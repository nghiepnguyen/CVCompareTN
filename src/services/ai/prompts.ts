
export interface PromptParams {
  jdSection: string;
  language?: 'vi' | 'en';
}

export function buildAnalyzePrompt({ jdSection, language = 'vi' }: PromptParams): string {
  if (language === 'en') return buildAnalyzePromptEn({ jdSection });
  return buildAnalyzePromptVi({ jdSection });
}

/**
 * Build the Vietnamese analysis prompt for Gemini.
 */
export function buildAnalyzePromptVi({ jdSection }: PromptParams): string {
  return `
    Bạn là một chuyên gia tuyển dụng HR và chuyên gia về hệ thống ATS (Applicant Tracking System).
    Hãy phân tích sự phù hợp của CV này so với Mô tả công việc (JD).

    ${jdSection}

    Nhiệm vụ: Phân tích và So sánh với JD:
    1. Xác định chức danh công việc (Job Title) từ JD.
    2. Tính toán điểm phù hợp tổng thể (0-100).
    3. Cung cấp điểm thành phần (0-100) cho: Kỹ năng (Skills), Kỹ năng mềm (Soft Skills), Kỹ năng cứng (Hard Skills), Kỹ năng kỹ thuật (Technical Skills), Kinh nghiệm (Experience), Công cụ/Công nghệ (Tools), Ngôn ngữ (Language Skills), và Học văn/Chứng chỉ (Education).
    4. Liệt kê các điểm tương đồng cụ thể theo danh mục.
    5. Liệt kê các điểm còn thiếu (gaps).
    6. Xác định các từ khóa ATS quan trọng nên có trong CV.
    7. Cung cấp 5–8 gợi ý viết lại cụ thể bằng cách:
       - Đọc kỹ TOÀN BỘ nội dung CV đã cung cấp (không bỏ sót phần nào).
       - Bắt buộc cover TẤT CẢ các section có trong CV: Professional Summary, từng vị trí Work Experience, Skills, Education, Projects, Certifications (nếu có).
       - Với mỗi gợi ý: trích dẫn CHÍNH XÁC câu/đoạn gốc trong CV vào field "original" (không được để trống, không paraphrase), viết lại vào "optimized" theo công thức Google XYZ (Accomplished [X] as measured by [Y], by doing [Z]) với số liệu cụ thể nếu CV đã cung cấp, và giải thích lý do tối ưu vào "explanation".
       - Mỗi Work Experience entry phải có ít nhất 2 gợi ý riêng biệt cho 2 bullet point khác nhau.
       - Ưu tiên các bullet point thiếu số liệu định lượng, dùng động từ yếu, hoặc không liên quan đến yêu cầu JD.
    8. Ước tính xác suất thành công khi phỏng vấn và khả năng vượt qua vòng lọc CV.
    9. Cung cấp bảng so sánh chi tiết (Detailed Comparison) đối chiếu TẤT CẢ các yêu cầu trong JD.

    YÊU CẦU QUAN TRỌNG:
    - Toàn bộ nội dung phân tích (điểm số, nhận xét, giải thích) phải bằng TIẾNG VIỆT.
    - RIÊNG các gợi ý 'optimized' phải dùng ĐÚNG NGÔN NGỮ GỐC của CV.
    - Mốc thời gian phải chuẩn hóa về MM/YYYY.
    - Phân loại (category) trong matchingPoints và missingGaps phải thuộc danh sách: "Skills", "Soft Skills", "Hard Skills", "Technical Skills", "Language Skills", "Experience", "Tools", "Education".
      + "Hard Skills": kỹ năng chuyên môn đo lường được nói chung (VD: phân tích tài chính, quản lý dự án).
      + "Technical Skills": công nghệ/công cụ/ngôn ngữ lập trình cụ thể (VD: React, Python, SQL, AWS).
      + "Language Skills": CHỈ dành cho ngoại ngữ (VD: tiếng Anh, tiếng Nhật) — không dùng cho ngôn ngữ lập trình.
      + "Soft Skills": kỹ năng mềm (giao tiếp, làm việc nhóm, lãnh đạo...).
  `;
}

/**
 * CV extraction (Parsed CV) is generated separately via /api/parse-cv in the
 * background — see _server-lib/ai/parseCvService.ts — so the main analyze
 * call's output stays small enough to reliably finish within Vercel's 60s
 * maxDuration (Hobby plan hard limit; can't be raised).
 */
export function buildParseCvPrompt({ jdSection, language = 'vi' }: PromptParams): string {
  if (language === 'en') return buildParseCvPromptEn({ jdSection });
  return buildParseCvPromptVi({ jdSection });
}

function buildParseCvPromptVi({ jdSection }: PromptParams): string {
  return `
    Bạn là chuyên gia phân tích CV và hệ thống ATS (Applicant Tracking System).
    Nhiệm vụ: Trích xuất và chuẩn hóa toàn bộ thông tin từ CV được cung cấp thành định dạng JSON chi tiết, đối chiếu sơ bộ với JD dưới đây.

    ${jdSection}

    - Trích xuất thông tin cá nhân: Họ tên, Email, Số điện thoại, LinkedIn, Portfolio.
    - Học vấn: Trích xuất đầy đủ bằng cấp, trường, chuyên ngành, năm tốt nghiệp, GPA.
    - Kinh nghiệm làm việc: Trích xuất TẤT CẢ các công việc trong CV (không giới hạn số lượng). Với mỗi công việc, lấy đầy đủ thông tin: công ty, chức danh, mốc thời gian (Chuẩn hóa về định dạng MM/YYYY), chi tiết các nhiệm vụ và thành tựu (không tóm tắt quá ngắn).
    - Kỹ năng: Phân loại rõ ràng thành: technical_skills (kỹ năng kỹ thuật), soft_skills (kỹ năng mềm), hard_skills (kỹ năng cứng), tools_software (công cụ/phần mềm).
    - Dự án & Chứng chỉ: Trích xuất tên, mô tả, công nghệ sử dụng.
    - ATS Evaluation: Tính tổng số năm kinh nghiệm thực tế (dựa trên mốc thời gian kinh nghiệm, không chỉ lấy năm hiện tại trừ năm bắt đầu); relevant_score (0-100) là mức độ phù hợp tổng thể của CV với JD; key_match_highlights là các điểm nổi bật khớp với JD; missing_keywords là từ khóa quan trọng trong JD còn thiếu trong CV.

    YÊU CẦU QUAN TRỌNG:
    - Toàn bộ dữ liệu trích xuất (trừ phần ATS Evaluation) phải dùng ĐÚNG NGÔN NGỮ GỐC của CV (không dịch).
    - Mốc thời gian phải chuẩn hóa về MM/YYYY.
  `;
}

function buildParseCvPromptEn({ jdSection }: PromptParams): string {
  return `
    You are a CV analysis and ATS (Applicant Tracking System) expert.
    Task: Extract and standardize all information from the provided CV into a detailed JSON format, cross-referenced against the JD below.

    ${jdSection}

    - Personal Info: Full name, Email, Phone, LinkedIn, Portfolio.
    - Education: ALL degrees, institutions, majors, graduation years, GPA.
    - Work Experience: Extract ALL work experiences listed in the CV (no limit). For each role, provide complete details: company, title, duration (standardize to MM/YYYY), detailed responsibilities and achievements (do not truncate or over-summarize).
    - Skills: Categorize clearly into technical_skills, soft_skills, hard_skills, tools_software.
    - Projects & Certifications: Names, descriptions, tech stack used.
    - ATS Evaluation: Calculate total years of actual experience (based on experience milestones, not just subtracting start year from current year); relevant_score (0-100) is the CV's overall fit against the JD; key_match_highlights are standout points matching the JD; missing_keywords are important JD keywords absent from the CV.

    IMPORTANT REQUIREMENTS:
    - All extracted data (except the ATS Evaluation) must use the EXACT ORIGINAL LANGUAGE of the CV (do not translate).
    - Standardize dates to MM/YYYY format.
  `;
}

/**
 * Build the English analysis prompt for Gemini.
 */
export function buildAnalyzePromptEn({ jdSection }: PromptParams): string {
  return `
    You are an HR recruitment expert and an ATS (Applicant Tracking System) specialist.
    Analyze the suitability of this CV against the Job Description (JD).

    ${jdSection}

    Task: Analysis & Comparison with JD:
    1. Identify the Job Title from the JD.
    2. Calculate an overall match score (0-100).
    3. Provide component scores (0-100) for Skills, Soft Skills, Hard Skills, Technical Skills, Experience, Tools, Language Skills, and Education.
    4. List specific matching points by category.
    5. List missing gaps (gaps).
    6. Identify important ATS keywords.
    7. Provide 5–8 specific rewrite suggestions by:
       - Reading the ENTIRE CV content carefully (do not skip any section).
       - Mandatory coverage of ALL sections present in the CV: Professional Summary, each Work Experience entry, Skills, Education, Projects, Certifications (if present).
       - For each suggestion: quote the EXACT original sentence/bullet from the CV into the "original" field (never leave it empty, never paraphrase), rewrite into "optimized" using the Google XYZ formula (Accomplished [X] as measured by [Y], by doing [Z]) with specific metrics if the CV already contains them, and explain the reasoning in "explanation".
       - Each Work Experience entry must have at least 2 separate suggestions for 2 different bullet points.
       - Prioritize bullet points that lack quantitative metrics, use weak action verbs, or are not aligned with JD requirements.
    8. Estimate success probability and pass probability.
    9. Provide a detailed comparison table against ALL JD requirements.

    IMPORTANT REQUIREMENTS:
    - All analysis content (scores, comments, explanations) must be in ENGLISH.
    - The 'optimized' suggestions must use the EXACT ORIGINAL LANGUAGE of the CV.
    - Standardize dates to MM/YYYY format.
    - Categories in matchingPoints and missingGaps must be one of: "Skills", "Soft Skills", "Hard Skills", "Technical Skills", "Language Skills", "Experience", "Tools", "Education".
      + "Hard Skills": general measurable professional skills (e.g. financial analysis, project management).
      + "Technical Skills": specific technologies/tools/programming languages (e.g. React, Python, SQL, AWS).
      + "Language Skills": ONLY for spoken/foreign languages (e.g. English, Japanese) — never programming languages.
      + "Soft Skills": interpersonal skills (communication, teamwork, leadership...).
  `;
}
