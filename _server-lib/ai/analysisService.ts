import { extractText } from 'unpdf';
import { assertBudget, ControlledError, createDeadline, MIN_GEMINI_BUDGET_MS } from '../deadline.js';
import { getGeminiClient, GEMINI_ANALYZE_MODEL, thinkingConfigFor, extractTokenUsage, type AiCallUsage } from './geminiClient.js';
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
import { buildAnalyzePromptEn } from '../../src/services/ai/prompts.js';
import { CANONICAL_PROBABILITY_VERSION, derivePassProbability } from '../../src/services/ai/canonicalProbability.js';
import { vnDateParts } from '../../src/lib/vnTime.js';
import { dropUnsupportedSuggestions, rawJdConcepts, type SuggestionGuardMetrics } from './suggestionGuard.js';
import { localizeAnalysis, SCORE_VERSION } from './localizeAnalysis.js';

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
): Promise<{ result: AnalysisResult; usage: AiCallUsage; guardMetrics: SuggestionGuardMetrics }> {
  const client = getGeminiClient();

  // Canonical scoring (Stage 3.7): the same English prompt, JD header and
  // English prose for every UI language, so `language` cannot shift the score
  // (Stage 3.6: the VI prompt / VI output moved MatchScore 4–10 points).
  // `language` is only the requested presentation language, applied afterwards
  // by localizeAnalysis on presentation strings.
  const jdSection = `Job Description (JD):\n${jd}`;

  const { y, m } = vnDateParts(new Date());
  const currentMonth = `${String(m + 1).padStart(2, '0')}/${y}`;
  const finalPrompt = buildAnalyzePromptEn({ jdSection, currentMonth });

  type GeminiPart = { text: string } | { inlineData: { data: string; mimeType: string } };
  const parts: GeminiPart[] = [{ text: finalPrompt }];
  // CV text the model saw, when there is one (not for inline PDF/image) — used
  // to drop suggestions with numbers the CV never states.
  let cvText: string | undefined;

  // Start the timeout BEFORE PDF extraction so the whole analyzeCV budget is bounded.
  // `timeoutMs` is whatever budget the caller has left after auth/quota/recaptcha —
  // see _server-lib/analyze/handler.ts, which derives it from the single
  // request deadline (_server-lib/deadline.ts).
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

  // Real cancellation of the Gemini HTTP request at the same moment the
  // timeout below fires (client-side abort; generation config is unchanged).
  const deadline = createDeadline(timeoutMs);
  const abortSignal = deadline.signal();

  try {
    assertBudget(deadline, MIN_GEMINI_BUDGET_MS);
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
          cvText = text;
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
      cvText = cvData;
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

    // unpdf cannot be cancelled: re-check the budget once preparation is done
    // and never start Gemini without enough time left.
    assertBudget(deadline, MIN_GEMINI_BUDGET_MS);
    const geminiStart = Date.now();
    const geminiPromise = client.models.generateContent({
      model: GEMINI_ANALYZE_MODEL,
      contents: [{ role: 'user', parts }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: ANALYSIS_RESPONSE_SCHEMA,
        maxOutputTokens: 16384,
        thinkingConfig: thinkingConfigFor(GEMINI_ANALYZE_MODEL),
        abortSignal,
      },
    });

    const response = await Promise.race([geminiPromise, timeoutPromise]);
    const usage: AiCallUsage = {
      ...extractTokenUsage(response.usageMetadata),
      model: GEMINI_ANALYZE_MODEL,
      latencyMs: Date.now() - geminiStart,
    };

    const resultText = response.text || '';
    const parsedResult = parseGeminiJson(resultText);

    const matchScoreRaw = parsedResult.matchScore;
    const matchScore =
      typeof matchScoreRaw === 'number' && Number.isFinite(matchScoreRaw)
        ? matchScoreRaw
        : typeof matchScoreRaw === 'string'
          ? parseFloat(matchScoreRaw) || 0
          : Number(matchScoreRaw) || 0;

    const missingGaps = normalizeMissingGaps(parsedResult.missingGaps);
    const detailedComparison = normalizeDetailedComparison(parsedResult.detailedComparison);
    const suggestionsIn = normalizeRewriteSuggestions(parsedResult.rewriteSuggestions);
    const guardMetrics: SuggestionGuardMetrics = {
      suggestionsIn: suggestionsIn.length,
      droppedTotal: 0, skills: 0, numeric: 0, rawJd: 0,
      factualChecks: Boolean(cvText), // same condition dropUnsupportedSuggestions uses
    };
    const rewriteSuggestions = dropUnsupportedSuggestions(
      suggestionsIn,
      cvText,
      // Distinctive JD terms absent from the CV. The analysis (detailedComparison,
      // missingGaps) is deliberately not used to filter suggestions.
      cvText ? rawJdConcepts(jd, cvText) : [],
      // Counted for analysis_log.guard_metrics. Console: reason only — section
      // is model free text (may name an employer); section, concept,
      // matchedForm and the suggestion body only for local debugging.
      (d, s) => {
        guardMetrics.droppedTotal++;
        if (d.reason === 'skills-section') guardMetrics.skills++;
        else if (d.reason === 'unsupported-number') guardMetrics.numeric++;
        else guardMetrics.rawJd++;
        console.info(
          '[suggestionGuard] dropped',
          JSON.stringify(
            process.env.SUGGESTION_GUARD_DEBUG === '1'
              ? { ...d, original: s.original, optimized: s.optimized }
              : { reason: d.reason }
          )
        );
      }
    );

    // Stage 3.13B contract A: probability is a deterministic representation of
    // the canonical matchScore. Any model-authored probability/explanation is
    // discarded before the canonical result exists (the model contract no longer
    // requests these fields at all — responseSchema.ts).
    const passProbability = derivePassProbability(matchScore);

    const finalResult = {
      jobTitle: parsedResult.jobTitle || 'Job Position',
      matchScore,
      categoryScores: normalizeCategoryScores(parsedResult.categoryScores),
      matchingPoints: normalizeMatchingPoints(parsedResult.matchingPoints),
      missingGaps,
      // Compatibility mirror only; never an independent authority.
      successProbability: passProbability,
      passProbability,
      probabilityVersion: CANONICAL_PROBABILITY_VERSION,
      passExplanation: '',
      mainFactor: parsedResult.mainFactor || '',
      atsKeywords: normalizeStringArray(parsedResult.atsKeywords),
      rewriteSuggestions,
      fullRewrittenCV: '',
      detailedComparison,
      formatAssessment: normalizeFormatAssessment(parsedResult.formatAssessment),
      // parsedCV is generated separately via /api/parse-cv in the background — see
      // _server-lib/ai/parseCvService.ts — to keep this call's output small.
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      cvName: cvName || 'Unnamed CV',
      jdTitle: jd.substring(0, 100) + '...',
      scoreVersion: SCORE_VERSION,
      language: 'en' as const,
      presentationLanguage: 'en' as const,
    };

    const canonical = finalResult as AnalysisResult;
    if (language === 'en') return { result: canonical, usage, guardMetrics };
    // Presentation only, after the guard, on the same AI deadline; never throws.
    const localized = await localizeAnalysis(canonical, deadline);
    const lang = localized.presentationLanguage;
    const totalUsage: AiCallUsage = localized.usage
      ? {
          ...usage,
          inputTokens: usage.inputTokens + localized.usage.inputTokens,
          outputTokens: usage.outputTokens + localized.usage.outputTokens,
          latencyMs: usage.latencyMs + localized.usage.latencyMs,
        }
      : usage;
    return { result: { ...localized.result, language: lang, presentationLanguage: lang }, usage: totalUsage, guardMetrics };
  } catch (error: unknown) {
    if (error instanceof ControlledError) throw error;
    console.error('Gemini Analysis Error:', error);

    // Our Promise.race timeout, the deadline abort and SDK DEADLINE_EXCEEDED are all timeouts
    if (error instanceof Error) {
      const isTimeout =
        abortSignal.aborted ||
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