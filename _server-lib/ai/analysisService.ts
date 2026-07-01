import { extractText } from 'unpdf';
import { getGeminiClient, GEMINI_MODEL } from './geminiClient.js';
import { ANALYSIS_RESPONSE_SCHEMA } from './responseSchema.js';
import { normalizeParsedCV } from '../../src/services/ai/parsedCvNormalize.js';
import {
  normalizeCategoryScores,
  normalizeDetailedComparison,
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

export async function analyzeCV(
  jd: string,
  cvData: string,
  cvMimeType: string,
  cvName?: string,
  language: 'vi' | 'en' = 'vi'
): Promise<AnalysisResult> {
  const client = getGeminiClient();

  const jdSection =
    language === 'vi'
      ? `Mô tả công việc (JD):\n${jd}`
      : `Job Description (JD):\n${jd}`;

  const finalPrompt = buildAnalyzePrompt({ jdSection, language });

  type GeminiPart = { text: string } | { inlineData: { data: string; mimeType: string } };
  const parts: GeminiPart[] = [{ text: finalPrompt }];

  // Start the timeout BEFORE PDF extraction so the whole analyzeCV budget is bounded.
  // 45s covers PDF extraction + Gemini combined; auth (≤4s) + quota (≤5s) + 45s = 54s,
  // leaving a 6s buffer before Vercel's 60s maxDuration hard-limit kills the function.
  // fullRewrittenCV is no longer generated here (moved to /api/rewrite-cv), so output
  // is small enough that 45s is generous rather than risky.
  const ANALYZE_TIMEOUT_MS = 45_000;
  let analyzeTimer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    analyzeTimer = setTimeout(
      () =>
        reject(
          new Error(
            'Quá trình phân tích đang mất nhiều thời gian hơn bình thường. Vui lòng thử lại với JD ngắn hơn hoặc CV đơn giản hơn. (Timeout)'
          )
        ),
      ANALYZE_TIMEOUT_MS
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
    }

    const geminiPromise = client.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: 'user', parts }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: ANALYSIS_RESPONSE_SCHEMA,
        maxOutputTokens: 16384,
      },
    });

    const response = await Promise.race([geminiPromise, timeoutPromise]);

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
      parsedCV: normalizeParsedCV(parsedResult.parsedCV),
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      cvName: cvName || 'Unnamed CV',
      jdTitle: jd.substring(0, 100) + '...',
      language,
    };

    return finalResult as AnalysisResult;
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