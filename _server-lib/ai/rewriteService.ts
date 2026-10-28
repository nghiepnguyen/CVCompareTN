import { extractText } from 'unpdf';
import { normalizeTextualMonthYear } from '../../src/lib/cvDates.js';
import { validateFullRewrite, type FullRewriteViolation } from './suggestionGuard.js';
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
// The prompt asks for MM/YYYY when the CV gives a month, but the model often
// keeps English textual months ("Jan 2022 – Present"). Normalize only the ###
// role/education heading lines, the structural place dates live; body prose
// is left as written.
export function normalizeHeadingDates(md: string): string {
  return md.replace(/^###[^\n]*$/gm, (line) => normalizeTextualMonthYear(line));
}

export function repairEscapedNewlines(md: string): string {
  if (md.includes('\\n') && !md.includes('\n')) {
    return md.replace(/\\r\\n|\\n/g, '\n').replace(/\\t/g, '\t');
  }
  return md;
}

// A retry is only tried when this much of the caller's single wall-clock
// budget is still left; otherwise the request goes straight to the fidelity
// fallback. Synthetic text CVs rewrite in ~2-6s (benchmark 2026-10-28), but
// long real CVs and production latency were not measured, so the margin is
// kept conservative.
export const REWRITE_RETRY_MIN_BUDGET_MS = 20_000;

// Retry after a failed fidelity check: the raw JD is withheld (it is where the
// unsupported concepts come from) and the violations are not named, so the
// model has nothing JD-specific to copy back.
function retryJdSection(language: 'vi' | 'en'): string {
  return language === 'vi'
    ? 'KHÔNG có JD cho lần viết này. Bản viết trước đã thêm dữ kiện không có trong CV gốc. Viết lại CV chuyên nghiệp, thân thiện ATS, CHỈ dùng thông tin có trong CV gốc; bỏ qua mọi hướng dẫn liên quan đến JD bên dưới.'
    : 'There is NO JD for this attempt. The previous draft added facts that are not in the original CV. Rewrite the CV professionally and ATS-friendly using ONLY information in the original CV; ignore any instruction below that refers to the JD.';
}

export function parseRewriteText(resultText: string): string {
  try {
    const parsed = JSON.parse(resultText) as { fullRewrittenCV?: string };
    return normalizeHeadingDates(repairEscapedNewlines(parsed.fullRewrittenCV || ''));
  } catch {
    const jsonMatch = resultText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as { fullRewrittenCV?: string };
      return normalizeHeadingDates(repairEscapedNewlines(parsed.fullRewrittenCV || ''));
    }
    return normalizeHeadingDates(repairEscapedNewlines(resultText));
  }
}

const addUsage = (a: AiCallUsage, b: AiCallUsage): AiCallUsage => ({
  model: a.model,
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
  latencyMs: a.latencyMs + b.latencyMs,
});

// Violation details without number values (a number outside the preamble
// may still be contact data); raw-JD concepts are JD vocabulary, not PII.
const logFidelity = (pass: 'first' | 'retry', violations: FullRewriteViolation[]) =>
  console.info(
    '[fullRewriteGuard] violation',
    JSON.stringify({ pass, violations: violations.map((v) => (v.reason === 'raw-jd' ? v : { reason: v.reason })) })
  );

/**
 * Full CV = generation → fidelity validation → at most one safe retry →
 * fidelity fallback (empty CV + flag). An output that failed validation is
 * never returned. Validation needs the exact CV text the model was given, so
 * it is skipped for inline PDF/image input (missing text is not evidence that
 * the CV lacks a fact); those keep the prompt-only guard.
 */
export async function generateFullRewrite(
  jd: string,
  cvData: string,
  cvMimeType: string,
  language: 'vi' | 'en' = 'vi',
  timeoutMs: number = REWRITE_TIMEOUT_MS
): Promise<{ fullRewrittenCV: string; usage: AiCallUsage; fidelityFallback?: true }> {
  const client = getGeminiClient();
  const deadline = Date.now() + timeoutMs;

  const jdSection =
    language === 'vi' ? `Mô tả công việc (JD):\n${jd}` : `Job Description (JD):\n${jd}`;
  const buildPrompt = language === 'vi' ? buildRewritePromptVi : buildRewritePromptEn;

  type GeminiPart = { text: string } | { inlineData: { data: string; mimeType: string } };
  const cvParts: GeminiPart[] = [];
  // The CV text sent to the model, when it was sent as text.
  let cvText: string | undefined;

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

  const callRewrite = async (promptText: string) => {
    const geminiStart = Date.now();
    const geminiPromise = client.models.generateContent({
      model: GEMINI_REWRITE_MODEL,
      contents: [{ role: 'user', parts: [{ text: promptText }, ...cvParts] }],
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
    return { fullRewrittenCV: parseRewriteText(response.text || ''), usage };
  };

  try {
    if (cvMimeType === 'application/pdf') {
      try {
        const base64Data = cvData.split(',')[1] || cvData;
        const buffer = Buffer.from(base64Data, 'base64');
        const { text } = await Promise.race([
          extractText(new Uint8Array(buffer), { mergePages: true }),
          timeoutPromise,
        ]);
        if (text && text.trim().length >= 100) {
          cvParts.push({ text: `CV Content:\n${text}` });
          cvText = text;
        }
      } catch (e) {
        if (e instanceof Error && e.message.includes('(Timeout)')) throw e;
      }
      if (cvText === undefined) {
        cvParts.push({
          inlineData: { data: cvData.split(',')[1] || cvData, mimeType: 'application/pdf' },
        });
      }
    } else if (cvMimeType.startsWith('image/')) {
      cvParts.push({
        inlineData: { data: cvData.split(',')[1] || cvData, mimeType: cvMimeType },
      });
    } else {
      cvParts.push({ text: `CV Content:\n${cvData}` });
      cvText = cvData;
    }

    const first = await callRewrite(buildPrompt(jdSection));
    if (cvText === undefined) return first;
    const firstCheck = validateFullRewrite({ originalCvText: cvText, jd, rewrittenCv: first.fullRewrittenCV });
    if (firstCheck.valid) return first;
    logFidelity('first', firstCheck.violations);

    const fallback = (usage: AiCallUsage) => ({ fullRewrittenCV: '', usage, fidelityFallback: true as const });
    if (deadline - Date.now() < REWRITE_RETRY_MIN_BUDGET_MS) return fallback(first.usage);
    let retry: Awaited<ReturnType<typeof callRewrite>>;
    try {
      retry = await callRewrite(buildPrompt(retryJdSection(language)));
    } catch (err) {
      console.warn('[fullRewriteGuard] retry failed:', err instanceof Error ? err.message : err);
      return fallback(first.usage);
    }
    const usage = addUsage(first.usage, retry.usage);
    const retryCheck = validateFullRewrite({ originalCvText: cvText, jd, rewrittenCv: retry.fullRewrittenCV });
    if (retryCheck.valid) return { fullRewrittenCV: retry.fullRewrittenCV, usage };
    logFidelity('retry', retryCheck.violations);
    return fallback(usage);
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
