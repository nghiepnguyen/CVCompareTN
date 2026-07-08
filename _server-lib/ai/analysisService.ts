import { extractText } from 'unpdf';
import { getGeminiClient, GEMINI_MODEL, GEMINI_THINKING_BUDGET, extractTokenUsage, type TokenUsage } from './geminiClient.js';
import { ANALYSIS_RESPONSE_SCHEMA } from './responseSchema.js';
import {
  normalizeCategoryScores,
  normalizeDetailedComparison,
  normalizeFormatAssessment,
  normalizeMatchingPoints,
  normalizeMissingGaps,
  normalizeRewriteSuggestions,
  normalizeStringArray,
} from '../../src/services/ai/resultPayloadNormalize.js';
import type { AnalysisResult } from '../../src/services/ai/types.js';
import { buildAnalyzePrompt } from '../../src/services/ai/prompts.js';

const parseGeminiJson = (text: string) => {
  try {
    return JSON.parse(text);
  } catch (e) {
    // responseSchema should guarantee valid JSON, but guard against edge cases
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        // eslint-disable-next-line no-control-regex
        return JSON.parse(jsonMatch[0].replace(/[\x00-\x1F\x7F-\x9F]/g, '').replace(/,\s*([\}\]])/g, '$1'));
      } catch {
        throw e;
      }
    }
    throw new SyntaxError('No JSON object found in Gemini response');
  }
};

// Server-side re-check of the client's inline-PDF size budget (defense-in-depth
// for callers other than the SPA — e.g. the Express deployment target or a
// future direct API integration — which don't go through useFileProcessor.ts).
// Matches MAX_STORAGE_UPLOAD_SIZE in src/hooks/useFileProcessor.ts.
const MAX_INLINE_PDF_BYTES = 15 * 1024 * 1024;

export async function analyzeCV(
  jd: string,
  cvData: string,
  cvMimeType: string,
  cvName?: string,
  language: 'vi' | 'en' = 'vi',
  timeoutMs = 45_000,
  cvPdfInlineData?: string
): Promise<{ result: AnalysisResult; usage: TokenUsage }> {
  const client = getGeminiClient();

  const jdSection =
    language === 'vi'
      ? `Mô tả công việc (JD):\n${jd}`
      : `Job Description (JD):\n${jd}`;

  const finalPrompt = buildAnalyzePrompt({ jdSection, language });

  type GeminiPart = { text: string } | { inlineData: { data: string; mimeType: string } };
  const parts: GeminiPart[] = [{ text: finalPrompt }];

  // Start the timeout BEFORE PDF extraction so the whole analyzeCV budget is bounded.
  // `timeoutMs` is whatever budget the caller has left after auth/quota/recaptcha —
  // see _server-lib/analyze/handler.ts, which derives it from a single wall-clock
  // deadline so the total handler time can't exceed Vercel's 60s maxDuration.
  let analyzeTimer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    analyzeTimer = setTimeout(
      () =>
        reject(
          new Error(
            'Quá trình phân tích đang mất nhiều thời gian hơn bình thường. Vui lòng thử lại với JD ngắn hơn hoặc CV đơn giản hơn. (Timeout)'
          )
        ),
      timeoutMs
    );
  });

  try {
    if (cvMimeType === 'application/pdf') {
      let usedText = false;
      try {
        const base64Data = cvData.split(',')[1] || cvData;
        const buffer = Buffer.from(base64Data, 'base64');
        const { text } = await Promise.race([
          extractText(new Uint8Array(buffer), { mergePages: true }),
          timeoutPromise,
        ]);
        if (text && text.trim().length >= 100) {
          parts.push({ text: `CV Content:\n${text}` });
          usedText = true;
        }
      } catch (e) {
        if (e instanceof Error && e.message.includes('(Timeout)')) throw e;
        // Non-timeout error (scanned/malformed PDF) → fall through to inlineData
      }
      if (!usedText) {
        parts.push({
          inlineData: {
            data: cvData.split(',')[1] || cvData,
            mimeType: 'application/pdf',
          },
        });
      }
    } else if (cvMimeType.startsWith('image/')) {
      parts.push({
        inlineData: {
          data: cvData.split(',')[1] || cvData,
          mimeType: cvMimeType,
        },
      });
    } else {
      parts.push({ text: `CV Content:\n${cvData}` });
      // Text extraction already succeeded — also attach the original PDF
      // (when provided and within budget) so Gemini can additionally assess
      // real layout/format for the formatAssessment section.
      if (cvPdfInlineData) {
        const base64Data = cvPdfInlineData.split(',')[1] || cvPdfInlineData;
        if (Buffer.byteLength(base64Data, 'base64') <= MAX_INLINE_PDF_BYTES) {
          parts.push({ inlineData: { data: base64Data, mimeType: 'application/pdf' } });
        }
      }
    }

    const geminiPromise = client.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: 'user', parts }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: ANALYSIS_RESPONSE_SCHEMA,
        maxOutputTokens: 16384,
        thinkingConfig: { thinkingBudget: GEMINI_THINKING_BUDGET },
      },
    });

    const response = await Promise.race([geminiPromise, timeoutPromise]);
    const usage = extractTokenUsage(response.usageMetadata);

    const resultText = response.text || '';
    const parsedResult = parseGeminiJson(resultText);

    const matchScoreRaw = parsedResult.matchScore;
    const matchScore =
      typeof matchScoreRaw === 'number' && Number.isFinite(matchScoreRaw)
        ? matchScoreRaw
        : typeof matchScoreRaw === 'string'
          ? parseFloat(matchScoreRaw) || 0
          : Number(matchScoreRaw) || 0;

    const finalResult = {
      jobTitle: parsedResult.jobTitle || 'Job Position',
      matchScore,
      categoryScores: normalizeCategoryScores(parsedResult.categoryScores),
      matchingPoints: normalizeMatchingPoints(parsedResult.matchingPoints),
      missingGaps: normalizeMissingGaps(parsedResult.missingGaps),
      successProbability: parsedResult.successProbability || 'Medium',
      passProbability: parsedResult.passProbability || 'Medium',
      passExplanation: parsedResult.passExplanation || '',
      mainFactor: parsedResult.mainFactor || '',
      atsKeywords: normalizeStringArray(parsedResult.atsKeywords),
      rewriteSuggestions: normalizeRewriteSuggestions(parsedResult.rewriteSuggestions),
      fullRewrittenCV: '',
      detailedComparison: normalizeDetailedComparison(parsedResult.detailedComparison),
      formatAssessment: normalizeFormatAssessment(parsedResult.formatAssessment),
      // parsedCV is generated separately via /api/parse-cv in the background — see
      // _server-lib/ai/parseCvService.ts — to keep this call's output small.
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      cvName: cvName || 'Unnamed CV',
      jdTitle: jd.substring(0, 100) + '...',
      language,
    };

    return { result: finalResult as AnalysisResult, usage };
  } catch (error: unknown) {
    console.error('Gemini Analysis Error:', error);

    // Treat both our Promise.race timeout and SDK-level DEADLINE_EXCEEDED as timeouts
    if (error instanceof Error) {
      const isTimeout =
        error.message.includes('(Timeout)') ||
        error.message.includes('DEADLINE_EXCEEDED');
      if (isTimeout) {
        throw new Error(
          'Quá trình phân tích đang mất nhiều thời gian hơn bình thường. Vui lòng thử lại với JD ngắn hơn hoặc CV đơn giản hơn. (Timeout)'
        );
      }
    }

    if (error instanceof SyntaxError) {
      throw new Error(`Invalid AI data (JSON Error). Please try again. Detail: ${error.message}`);
    }
    const message = error instanceof Error ? error.message : undefined;
    throw new Error(message || 'Could not perform analysis with Gemini. Please try again later.');
  } finally {
    clearTimeout(analyzeTimer);
  }
}