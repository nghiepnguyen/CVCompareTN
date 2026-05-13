import { GoogleGenAI, Type } from "@google/genai";

let GEMINI_API_KEY = (import.meta.env.VITE_GEMINI_API_KEY as string) || '';

export interface ParsedPersonalInformation {
  full_name: string;
  contact: {
    email: string;
    phone: string;
    location: string;
    linkedin?: string;
    website_portfolio?: string;
  };
  summary: string;
}

export interface ParsedEducation {
  degree: string;
  institution: string;
  major: string;
  graduation_year: number;
  gpa?: string;
}

export interface ParsedWorkExperience {
  company: string;
  job_title: string;
  duration: {
    start: string;
    end: string;
    is_current: boolean;
  };
  responsibilities: string[];
  achievements: string[];
}

export interface ParsedSkills {
  technical_skills: string[];
  soft_skills: string[];
  tools_software: string[];
  languages: {
    language: string;
    proficiency: string;
  }[];
}

export interface ParsedProject {
  name: string;
  description: string;
  tech_stack: string[];
  link?: string;
}

export interface ATSEvaluation {
  years_of_experience: number;
  relevant_score: number;
  key_match_highlights: string[];
  missing_keywords: string[];
}

export interface ParsedCV {
  personal_information: ParsedPersonalInformation;
  education: ParsedEducation[];
  work_experience: ParsedWorkExperience[];
  skills: ParsedSkills;
  projects: ParsedProject[];
  certifications: string[];
  ats_evaluation: ATSEvaluation;
}

export interface CategorizedScore {
  skills: number;
  experience: number;
  tools: number;
  education: number;
}

export interface CategorizedPoint {
  category: string;
  content: string;
}

export interface MissingGap {
  category: string;
  content: string;
  impact: 'High' | 'Medium' | 'Low';
}

export interface RewriteSuggestion {
  section: string;
  original: string;
  optimized: string;
  explanation: string;
}

export interface DetailedComparison {
  skills: {
    match: string[];
    missing: string[];
  };
  experience: {
    match: string[];
    missing: string[];
  };
}

export interface AnalysisResult {
  id: string;
  timestamp: number;
  jdTitle?: string;
  jobTitle?: string;
  cvName?: string;
  matchScore: number;
  categoryScores: CategorizedScore;
  matchingPoints: CategorizedPoint[];
  missingGaps: MissingGap[];
  successProbability: string;
  passProbability: string;
  passExplanation: string;
  mainFactor: string;
  atsKeywords: string[];
  rewriteSuggestions: RewriteSuggestion[];
  fullRewrittenCV?: string;
  cvUrl?: string;
  jdUrl?: string;
  detailedComparison: DetailedComparison;
  userId?: string;
  rating?: number;
  feedback?: string;
  language?: 'vi' | 'en';
  parsedCV?: ParsedCV;
}

// Function to fetch config from backend if build-time key is missing or invalid
async function ensureApiKey() {
  if (!GEMINI_API_KEY || GEMINI_API_KEY === 'undefined' || GEMINI_API_KEY.startsWith('your_')) {
    try {
      const response = await fetch('/api/config');
      const config = await response.json();
      if (config.GEMINI_API_KEY) {
        GEMINI_API_KEY = config.GEMINI_API_KEY;
      }
    } catch (error) {
      console.error("Lỗi khi lấy cấu hình từ backend:", error);
    }
  }
  return GEMINI_API_KEY;
}

export async function analyzeCV(jd: string, cvData: string, cvMimeType: string, cvName?: string, jdUrl?: string, language: 'vi' | 'en' = 'vi'): Promise<AnalysisResult> {
  const apiKey = await ensureApiKey();
  if (!apiKey) {
    throw new Error("Thiếu API Key Gemini. Vui lòng cấu hình trong Settings > Secrets.");
  }

  const ai = new GoogleGenAI({ apiKey });
  
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
    - RIÊNG PHẦN VIẾT LẠI CV (Full Rewritten CV), các gợi ý 'optimized' và PHẦN PARSED CV (trừ phần đánh giá) phải dùng ĐÚNG NGÔN NGỮ GỐC của CV.
    - Mốc thời gian phải chuẩn hóa về MM/YYYY.
    - Trả về kết quả dưới định dạng JSON theo schema đã quy định.
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
    - The FULL REWRITTEN CV, 'optimized' suggestions, and the PARSED CV data (except evaluation) must use the EXACT ORIGINAL LANGUAGE of the CV.
    - Standardize dates to MM/YYYY format.
    - Return the result in JSON format following the specified schema.
  `;

  const prompt = language === 'vi' ? promptVi : promptEn;

  const parts: any[] = [{ text: prompt }];

  if (cvMimeType === 'application/pdf' || cvMimeType.startsWith('image/')) {
    parts.push({
      inlineData: {
        data: cvData.split(",")[1] || cvData,
        mimeType: cvMimeType,
      },
    });
  } else {
    parts.push({ text: `Nội dung CV:\n${cvData}` });
  }

  const config: any = {
    responseMimeType: "application/json",
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        jobTitle: { type: Type.STRING, description: "Chức danh công việc được trích xuất từ JD" },
        matchScore: { type: Type.NUMBER },
        categoryScores: {
          type: Type.OBJECT,
          properties: {
            skills: { type: Type.NUMBER },
            experience: { type: Type.NUMBER },
            tools: { type: Type.NUMBER },
            education: { type: Type.NUMBER },
          },
          required: ["skills", "experience", "tools", "education"],
        },
        matchingPoints: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              category: { type: Type.STRING, enum: ["Skills", "Experience", "Tools", "Education", "Soft Skills", "Hard Skills", "Technical Skills"] },
              content: { type: Type.STRING },
            },
            required: ["category", "content"],
          },
        },
        missingGaps: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              category: { type: Type.STRING, enum: ["Skills", "Experience", "Keywords", "Soft Skills", "Hard Skills", "Technical Skills"] },
              content: { type: Type.STRING },
            },
            required: ["category", "content"],
          },
        },
        atsKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
        rewriteSuggestions: { 
          type: Type.ARRAY, 
          items: { 
            type: Type.OBJECT,
            properties: {
              section: { type: Type.STRING, description: "Tên phần trong CV (ví dụ: Kinh nghiệm, Kỹ năng, Giới thiệu)" },
              original: { type: Type.STRING, description: "Nội dung gốc trong CV cần cải thiện" },
              optimized: { type: Type.STRING, description: "Nội dung đã được tối ưu hóa, sử dụng động từ mạnh, định lượng thành tựu và lồng ghép từ khóa ATS" },
              explanation: { type: Type.STRING, description: "Giải thích cụ thể tại sao thay đổi này giúp tăng điểm ATS hoặc gây ấn tượng mạnh với HR" }
            },
            required: ["section", "optimized", "explanation"]
          } 
        },
        fullRewrittenCV: { type: Type.STRING, description: "Bản CV hoàn chỉnh đã được viết lại bằng Markdown" },
        successProbability: { type: Type.STRING },
        passProbability: { type: Type.STRING, enum: ["Thấp", "Trung bình", "Cao"] },
        passExplanation: { type: Type.STRING },
        mainFactor: { type: Type.STRING },
        detailedComparison: {
          type: Type.OBJECT,
          properties: {
            skills: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  requirement: { type: Type.STRING },
                  status: { type: Type.STRING, enum: ["matched", "missing", "partial"] },
                  cvEvidence: { type: Type.STRING },
                  improvement: { type: Type.STRING },
                },
                required: ["requirement", "status"],
              },
            },
            experience: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  requirement: { type: Type.STRING },
                  status: { type: Type.STRING, enum: ["matched", "missing", "partial"] },
                  cvEvidence: { type: Type.STRING },
                  improvement: { type: Type.STRING },
                },
                required: ["requirement", "status"],
              },
            },
            tools: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  requirement: { type: Type.STRING },
                  status: { type: Type.STRING, enum: ["matched", "missing", "partial"] },
                  cvEvidence: { type: Type.STRING },
                  improvement: { type: Type.STRING },
                },
                required: ["requirement", "status"],
              },
            },
            education: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  requirement: { type: Type.STRING },
                  status: { type: Type.STRING, enum: ["matched", "missing", "partial"] },
                  cvEvidence: { type: Type.STRING },
                  improvement: { type: Type.STRING },
                },
                required: ["requirement", "status"],
              },
            },
            keywords: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  requirement: { type: Type.STRING },
                  status: { type: Type.STRING, enum: ["matched", "missing", "partial"] },
                  cvEvidence: { type: Type.STRING },
                  improvement: { type: Type.STRING },
                },
                required: ["requirement", "status"],
              },
            },
          },
          required: ["skills", "experience", "tools", "education", "keywords"],
        },
        parsedCV: {
          type: Type.OBJECT,
          properties: {
            personal_information: {
              type: Type.OBJECT,
              properties: {
                full_name: { type: Type.STRING },
                contact: {
                  type: Type.OBJECT,
                  properties: {
                    email: { type: Type.STRING },
                    phone: { type: Type.STRING },
                    location: { type: Type.STRING },
                    linkedin: { type: Type.STRING },
                    website_portfolio: { type: Type.STRING },
                  },
                  required: ["email", "phone", "location"],
                },
                summary: { type: Type.STRING },
              },
              required: ["full_name", "contact", "summary"],
            },
            education: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  degree: { type: Type.STRING },
                  institution: { type: Type.STRING },
                  major: { type: Type.STRING },
                  graduation_year: { type: Type.NUMBER },
                  gpa: { type: Type.STRING },
                },
                required: ["degree", "institution", "graduation_year"],
              },
            },
            work_experience: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  company: { type: Type.STRING },
                  job_title: { type: Type.STRING },
                  duration: {
                    type: Type.OBJECT,
                    properties: {
                      start: { type: Type.STRING, description: "MM/YYYY" },
                      end: { type: Type.STRING, description: "MM/YYYY or 'Present'" },
                      is_current: { type: Type.BOOLEAN },
                    },
                    required: ["start", "end", "is_current"],
                  },
                  responsibilities: { type: Type.ARRAY, items: { type: Type.STRING } },
                  achievements: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: ["company", "job_title", "duration"],
              },
            },
            skills: {
              type: Type.OBJECT,
              properties: {
                technical_skills: { type: Type.ARRAY, items: { type: Type.STRING } },
                soft_skills: { type: Type.ARRAY, items: { type: Type.STRING } },
                tools_software: { type: Type.ARRAY, items: { type: Type.STRING } },
                languages: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      language: { type: Type.STRING },
                      proficiency: { type: Type.STRING },
                    },
                    required: ["language", "proficiency"],
                  },
                },
              },
              required: ["technical_skills", "soft_skills", "tools_software"],
            },
            projects: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  description: { type: Type.STRING },
                  tech_stack: { type: Type.ARRAY, items: { type: Type.STRING } },
                  link: { type: Type.STRING },
                },
                required: ["name", "description"],
              },
            },
            certifications: { type: Type.ARRAY, items: { type: Type.STRING } },
            ats_evaluation: {
              type: Type.OBJECT,
              properties: {
                years_of_experience: { type: Type.NUMBER },
                relevant_score: { type: Type.NUMBER },
                key_match_highlights: { type: Type.ARRAY, items: { type: Type.STRING } },
                missing_keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ["years_of_experience", "relevant_score", "key_match_highlights", "missing_keywords"],
            },
          },
          required: ["personal_information", "education", "work_experience", "skills", "ats_evaluation"],
        },
      },
      required: ["matchScore", "categoryScores", "matchingPoints", "missingGaps", "atsKeywords", "rewriteSuggestions", "fullRewrittenCV", "successProbability", "passProbability", "passExplanation", "mainFactor", "detailedComparison", "parsedCV"],
    },
  };

  if (jdUrl) {
    config.tools = [{ urlContext: {} }];
  }

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{ parts }],
    config,
  });

  try {
    const result = JSON.parse(response.text || "{}");
    return {
      ...result,
      id: Math.random().toString(36).substring(7),
      timestamp: Date.now(),
      cvName: cvName || 'CV chưa đặt tên',
      jdTitle: jdUrl ? jdUrl : (jd.trim().split('\n').filter(l => l.trim().length > 0).slice(0, 5).join('\n').substring(0, 500) || 'JD không tên'),
      language
    } as AnalysisResult;
  } catch (error) {
    console.error("Lỗi khi phân tích phản hồi từ Gemini:", error);
    throw new Error("Không thể phân tích CV. Vui lòng thử lại.");
  }
}

export async function extractTextFromImage(imageData: string, mimeType: string): Promise<string> {
  const apiKey = await ensureApiKey();
  if (!apiKey) {
    throw new Error("Thiếu API Key Gemini. Vui lòng cấu hình trong Settings > Secrets.");
  }

  const ai = new GoogleGenAI({ apiKey });
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{
        parts: [
          { text: "Hãy trích xuất toàn bộ văn bản từ hình ảnh này một cách chính xác nhất. Giữ nguyên cấu trúc nếu có thể. Chỉ trả về văn bản đã trích xuất, không thêm lời dẫn." },
          { inlineData: { data: imageData.split(",")[1] || imageData, mimeType } }
        ]
      }]
    });
    return response.text || "";
  } catch (error) {
    console.error("Lỗi khi trích xuất văn bản từ hình ảnh:", error);
    throw new Error("Không thể trích xuất văn bản từ hình ảnh này.");
  }
}

export async function extractJDFromUrl(url: string): Promise<string> {
  const apiKey = await ensureApiKey();
  if (!apiKey) {
    throw new Error("Thiếu API Key Gemini. Vui lòng cấu hình trong Settings > Secrets.");
  }

  // Basic URL validation
  try {
    new URL(url);
  } catch (e) {
    throw new Error("Liên kết không hợp lệ. Vui lòng kiểm tra lại.");
  }

  const ai = new GoogleGenAI({ apiKey });
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{
        parts: [
          { text: `Hãy truy cập liên kết này: ${url}. Đây là một trang tuyển dụng. Hãy trích xuất TOÀN BỘ nội dung Mô tả công việc (Job Description) một cách chi tiết và chính xác nhất. 
Bất kể cấu trúc trang web ra sao, hãy tìm và lấy các thông tin sau:
1. Tên vị trí công việc (Job Title).
2. Yêu cầu công việc (Requirements/Qualifications).
3. Trách nhiệm công việc (Responsibilities/Duties).
4. Quyền lợi (Benefits).
5. Các kỹ năng cần thiết (Skills).
6. Thông tin khác nếu có.

Chỉ trả về nội dung JD đã trích xuất dưới dạng văn bản rõ ràng, không thêm lời dẫn, không giải thích, không bao gồm các phần thừa của trang web như menu, footer, quảng cáo.` }
        ]
      }],
      config: {
        tools: [{ urlContext: {} }]
      }
    });
    
    const extractedText = response.text || "";
    if (!extractedText.trim() || extractedText.toLowerCase().includes("không thể") || extractedText.toLowerCase().includes("lỗi") || extractedText.length < 100) {
       throw new Error("Không thể trích xuất nội dung từ liên kết này. Vui lòng kiểm tra lại liên kết hoặc dán trực tiếp nội dung JD.");
    }
    return extractedText;
  } catch (error) {
    console.error("Lỗi khi trích xuất JD từ URL:", error);
    throw new Error("Không thể truy cập hoặc trích xuất nội dung từ liên kết này. Vui lòng dán trực tiếp nội dung JD.");
  }
}
