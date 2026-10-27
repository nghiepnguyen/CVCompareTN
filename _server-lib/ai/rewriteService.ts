import { extractText } from 'unpdf';
import { getGeminiClient, GEMINI_REWRITE_MODEL, thinkingConfigFor, extractTokenUsage, type AiCallUsage } from './geminiClient.js';

const REWRITE_TIMEOUT_MS = 50_000;

const REWRITE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    fullRewrittenCV: { type: 'STRING' },
  },
  required: ['fullRewrittenCV'],
};

// The JD only decides what to emphasize and which wording to use; it is never
// a source of facts about the candidate. Both models invented metrics, tools,
// contact details and promoted titles/levels when the prompt asked for
// "XYZ" bullets with JD keywords (benchmark 2026-10-28), so the guardrails
// below are explicit. Output language follows the CV, not the UI `language`
// (which only picks the instruction language) and not the JD.
export function buildRewritePromptVi(jdSection: string): string {
  return `Bạn là chuyên gia viết CV chuyên nghiệp và tối ưu ATS.
Nhiệm vụ: Viết lại CV đã cung cấp để trình bày rõ ràng, chuyên nghiệp và phù hợp hơn với JD, CHỈ dựa trên dữ kiện có trong CV.

${jdSection}

NGUYÊN TẮC TRUNG THỰC (bắt buộc, ưu tiên cao nhất):
- CV gốc là nguồn dữ kiện DUY NHẤT về ứng viên. JD chỉ dùng để chọn nội dung cần nhấn mạnh, sắp xếp lại thứ tự và chọn cách diễn đạt/thuật ngữ ATS tương đương nghĩa — KHÔNG BAO GIỜ biến yêu cầu của JD thành dữ kiện về ứng viên.
- KHÔNG bịa hoặc thêm: con số, phần trăm, doanh thu, ROAS/CPA/tỷ lệ chuyển đổi, đánh giá/xếp hạng, uptime, quy mô team, số người dùng/khách hàng, thành tích, chứng chỉ, công nghệ, công cụ, kỹ năng, trách nhiệm công việc.
- Mọi con số trong output phải có nguyên văn trong CV gốc. Không tự tính toán ra số mới. Nếu CV không có số liệu, viết bullet mạnh hơn bằng hành động, phạm vi và kết quả đã có trong CV — không thêm số.
- Kỹ năng/công cụ/từ khóa chỉ có trong JD mà CV không chứng minh: KHÔNG thêm vào bất kỳ mục nào (kể cả Kỹ năng, Tóm tắt, Kinh nghiệm).
- Giữ NGUYÊN VĂN tên công ty, chức danh, tên bằng cấp, trường, chứng chỉ. Không nâng cấp chức danh/cấp bậc (VD: không đổi "Nhân viên" thành "Chuyên viên", "Data Analyst II" thành "Senior Data Analyst").
- Không nâng trình độ ngoại ngữ hay mức thành thạo kỹ năng so với CV gốc.
- Thông tin liên hệ (email, số điện thoại, địa chỉ/địa điểm, LinkedIn, website, portfolio): chỉ chép đúng những gì CV có. Trường nào CV không có thì BỎ HẲN — không tạo giá trị giả, không dùng placeholder như [Email], không lấy địa điểm từ JD.

NGÔN NGỮ:
- Xác định ngôn ngữ chính của CV gốc và viết TOÀN BỘ output bằng đúng ngôn ngữ đó, kể cả tiêu đề mục. Không dịch, kể cả khi JD hoặc hướng dẫn này dùng ngôn ngữ khác.
- CV tiếng Việt → tiêu đề tiếng Việt (VD: Tóm tắt chuyên môn, Kinh nghiệm làm việc, Kỹ năng, Học vấn, Chứng chỉ, Ngoại ngữ, Dự án). CV tiếng Anh → tiêu đề tiếng Anh (VD: Professional Summary, Work Experience, Skills, Education). Thuật ngữ kỹ thuật/tên công cụ giữ như trong CV.

CÁCH VIẾT BULLET:
- Mỗi bullet: động từ hành động + phạm vi/cách làm + kết quả (chỉ khi CV đã nêu kết quả). Câu tự nhiên, ngắn gọn, đúng ngữ pháp; không nhồi từ khóa.
- Không đưa vào output các nhãn/khung công thức hay cụm như "Accomplished", "as measured by", "by doing" (trừ khi có sẵn trong CV gốc).

ĐỊNH DẠNG — trả về chuỗi Markdown (GFM) trong trường fullRewrittenCV, dùng ký tự xuống dòng thật:
- Dòng đầu: tiêu đề cấp 1 (# Họ và Tên đầy đủ)
- Tiếp theo 1–3 dòng thông tin liên lạc có trong CV (không dùng #). Nếu CV không có thông tin liên lạc, chuyển thẳng sang mục ## đầu tiên — không đặt nội dung khác vào vị trí này
- Mỗi mục chính: ## Tên Mục
- Mỗi vị trí công việc: ### Chức danh — Công ty | thời gian, tiếp theo các dòng gạch đầu dòng (- )
- Luôn dùng gạch đầu dòng (- ) cho danh sách; không dùng đoạn văn liền mạch không có heading.
- Thời gian: dùng MM/YYYY khi CV có tháng; nếu CV chỉ có năm thì giữ YYYY — không tự thêm tháng.`;
}

export function buildRewritePromptEn(jdSection: string): string {
  return `You are a professional CV writer and ATS optimization expert.
Task: Rewrite the provided CV so it reads clearly and professionally and fits the JD better, using ONLY facts present in the CV.

${jdSection}

FACTUAL FIDELITY (mandatory, highest priority):
- The original CV is the ONLY source of facts about the candidate. Use the JD only to choose what to emphasize, reorder content, and pick wording/ATS terminology with the same meaning — NEVER turn a JD requirement into a fact about the candidate.
- Do NOT invent or add: numbers, percentages, revenue, ROAS/CPA/conversion figures, ratings/rankings, uptime, team sizes, user/customer counts, achievements, certifications, technologies, tools, skills, or responsibilities.
- Every number in the output must appear verbatim in the original CV. Do not compute new numbers. If the CV has no metrics, strengthen bullets with action, scope and outcomes the CV already states — do not add numbers.
- JD-only skills/tools/keywords that the CV does not demonstrate: do NOT add them anywhere (including Skills, Summary, Experience).
- Keep company names, job titles, degree names, schools and certifications VERBATIM. Never promote a title or seniority (e.g. do not turn "Data Analyst II" into "Senior Data Analyst").
- Never raise a language or skill proficiency level above what the CV states.
- Contact details (email, phone, address/location, LinkedIn, website, portfolio): copy only what the CV contains. OMIT any field the CV lacks — no made-up values, no placeholders like [Email], never take a location from the JD.

LANGUAGE:
- Detect the CV's main language and write the ENTIRE output in that language, section headings included. Do not translate, even if the JD or these instructions use another language.
- Vietnamese CV → Vietnamese headings (e.g. Tóm tắt chuyên môn, Kinh nghiệm làm việc, Kỹ năng, Học vấn). English CV → English headings (e.g. Professional Summary, Work Experience, Skills, Education). Keep technical terms/tool names as written in the CV.

BULLET STYLE:
- Each bullet: action verb + scope/method + outcome (only when the CV states one). Natural, concise, grammatical sentences; no keyword stuffing.
- Never output formula labels or phrases such as "Accomplished", "as measured by", "by doing" (unless they appear in the original CV).

FORMAT — return a GitHub-Flavored Markdown string in the fullRewrittenCV field, using real newline characters:
- First line: level-1 heading (# Full Name)
- Next 1–3 lines for contact info present in the CV (no leading #). If the CV has none, go straight to the first ## section — put nothing else in that slot
- Each major section: ## Section Name
- Each job: ### Job Title — Company | dates, then hyphen bullet lines (- )
- Always use hyphen bullet lists (- ); do not output prose without Markdown headings.
- Dates: use MM/YYYY when the CV gives a month; if it only gives a year keep YYYY — never add months.`;
}

// Gemini occasionally double-escapes the JSON string, so after JSON.parse the
// Markdown arrives as one line with literal "\n" sequences (seen once in 12
// preview rewrites, benchmark 2026-10-28) and renders as a single paragraph.
// Only repair when the text has no real newline at all: a multi-line CV that
// mentions "\n" literally (e.g. a code snippet) is left untouched.
export function repairEscapedNewlines(md: string): string {
  if (md.includes('\\n') && !md.includes('\n')) {
    return md.replace(/\\r\\n|\\n/g, '\n').replace(/\\t/g, '\t');
  }
  return md;
}

export async function generateFullRewrite(
  jd: string,
  cvData: string,
  cvMimeType: string,
  language: 'vi' | 'en' = 'vi',
  timeoutMs: number = REWRITE_TIMEOUT_MS
): Promise<{ fullRewrittenCV: string; usage: AiCallUsage }> {
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

    const geminiStart = Date.now();
    const geminiPromise = client.models.generateContent({
      model: GEMINI_REWRITE_MODEL,
      contents: [{ role: 'user', parts }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: REWRITE_SCHEMA,
        maxOutputTokens: 16384,
        thinkingConfig: thinkingConfigFor(GEMINI_REWRITE_MODEL),
      },
    });

    const response = await Promise.race([geminiPromise, timeoutPromise]);
    const usage: AiCallUsage = {
      ...extractTokenUsage(response.usageMetadata),
      model: GEMINI_REWRITE_MODEL,
      latencyMs: Date.now() - geminiStart,
    };
    const resultText = response.text || '';

    try {
      const parsed = JSON.parse(resultText) as { fullRewrittenCV?: string };
      return { fullRewrittenCV: repairEscapedNewlines(parsed.fullRewrittenCV || ''), usage };
    } catch {
      const jsonMatch = resultText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as { fullRewrittenCV?: string };
        return { fullRewrittenCV: repairEscapedNewlines(parsed.fullRewrittenCV || ''), usage };
      }
      return { fullRewrittenCV: repairEscapedNewlines(resultText), usage };
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
