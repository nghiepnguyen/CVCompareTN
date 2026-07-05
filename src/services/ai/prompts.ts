
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
    2. TRƯỚC KHI chấm điểm, phân loại các yêu cầu trong JD thành hai nhóm:
       - BẮT BUỘC (required/must-have): yêu cầu JD diễn đạt bằng "phải có", "yêu cầu", "bắt buộc", "cần có", hoặc nằm trong mục "Yêu cầu công việc/Requirements/Qualifications".
       - ƯU TIÊN (nice-to-have/preferred): yêu cầu JD diễn đạt bằng "ưu tiên", "là một lợi thế", "điểm cộng", "không bắt buộc", hoặc nằm trong mục "Ưu tiên/Preferred/Nice to have/Bonus".
       Nếu JD không phân định rõ, coi các yêu cầu kỹ năng/công cụ/kinh nghiệm CỐT LÕI của vị trí là BẮT BUỘC, các yêu cầu bổ trợ là ƯU TIÊN.
       Đồng thời trích xuất số năm kinh nghiệm TỐI THIỂU JD yêu cầu nếu có nêu rõ (VD: "3+ năm", "tối thiểu 5 năm kinh nghiệm"); nếu JD không nêu số năm cụ thể, bỏ qua việc so sánh số năm và đánh giá kinh nghiệm dựa trên độ phù hợp vai trò/seniority.
    3. Tính điểm phù hợp tổng thể (0-100) và điểm thành phần (0-100) cho: Kỹ năng (Skills), Kỹ năng mềm (Soft Skills), Kỹ năng cứng (Hard Skills), Kỹ năng kỹ thuật (Technical Skills), Kinh nghiệm (Experience), Công cụ/Công nghệ (Tools), Ngôn ngữ (Language Skills), và Học vấn/Chứng chỉ (Education). Áp dụng thang điểm chuẩn hóa sau cho MỖI điểm thành phần, dựa trên nhóm BẮT BUỘC/ƯU TIÊN đã xác định ở bước 2:
       - 90-100: Đáp ứng ĐẦY ĐỦ mọi yêu cầu BẮT BUỘC của category + hầu hết yêu cầu ƯU TIÊN, có bằng chứng cụ thể trong CV.
       - 75-89: Đáp ứng tất cả hoặc gần hết yêu cầu BẮT BUỘC, có thể thiếu một vài yêu cầu ƯU TIÊN.
       - 60-74: Đáp ứng phần lớn (≥70%) yêu cầu BẮT BUỘC, hoặc thiếu 1 yêu cầu BẮT BUỘC không quá quan trọng, hoặc thiếu nhiều yêu cầu ƯU TIÊN.
       - 40-59: Chỉ đáp ứng dưới 50% yêu cầu BẮT BUỘC, hoặc thiếu ít nhất 1 yêu cầu BẮT BUỘC quan trọng (critical) của category.
       - 20-39: Hầu như không đáp ứng yêu cầu BẮT BUỘC nào của category, chỉ có liên hệ mơ hồ/gián tiếp.
       - 0-19: Không có bằng chứng liên quan trong CV.
       Riêng điểm "Kinh nghiệm" (Experience): nếu đã xác định được số năm YÊU CẦU ở bước 2, tính số năm kinh nghiệm THỰC TẾ của candidate (ước tính từ TOÀN BỘ mốc thời gian công việc trong CV, không chỉ vị trí gần nhất), dùng thang điểm trên làm điểm nền rồi điều chỉnh: thực tế ≥100% yêu cầu → giữ điểm nền; 80-99% → trừ 10-15 điểm; 50-79% → trừ 25-35 điểm; dưới 50% → điểm tối đa 40 dù các yếu tố khác tốt.
    4. Liệt kê các điểm tương đồng cụ thể theo danh mục (matchingPoints).
    5. Liệt kê các điểm còn thiếu (missingGaps). Yêu cầu BẮT BUỘC bị thiếu LUÔN gán impact = "High"; yêu cầu ƯU TIÊN bị thiếu gán impact = "Medium" hoặc "Low" tùy mức độ ảnh hưởng thực tế.
    6. Xác định từ khóa ATS (atsKeywords) theo cách một bộ máy ATS THẬT hoạt động — so khớp CHUỖI/CỤM TỪ gần-chính xác, KHÔNG suy diễn ngữ nghĩa lỏng:
       - So khớp không phân biệt hoa/thường, chấp nhận số ít/số nhiều và các biến thể viết tắt ↔ đầy đủ được công nhận rộng rãi (VD: "JS" ↔ "JavaScript", "AWS" ↔ "Amazon Web Services", "PM" ↔ "Project Manager").
       - Với mỗi từ khóa/cụm từ quan trọng trong JD (kỹ năng, công cụ, chứng chỉ, chức danh, công nghệ...): kiểm tra chuỗi đó (hoặc biến thể được công nhận) có xuất hiện LITERAL trong text CV hay không — không tính là khớp chỉ vì có khái niệm liên quan về ngữ nghĩa.
       - Nếu chuỗi/biến thể xuất hiện trong CV → đưa vào atsKeywords.
       - Nếu JD nêu rõ nhưng KHÔNG có chuỗi/biến thể nào xuất hiện literal trong CV (kể cả khi CV có kinh nghiệm/kỹ năng liên quan về nghĩa) → liệt kê vào missingGaps và ghi rõ trong "content" đây là thiếu TỪ KHÓA CHÍNH XÁC cho ATS (VD: "CV có kinh nghiệm phân tích số liệu tương đương nhưng không ghi rõ chuỗi 'Google Analytics'").
    7. Cung cấp 5–8 gợi ý viết lại cụ thể bằng cách:
       - Đọc kỹ TOÀN BỘ nội dung CV đã cung cấp (không bỏ sót phần nào).
       - Bắt buộc cover TẤT CẢ các section có trong CV: Professional Summary, từng vị trí Work Experience, Skills, Education, Projects, Certifications (nếu có).
       - Với mỗi gợi ý: trích dẫn CHÍNH XÁC câu/đoạn gốc trong CV vào field "original" (không được để trống, không paraphrase), viết lại vào "optimized" theo công thức Google XYZ (Accomplished [X] as measured by [Y], by doing [Z]) với số liệu cụ thể nếu CV đã cung cấp, và giải thích lý do tối ưu vào "explanation".
       - Mỗi Work Experience entry phải có ít nhất 2 gợi ý riêng biệt cho 2 bullet point khác nhau.
       - Ưu tiên các bullet point thiếu số liệu định lượng, dùng động từ yếu, hoặc không liên quan đến yêu cầu JD, ĐẶC BIỆT các yêu cầu BẮT BUỘC.
    8. Ước tính xác suất thành công khi phỏng vấn và khả năng vượt qua vòng lọc CV, phản ánh đúng việc các gap thuộc yêu cầu BẮT BUỘC ảnh hưởng nặng hơn nhiều so với gap thuộc yêu cầu ƯU TIÊN.
    9. Cung cấp bảng so sánh chi tiết (detailedComparison) đối chiếu TẤT CẢ các yêu cầu trong JD, phân bổ MỖI yêu cầu vào ĐÚNG MỘT nhóm sau (không bỏ sót, không trùng lặp một yêu cầu ở nhiều nhóm):
       - "skills": mọi yêu cầu về NĂNG LỰC/KỸ NĂNG nói chung — kỹ năng cứng, kỹ năng mềm, kỹ năng kỹ thuật/ngôn ngữ lập trình, và năng lực ngoại ngữ (VD: "thành thạo React", "kỹ năng giao tiếp tốt", "tiếng Anh trôi chảy").
       - "tools": yêu cầu về CÔNG CỤ/PHẦN MỀM/NỀN TẢNG/CÔNG NGHỆ cụ thể có TÊN RIÊNG (VD: AWS, Jira, Photoshop, Docker, Salesforce). Nếu một yêu cầu vừa là tên công nghệ cụ thể vừa được diễn đạt như một kỹ năng ("thành thạo AWS"), ưu tiên xếp vào "tools".
       - "experience": yêu cầu về SỐ NĂM kinh nghiệm, loại/lĩnh vực kinh nghiệm, cấp độ (seniority), vai trò quản lý/lãnh đạo đã từng đảm nhiệm.
       - "education": yêu cầu về bằng cấp, chuyên ngành, trường học, và chứng chỉ chuyên môn (certifications).
       - "keywords": thuật ngữ/cụm từ/từ viết tắt xuất hiện trong JD mà một ATS literal sẽ tìm kiếm nguyên văn nhưng KHÔNG map rõ vào 4 nhóm trên (VD: tên phương pháp luận như "Agile/Scrum", biệt ngữ ngành, mô hình kinh doanh "B2B SaaS"). Nhóm này LUÔN xuất hiện trong kết quả, có thể là mảng rỗng nếu JD không có thuật ngữ phù hợp.
       Với MỖI item trong detailedComparison, đặt "priority" = "required" nếu yêu cầu thuộc nhóm BẮT BUỘC ở bước 2, hoặc "nice-to-have" nếu thuộc nhóm ƯU TIÊN.
    10. Đánh giá khả năng đọc được của ATS (formatAssessment) dựa trên FILE GỐC của CV, nếu file gốc (PDF/ảnh) được cung cấp kèm theo (không chỉ text đã trích xuất):
       - Nếu có file gốc: quan sát trực quan bố cục — có bị chia nhiều cột không (hasMultiColumnLayout), có dùng bảng/hình ảnh/biểu đồ để trình bày nội dung chính không (hasTablesOrGraphics), các heading section có dùng tên chuẩn ATS nhận diện được không như "Kinh nghiệm/Experience", "Học vấn/Education", "Kỹ năng/Skills" (hasStandardSectionHeadings), thông tin liên hệ (email/SĐT) có bị đặt trong header/footer hoặc text box tách biệt khỏi nội dung chính không — đây là lỗi phổ biến khiến ATS không đọc được (contactInfoInHeaderFooter), font chữ có nhất quán xuyên suốt CV không (fontConsistencyIssue: true nếu KHÔNG nhất quán), định dạng ngày có nhất quán không (dateFormatConsistent), CV có phải là ảnh scan/chụp thay vì file tạo từ phần mềm không (isLikelyScannedImage). Tính overallAtsParseabilityScore (0-100: 100 = cực dễ đọc với ATS, 0 = ATS gần như không đọc được) và liệt kê các phát hiện cụ thể bằng câu văn dễ hiểu vào formatIssues. Đặt analysisAvailable = true.
       - Nếu KHÔNG có file gốc (chỉ có text CV): KHÔNG suy đoán về layout — đặt analysisAvailable = false, overallAtsParseabilityScore = 0, tất cả các cờ boolean còn lại = false, và formatIssues = [].

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
    - ATS Evaluation: Tính tổng số năm kinh nghiệm thực tế (dựa trên mốc thời gian kinh nghiệm, không chỉ lấy năm hiện tại trừ năm bắt đầu); relevant_score (0-100) là mức độ phù hợp tổng thể của CV với JD — khi ước tính relevant_score, ưu tiên đối chiếu các yêu cầu BẮT BUỘC/cốt lõi của JD (VD: yêu cầu diễn đạt bằng "phải có", "yêu cầu", hoặc nằm trong mục "Yêu cầu công việc") nặng hơn các yêu cầu mang tính "ưu tiên/là một lợi thế"; key_match_highlights là các điểm nổi bật khớp với JD; missing_keywords là các từ khóa/cụm từ QUAN TRỌNG trong JD mà không có chuỗi hoặc biến thể viết tắt/đầy đủ tương ứng (VD: "JS" ↔ "JavaScript", "AWS" ↔ "Amazon Web Services") xuất hiện literal trong text CV — không chỉ dựa vào liên hệ ngữ nghĩa lỏng.

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
    - ATS Evaluation: Calculate total years of actual experience (based on experience milestones, not just subtracting start year from current year); relevant_score (0-100) is the CV's overall fit against the JD — when estimating relevant_score, weigh REQUIRED/core JD requirements (e.g. phrased as "must have", "required", or listed under a "Requirements" section) more heavily than "preferred/a plus" requirements; key_match_highlights are standout points matching the JD; missing_keywords are important JD terms/phrases for which no matching string or recognized abbreviation/full-form variant (e.g. "JS" ↔ "JavaScript", "AWS" ↔ "Amazon Web Services") appears literally in the CV text — not just loosely related concepts.

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
    2. BEFORE scoring, classify every JD requirement into one of two groups:
       - REQUIRED (must-have): requirements phrased as "must have", "required", "mandatory", "need to have", or listed under a "Requirements/Qualifications" section.
       - NICE-TO-HAVE (preferred): requirements phrased as "preferred", "a plus", "bonus", "not required", or listed under a "Preferred/Nice to have/Bonus" section.
       If the JD does not clearly separate these, treat core skill/tool/experience requirements of the role as REQUIRED and supplementary "would be good to have" items as NICE-TO-HAVE.
       Also extract the MINIMUM years of experience the JD requires, if explicitly stated (e.g. "3+ years", "minimum 5 years of experience"); if the JD states no specific number, skip the years comparison and assess experience based on role/seniority fit instead.
    3. Calculate an overall match score (0-100) and component scores (0-100) for Skills, Soft Skills, Hard Skills, Technical Skills, Experience, Tools, Language Skills, and Education. Apply the following standardized scoring band to EACH component score, based on the REQUIRED/NICE-TO-HAVE classification from step 2:
       - 90-100: FULLY meets all REQUIRED items for this category plus most NICE-TO-HAVE items, with concrete evidence in the CV.
       - 75-89: Meets all or nearly all REQUIRED items, may be missing a few NICE-TO-HAVE items.
       - 60-74: Meets most (≥70%) REQUIRED items, or is missing one non-critical REQUIRED item, or is missing several NICE-TO-HAVE items.
       - 40-59: Meets fewer than 50% of REQUIRED items, or is missing at least one critical REQUIRED item for this category.
       - 20-39: Meets almost none of the REQUIRED items for this category, only vague/indirect relevance.
       - 0-19: No relevant evidence found in the CV.
       For the "Experience" score specifically: if a REQUIRED years figure was extracted in step 2, compute the candidate's ACTUAL years of experience (estimated from ALL work-history timelines in the CV, not just the most recent role), use the band above as the baseline score, then adjust: actual ≥100% of required → keep baseline; 80-99% → subtract 10-15 points; 50-79% → subtract 25-35 points; below 50% → cap the score at 40 regardless of how strong other factors are.
    4. List specific matching points by category (matchingPoints).
    5. List missing gaps (missingGaps). A missing REQUIRED item MUST always be tagged impact = "High"; a missing NICE-TO-HAVE item should be tagged impact = "Medium" or "Low" depending on actual severity.
    6. Identify ATS keywords (atsKeywords) the way a REAL ATS engine actually works — literal string/phrase matching, not loose semantic inference:
       - Match case-insensitively, accepting singular/plural forms and well-recognized abbreviation ↔ full-form variants (e.g. "JS" ↔ "JavaScript", "AWS" ↔ "Amazon Web Services", "PM" ↔ "Project Manager").
       - For each important keyword/phrase in the JD (skill name, tool, certification, job title, technology...): check whether that exact string (or a recognized variant) appears literally in the CV text — do not count it as a match just because a semantically related concept exists.
       - If the string/variant appears in the CV → include it in atsKeywords.
       - If the JD states it but NO literal string/variant appears anywhere in the CV (even if the CV shows semantically related experience) → list it in missingGaps and explicitly note in "content" that this is a missing EXACT ATS KEYWORD (e.g. "CV shows equivalent analytics experience but never states the exact string 'Google Analytics'").
    7. Provide 5–8 specific rewrite suggestions by:
       - Reading the ENTIRE CV content carefully (do not skip any section).
       - Mandatory coverage of ALL sections present in the CV: Professional Summary, each Work Experience entry, Skills, Education, Projects, Certifications (if present).
       - For each suggestion: quote the EXACT original sentence/bullet from the CV into the "original" field (never leave it empty, never paraphrase), rewrite into "optimized" using the Google XYZ formula (Accomplished [X] as measured by [Y], by doing [Z]) with specific metrics if the CV already contains them, and explain the reasoning in "explanation".
       - Each Work Experience entry must have at least 2 separate suggestions for 2 different bullet points.
       - Prioritize bullet points that lack quantitative metrics, use weak action verbs, or are not aligned with JD requirements, ESPECIALLY REQUIRED requirements.
    8. Estimate success probability and pass probability, correctly reflecting that gaps in REQUIRED items hurt these estimates far more than gaps in NICE-TO-HAVE items.
    9. Provide a detailed comparison table (detailedComparison) against ALL JD requirements, assigning EACH requirement to EXACTLY ONE of the following buckets (no omissions, no duplicating a requirement across buckets):
       - "skills": any requirement about general ABILITY/COMPETENCY — hard skills, soft skills, technical skills/programming languages, and spoken-language proficiency (e.g. "proficient in React", "strong communication skills", "fluent English").
       - "tools": requirements naming a specific, PROPER-NOUN tool/software/platform/technology (e.g. AWS, Jira, Photoshop, Docker, Salesforce). If a requirement is both a named technology and phrased as a skill ("proficient in AWS"), prefer "tools" since it names a specific product/platform.
       - "experience": requirements about YEARS of experience, type/domain of experience, seniority level, or management/leadership roles held.
       - "education": requirements about degrees, majors, institutions, and professional certifications.
       - "keywords": terms/phrases/abbreviations appearing in the JD that a literal ATS would search for verbatim but that do NOT map cleanly to the four buckets above (e.g. methodology names like "Agile/Scrum", domain jargon, business-model terms like "B2B SaaS"). This bucket must ALWAYS be present in the output, even as an empty array if no such terms apply.
       For EVERY item in detailedComparison, set "priority" to "required" if the requirement belongs to the REQUIRED group from step 2, or "nice-to-have" if it belongs to the NICE-TO-HAVE group.
    10. Assess ATS readability (formatAssessment) based on the CV's ORIGINAL FILE, if the original file (PDF/image) was provided alongside the extracted text (not just the text itself):
       - If the original file is present: visually inspect the layout — is it split into multiple columns (hasMultiColumnLayout), does it rely on tables/images/graphics to present core content (hasTablesOrGraphics), do section headings use ATS-recognizable standard names like "Experience", "Education", "Skills" (hasStandardSectionHeadings), is contact info (email/phone) placed in a header/footer or a separate text box outside the main content flow — a common failure mode ATS parsers can't read (contactInfoInHeaderFooter), is the font consistent throughout the document (fontConsistencyIssue: true if NOT consistent), are dates formatted consistently (dateFormatConsistent), does the document look like a scanned/photographed image rather than a digitally generated file (isLikelyScannedImage). Compute overallAtsParseabilityScore (0-100: 100 = extremely ATS-readable, 0 = ATS can barely read it) and list concrete, plain-language findings in formatIssues. Set analysisAvailable = true.
       - If NO original file is present (text only): do NOT guess about layout — set analysisAvailable = false, overallAtsParseabilityScore = 0, every other boolean flag = false, and formatIssues = [].

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
