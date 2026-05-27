import { getGeminiClient, GEMINI_MODEL } from "./geminiProvider";
import { normalizeParsedCV } from "./parsedCvNormalize";
import {
  normalizeCategoryScores,
  normalizeDetailedComparison,
  normalizeMatchingPoints,
  normalizeMissingGaps,
  normalizeRewriteSuggestions,
  normalizeStringArray,
} from "./resultPayloadNormalize";
import { AnalysisResult } from "./types";
import { buildAnalyzePromptVi, buildAnalyzePromptEn } from "./prompts";

/**
 * Helper to safely extract and parse JSON from Gemini responses
 */
const parseGeminiJson = (text: string) => {
  try {
    // 1. Try direct parse
    return JSON.parse(text);
  } catch (e) {
    // 2. Try regex extraction
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        // Clean control characters and trailing commas
        const cleaned = jsonMatch[0]
          .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
          .replace(/,\s*([\}\]])/g, "$1")
          .trim();
        return JSON.parse(cleaned);
      } catch (e2: any) {
        console.error("JSON Parse Error (Extracted):", e2);
        try {
          // Final attempt: fix common truncated JSON errors
          let fixed = jsonMatch[0];
          const openBraces = (fixed.match(/\{/g) || []).length;
          const closeBraces = (fixed.match(/\}/g) || []).length;
          if (openBraces > closeBraces) {
            fixed += "}".repeat(openBraces - closeBraces);
          }
          return JSON.parse(
            fixed.replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
          );
        } catch (e3) {
          throw e2;
        }
      }
    }
    throw e;
  }
};

export async function analyzeCV(
  jd: string,
  cvData: string,
  cvMimeType: string,
  cvName?: string,
  jdUrl?: string,
  language: "vi" | "en" = "vi"
): Promise<AnalysisResult> {
  const client = await getGeminiClient();

  const jdSection = jdUrl
    ? language === "vi"
      ? `Mô tả công việc (JD) nằm trong liên kết sau: ${jdUrl}. Hãy truy cập liên kết này để lấy nội dung JD.`
      : `The Job Description (JD) is located at the following link: ${jdUrl}. Please access this link to retrieve the JD content.`
    : language === "vi"
      ? `Mô tả công việc (JD):\n${jd}`
      : `Job Description (JD):\n${jd}`;

  const finalPrompt =
    language === "vi"
      ? buildAnalyzePromptVi({ jdSection })
      : buildAnalyzePromptEn({ jdSection });

  const parts: any[] = [{ text: finalPrompt }];

  if (
    cvMimeType === "application/pdf" ||
    cvMimeType.startsWith("image/")
  ) {
    parts.push({
      inlineData: {
        data: cvData.split(",")[1] || cvData,
        mimeType: cvMimeType,
      },
    });
  } else {
    parts.push({ text: `CV Content:\n${cvData}` });
  }

  try {
    const response = await client.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: "user", parts }],
      config: {
        responseMimeType: "application/json",
      },
    });

    const resultText = response.text || "";
    const parsedResult = parseGeminiJson(resultText);

    const matchScoreRaw = parsedResult.matchScore;
    const matchScore =
      typeof matchScoreRaw === "number" && Number.isFinite(matchScoreRaw)
        ? matchScoreRaw
        : typeof matchScoreRaw === "string"
          ? parseFloat(matchScoreRaw) || 0
          : Number(matchScoreRaw) || 0;

    // Ensure fallback values for safety (handles malformed / partial Gemini JSON)
    const finalResult = {
      jobTitle: parsedResult.jobTitle || "Job Position",
      matchScore,
      categoryScores: normalizeCategoryScores(parsedResult.categoryScores),
      matchingPoints: normalizeMatchingPoints(parsedResult.matchingPoints),
      missingGaps: normalizeMissingGaps(parsedResult.missingGaps),
      successProbability: parsedResult.successProbability || "Medium",
      passProbability: parsedResult.passProbability || "Medium",
      passExplanation: parsedResult.passExplanation || "",
      mainFactor: parsedResult.mainFactor || "",
      atsKeywords: normalizeStringArray(parsedResult.atsKeywords),
      rewriteSuggestions: normalizeRewriteSuggestions(
        parsedResult.rewriteSuggestions
      ),
      fullRewrittenCV: parsedResult.fullRewrittenCV || "",
      detailedComparison: normalizeDetailedComparison(
        parsedResult.detailedComparison
      ),
      parsedCV: normalizeParsedCV(parsedResult.parsedCV),
      id: Math.random().toString(36).substring(7),
      timestamp: Date.now(),
      cvName: cvName || "Unnamed CV",
      jdTitle: jdUrl || jd.substring(0, 100) + "...",
      language,
    };

    return finalResult as AnalysisResult;
  } catch (error: any) {
    console.error("Gemini Analysis Error:", error);
    if (error instanceof SyntaxError) {
      throw new Error(
        `Invalid AI data (JSON Error). Please try again. Detail: ${error.message}`
      );
    }
    throw new Error(
      error.message ||
        "Could not perform analysis with Gemini. Please try again later."
    );
  }
}