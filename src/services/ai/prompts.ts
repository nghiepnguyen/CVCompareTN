
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
    Hãy thực hiện đồng thời hai nhiệm vụ quan trọng:
    1. Trích xuất và chuẩn hóa thông tin từ CV thành định dạng JSON chi tiết (Parsed CV).
    2. Phân tích sự phù hợp của CV này so với Mô tả công việc (JD).

    ${jdSection}

    Nhiệm vụ 1: Trích xuất và chuẩn hóa CV (Parsed CV):
    - Trích xuất thông tin cá nhân: Họ tên, Email, Số điện thoại, LinkedIn, Portfolio.
    - Học vấn: Trích xuất đầy đủ bằng cấp, trường, chuyên ngành, năm tốt nghiệp, GPA.
    - Kinh nghiệm làm việc: Trích xuất TẤT CẢ các công việc trong CV (không giới hạn số lượng). Với mỗi công việc, lấy đầy đủ thông tin: công ty, chức danh, mốc thời gian (Chuẩn hóa về định dạng MM/YYYY), chi tiết các nhiệm vụ và thành tựu (không tóm tắt quá ngắn).
    - Kỹ năng: Phân loại rõ ràng thành: technical_skills (kỹ năng kỹ thuật), soft_skills (kỹ năng mềm), tools_software (công cụ/phần mềm).
    - Dự án & Chứng chỉ: Trích xuất tên, mô tả, công nghệ sử dụng.
    - ATS Evaluation sơ bộ: Tính toán tổng số năm kinh nghiệm thực tế (dựa trên các mốc thời gian kinh nghiệm, không chỉ là lấy năm hiện tại trừ năm bắt đầu).

    Nhiệm vụ 2: Phân tích và So sánh với JD:
    1. Xác định chức danh công việc (Job Title) từ JD.
    2. Tính toán điểm phù hợp tổng thể (0-100).
    3. Cung cấp điểm thành phần (0-100) cho: Kỹ năng (Skills), Kinh nghiệm (Experience), Công cụ/Công nghệ (Tools), và Học văn/Chứng chỉ (Education).
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
    - RIÊNG các gợi ý 'optimized' và PHẦN PARSED CV (trừ phần đánh giá) phải dùng ĐÚNG NGÔN NGỮ GỐC của CV.
    - Mốc thời gian phải chuẩn hóa về MM/YYYY.
    - Phân loại (category) trong matchingPoints và missingGaps phải thuộc danh sách: "Skills", "Soft Skills", "Hard Skills", "Technical Skills", "Experience", "Tools", "Education".
  `;
}

/**
 * Build the English analysis prompt for Gemini.
 */
export function buildAnalyzePromptEn({ jdSection }: PromptParams): string {
  return `
    You are an HR recruitment expert and an ATS (Applicant Tracking System) specialist.
    Perform two critical tasks simultaneously:
    1. Extract and standardize CV information into a detailed JSON format (Parsed CV).
    2. Analyze the suitability of this CV against the Job Description (JD).

    ${jdSection}

    Task 1: CV Extraction & Standardization (Parsed CV):
    - Personal Info: Full name, Email, Phone, LinkedIn, Portfolio.
    - Education: ALL degrees, institutions, majors, graduation years, GPA.
    - Work Experience: Extract ALL work experiences listed in the CV (no limit). For each role, provide complete details: companies, titles, durations (Standardize to MM/YYYY), detailed responsibilities, and achievements (do not truncate or over-summarize).
    - Skills: Categorize clearly into technical_skills, soft_skills, tools_software.
    - Projects & Certifications: Names, descriptions, tech stack used.
    - Preliminary ATS Evaluation: Calculate total years of actual experience (based on experience milestones, not just subtracting start year from current year).

    Task 2: Analysis & Comparison with JD:
    1. Identify the Job Title from the JD.
    2. Calculate an overall match score (0-100).
    3. Provide component scores (0-100) for Skills, Experience, Tools, and Education.
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
    - The 'optimized' suggestions and the PARSED CV data (except evaluation) must use the EXACT ORIGINAL LANGUAGE of the CV.
    - Standardize dates to MM/YYYY format.
    - Categories in matchingPoints and missingGaps must be one of: "Skills", "Soft Skills", "Hard Skills", "Technical Skills", "Experience", "Tools", "Education".
  `;
}
