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
          return JSON.parse(fixed.replace(/[\u0000-\u001F\u007F-\u009F]/g, ""));
        } catch (e3) {
          throw e2;
        }
      }
    }
    throw e;
  }
};

export async function analyzeCV(jd: string, cvData: string, cvMimeType: string, cvName?: string, jdUrl?: string, language: 'vi' | 'en' = 'vi'): Promise<AnalysisResult> {
  const client = await getGeminiClient();
  
  const jdSection = jdUrl 
    ? (language === 'vi' 
        ? `Mô tả công việc (JD) nằm trong liên kết sau: ${jdUrl}. Hãy truy cập liên kết này để lấy nội dung JD.`
        : `The Job Description (JD) is located at the following link: ${jdUrl}. Please access this link to retrieve the JD content.`)
    : (language === 'vi'
        ? `Mô tả công việc (JD):\n${jd}`
        : `Job Description (JD):\n${jd}`);

  const promptVi = `
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
    7. Cung cấp các gợi ý viết lại cụ thể cho từng phần CV (Sử dụng công thức Google XYZ).
    8. Viết lại toàn bộ CV (Full Rewritten CV) chuyên nghiệp, tối ưu 100% cho ATS.
    9. Ước tính xác suất thành công khi phỏng vấn và khả năng vượt qua vòng lọc CV.
    10. Cung cấp bảng so sánh chi tiết (Detailed Comparison) đối chiếu TẤT CẢ các yêu cầu trong JD.
    
    YÊU CẦU QUAN TRỌNG: 
    - Toàn bộ nội dung phân tích (điểm số, nhận xét, giải thích) phải bằng TIẾNG VIỆT.
    - RIÊNG PHẦN VIẾT LẠI CV (fullRewrittenCV), các gợi ý 'optimized' và PHẦN PARSED CV (trừ phần đánh giá) phải dùng ĐÚNG NGÔN NGỮ GỐC của CV.
    - fullRewrittenCV là một chuỗi Markdown (GFM), KHÔNG được là một khối văn phẳng chỉ xuống dòng:
      • Dòng đầu: tiêu đề cấp 1 (một ký tự # + khoảng trắng + họ tên đầy đủ)
      • Tiếp theo có thể 1–3 dòng tagline / liên hệ (không dùng #)
      • Mỗi mục chính phải mở bằng tiêu đề cấp 2 (## và khoảng trắng + tên mục; ví dụ Professional Summary, Work Experience / Kinh nghiệm làm việc…)
      • Mỗi vị trí công việc: tiêu đề cấp 3 (### và khoảng trắng + chức danh — công ty | MM/YYYY – MM/YYYY), sau đó các dòng gạch đầu dòng (gạch ngang và khoảng trắng)
      • Luôn dùng gạch đầu dòng cho danh sách; không được chỉ có các đoạn văn liền mạch không có tiêu đề Markdown.
    - Mốc thời gian phải chuẩn hóa về MM/YYYY.
    - Phân loại (category) trong matchingPoints và missingGaps phải thuộc danh sách: "Skills", "Soft Skills", "Hard Skills", "Technical Skills", "Experience", "Tools", "Education".
    - Trả về kết quả dưới định dạng JSON tuân thủ cấu trúc sau:
    {
      "jobTitle": "...",
      "matchScore": 85,
      "categoryScores": {
        "skills": 90,
        "experience": 80,
        "tools": 85,
        "education": 70
      },
      "matchingPoints": [{"category": "Skills", "content": "..."}],
      "missingGaps": [{"category": "Skills", "content": "...", "impact": "High"}],
      "successProbability": "High",
      "passProbability": "High",
      "passExplanation": "...",
      "mainFactor": "...",
      "atsKeywords": ["...", "..."],
      "rewriteSuggestions": [{"section": "...", "original": "...", "optimized": "...", "explanation": "..."}],
      "fullRewrittenCV": "...",
      "detailedComparison": {
        "skills": [{"requirement": "...", "status": "matched", "cvEvidence": "...", "improvement": "..."}],
        "experience": [{"requirement": "...", "status": "missing", "improvement": "..."}],
        "tools": [{"requirement": "...", "status": "partial", "cvEvidence": "...", "improvement": "..."}],
        "education": [{"requirement": "...", "status": "matched", "cvEvidence": "..."}],
        "keywords": [{"requirement": "...", "status": "matched", "cvEvidence": "...", "improvement": "..."}]
      },
      "parsedCV": {
        "personal_information": {"full_name": "...", "contact": {"email": "...", "phone": "...", "location": "...", "linkedin": "...", "website_portfolio": "..."}, "summary": "..."},
        "education": [{"degree": "...", "institution": "...", "major": "...", "graduation_year": 2020, "gpa": "..."}],
        "work_experience": [{"company": "...", "job_title": "...", "duration": {"start": "01/2020", "end": "12/2022", "is_current": false}, "responsibilities": ["..."], "achievements": ["..."]}],
        "skills": {"technical_skills": ["..."], "soft_skills": ["..."], "tools_software": ["..."], "languages": [{"language": "...", "proficiency": "..."}]},
        "projects": [{"name": "...", "description": "...", "tech_stack": ["..."], "link": "..."}],
        "certifications": ["..."],
        "ats_evaluation": {"years_of_experience": 5, "relevant_score": 85, "key_match_highlights": ["..."], "missing_keywords": ["..."]}
      }
    }
  `;

  const promptEn = `
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
    7. Provide specific rewrite suggestions (Google XYZ formula).
    8. Generate a FULL REWRITTEN CV optimized 100% for ATS.
    9. Estimate success probability and pass probability.
    10. Provide a detailed comparison table against ALL JD requirements.
    
    IMPORTANT REQUIREMENTS:
    - All analysis content (scores, comments, explanations) must be in ENGLISH.
    - The FULL REWRITTEN CV (fullRewrittenCV field), 'optimized' suggestions, and the PARSED CV data (except evaluation) must use the EXACT ORIGINAL LANGUAGE of the CV.
    - fullRewrittenCV MUST be a GitHub-Flavored Markdown string, NOT a single flat prose block:
      • First line: level-1 heading (one hash #, space, full name)
      • Optionally next 1–3 lines for title / contact (no leading #)
      • Each major section starts with a level-2 heading (## followed by space and section name; e.g. Professional Summary, Work Experience, Education, Skills…)
      • Each job: level-3 heading (### followed by space + Job Title — Company | MM/YYYY – MM/YYYY), then hyphen bullets for responsibilities / achievements
      • Always use hyphen bullet lists; do not output only paragraph breaks without Markdown headings.
    - Standardize dates to MM/YYYY format.
    - Categories in matchingPoints and missingGaps must be one of: "Skills", "Soft Skills", "Hard Skills", "Technical Skills", "Experience", "Tools", "Education".
    - Return the result in JSON format following this structure:
    {
      "jobTitle": "...",
      "matchScore": 85,
      "categoryScores": {
        "skills": 90,
        "experience": 80,
        "tools": 85,
        "education": 70
      },
      "matchingPoints": [{"category": "Skills", "content": "..."}],
      "missingGaps": [{"category": "Skills", "content": "...", "impact": "High"}],
      "successProbability": "High",
      "passProbability": "High",
      "passExplanation": "...",
      "mainFactor": "...",
      "atsKeywords": ["...", "..."],
      "rewriteSuggestions": [{"section": "...", "original": "...", "optimized": "...", "explanation": "..."}],
      "fullRewrittenCV": "...",
      "detailedComparison": {
        "skills": [{"requirement": "...", "status": "matched", "cvEvidence": "...", "improvement": "..."}],
        "experience": [{"requirement": "...", "status": "missing", "improvement": "..."}],
        "tools": [{"requirement": "...", "status": "partial", "cvEvidence": "...", "improvement": "..."}],
        "education": [{"requirement": "...", "status": "matched", "cvEvidence": "..."}],
        "keywords": [{"requirement": "...", "status": "matched", "cvEvidence": "...", "improvement": "..."}]
      },
      "parsedCV": {
        "personal_information": {"full_name": "...", "contact": {"email": "...", "phone": "...", "location": "...", "linkedin": "...", "website_portfolio": "..."}, "summary": "..."},
        "education": [{"degree": "...", "institution": "...", "major": "...", "graduation_year": 2020, "gpa": "..."}],
        "work_experience": [{"company": "...", "job_title": "...", "duration": {"start": "01/2020", "end": "12/2022", "is_current": false}, "responsibilities": ["..."], "achievements": ["..."]}],
        "skills": {"technical_skills": ["..."], "soft_skills": ["..."], "tools_software": ["..."], "languages": [{"language": "...", "proficiency": "..."}]},
        "projects": [{"name": "...", "description": "...", "tech_stack": ["..."], "link": "..."}],
        "certifications": ["..."],
        "ats_evaluation": {"years_of_experience": 5, "relevant_score": 85, "key_match_highlights": ["..."], "missing_keywords": ["..."]}
      }
    }
  `;

  const finalPrompt = language === 'vi' ? promptVi : promptEn;
  const parts: any[] = [{ text: finalPrompt }];

  if (cvMimeType === 'application/pdf' || cvMimeType.startsWith('image/')) {
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
      contents: [{ role: 'user', parts }],
      config: {
        responseMimeType: "application/json",
      }
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
      rewriteSuggestions: normalizeRewriteSuggestions(parsedResult.rewriteSuggestions),
      fullRewrittenCV: parsedResult.fullRewrittenCV || "",
      detailedComparison: normalizeDetailedComparison(parsedResult.detailedComparison),
      parsedCV: normalizeParsedCV(parsedResult.parsedCV),
      id: Math.random().toString(36).substring(7),
      timestamp: Date.now(),
      cvName: cvName || 'Unnamed CV',
      jdTitle: jdUrl || (jd.substring(0, 100) + '...'),
      language
    };

    return finalResult as AnalysisResult;
  } catch (error: any) {
    console.error("Gemini Analysis Error:", error);
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid AI data (JSON Error). Please try again. Detail: ${error.message}`);
    }
    throw new Error(error.message || "Could not perform analysis with Gemini. Please try again later.");
  }
}
