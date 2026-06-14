import { getGeminiClient, GEMINI_MODEL } from './geminiClient';
import { normalizeParsedCV } from '../../src/services/ai/parsedCvNormalize';
import {
  normalizeCategoryScores,
  normalizeDetailedComparison,
  normalizeMatchingPoints,
  normalizeMissingGaps,
  normalizeRewriteSuggestions,
  normalizeStringArray,
} from '../../src/services/ai/resultPayloadNormalize';
import type { AnalysisResult } from '../../src/services/ai/types';
import { buildAnalyzePromptVi, buildAnalyzePromptEn } from '../../src/services/ai/prompts';

function stripControlChars(s: string): string {
  // Remove ASCII control characters (0x00-0x1F, 0x7F-0x9F)
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
}

const parseGeminiJson = (text: string) => {
  try {
    return JSON.parse(text);
  } catch {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const cleaned = stripControlChars(jsonMatch[0])
          .replace(/,\s*([\}\]])/g, '$1')
          .trim();
        return JSON.parse(cleaned);
      } catch (e2: any) {
        console.error('JSON Parse Error (Extracted):', e2);
        try {
          let fixed = jsonMatch[0];
          const openBraces = (fixed.match(/\{/g) || []).length;
          const closeBraces = (fixed.match(/\}/g) || []).length;
          if (openBraces > closeBraces) {
            fixed += '}'.repeat(openBraces - closeBraces);
          }
          return JSON.parse(stripControlChars(fixed));
        } catch {
          throw e2;
        }
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

  const finalPrompt =
    language === 'vi'
      ? buildAnalyzePromptVi({ jdSection })
      : buildAnalyzePromptEn({ jdSection });

  const parts: any[] = [{ text: finalPrompt }];

  if (cvMimeType === 'application/pdf' || cvMimeType.startsWith('image/')) {
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
    const response = await client.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: 'user', parts }],
      config: {
        responseMimeType: 'application/json',
      },
    });

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
      id: Math.random().toString(36).substring(7),
      timestamp: Date.now(),
      cvName: cvName || 'Unnamed CV',
      jdTitle: jd.substring(0, 100) + '...',
      language,
    };

    return finalResult as AnalysisResult;
  } catch (error: any) {
    console.error('Gemini Analysis Error:', error);
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid AI data (JSON Error). Please try again. Detail: ${error.message}`);
    }
    throw new Error(
      error.message || 'Could not perform analysis with Gemini. Please try again later.'
    );
  }
}
