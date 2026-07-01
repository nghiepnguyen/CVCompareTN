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

  if (cvMimeType === 'application/pdf') {
    let usedText = false;
    try {
      const base64Data = cvData.split(',')[1] || cvData;
      const buffer = Buffer.from(base64Data, 'base64');
      const { text } = await extractText(new Uint8Array(buffer), { mergePages: true });
      if (text && text.trim().length >= 100) {
        parts.push({ text: `CV Content:\n${text}` });
        usedText = true;
      }
    } catch {
      // fall through to inlineData (scanned or malformed PDF)
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

  try {
    // Use Promise.race with a 50s timeout so we return a proper error before Vercel's 60s hard limit.
    // httpOptions.timeout on the Gemini client (50s) serves as a backup.
    // 45s leaves ~15s headroom for auth, quota check, and response serialization
    // before Vercel Hobby's 60s maxDuration hard-limit kills the function.
    const ANALYZE_TIMEOUT_MS = 45_000;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              'Quá trình phân tích đang mất nhiều thời gian hơn bình thường. Vui lòng thử lại với JD ngắn hơn hoặc CV đơn giản hơn. (Timeout)'
            )
          ),
        ANALYZE_TIMEOUT_MS
      )
    );

    const geminiPromise = client.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: 'user', parts }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: ANALYSIS_RESPONSE_SCHEMA,
        maxOutputTokens: 32768,
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
      fullRewrittenCV: parsedResult.fullRewrittenCV || '',
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
  }
}