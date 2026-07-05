import { extractText } from 'unpdf';
import { getGeminiClient, GEMINI_MODEL, GEMINI_THINKING_BUDGET, extractTokenUsage, type TokenUsage } from './geminiClient.js';
import { normalizeParsedCV } from '../../src/services/ai/parsedCvNormalize.js';
import { buildParseCvPrompt } from '../../src/services/ai/prompts.js';
import type { ParsedCV } from '../../src/services/ai/types.js';

const PARSE_CV_TIMEOUT_MS = 45_000;
// See analysisService.ts's identical constant for rationale.
const MAX_INLINE_PDF_BYTES = 2 * 1024 * 1024;

const PARSED_CV_SCHEMA = {
  type: 'OBJECT',
  properties: {
    personal_information: {
      type: 'OBJECT',
      properties: {
        full_name: { type: 'STRING' },
        contact: {
          type: 'OBJECT',
          properties: {
            email: { type: 'STRING' },
            phone: { type: 'STRING' },
            location: { type: 'STRING' },
            linkedin: { type: 'STRING' },
            website_portfolio: { type: 'STRING' },
          },
          required: ['email', 'phone', 'location'],
        },
        summary: { type: 'STRING' },
      },
      required: ['full_name', 'contact', 'summary'],
    },
    education: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          degree: { type: 'STRING' },
          institution: { type: 'STRING' },
          major: { type: 'STRING' },
          graduation_year: { type: 'INTEGER' },
          gpa: { type: 'STRING' },
        },
        required: ['degree', 'institution', 'major', 'graduation_year'],
      },
    },
    work_experience: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          company: { type: 'STRING' },
          job_title: { type: 'STRING' },
          duration: {
            type: 'OBJECT',
            properties: {
              start: { type: 'STRING' },
              end: { type: 'STRING' },
              is_current: { type: 'BOOLEAN' },
            },
            required: ['start', 'end', 'is_current'],
          },
          responsibilities: { type: 'ARRAY', items: { type: 'STRING' } },
          achievements: { type: 'ARRAY', items: { type: 'STRING' } },
        },
        required: ['company', 'job_title', 'duration', 'responsibilities', 'achievements'],
      },
    },
    skills: {
      type: 'OBJECT',
      properties: {
        technical_skills: { type: 'ARRAY', items: { type: 'STRING' } },
        soft_skills: { type: 'ARRAY', items: { type: 'STRING' } },
        hard_skills: { type: 'ARRAY', items: { type: 'STRING' } },
        tools_software: { type: 'ARRAY', items: { type: 'STRING' } },
        languages: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              language: { type: 'STRING' },
              proficiency: { type: 'STRING' },
            },
            required: ['language', 'proficiency'],
          },
        },
      },
      required: ['technical_skills', 'soft_skills', 'hard_skills', 'tools_software', 'languages'],
    },
    projects: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          description: { type: 'STRING' },
          tech_stack: { type: 'ARRAY', items: { type: 'STRING' } },
          link: { type: 'STRING' },
        },
        required: ['name', 'description', 'tech_stack'],
      },
    },
    certifications: { type: 'ARRAY', items: { type: 'STRING' } },
    ats_evaluation: {
      type: 'OBJECT',
      properties: {
        years_of_experience: { type: 'NUMBER' },
        relevant_score: { type: 'NUMBER' },
        key_match_highlights: { type: 'ARRAY', items: { type: 'STRING' } },
        missing_keywords: { type: 'ARRAY', items: { type: 'STRING' } },
      },
      required: ['years_of_experience', 'relevant_score', 'key_match_highlights', 'missing_keywords'],
    },
  },
  required: ['personal_information', 'education', 'work_experience', 'skills', 'projects', 'certifications', 'ats_evaluation'],
};

export async function generateParsedCV(
  jd: string,
  cvData: string,
  cvMimeType: string,
  language: 'vi' | 'en' = 'vi',
  timeoutMs: number = PARSE_CV_TIMEOUT_MS,
  cvPdfInlineData?: string
): Promise<{ parsedCV: ParsedCV | undefined; usage: TokenUsage }> {
  const client = getGeminiClient();

  const jdSection =
    language === 'vi' ? `Mô tả công việc (JD):\n${jd}` : `Job Description (JD):\n${jd}`;
  const prompt = buildParseCvPrompt({ jdSection, language });

  type GeminiPart = { text: string } | { inlineData: { data: string; mimeType: string } };
  const parts: GeminiPart[] = [{ text: prompt }];

  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('CV parsing is taking too long. Please try again. (Timeout)')),
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
      }
      if (!usedText) {
        parts.push({
          inlineData: { data: cvData.split(',')[1] || cvData, mimeType: 'application/pdf' },
        });
      }
    } else if (cvMimeType.startsWith('image/')) {
      parts.push({
        inlineData: { data: cvData.split(',')[1] || cvData, mimeType: cvMimeType },
      });
    } else {
      parts.push({ text: `CV Content:\n${cvData}` });
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
        responseSchema: PARSED_CV_SCHEMA,
        maxOutputTokens: 16384,
        thinkingConfig: { thinkingBudget: GEMINI_THINKING_BUDGET },
      },
    });

    const response = await Promise.race([geminiPromise, timeoutPromise]);
    const usage = extractTokenUsage(response.usageMetadata);
    const resultText = response.text || '';

    try {
      return { parsedCV: normalizeParsedCV(JSON.parse(resultText)), usage };
    } catch {
      const jsonMatch = resultText.match(/\{[\s\S]*\}/);
      if (jsonMatch) return { parsedCV: normalizeParsedCV(JSON.parse(jsonMatch[0])), usage };
      throw new SyntaxError('No JSON object found in Gemini response');
    }
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('(Timeout)')) {
      throw new Error('CV parsing is taking too long. Please try again. (Timeout)');
    }
    if (error instanceof Error && error.message.includes('DEADLINE_EXCEEDED')) {
      throw new Error('CV parsing is taking too long. Please try again. (Timeout)');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
