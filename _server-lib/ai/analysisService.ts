import { extractText } from 'unpdf';
import { getGeminiClient, GEMINI_MODEL } from './geminiClient.js';
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
import { buildAnalyzePromptVi, buildAnalyzePromptEn } from '../../src/services/ai/prompts.js';

function stripControlChars(s: string): string {
  // Remove ASCII control characters (0x00-0x1F, 0x7F-0x9F)
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
}

const repairTruncatedJson = (raw: string): string => {
  // Strip trailing partial string (truncation often ends mid-string)
  let fixed = raw.replace(/,?\s*"[^"\\]*(?:\\.[^"\\]*)*$/, '');
  // Strip trailing dangling comma
  fixed = fixed.replace(/,\s*$/, '');
  // Walk the JSON to build a close-bracket stack, skipping string contents
  const stack: string[] = [];
  let inString = false;
  let escape = false;
  for (const ch of fixed) {
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') stack.pop();
  }
  return fixed + stack.reverse().join('');
};

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
      } catch (e2: unknown) {
        console.error('JSON Parse Error (Extracted):', e2);
        try {
          const fixed = repairTruncatedJson(jsonMatch[0]);
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
    const response = await client.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: 'user', parts }],
      config: {
        responseMimeType: 'application/json',
        maxOutputTokens: 65536,
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
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      cvName: cvName || 'Unnamed CV',
      jdTitle: jd.substring(0, 100) + '...',
      language,
    };

    return finalResult as AnalysisResult;
  } catch (error: unknown) {
    console.error('Gemini Analysis Error:', error);
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid AI data (JSON Error). Please try again. Detail: ${error.message}`);
    }
    const message = error instanceof Error ? error.message : undefined;
    throw new Error(message || 'Could not perform analysis with Gemini. Please try again later.');
  }
}
