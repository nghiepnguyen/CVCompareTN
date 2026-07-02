import { extractText } from 'unpdf';
import { getGeminiClient, GEMINI_MODEL, GEMINI_THINKING_BUDGET } from './geminiClient.js';

const REWRITE_TIMEOUT_MS = 50_000;

const REWRITE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    fullRewrittenCV: { type: 'STRING' },
  },
  required: ['fullRewrittenCV'],
};

function buildRewritePromptVi(jdSection: string): string {
  return `Bạn là chuyên gia viết CV chuyên nghiệp và tối ưu ATS.
Nhiệm vụ: Viết lại toàn bộ CV đã cung cấp để tối ưu hoàn toàn cho JD và hệ thống ATS.

${jdSection}

Trả về chuỗi Markdown (GFM) trong trường fullRewrittenCV:
- Dòng đầu: tiêu đề cấp 1 (# Họ và Tên đầy đủ)
- Tiếp theo 1–3 dòng thông tin liên lạc (không dùng #)
- Mỗi mục chính: ## Tên Mục (ví dụ: Professional Summary, Work Experience, Skills…)
- Mỗi vị trí công việc: ### Chức danh — Công ty | MM/YYYY – MM/YYYY, tiếp theo các dòng gạch đầu dòng (- )
- Luôn dùng gạch đầu dòng (- ) cho danh sách; không dùng đoạn văn liền mạch không có heading.
- Áp dụng công thức Google XYZ: Accomplished [X] as measured by [Y], by doing [Z]
- Tích hợp từ khóa từ JD một cách tự nhiên
- Dùng ĐÚNG NGÔN NGỮ GỐC của CV (không dịch)
- Chuẩn hóa tất cả mốc thời gian về MM/YYYY`;
}

function buildRewritePromptEn(jdSection: string): string {
  return `You are a professional CV writer and ATS optimization expert.
Task: Fully rewrite the provided CV to be 100% optimized for the given JD and ATS systems.

${jdSection}

Return a GitHub-Flavored Markdown string in the fullRewrittenCV field:
- First line: level-1 heading (# Full Name)
- Next 1–3 lines for contact info (no leading #)
- Each major section: ## Section Name (e.g. Professional Summary, Work Experience, Skills…)
- Each job: ### Job Title — Company | MM/YYYY – MM/YYYY, then hyphen bullet lines (- )
- Always use hyphen bullet lists (- ); do not output prose without Markdown headings.
- Apply Google XYZ formula: Accomplished [X] as measured by [Y], by doing [Z]
- Integrate JD keywords naturally
- Use the EXACT ORIGINAL LANGUAGE of the CV (do not translate)
- Standardize all dates to MM/YYYY`;
}

export async function generateFullRewrite(
  jd: string,
  cvData: string,
  cvMimeType: string,
  language: 'vi' | 'en' = 'vi',
  timeoutMs: number = REWRITE_TIMEOUT_MS
): Promise<string> {
  const client = getGeminiClient();

  const jdSection =
    language === 'vi' ? `Mô tả công việc (JD):\n${jd}` : `Job Description (JD):\n${jd}`;
  const prompt =
    language === 'vi' ? buildRewritePromptVi(jdSection) : buildRewritePromptEn(jdSection);

  type GeminiPart = { text: string } | { inlineData: { data: string; mimeType: string } };
  const parts: GeminiPart[] = [{ text: prompt }];

  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(
            'CV rewrite is taking too long. Please try again. (Timeout)'
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
    }

    const geminiPromise = client.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: 'user', parts }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: REWRITE_SCHEMA,
        maxOutputTokens: 16384,
        thinkingConfig: { thinkingBudget: GEMINI_THINKING_BUDGET },
      },
    });

    const response = await Promise.race([geminiPromise, timeoutPromise]);
    const resultText = response.text || '';

    try {
      const parsed = JSON.parse(resultText) as { fullRewrittenCV?: string };
      return parsed.fullRewrittenCV || '';
    } catch {
      const jsonMatch = resultText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as { fullRewrittenCV?: string };
        return parsed.fullRewrittenCV || '';
      }
      return resultText;
    }
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('(Timeout)')) {
      throw new Error('CV rewrite is taking too long. Please try again. (Timeout)');
    }
    if (error instanceof Error && error.message.includes('DEADLINE_EXCEEDED')) {
      throw new Error('CV rewrite is taking too long. Please try again. (Timeout)');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
