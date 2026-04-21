import { GoogleGenAI, Type } from "@google/genai";
import axios from 'axios';
import { db, auth, storage } from "../firebase";
import { doc, setDoc, getDoc, collection, onSnapshot, increment, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

let GEMINI_API_KEY = process.env.GEMINI_API_KEY;

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

export interface CategorizedScore {
  skills: number;
  experience: number;
  tools: number;
  education: number;
}

export interface CategorizedPoint {
  category: 'Skills' | 'Experience' | 'Tools' | 'Education' | 'Soft Skills' | 'Hard Skills' | 'Technical Skills';
  content: string;
}

export interface MissingGap {
  category: 'Skills' | 'Experience' | 'Keywords' | 'Soft Skills' | 'Hard Skills' | 'Technical Skills';
  content: string;
}

export interface RewriteSuggestion {
  section: string;
  original: string;
  optimized: string;
  explanation: string;
}

export interface ComparisonItem {
  requirement: string;
  status: 'matched' | 'missing' | 'partial';
  cvEvidence?: string;
  improvement?: string;
}

export interface DetailedComparison {
  skills: ComparisonItem[];
  experience: ComparisonItem[];
  tools: ComparisonItem[];
  education: ComparisonItem[];
  keywords: ComparisonItem[];
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
}

export const DEFAULT_AVATAR_URL = "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y";

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  defaultAvatarURL: string;
  role: 'admin' | 'user';
  hasPermission: boolean;
  createdAt: number;
  usageCount: number;
  isNew?: boolean;
}

export interface SavedJD {
  id: string;
  title: string;
  content: string;
  timestamp: number;
}

export async function uploadFileToStorage(file: File, path: string): Promise<string> {
  if (!auth.currentUser) throw new Error("Bạn cần đăng nhập để tải tệp lên.");
  
  try {
    const fileRef = ref(storage, `${path}/${Date.now()}_${file.name}`);
    const snapshot = await uploadBytes(fileRef, file);
    const downloadURL = await getDownloadURL(snapshot.ref);
    return downloadURL;
  } catch (error) {
    console.error("Lỗi khi tải tệp lên Storage:", error);
    throw new Error("Không thể tải tệp lên. Vui lòng thử lại.");
  }
}

export async function rateAnalysis(userId: string, analysisId: string, rating: number, feedback: string): Promise<void> {
  if (!auth.currentUser) throw new Error("Bạn cần đăng nhập để đánh giá.");
  
  const docRef = doc(db, "users", userId, "history", analysisId);
  try {
    await updateDoc(docRef, {
      rating,
      feedback,
      ratedAt: Date.now()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${userId}/history/${analysisId}`);
  }
}

export async function saveToHistory(results: AnalysisResult | AnalysisResult[]): Promise<void> {
  const resultsArray = Array.isArray(results) ? results : [results];
  if (resultsArray.length === 0 || !resultsArray[0].userId) return;
  
  const userId = resultsArray[0].userId;
  
  try {
    const { getDocs, query, orderBy, collection, writeBatch, doc } = await import("firebase/firestore");
    const batch = writeBatch(db);
    
    // Save new results
    resultsArray.forEach(result => {
      const docRef = doc(db, "users", userId, "history", result.id);
      batch.set(docRef, result);
    });
    
    await batch.commit();
    
    // Prune history to keep only 20 most recent
    const historyRef = collection(db, "users", userId, "history");
    const q = query(historyRef, orderBy("timestamp", "desc"));
    const snapshot = await getDocs(q);
    
    if (snapshot.size > 20) {
      const docsToDelete = snapshot.docs.slice(20);
      const deleteBatch = writeBatch(db);
      docsToDelete.forEach(d => deleteBatch.delete(d.ref));
      await deleteBatch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${userId}/history`);
  }
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const docRef = doc(db, "users", uid);
  try {
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data() as UserProfile;
      // Ensure defaultAvatarURL and photoURL exist for existing users
      let needsUpdate = false;
      if (!data.defaultAvatarURL) {
        data.defaultAvatarURL = DEFAULT_AVATAR_URL;
        needsUpdate = true;
      }
      if (!data.photoURL) {
        data.photoURL = DEFAULT_AVATAR_URL;
        needsUpdate = true;
      }
      
      // Auto-fix admin role if email matches
      if (data.email.toLowerCase() === (import.meta.env.VITE_ADMIN_EMAIL || "").toLowerCase() && (data.role !== 'admin' || !data.hasPermission)) {
        data.role = 'admin' as const;
        data.hasPermission = true;
        needsUpdate = true;
      }

      if (needsUpdate) {
        await setDoc(docRef, data, { merge: true });
      }
      return data;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${uid}`);
  }
  return null;
}

export async function createUserProfile(user: any, recaptchaToken?: string): Promise<UserProfile> {
  const isAdmin = user.email?.toLowerCase() === (import.meta.env.VITE_ADMIN_EMAIL || "").toLowerCase();
  const profile: UserProfile = {
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName || '',
    photoURL: user.photoURL || DEFAULT_AVATAR_URL,
    defaultAvatarURL: DEFAULT_AVATAR_URL,
    role: isAdmin ? 'admin' : 'user',
    hasPermission: true, // Everyone can use the app by default now
    createdAt: Date.now(),
    usageCount: 0,
    isNew: !isAdmin, // Mark as new for admin notification (except admin themselves)
  };
  try {
    await setDoc(doc(db, "users", user.uid), profile);

    // Send welcome email if token is provided
    if (recaptchaToken) {
      try {
        await axios.post('/api/send-welcome-email', {
          token: recaptchaToken,
          userEmail: profile.email,
          userName: profile.displayName
        });
      } catch (emailError) {
        // Log error but don't fail the registration
        console.error("Lỗi khi gửi email chào mừng:", emailError);
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}`);
  }
  return profile;
}

export async function markUserAsRead(uid: string): Promise<void> {
  const docRef = doc(db, "users", uid);
  try {
    await setDoc(docRef, { isNew: false }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
  }
}

export async function updateUserPermission(uid: string, hasPermission: boolean): Promise<void> {
  const docRef = doc(db, "users", uid);
  try {
    await setDoc(docRef, { hasPermission }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
  }
}

export async function updateUserRole(uid: string, role: 'admin' | 'user'): Promise<void> {
  const docRef = doc(db, "users", uid);
  try {
    await setDoc(docRef, { role }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
  }
}

export async function deleteUser(uid: string): Promise<void> {
  const { deleteDoc } = await import("firebase/firestore");
  try {
    await deleteDoc(doc(db, "users", uid));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${uid}`);
  }
}

export async function getAllUsers(): Promise<UserProfile[]> {
  const { getDocs } = await import("firebase/firestore");
  try {
    const usersSnap = await getDocs(collection(db, "users"));
    return usersSnap.docs
      .map(doc => doc.data() as UserProfile)
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, "users");
  }
  return [];
}

export function subscribeToAllUsers(callback: (users: UserProfile[]) => void) {
  return onSnapshot(collection(db, "users"), (snapshot) => {
    const users = snapshot.docs
      .map(doc => {
        const data = doc.data() as UserProfile;
        return {
          ...data,
          photoURL: data.photoURL || data.defaultAvatarURL || DEFAULT_AVATAR_URL,
          defaultAvatarURL: data.defaultAvatarURL || DEFAULT_AVATAR_URL
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);
    callback(users);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, "users");
  });
}

export async function incrementUsageCount(uid: string): Promise<void> {
  try {
    await updateDoc(doc(db, "users", uid), {
      usageCount: increment(1)
    });
  } catch (error) {
    console.error("Error incrementing usage count:", error);
  }
}

export async function getUserHistory(uid: string): Promise<AnalysisResult[]> {
  const { getDocs, query, orderBy, limit } = await import("firebase/firestore");
  try {
    const historyRef = collection(db, "users", uid, "history");
    const q = query(historyRef, orderBy("timestamp", "desc"), limit(20));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data() as AnalysisResult);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `users/${uid}/history`);
  }
  return [];
}

export async function deleteFromHistory(uid: string, resultId: string): Promise<void> {
  const { deleteDoc } = await import("firebase/firestore");
  try {
    await deleteDoc(doc(db, "users", uid, "history", resultId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${uid}/history/${resultId}`);
  }
}

export async function clearUserHistory(uid: string): Promise<void> {
  const { getDocs, writeBatch } = await import("firebase/firestore");
  try {
    const historyRef = collection(db, "users", uid, "history");
    const snapshot = await getDocs(historyRef);
    const batch = writeBatch(db);
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${uid}/history`);
  }
}

export async function saveJDToProfile(uid: string, title: string, content: string): Promise<void> {
  const { setDoc, doc } = await import("firebase/firestore");
  const jdId = Math.random().toString(36).substring(7);
  const savedJD: SavedJD = {
    id: jdId,
    title: title.substring(0, 100) || 'JD đã lưu',
    content,
    timestamp: Date.now()
  };
  
  try {
    await setDoc(doc(db, "users", uid, "savedJDs", jdId), savedJD);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `users/${uid}/savedJDs/${jdId}`);
  }
}

export async function getSavedJDs(uid: string): Promise<SavedJD[]> {
  const { getDocs, query, orderBy } = await import("firebase/firestore");
  try {
    const jdsRef = collection(db, "users", uid, "savedJDs");
    const q = query(jdsRef, orderBy("timestamp", "desc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data() as SavedJD);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `users/${uid}/savedJDs`);
  }
  return [];
}

export async function deleteSavedJD(uid: string, jdId: string): Promise<void> {
  const { deleteDoc, doc } = await import("firebase/firestore");
  try {
    await deleteDoc(doc(db, "users", uid, "savedJDs", jdId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${uid}/savedJDs/${jdId}`);
  }
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
    Hãy phân tích CV được cung cấp so với Mô tả công việc (JD).
    
    ${jdSection}
    
    Nhiệm vụ:
    1. Xác định chức danh công việc (Job Title) từ JD.
    2. Tính toán điểm phù hợp tổng thể (0-100).
    2. Cung cấp điểm thành phần (0-100) cho: Kỹ năng (Skills), Kinh nghiệm (Experience), Công cụ/Công nghệ (Tools), và Học vấn/Chứng chỉ (Education).
    3. Liệt kê các điểm tương đồng cụ thể theo danh mục: Kỹ năng mềm (Soft Skills), Kỹ năng cứng (Hard Skills), Kỹ năng kỹ thuật (Technical Skills), Kinh nghiệm (Experience), Công cụ (Tools), hoặc Học vấn (Education).
    4. Liệt kê các điểm còn thiếu (gaps) theo danh mục: Kỹ năng mềm (Soft Skills), Kỹ năng cứng (Hard Skills), Kỹ năng kỹ thuật (Technical Skills), Kinh nghiệm (Experience), hoặc Từ khóa (Keywords).
    5. Xác định các từ khóa ATS quan trọng nên có trong CV.
    6. Cung cấp các gợi ý viết lại cụ thể và có tác động cao (impactful) cho các phần trong CV:
       - Tập trung vào việc chuyển đổi các mô tả chung chung thành các thành tựu có thể định lượng được (Sử dụng công thức Google XYZ: "Đạt được [X] được đo lường bởi [Y], bằng cách thực hiện [Z]").
       - Sử dụng các động từ hành động mạnh mẽ (Strong Action Verbs).
       - Lồng ghép các từ khóa quan trọng từ JD một cách tự nhiên để tối ưu hóa ATS.
       - Đảm bảo các gợi ý là thực tế, có thể thực hiện ngay (actionable) và trực tiếp cải thiện sự phù hợp với JD.
       - Phần 'optimized' phải dùng ĐÚNG NGÔN NGỮ của phần đó trong CV gốc.
       - Phần 'explanation' phải giải thích rõ ràng tại sao thay đổi này giúp vượt qua bộ lọc ATS hoặc gây ấn tượng với nhà tuyển dụng (ví dụ: "Thêm từ khóa 'Cloud Architecture' giúp tăng điểm ATS", "Định lượng kết quả giúp tăng tính thuyết phục").
    7. VIẾT LẠI TOÀN BỘ CV (Full Rewritten CV): Dựa trên thông tin từ CV gốc và yêu cầu của JD, hãy tạo ra một bản CV hoàn chỉnh, chuyên nghiệp, tối ưu hóa 100% cho hệ thống ATS và JD này. 
       - QUAN TRỌNG: Phải sử dụng ĐÚNG NGÔN NGỮ GỐC của CV.
       - TUYỆT ĐỐI KHÔNG sử dụng các thẻ HTML hoặc bao bọc nội dung trong các khối mã Markdown (KHÔNG dùng \` \` \` hoặc \` \` \`markdown ở đầu và cuối). Trả về văn bản thuần túy theo định dạng Markdown.
       - Cấu trúc bắt buộc: 
         # [Họ và Tên]
         [Thông tin liên hệ: Email | Số điện thoại | LinkedIn | Địa chỉ]
         
         ## Tóm tắt chuyên môn (Professional Summary)
         [Đoạn văn ngắn gọn, ấn tượng]
         
         ## Kinh nghiệm làm việc (Work Experience)
         [Liệt kê theo thứ tự thời gian đảo ngược. Sử dụng công thức XYZ cho các thành tựu]
         
         ## Kỹ năng (Skills)
         [Phân loại rõ ràng: Kỹ năng kỹ thuật, Kỹ năng mềm...]
         
         ## Học vấn (Education)
         [Trường học, Chuyên ngành, Năm tốt nghiệp]
       - QUAN TRỌNG: Mỗi tiêu đề (# hoặc ##) phải nằm trên một dòng riêng biệt và theo sau bởi một dòng trống.
       - Sử dụng danh sách có dấu đầu dòng (-) cho các nhiệm vụ và thành tựu.
       - Đảm bảo có 2 dòng trống giữa các mục lớn (##) để tạo không gian thoáng.
    8. Ước tính xác suất thành công khi phỏng vấn.
    9. Ước lượng khả năng vượt qua vòng lọc CV (Thấp, Trung bình, Cao).
    10. Giải thích ngắn gọn lý do tại sao khả năng vượt qua vòng lọc CV lại ở mức đó.
    11. Xác định yếu tố nào đang ảnh hưởng nhiều nhất đến kết quả này.
    12. Cung cấp một bảng so sánh chi tiết (Detailed Comparison) đối chiếu TẤT CẢ các yêu cầu được nêu trong JD với nội dung CV:
        - Phân tích kỹ lưỡng JD để trích xuất mọi yêu cầu về Kỹ năng, Kinh nghiệm, Công cụ, Học vấn và các Từ khóa quan trọng.
        - Đối với mỗi yêu cầu, hãy xác định xem CV có đáp ứng hay không.
        - Trạng thái (status): 'matched' (khớp), 'missing' (thiếu), 'partial' (khớp một phần).
        - Bằng chứng từ CV (cvEvidence): Trích dẫn chính xác phần trong CV chứng minh sự phù hợp (nếu có).
        - Gợi ý cải thiện (improvement): Cách cụ thể để bổ sung hoặc làm rõ yêu cầu này trong CV để gây ấn tượng với nhà tuyển dụng.
    
    YÊU CẦU QUAN TRỌNG: 
    - Toàn bộ nội dung phân tích (điểm số, nhận xét, giải thích) phải bằng TIẾNG VIỆT để người dùng dễ hiểu.
    - RIÊNG PHẦN VIẾT LẠI CV (Full Rewritten CV) và nội dung tối ưu trong gợi ý (optimized content) phải dùng ĐÚNG NGÔN NGỮ GỐC của CV.
    - Trả về kết quả dưới định dạng JSON.
  `;

  const promptEn = `
    You are an HR recruitment expert and an ATS (Applicant Tracking System) specialist.
    Analyze the provided CV against the Job Description (JD).
    
    ${jdSection}
    
    Tasks:
    1. Identify the Job Title from the JD.
    2. Calculate an overall match score (0-100).
    3. Provide component scores (0-100) for: Skills, Experience, Tools/Technology, and Education/Certifications.
    4. List specific matching points by category: Soft Skills, Hard Skills, Technical Skills, Experience, Tools, or Education.
    5. List missing gaps by category: Soft Skills, Hard Skills, Technical Skills, Experience, or Keywords.
    6. Identify important ATS keywords that should be in the CV.
    7. Provide specific and impactful rewrite suggestions for sections in the CV:
       - Focus on converting generic descriptions into quantifiable achievements (Use Google XYZ formula: "Accomplished [X] as measured by [Y], by doing [Z]").
       - Use strong action verbs.
       - Naturally incorporate important keywords from the JD to optimize for ATS.
       - Ensure suggestions are realistic, actionable, and directly improve alignment with the JD.
       - The 'optimized' part must use the EXACT ORIGINAL LANGUAGE of that section in the CV.
       - The 'explanation' part must clearly explain why this change helps pass ATS filters or impress recruiters (e.g., "Adding 'Cloud Architecture' keyword increases ATS score", "Quantifying results increases persuasiveness").
    8. FULL REWRITTEN CV: Based on information from the original CV and JD requirements, create a complete, professional CV, 100% optimized for ATS and this JD.
       - IMPORTANT: Must use the EXACT ORIGINAL LANGUAGE of the CV.
       - ABSOLUTELY DO NOT use HTML tags or wrap the content in Markdown code blocks (NO \` \` \` or \` \` \`markdown at the beginning and end). Return pure Markdown text.
       - Mandatory Structure:
         # [Full Name]
         [Contact Info: Email | Phone | LinkedIn | Location]
         
         ## Professional Summary
         [Short, impactful paragraph]
         
         ## Work Experience
         [Reverse chronological order. Use XYZ formula for achievements]
         
         ## Skills
         [Categorized clearly: Technical, Soft Skills...]
         
         ## Education
         [School, Degree, Years]
       - IMPORTANT: Each heading (# or ##) must be on its own line followed by a blank line.
       - Use bullet points (-) for responsibilities and achievements.
       - Ensure 2 blank lines between major sections (##) for readability.
    9. Estimate the probability of success in an interview.
    10. Estimate the probability of passing the CV screening (Low, Medium, High).
    11. Briefly explain why the probability of passing the CV screening is at that level.
    12. Identify which factor is influencing this result the most.
    13. Provide a detailed comparison table matching ALL requirements stated in the JD with the CV content:
        - Thoroughly analyze the JD to extract all requirements for Skills, Experience, Tools, Education, and important Keywords.
        - For each requirement, determine if the CV meets it.
        - Status: 'matched', 'missing', 'partial'.
        - CV Evidence (cvEvidence): Accurately quote the part in the CV that proves suitability (if any).
        - Improvement Suggestion (improvement): Specific way to add or clarify this requirement in the CV to impress recruiters.
    
    IMPORTANT REQUIREMENTS:
    - All analysis content (scores, comments, explanations) must be in ENGLISH for the user to understand.
    - ONLY the FULL REWRITTEN CV and optimized content in suggestions must use the EXACT ORIGINAL LANGUAGE of the CV.
    - Return the result in JSON format.
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
      },
      required: ["matchScore", "categoryScores", "matchingPoints", "missingGaps", "atsKeywords", "rewriteSuggestions", "fullRewrittenCV", "successProbability", "passProbability", "passExplanation", "mainFactor", "detailedComparison"],
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
