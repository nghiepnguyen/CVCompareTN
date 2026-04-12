import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, animate, useInView } from 'motion/react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  AreaChart, Area, BarChart, Bar, Cell, PieChart, Pie
} from 'recharts';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeSanitize from 'rehype-sanitize';
import rehypeRaw from 'rehype-raw';
import { 
  Upload, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  TrendingUp, 
  BarChart3,
  PieChart as PieChartIcon,
  Activity,
  Brain,
  Key,
  Loader2, 
  RefreshCcw,
  FileSearch,
  Check,
  X,
  History as HistoryIcon,
  LayoutDashboard,
  ArrowRight,
  Trash2,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Layers,
  Sparkles,
  Target,
  Copy,
  ExternalLink,
  LogIn,
  LogOut,
  User as UserIcon,
  ShieldCheck,
  Users,
  Clock,
  UserCheck,
  UserX,
  UserPlus,
  Search,
  Calendar,
  Filter,
  Zap,
  Database,
  Bookmark,
  BookmarkPlus,
  FolderOpen,
  UserCog,
  Shield,
  Star,
  MessageSquare,
  Globe,
  Download,
  GraduationCap,
  FileCheck,
  Heart,
  Printer,
} from 'lucide-react';
import { 
  AnalysisResult, 
  saveToHistory, 
  rateAnalysis,
  UserProfile,
  getUserProfile,
  createUserProfile,
  updateUserPermission,
  updateUserRole,
  deleteUser,
  markUserAsRead,
  getAllUsers,
  subscribeToAllUsers,
  incrementUsageCount,
  analyzeCV,
  getUserHistory,
  deleteFromHistory,
  clearUserHistory,
  extractTextFromImage,
  extractJDFromUrl,
  saveJDToProfile,
  getSavedJDs,
  deleteSavedJD,
  SavedJD
} from './services/geminiService';
import { PrivacyPolicyPage } from './components/PrivacyPolicyPage';
import { TermsOfServicePage } from './components/TermsOfServicePage';
import { SupportDevelopmentPage } from './components/SupportDevelopmentPage';
import { calculateMatchScore } from './services/matchService';
import { Candidate, JobDescription } from './types';
import { auth, googleProvider } from './firebase';
import { signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import mammoth from 'mammoth';
import { useGoogleReCaptcha } from 'react-google-recaptcha-v3';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function Counter({ from, to, suffix }: { from: number; to: number; suffix: string }) {
  const count = useMotionValue(from);
  const rounded = useTransform(count, (latest) => Math.round(latest));
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });

  useEffect(() => {
    if (isInView) {
      const controls = animate(count, to, { duration: 2 });
      return () => controls.stop();
    }
  }, [isInView, count, to]);

  return <span ref={ref}><motion.span>{rounded}</motion.span>{suffix}</span>;
}

// Declare gtag for TypeScript
declare global {
  interface Window {
    gtag: (...args: any[]) => void;
    dataLayer: any[];
  }
}

type Tab = 'analyze' | 'history' | 'admin' | 'privacy' | 'terms' | 'support';

// Error Boundary Component
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: any }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "Đã xảy ra lỗi không mong muốn.";
      let errorDetails = "";

      try {
        const parsed = JSON.parse(this.state.error.message);
        if (parsed.error) {
          errorMessage = "Lỗi Firestore: " + parsed.error;
          errorDetails = `Operation: ${parsed.operationType}, Path: ${parsed.path}`;
        }
      } catch (e) {
        errorMessage = this.state.error.message || errorMessage;
      }

      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 text-center border border-slate-200">
            <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 mb-2">Rất tiếc!</h2>
            <p className="text-slate-600 mb-6">{errorMessage}</p>
            {errorDetails && (
              <div className="mb-6 p-3 bg-slate-50 rounded-xl text-left">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Chi tiết kỹ thuật</p>
                <code className="text-xs text-slate-500 break-all">{errorDetails}</code>
              </div>
            )}
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
            >
              Tải lại trang
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

const UI_LABELS = {
  vi: {
    atsScore: "Mức độ tương thích hệ thống",
    atsDesc: "Dựa trên phân tích từ khóa, cấu trúc và yêu cầu kỹ thuật của JD, CV của bạn đạt mức tương thích này với hệ thống lọc tự động (ATS).",
    skills: "Kỹ năng",
    experience: "Kinh nghiệm",
    tools: "Công cụ",
    education: "Học vấn",
    passProb: "Khả năng pass vòng CV",
    explanation: "Giải thích ngắn gọn",
    mainFactor: "Yếu tố ảnh hưởng nhiều nhất",
    matchingPoints: "Điểm tương đồng",
    matchingPointsDesc: "Các điểm mạnh và sự phù hợp của CV với JD",
    matchingPointsCount: "điểm",
    missingGaps: "Điểm cần cải thiện",
    missingGapsDesc: "Các lỗ hổng kỹ năng hoặc kinh nghiệm cần bổ sung",
    missingGapsCount: "lỗ hổng",
    detailedComparison: "So sánh chi tiết",
    detailedComparisonDesc: "Đối chiếu từng yêu cầu của JD với nội dung CV",
    detailedComparisonCount: "yêu cầu",
    atsKeywords: "Từ khóa ATS quan trọng",
    atsKeywordsDesc: "Các từ khóa quan trọng từ JD mà CV nên có",
    rewriteSuggestions: "Gợi ý chỉnh sửa nội dung",
    rewriteSuggestionsDesc: "Cách viết lại các phần trong CV để tối ưu hơn",
    fullRewrittenCV: "CV đã được tối ưu hoàn chỉnh",
    fullRewrittenCVDesc: "Bản thảo CV mới dựa trên thông tin của bạn và yêu cầu của JD",
    copy: "Sao chép",
    copied: "Đã sao chép",
    download: "Tải xuống",
    original: "Gốc",
    optimized: "Tối ưu",
    reason: "Lý do",
    requirement: "Yêu cầu",
    status: "Trạng thái",
    evidence: "Minh chứng trong CV",
    improvement: "Gợi ý cải thiện",
    matched: "Đạt",
    partial: "Một phần",
    missing: "Thiếu",
    high: "Cao",
    medium: "Trung bình",
    low: "Thấp",
    analyze: 'Phân tích',
    history: 'Lịch sử',
    admin: 'Quản trị',
    logout: 'Đăng xuất',
    login: 'Đăng nhập',
    heroTitle: 'Nâng tầm sự nghiệp với',
    heroDesc: 'Công cụ phân tích CV thông minh giúp bạn tối ưu hóa hồ sơ, so khớp chính xác với yêu cầu công việc và tăng cơ hội trúng tuyển.',
    startNow: 'Bắt đầu ngay!',
    heroSub: 'Miễn phí 100% • Kết quả trong vòng vài giây',
    whyTitle: 'Giải pháp thông minh với công nghệ đột phá',
    feature1Title: 'Điểm phù hợp CV vs Job Description',
    feature1Desc: 'Biết ngay mức độ match với công việc (%)',
    feature2Title: 'Chấm điểm chuẩn ATS',
    feature2Desc: 'Xem CV của bạn có vượt qua hệ thống lọc tự động không',
    feature3Title: 'Phân tích khoảng trống kỹ năng (Skill Gap)',
    feature3Desc: 'Những kỹ năng bạn đang thiếu so với JD',
    feature4Title: 'Phát hiện điểm mạnh & điểm yếu',
    feature4Desc: 'Hiểu rõ lợi thế và hạn chế trong CV',
    feature5Title: 'Gợi ý từ khóa quan trọng',
    feature5Desc: 'Bổ sung keyword giúp tăng khả năng lọt ATS',
    feature6Title: 'Đề xuất tối ưu CV chi tiết',
    feature6Desc: 'Gợi ý chỉnh sửa từng phần: summary, experience, skills',
    feature7Title: 'Phân tích mức độ liên quan kinh nghiệm',
    feature7Desc: 'Kinh nghiệm của bạn có “đúng việc” hay không',
    feature8Title: 'Gợi ý phiên bản CV tối ưu hơn',
    feature8Desc: 'Tạo CV tốt hơn dựa trên JD',
    stats1: 'Ngành nghề',
    stats2: 'Tỷ lệ hài lòng',
    stats3: 'CV đã phân tích',
    jdTitle: 'Mô tả công việc (JD)',
    jdDesc: 'Cung cấp thông tin về vị trí tuyển dụng để AI có thể so sánh chính xác nhất với CV của bạn.',
    textMode: 'VĂN BẢN',
    linkMode: 'LINK',
    jdStore: 'Kho JD',
    saveJd: 'Lưu JD',
    cvTitle: 'Hồ sơ của bạn (CV)',
    cvDesc: 'Tải lên CV của bạn (PDF, DOCX) hoặc dán nội dung văn bản để bắt đầu phân tích.',
    analyzeBtn: 'Phân tích ngay',
    analyzingBtn: 'Đang phân tích...',
    clearBtn: 'Xóa trắng',
    placeholderJD: 'Dán mô tả công việc (Job Description) vào đây...',
    placeholderCV: 'Dán nội dung CV của bạn vào đây...',
    placeholderLink: 'Dán link tuyển dụng (LinkedIn, TopCV,...)',
    uploadCV: 'Tải CV lên',
    orDrag: 'hoặc kéo thả file vào đây',
    atsOptimization: 'Tối ưu hóa CV cho hệ thống ATS',
    atsOptimizationDesc: 'Tải lên CV hoặc dán văn bản để so sánh với bất kỳ Job Description nào. Nhận ngay điểm tương thích ATS, phân tích kỹ năng còn thiếu và bản CV được viết lại hoàn chỉnh.',
    problemTitle: "Tại sao CV của bạn bị từ chối?",
    problemItem1: "CV không tối ưu theo chuẩn ATS",
    problemItem2: "Thiếu từ khóa quan trọng từ JD",
    problemItem3: "Kỹ năng không khớp với yêu cầu công việc",
    problemItem4: "Nhà tuyển dụng chỉ dành 6–10 giây để đọc CV",
    problemItem5: "Bạn không biết cần cải thiện ở đâu",
    problemResult: "Kết quả: Bạn bị loại ngay từ vòng lọc CV mà không biết lý do.",
    howItWorksTitle: "Cách hoạt động cực đơn giản",
    howItWorksStep1Title: "Tải CV",
    howItWorksStep1Desc: "Upload hồ sơ của bạn dưới dạng PDF hoặc Word",
    howItWorksStep2Title: "Dán JD",
    howItWorksStep2Desc: "Sao chép nội dung tuyển dụng từ công ty bạn muốn ứng tuyển",
    howItWorksStep3Title: "AI Phân tích",
    howItWorksStep3Desc: "Hệ thống so sánh hơn 50 tiêu chí giữa hồ sơ và yêu cầu",
    howItWorksStep4Title: "Nhận báo cáo",
    howItWorksStep4Desc: "Nhận kết quả đánh giá chi tiết và hướng dẫn tối ưu ngay lập tức",
    howItWorksFooter: "Tất cả chỉ mất vài giây.",
    resultTitle: "Kết quả bạn nhận được",
    matchingScore: "Matching Score",
    missingSkills: "Thiếu kỹ năng",
    strengths: "Điểm mạnh",
    suggestions: "Gợi ý cải thiện",
    suggestion1: "Thêm số liệu cụ thể vào kinh nghiệm làm việc",
    suggestion2: "Bổ sung từ khóa còn thiếu",
    suggestion3: "Viết lại phần Summary rõ ràng hơn",
    targetUsersTitle: "Công cụ này dành cho ai?",
    targetUsersItem1: "Sinh viên & Fresher",
    targetUsersItem2: "Người đang tìm việc",
    targetUsersItem3: "Developer, Designer, Marketer",
    targetUsersItem4: "Người apply công ty nước ngoài",
    targetUsersItem5: "Bất kỳ ai muốn CV chuẩn ATS",
    ctaTitle: "Tối ưu CV trước khi nhà tuyển dụng nhìn thấy nó",
    ctaBtn: "Phân tích CV của tôi ngay",
    ctaSub: "Miễn phí 100% • Kết quả trong vòng vài giây",
    trustedBy: "Được tin dùng bởi các chuyên gia hàng đầu",
    footerDesc: "Công cụ so sánh CV với Job Description hàng đầu, giúp bạn vượt qua hệ thống ATS và chinh phục nhà tuyển dụng.",
    faqTitle: "FAQ – Giải đáp thắc mắc của bạn",
    faqItems: [
      {
        q: "Dữ liệu của tôi có được bảo mật không?",
        a: "Tuyệt đối bảo mật. Chúng tôi hiểu rằng CV chứa nhiều thông tin cá nhân nhạy cảm. Mọi tập tin bạn tải lên đều được mã hóa bằng giao thức SSL/TLS cao cấp. Hệ thống sẽ tự động xóa vĩnh viễn dữ liệu của bạn sau 24 giờ kể từ khi phân tích xong. Chúng tôi cam kết không chia sẻ thông tin của bạn cho bất kỳ bên thứ ba hay nhà tuyển dụng nào khi chưa có sự cho phép."
      },
      {
        q: "Hệ thống hỗ trợ những định dạng file nào?",
        a: "Công cụ hiện hỗ trợ các định dạng phổ biến nhất là PDF (.pdf), Word (.docx) và cả file hình ảnh (JPG,PNG).\n\nLời khuyên: Để AI phân tích chính xác nhất về bố cục (Layout) và khả năng đọc của ATS, chúng tôi khuyến khích bạn sử dụng định dạng PDF. Đối với nội dung JD (Mô tả công việc), bạn có thể dán trực tiếp văn bản hoặc dẫn link từ các trang tuyển dụng."
      },
      {
        q: "Làm sao để biết CV của tôi đã chuẩn ATS chưa?",
        a: "Sau khi quét, hệ thống sẽ trả về một Báo cáo ATS chi tiết. CV của bạn được coi là chuẩn ATS khi:\n- Đạt số điểm Matching Score trên 80%.\n- Không chứa các yếu tố gây nhiễu Robot (như bảng biểu phức tạp, ảnh chèn đè chữ, hoặc font chữ lạ).\n- Chứa đầy đủ các từ khóa (Keywords) quan trọng xuất hiện trong JD.\nHệ thống sẽ đánh dấu Xanh (Đạt) hoặc Đỏ (Cần sửa) kèm hướng dẫn chi tiết để bạn tối ưu ngay lập tức."
      },
      {
        q: "Tôi có thể sử dụng công cụ này miễn phí không?",
        a: "Có! Chúng tôi cung cấp phân tích chuyên sâu hoàn toàn miễn phí cho người dùng mới để bạn trải nghiệm sức mạnh của AI."
      },
      {
        q: "Điểm số Matching Score có đảm bảo tôi sẽ nhận được lịch phỏng vấn?",
        a: "Matching Score cao giúp CV của bạn \"vượt rào\" thành công qua các bộ lọc tự động và gây ấn tượng mạnh với nhà tuyển dụng bằng các số liệu chuẩn xác. Tuy nhiên, việc nhận được lời mời phỏng vấn còn phụ thuộc vào thái độ và cách bạn thể hiện trong hồ sơ. Công cụ của chúng tôi đóng vai trò là \"người trợ lý đắc lực\" để đảm bảo hồ sơ của bạn luôn ở trạng thái hoàn hảo nhất trước khi đến tay con người."
      }
    ],
    inAppBrowserWarning: "Bạn đang mở ứng dụng từ trình duyệt trong ứng dụng (Zalo, Facebook, Messenger...). Google chặn đăng nhập từ các trình duyệt này.",
    inAppBrowserAction: "Vui lòng nhấn vào dấu ba chấm (...) hoặc biểu tượng trình duyệt trên màn hình và chọn 'Mở bằng trình duyệt' (Chrome hoặc Safari) để tiếp tục.",
    openInExternalBrowser: "Mở bằng trình duyệt bên ngoài",
    loginErrorInApp: "Lỗi đăng nhập: Trình duyệt này không được Google hỗ trợ. Vui lòng mở trang web bằng Chrome hoặc Safari.",
    analysisHistory: "Lịch sử phân tích",
    historyDesc: "Xem lại và quản lý các kết quả phân tích CV của bạn",
    clearHistory: "Xóa toàn bộ lịch sử",
    backToList: "Quay lại danh sách",
    back: "Quay lại",
    detailedAnalysis: "Phân tích chi tiết:",
    comparisonJD: "Thông tin JD so sánh:",
    reportLanguageLabel: "Ngôn ngữ báo cáo",
    vietnamese: "Tiếng Việt",
    english: "Tiếng Anh",
    analysisProgress: "Tiến trình phân tích",
    aiThinking: "AI đang suy nghĩ...",
    analysisTime: "Thời gian phân tích",
    sectionOther: "Khác",
    printOptimized: "In CV",
    premiumOptimizedBadge: "Tối ưu bởi AI Premium",
    processingFile: "Đang xử lý File...",
    readyToAnalyze: "Sẵn sàng phân tích",
    readyToAnalyzeDesc: "Tải lên CV của bạn và cung cấp mô tả công việc để xem thông tin chi tiết về mức độ phù hợp.",
    rateResults: "Đánh giá kết quả phân tích",
    rateResultsDesc: "Phản hồi của bạn giúp chúng tôi cải thiện độ chính xác của AI.",
    thankYouRating: "Cảm ơn bạn đã đánh giá!",
    submitRating: "Gửi đánh giá",
    feedbackPlaceholder: "Bạn có góp ý gì để kết quả chính xác hơn không? (Tùy chọn)",
    atsCompatibilityScore: "Điểm tương thích ATS",
    scoreDistribution: "Phân bổ điểm thành phần",
    skillDistribution: "Phân bổ kỹ năng",
  },
  en: {
    atsScore: "ATS Compatibility Score",
    atsDesc: "Based on keyword analysis, structure, and technical requirements of the JD, your CV achieves this compatibility level with automated filtering systems (ATS).",
    skills: "Skills",
    experience: "Experience",
    tools: "Tools",
    education: "Education",
    passProb: "CV Pass Probability",
    explanation: "Brief Explanation",
    mainFactor: "Most Influential Factor",
    matchingPoints: "Matching Points",
    matchingPointsDesc: "Strengths and alignment of your CV with the JD",
    matchingPointsCount: "points",
    missingGaps: "Missing Gaps",
    missingGapsDesc: "Skill or experience gaps that need to be addressed",
    missingGapsCount: "gaps",
    detailedComparison: "Detailed Comparison",
    detailedComparisonDesc: "Comparison of each JD requirement with CV content",
    detailedComparisonCount: "requirements",
    atsKeywords: "Important ATS Keywords",
    atsKeywordsDesc: "Key terms from the JD that your CV should include",
    rewriteSuggestions: "Content Rewrite Suggestions",
    rewriteSuggestionsDesc: "How to rewrite sections of your CV for better optimization",
    fullRewrittenCV: "Full Optimized CV",
    fullRewrittenCVDesc: "A new CV draft based on your information and JD requirements",
    copy: "Copy",
    copied: "Copied",
    download: "Download",
    original: "Original",
    optimized: "Optimized",
    reason: "Reason",
    requirement: "Requirement",
    status: "Status",
    evidence: "Evidence in CV",
    improvement: "Improvement Suggestion",
    matched: "Matched",
    partial: "Partial",
    missing: "Missing",
    high: "High",
    medium: "Medium",
    low: "Low",
    analyze: 'Analyze',
    history: 'History',
    admin: 'Admin',
    logout: 'Logout',
    login: 'Login',
    heroTitle: 'Elevate your career with',
    heroDesc: 'Smart CV analysis tool helps you optimize your profile, accurately match job requirements, and increase your chances of being hired.',
    startNow: 'Start Now!',
    heroSub: '100% Free • Results in seconds',
    whyTitle: 'Smart solution with breakthrough technology',
    feature1Title: 'CV vs Job Description Match Score',
    feature1Desc: 'Instantly know your job match percentage (%)',
    feature2Title: 'ATS Standard Scoring',
    feature2Desc: 'See if your CV passes automated filtering systems',
    feature3Title: 'Skill Gap Analysis',
    feature3Desc: 'Skills you are missing compared to the JD',
    feature4Title: 'Strengths & Weaknesses Detection',
    feature4Desc: 'Understand your CV advantages and limitations',
    feature5Title: 'Important Keyword Suggestions',
    feature5Desc: 'Add keywords to increase ATS pass rate',
    feature6Title: 'Detailed CV Optimization Proposals',
    feature6Desc: 'Suggestions for editing summary, experience, skills',
    feature7Title: 'Experience Relevance Analysis',
    feature7Desc: 'Is your experience relevant to the job?',
    feature8Title: 'Optimized CV Version Suggestions',
    feature8Desc: 'Create a better CV based on the JD',
    stats1: 'Industries',
    stats2: 'Satisfaction Rate',
    stats3: 'CVs Analyzed',
    jdTitle: 'Job Description (JD)',
    jdDesc: 'Provide job information so AI can accurately compare it with your CV.',
    textMode: 'TEXT',
    linkMode: 'LINK',
    jdStore: 'JD Store',
    saveJd: 'Save JD',
    cvTitle: 'Your Profile (CV)',
    cvDesc: 'Upload your CV (PDF, DOCX) or paste text content to start analysis.',
    analyzeBtn: 'Analyze Now',
    analyzingBtn: 'Analyzing...',
    clearBtn: 'Clear',
    placeholderJD: 'Paste Job Description here...',
    placeholderCV: 'Paste your CV content here...',
    placeholderLink: 'Paste job link (LinkedIn, Indeed,...)',
    uploadCV: 'Upload CV',
    orDrag: 'or drag and drop file here',
    atsOptimization: 'Optimize your CV for ATS',
    atsOptimizationDesc: 'Upload CV or paste text to compare with any Job Description. Get ATS compatibility score, missing skills analysis, and a full rewritten CV.',
    problemTitle: "Why is your CV rejected?",
    problemItem1: "CV is not optimized for ATS standards",
    problemItem2: "Missing important keywords from JD",
    problemItem3: "Skills do not match job requirements",
    problemItem4: "Recruiters only spend 6–10 seconds reading your CV",
    problemItem5: "You don't know where to improve",
    problemResult: "Result: You are rejected right at the CV screening round without knowing why.",
    howItWorksTitle: "How it works in simple steps",
    howItWorksStep1Title: "Upload CV",
    howItWorksStep1Desc: "Upload your profile in PDF or Word format",
    howItWorksStep2Title: "Paste JD",
    howItWorksStep2Desc: "Copy job description content from the company you want to apply to",
    howItWorksStep3Title: "AI Analysis",
    howItWorksStep3Desc: "System compares over 50 criteria between profile and requirements",
    howItWorksStep4Title: "Get Report",
    howItWorksStep4Desc: "Receive detailed evaluation results and optimization guidance immediately",
    howItWorksFooter: "It only takes a few seconds.",
    resultTitle: "Results you get",
    matchingScore: "Matching Score",
    missingSkills: "Missing Skills",
    strengths: "Strengths",
    suggestions: "Improvement Suggestions",
    suggestion1: "Add specific metrics to work experience",
    suggestion2: "Add missing keywords",
    suggestion3: "Rewrite Summary section more clearly",
    targetUsersTitle: "Who is this tool for?",
    targetUsersItem1: "Students & Freshers",
    targetUsersItem2: "Job Seekers",
    targetUsersItem3: "Developers, Designers, Marketers",
    targetUsersItem4: "People applying to foreign companies",
    targetUsersItem5: "Anyone who wants an ATS-standard CV",
    ctaTitle: "Optimize your CV before recruiters see it",
    ctaBtn: "Analyze my CV now",
    ctaSub: "100% Free • Results in seconds",
    trustedBy: "Trusted by top experts",
    footerDesc: "The leading CV vs Job Description comparison tool, helping you pass ATS systems and conquer recruiters.",
    faqTitle: "FAQ – Frequently Asked Questions",
    faqItems: [
      {
        q: "Is my data secure?",
        a: "Absolutely secure. We understand that CVs contain sensitive personal information. All files you upload are encrypted using high-level SSL/TLS protocols. The system automatically permanently deletes your data 24 hours after analysis is complete. We commit not to share your information with any third party or recruiter without your permission."
      },
      {
        q: "What file formats are supported?",
        a: "The tool currently supports the most common formats: PDF (.pdf), Word (.docx), and image files (JPG, PNG).\n\nTip: For the most accurate AI analysis of layout and ATS readability, we encourage you to use the PDF format. For Job Description (JD) content, you can directly paste text or provide links from recruitment sites."
      },
      {
        q: "How do I know if my CV is ATS-ready?",
        a: "After scanning, the system will return a detailed ATS Report. Your CV is considered ATS-ready when:\n- It achieves a Matching Score of over 80%.\n- It does not contain robot-interfering elements (such as complex tables, images overlapping text, or unusual fonts).\n- It contains all the important keywords appearing in the JD.\nThe system will mark Green (Pass) or Red (Needs fixing) with detailed instructions for you to optimize immediately."
      },
      {
        q: "Can I use this tool for free?",
        a: "Yes! We provide in-depth analysis completely free for new users so you can experience the power of AI."
      },
      {
        q: "Does a high Matching Score guarantee an interview?",
        a: "A high Matching Score helps your CV successfully 'pass the gate' through automated filters and strongly impresses recruiters with accurate data. However, receiving an interview invitation also depends on your attitude and how you present yourself in the profile. Our tool acts as a 'powerful assistant' to ensure your profile is always in the most perfect state before it reaches human hands."
      }
    ],
    inAppBrowserWarning: "You are opening the app from an in-app browser (Zalo, Facebook, Messenger...). Google blocks login from these browsers.",
    inAppBrowserAction: "Please tap the three dots (...) or the browser icon on your screen and select 'Open in browser' (Chrome or Safari) to continue.",
    openInExternalBrowser: "Open in External Browser",
    loginErrorInApp: "Login Error: This browser is not supported by Google. Please open the website in Chrome or Safari.",
    analysisHistory: "Analysis History",
    historyDesc: "Review and manage your CV analysis history results",
    clearHistory: "Clear All History",
    backToList: "Back to List",
    back: "Back",
    detailedAnalysis: "Detailed Analysis:",
    comparisonJD: "Comparison JD Info:",
    reportLanguageLabel: "Report Language",
    vietnamese: "Vietnamese",
    english: "English",
    analysisProgress: "Analysis Progress",
    aiThinking: "AI is thinking...",
    analysisTime: "Analysis Time",
    sectionOther: "Other",
    printOptimized: "Print CV",
    premiumOptimizedBadge: "Premium AI Optimized",
    processingFile: "Processing file...",
    readyToAnalyze: "Ready to analyze",
    readyToAnalyzeDesc: "Upload your CV and provide a job description to see detailed matching insights.",
    rateResults: "Rate Analysis Results",
    rateResultsDesc: "Your feedback helps us improve AI accuracy.",
    thankYouRating: "Thank you for your rating!",
    submitRating: "Submit Rating",
    feedbackPlaceholder: "Do you have any suggestions to make the results more accurate? (Optional)",
    atsCompatibilityScore: "ATS Compatibility Score",
    scoreDistribution: "Component Score Breakdown",
    skillDistribution: "Skill Distribution",
  }
};

function AppContent() {
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const path = window.location.pathname;
    const params = new URLSearchParams(window.location.search);
    
    // Check path segments first
    if (path.includes('/privacy') || path.includes('/policy')) return 'privacy';
    if (path.includes('/terms')) return 'terms';
    if (path.includes('/support')) return 'support';
    
    // Fallback to query params
    if (params.get('policy') === 'true' || params.get('privacy') === 'true') return 'privacy';
    if (params.get('terms') === 'true') return 'terms';
    if (params.get('support') === 'true') return 'support';
    
    return 'analyze';
  });
  const [jd, setJd] = useState('');
  const [jdInputMode, setJdInputMode] = useState<'text' | 'link'>('text');
  const [jdUrl, setJdUrl] = useState('');
  const [cvText, setCvText] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [cvInputMode, setCvInputMode] = useState<'file' | 'text'>('file');
  const [files, setFiles] = useState<File[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState<string | null>(null);
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [history, setHistory] = useState<AnalysisResult[]>([]);
  const [error, setError] = useState<string | React.ReactNode>(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [selectedResult, setSelectedResult] = useState<AnalysisResult | null>(null);
  const [openSections, setOpenSections] = useState<string[]>(['matching']);
  const [isDraggingJD, setIsDraggingJD] = useState(false);
  const [isDraggingCV, setIsDraggingCV] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isExtractingJD, setIsExtractingJD] = useState(false);
  const [isSavingJD, setIsSavingJD] = useState(false);
  const [savedJDs, setSavedJDs] = useState<SavedJD[]>([]);
  const [isSavedJDsModalOpen, setIsSavedJDsModalOpen] = useState(false);
  const [isSaveJDNameModalOpen, setIsSaveJDNameModalOpen] = useState(false);
  const [jdSaveTitle, setJdSaveTitle] = useState('');
  const [savedJDSearchTerm, setSavedJDSearchTerm] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [userRating, setUserRating] = useState<number>(0);
  const [userFeedback, setUserFeedback] = useState<string>('');
  const [isRatingSubmitted, setIsRatingSubmitted] = useState<boolean>(false);
  const [isSubmittingRating, setIsSubmittingRating] = useState<boolean>(false);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [resultTab, setResultTab] = useState<'analysis' | 'comparison' | 'optimization'>('analysis');
  const [reportLanguage, setReportLanguage] = useState<'vi' | 'en'>(() => {
    const path = window.location.pathname;
    if (path.startsWith('/en')) return 'en';
    return 'vi';
  });
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);
  const [isInAppBrowser, setIsInAppBrowser] = useState(false);
  const [showInAppWarning, setShowInAppWarning] = useState(false);

  // Unified Sync for Language and ActiveTab with Path-based Routing
  useEffect(() => {
    const langPrefix = reportLanguage === 'en' ? '/en' : '/vi';
    let subPath = '';
    
    if (activeTab === 'privacy') subPath = '/privacy';
    else if (activeTab === 'terms') subPath = '/terms';
    else if (activeTab === 'support') subPath = '/support';
    
    const newPathname = langPrefix + subPath;
    const currentPathname = window.location.pathname;
    
    // Clean up old search params if they exist
    const url = new URL(window.location.href);
    const hadLegacyParams = url.searchParams.has('policy') || url.searchParams.has('privacy') || url.searchParams.has('terms') || url.searchParams.has('support');
    
    url.searchParams.delete('policy');
    url.searchParams.delete('privacy');
    url.searchParams.delete('terms');
    url.searchParams.delete('support');
    
    if (currentPathname !== newPathname || hadLegacyParams) {
      window.history.pushState(null, '', newPathname + url.search);
    }
  }, [reportLanguage, activeTab]);

  // Listen for popstate (back/forward browser buttons)
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      
      // Set language
      if (path.startsWith('/en')) {
        setReportLanguage('en');
      } else {
        setReportLanguage('vi');
      }

      // Set tab based on path
      if (path.includes('/privacy') || path.includes('/policy')) {
        setActiveTab('privacy');
      } else if (path.includes('/terms')) {
        setActiveTab('terms');
      } else if (path.includes('/support')) {
        setActiveTab('support');
      } else {
        // Fallback or analyze
        const params = new URLSearchParams(window.location.search);
        if (params.get('support') === 'true') {
          setActiveTab('support');
        } else if (params.get('policy') === 'true' || params.get('privacy') === 'true') {
          setActiveTab('privacy');
        } else if (params.get('terms') === 'true') {
          setActiveTab('terms');
        } else {
          setActiveTab('analyze');
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  
  // History filtering state
  const [historySearchQuery, setHistorySearchQuery] = useState('');
  const [historyScoreFilter, setHistoryScoreFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [historyDateFilter, setHistoryDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  
  const { executeRecaptcha } = useGoogleReCaptcha();
  const jdFileInputRef = useRef<HTMLInputElement>(null);

  // Initialize Google Analytics
  useEffect(() => {
    const GA_ID = import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-89Y51J2MS7';
    
    // Check if script already exists OR if GA_ID is missing
    if (!GA_ID || document.querySelector(`script[src*="${GA_ID}"]`)) return;

    const script = document.createElement('script');
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
    script.async = true;
    
    // Add error handling for script loading
    script.onerror = () => {
      console.warn('Google Analytics script failed to load. This is often caused by ad-blockers.');
    };

    document.head.appendChild(script);

    window.dataLayer = window.dataLayer || [];
    window.gtag = function() {
      window.dataLayer.push(arguments);
    };
    window.gtag('js', new Date());
    window.gtag('config', GA_ID, {
      page_path: window.location.pathname + window.location.search,
      page_title: reportLanguage === 'en' ? 'CV Matcher & Optimizer' : 'Phân tích CV - thanhnghiep.top'
    });
  }, [reportLanguage]);

  // Detect In-App Browser
  useEffect(() => {
    const ua = navigator.userAgent || navigator.vendor || (window as any).opera;
    const isInApp = /FBAN|FBAV|Instagram|Zalo|Messenger|Telegram|Line|Viber|Twitter|LinkedIn/i.test(ua);
    setIsInAppBrowser(isInApp);
    if (isInApp) {
      setShowInAppWarning(true);
    }
  }, []);

  // Handle Auth State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        setIsLoadingProfile(true);
        try {
          let profile = await getUserProfile(currentUser.uid);
          if (!profile) {
            profile = await createUserProfile(currentUser);
          }
          setUserProfile(profile);
          
          // Fetch user-specific history
          const userHistory = await getUserHistory(currentUser.uid);
          setHistory(userHistory);
        } catch (err) {
          console.error("Error loading profile or history:", err);
        } finally {
          setIsLoadingProfile(false);
        }
      } else {
        setUserProfile(null);
        setHistory([]); // Clear history on logout
        setResults([]);
        setSelectedResult(null);
        setJd('');
        setJdUrl('');
        setJdInputMode('text');
        setCvText('');
        setCvInputMode('file');
        setFiles([]);
        setError(null);
        setUploadProgress(null);
        setIsAnalyzing(false);
        setActiveTab('analyze');
        setIsUserMenuOpen(false);
        setIsLoadingProfile(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // Fetch all users for admin (Real-time)
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    
    // Always subscribe if admin, to show notification dots even when not on admin tab
    if (userProfile?.role === 'admin' || user?.email?.toLowerCase() === (import.meta.env.VITE_ADMIN_EMAIL || "").toLowerCase()) {
      unsubscribe = subscribeToAllUsers(setAllUsers);
    }
    
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [userProfile, user]);

  const newUsersCount = allUsers.filter(u => u.isNew && u.role !== 'admin').length;

  // Filtered history logic
  const filteredHistory = useMemo(() => {
    return history.filter(item => {
      // Search query filter
      const searchMatch = 
        item.cvName.toLowerCase().includes(historySearchQuery.toLowerCase()) ||
        (item.jobTitle || '').toLowerCase().includes(historySearchQuery.toLowerCase()) ||
        (item.jdTitle || '').toLowerCase().includes(historySearchQuery.toLowerCase());
      
      if (!searchMatch) return false;

      // Score filter
      if (historyScoreFilter !== 'all') {
        if (historyScoreFilter === 'high' && item.matchScore < 80) return false;
        if (historyScoreFilter === 'medium' && (item.matchScore < 60 || item.matchScore >= 80)) return false;
        if (historyScoreFilter === 'low' && item.matchScore >= 60) return false;
      }

      // Date filter
      if (historyDateFilter !== 'all') {
        const now = new Date();
        const itemDate = new Date(item.timestamp);
        const diffTime = Math.abs(now.getTime() - itemDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (historyDateFilter === 'today' && diffDays > 1) return false;
        if (historyDateFilter === 'week' && diffDays > 7) return false;
        if (historyDateFilter === 'month' && diffDays > 30) return false;
      }

      return true;
    });
  }, [history, historySearchQuery, historyScoreFilter, historyDateFilter]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      if (window.gtag) {
        window.gtag('event', 'login', { method: 'Google' });
      }
    } catch (err: any) {
      console.error("Login Error:", err);
      const isIframe = window.self !== window.top;
      
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        // User closed the popup or cancelled the request, ignore
        return;
      }

      // Handle In-App Browser error (disallowed_useragent)
      if (isInAppBrowser || err.message?.includes('disallowed_useragent') || err.code === 'auth/web-storage-unsupported') {
        setError(
          <div className="flex flex-col gap-4 text-left">
            <div className="flex items-start gap-3 text-red-600 font-bold">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <p>{t.loginErrorInApp}</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-sm text-slate-600">
              <p className="font-bold mb-2">{t.inAppBrowserAction}</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Nhấn vào biểu tượng 3 chấm (⋮ hoặc ⋯)</li>
                <li>Chọn "Mở bằng trình duyệt" hoặc "Mở trong Chrome/Safari"</li>
              </ul>
            </div>
            <button 
              onClick={() => window.open(window.location.href, '_blank')}
              className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-100"
            >
              <ExternalLink className="w-4 h-4" />
              {t.openInExternalBrowser}
            </button>
          </div>
        );
        return;
      }
      
      if (err.code === 'auth/popup-blocked') {
        setError(
          <div className="flex flex-col gap-2">
            <p>{reportLanguage === 'vi' ? 'Popup đăng nhập bị chặn bởi trình duyệt.' : 'Login popup blocked by browser.'}</p>
            {isIframe && (
              <button 
                onClick={() => window.open(window.location.href, '_blank')}
                className="text-indigo-600 underline font-bold"
              >
                {reportLanguage === 'vi' ? 'Mở ứng dụng trong tab mới để đăng nhập' : 'Open app in new tab to login'}
              </button>
            )}
          </div>
        );
      } else if (err.code === 'auth/unauthorized-domain') {
        setError(
          <div className="flex flex-col gap-2">
            <p>{reportLanguage === 'vi' ? 'Tên miền này chưa được cấp phép trong Firebase Console.' : 'This domain is not authorized in Firebase Console.'}</p>
            <p className="text-[10px] bg-slate-100 p-2 rounded border border-slate-200 font-mono break-all">
              {window.location.hostname}
            </p>
            <p className="text-xs">{reportLanguage === 'vi' ? 'Vui lòng thêm tên miền trên vào danh sách Authorized Domains trong Firebase Auth Settings.' : 'Please add this domain to the Authorized Domains list in Firebase Auth Settings.'}</p>
          </div>
        );
      } else {
        setError((reportLanguage === 'vi' ? "Không thể đăng nhập bằng Google: " : "Cannot login with Google: ") + (err.message || (reportLanguage === 'vi' ? "Lỗi không xác định" : "Unknown error")));
      }
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      if (window.gtag) {
        window.gtag('event', 'logout');
      }
      // Clear all input states
      setJd('');
      setJdUrl('');
      setJdInputMode('text');
      setCvText('');
      setCvInputMode('file');
      setFiles([]);
      setResults([]);
      setSelectedResult(null);
      setHistory([]); // Extra safety to clear history
      setError(null);
      setUploadProgress(null);
      setIsAnalyzing(false);
      setActiveTab('analyze');
      setIsUserMenuOpen(false);
    } catch (err: any) {
      console.error("Logout Error:", err);
    }
  };

  // Save history to localStorage (only for current session/fallback)
  useEffect(() => {
    if (user) {
      localStorage.setItem(`cv_history_${user.uid}`, JSON.stringify(history));
    }
  }, [history, user]);

  // Track result selection
  useEffect(() => {
    if (selectedResult) {
      setUserRating(selectedResult.rating || 0);
      setUserFeedback(selectedResult.feedback || '');
      setIsRatingSubmitted(!!selectedResult.rating);
      setResultTab('analysis');
      
      if (window.gtag) {
        window.gtag('event', 'view_result', {
          score: selectedResult.matchScore,
          cv_name: selectedResult.cvName,
        });
      }
    } else {
      setUserRating(0);
      setUserFeedback('');
      setIsRatingSubmitted(false);
    }
  }, [selectedResult]);

  // Track tab changes
  useEffect(() => {
    if (window.gtag) {
      window.gtag('event', 'page_view', {
        page_title: activeTab === 'analyze' ? t.analyze : t.analysisHistory,
        page_path: `/${activeTab}`,
      });
    }
  }, [activeTab]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      const validTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
        'text/plain',
        'image/jpeg',
        'image/png',
        'image/webp'
      ];
      
      const validFiles = selectedFiles.filter(f => 
        validTypes.includes(f.type) || f.type.startsWith('image/') || f.name.endsWith('.docx') || f.name.endsWith('.doc')
      );

      if (validFiles.length > 0) {
        // Simulate upload progress
        setUploadProgress(0);
        const interval = setInterval(() => {
          setUploadProgress(prev => {
            if (prev === null || prev >= 100) {
              clearInterval(interval);
              return null;
            }
            return prev + 10;
          });
        }, 100);

        setTimeout(() => {
          setFiles(prev => [...prev, ...validFiles]);
          setUploadProgress(null);
          if (window.gtag) {
            window.gtag('event', 'cv_file_upload', {
              file_count: validFiles.length
            });
          }
        }, 1100);
      }

      if (validFiles.length !== selectedFiles.length) {
        setError(reportLanguage === 'vi' ? 'Một số file đã bị bỏ qua. Vui lòng chỉ tải lên tài liệu PDF, DOCX, TXT hoặc Hình ảnh.' : 'Some files were ignored. Please only upload PDF, DOCX, TXT or Image files.');
      } else {
        setError(null);
      }
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const cleanText = (text: string): string => {
    return text
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n/g, '\n\n')
      .trim();
  };

  const processFile = async (file: File): Promise<{ data: string; mimeType: string }> => {
    const isPdf = file.type === 'application/pdf' || file.name.endsWith('.pdf');
    const isDocx = file.name.endsWith('.docx');
    const isImage = file.type.startsWith('image/');

    if (isPdf) {
      const reader = new FileReader();
      const pdfTextPromise = new Promise<string>((resolve, reject) => {
        reader.onload = async () => {
          try {
            const base64Data = reader.result as string;
            const response = await fetch('/api/extract-pdf', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ base64Data }),
            });
            
            if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.error || 'Failed to extract PDF');
            }
            
            const data = await response.json();
            resolve(data.text);
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const text = await pdfTextPromise;
      return { data: text, mimeType: 'text/plain' };
    } else if (isDocx) {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      return { data: cleanText(result.value), mimeType: 'text/plain' };
    } else if (isImage) {
      const reader = new FileReader();
      const imageTextPromise = new Promise<string>((resolve, reject) => {
        reader.onload = async () => {
          try {
            const extractedText = await extractTextFromImage(reader.result as string, file.type);
            resolve(extractedText);
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const text = await imageTextPromise;
      return { data: text, mimeType: 'text/plain' };
    } else {
      const text = await file.text();
      return { data: cleanText(text), mimeType: 'text/plain' };
    }
  };

  const handleJDFileChange = async (e: React.ChangeEvent<HTMLInputElement> | React.DragEvent) => {
    let file: File | null = null;
    
    if ('dataTransfer' in e) {
      // It's a DragEvent
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        file = e.dataTransfer.files[0];
      }
    } else if (e.target instanceof HTMLInputElement && e.target.files && e.target.files.length > 0) {
      // It's a ChangeEvent from an input
      file = e.target.files[0];
    }

    if (file) {
      const isDoc = file.name.endsWith('.doc');
      const isDocx = file.name.endsWith('.docx');
      const isPdf = file.type === 'application/pdf' || file.name.endsWith('.pdf');
      const isTxt = file.type === 'text/plain' || file.name.endsWith('.txt');
      const isImage = file.type.startsWith('image/');
      
      if (!isPdf && !isDocx && !isDoc && !isTxt && !isImage) {
        setError(reportLanguage === 'vi' ? 'Vui lòng chỉ tải lên tài liệu PDF, DOCX, TXT hoặc Hình ảnh cho JD.' : 'Please only upload PDF, DOCX, TXT or Image files for JD.');
        return;
      }

      if (isDoc && !isDocx) {
        setError(reportLanguage === 'vi' ? 'Định dạng .doc cũ không được hỗ trợ tốt. Vui lòng chuyển sang .docx hoặc .pdf.' : 'Old .doc format is not well supported. Please convert to .docx or .pdf.');
        return;
      }

      setIsAnalyzing(true);
      setError(null);
      try {
        const { data } = await processFile(file);
        
        if (data && data.trim()) {
          setJd(data.trim());
          setError(null);
          if (window.gtag) {
            window.gtag('event', 'jd_file_upload', {
              file_name: file.name
            });
          }
        } else {
          setError(reportLanguage === 'vi' ? 'Không thể trích xuất văn bản từ file JD này. Vui lòng thử dán trực tiếp.' : 'Could not extract text from this JD file. Please try pasting directly.');
        }
      } catch (err: any) {
        console.error('Lỗi xử lý file JD:', err);
        setError((reportLanguage === 'vi' ? 'Lỗi khi xử lý file JD: ' : 'Error processing JD file: ') + (err.message || (reportLanguage === 'vi' ? 'Không xác định' : 'Unknown')) + (reportLanguage === 'vi' ? '. Vui lòng thử dán trực tiếp.' : '. Please try pasting directly.'));
      } finally {
        setIsAnalyzing(false);
        // Reset the input value so the same file can be uploaded again if needed
        if (jdFileInputRef.current) {
          jdFileInputRef.current.value = '';
        }
      }
    }
  };

  const handleCVDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingCV(false);
    if (e.dataTransfer.files) {
      const selectedFiles = Array.from(e.dataTransfer.files);
      const validTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
        'text/plain',
        'image/jpeg',
        'image/png',
        'image/webp'
      ];
      
      const validFiles = selectedFiles.filter(f => 
        validTypes.includes(f.type) || f.type.startsWith('image/') || f.name.endsWith('.docx') || f.name.endsWith('.doc')
      );

      if (validFiles.length > 0) {
        // Simulate upload progress
        setUploadProgress(0);
        const interval = setInterval(() => {
          setUploadProgress(prev => {
            if (prev === null || prev >= 100) {
              clearInterval(interval);
              return null;
            }
            return prev + 10;
          });
        }, 100);

        setTimeout(() => {
          setFiles(prev => [...prev, ...validFiles]);
          setUploadProgress(null);
        }, 1100);
      }

      if (validFiles.length !== selectedFiles.length) {
        setError(reportLanguage === 'vi' ? 'Một số file đã bị bỏ qua. Vui lòng chỉ tải lên tài liệu PDF, DOCX, TXT hoặc Hình ảnh.' : 'Some files were ignored. Please only upload PDF, DOCX, TXT or Image files.');
      } else {
        setError(null);
      }
    }
  };

  useEffect(() => {
    if (user) {
      loadSavedJDs();
    } else {
      setSavedJDs([]);
    }
  }, [user]);

  const loadSavedJDs = async () => {
    if (!user) return;
    try {
      const jds = await getSavedJDs(user.uid);
      setSavedJDs(jds);
    } catch (err) {
      console.error("Error loading saved JDs:", err);
    }
  };

  const handleSaveJD = () => {
    if (!user) {
      setError(reportLanguage === 'vi' ? "Bạn cần đăng nhập để lưu JD." : "You need to login to save JD.");
      return;
    }
    if (!jd.trim()) {
      setError(reportLanguage === 'vi' ? "Vui lòng nhập nội dung JD trước khi lưu." : "Please enter JD content before saving.");
      return;
    }

    const defaultTitle = jd.split('\n')[0].substring(0, 50) || (reportLanguage === 'vi' ? 'JD đã lưu' : 'Saved JD');
    setJdSaveTitle(defaultTitle);
    setIsSaveJDNameModalOpen(true);
  };

  const confirmSaveJD = async () => {
    if (!user) return;
    
    setIsSavingJD(true);
    try {
      await saveJDToProfile(user.uid, jdSaveTitle || 'JD đã lưu', jd);
      await loadSavedJDs();
      setIsSaveJDNameModalOpen(false);
      setJdSaveTitle('');
      if (window.gtag) {
        window.gtag('event', 'jd_create', { method: 'manual' });
      }
    } catch (err: any) {
      setError("Lỗi khi lưu JD: " + err.message);
    } finally {
      setIsSavingJD(false);
    }
  };

  const handleDeleteSavedJD = async (jdId: string) => {
    if (!user) return;
    if (!window.confirm('Bạn có chắc chắn muốn xóa JD này khỏi kho lưu trữ không?')) {
      return;
    }
    try {
      await deleteSavedJD(user.uid, jdId);
      await loadSavedJDs();
    } catch (err: any) {
      setError("Lỗi khi xóa JD: " + err.message);
    }
  };

  const handleLoadSavedJD = (content: string) => {
    setJd(content);
    setJdInputMode('text');
    setIsSavedJDsModalOpen(false);
  };

  const handleExtractJD = async () => {
    if (!jdUrl.trim()) {
      setError("Vui lòng nhập liên kết JD.");
      return;
    }
    
    // Simple URL validation
    try {
      new URL(jdUrl);
    } catch (e) {
      setError("Liên kết không hợp lệ. Vui lòng kiểm tra lại.");
      return;
    }

    setIsExtractingJD(true);
    setError(null);
    
    try {
      const extractedText = await extractJDFromUrl(jdUrl);
      setJd(extractedText);
      setJdInputMode('text'); // Switch to text mode to show the extracted content
      if (window.gtag) {
        window.gtag('event', 'jd_create', { method: 'extract_url', url: jdUrl });
      }
    } catch (err: any) {
      setError(err.message || "Không thể trích xuất nội dung từ liên kết này.");
    } finally {
      setIsExtractingJD(false);
    }
  };

  const currentLang = selectedResult?.language || reportLanguage || 'vi';
  const t = UI_LABELS[currentLang as keyof typeof UI_LABELS];

  const handleAnalyze = async () => {
    if (jdInputMode === 'text' && !jd.trim()) {
      setError('Vui lòng cung cấp Mô tả công việc (JD).');
      return;
    }

    if (jdInputMode === 'link' && !jdUrl.trim()) {
      setError('Vui lòng cung cấp liên kết JD.');
      return;
    }

    if (cvInputMode === 'file' && files.length === 0) {
      setError('Vui lòng tải lên ít nhất một CV.');
      return;
    }

    if (cvInputMode === 'text' && !cvText.trim()) {
      setError('Vui lòng dán nội dung CV của bạn.');
      return;
    }

    if (!executeRecaptcha) {
      setError('Hệ thống xác thực reCAPTCHA chưa sẵn sàng. Vui lòng thử lại sau giây lát.');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisProgress(0);
    setAnalysisStatus(reportLanguage === 'vi' ? 'Đang chuẩn bị...' : 'Preparing...');
    setError(null);
    setResults([]);

    // Verify reCAPTCHA token on server
    try {
      setAnalysisProgress(5);
      const token = await executeRecaptcha('analyze_cv');
      const verifyResponse = await fetch('/api/verify-recaptcha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const verifyData = await verifyResponse.json();
      
      if (!verifyData.success) {
        setError('Xác nhận reCAPTCHA thất bại (điểm tin cậy thấp). Vui lòng thử lại.');
        setIsAnalyzing(false);
        return;
      }
      setAnalysisProgress(10);
    } catch (err) {
      console.error('Lỗi xác thực reCAPTCHA:', err);
      // Proceed in dev or handle error
    }

    // Track analysis event
    if (window.gtag) {
      window.gtag('event', 'analyze_cv', {
        input_mode: cvInputMode,
        jd_mode: jdInputMode,
        cv_count: cvInputMode === 'file' ? files.length : 1,
      });
    }

    try {
      const newResults: AnalysisResult[] = [];
      
      setAnalysisStatus(reportLanguage === 'vi' ? 'Đang đọc CV...' : 'Reading CV...');
      setAnalysisProgress(15);
      
      if (cvInputMode === 'file') {
        const totalFiles = files.length;
        for (let i = 0; i < totalFiles; i++) {
          const file = files[i];
          const fileBaseProgress = 15 + (i / totalFiles) * 75;
          
          setAnalysisStatus(reportLanguage === 'vi' ? `Đang đọc file: ${file.name}` : `Reading file: ${file.name}`);
          setAnalysisProgress(fileBaseProgress + 5);
          
          const { data, mimeType } = await processFile(file);
          
          setAnalysisStatus(reportLanguage === 'vi' ? `Đang phân tích: ${file.name}` : `Analyzing: ${file.name}`);
          setAnalysisProgress(fileBaseProgress + 15);
          
          const analysis = await analyzeCV(jd, data, mimeType, file.name, jdInputMode === 'link' ? jdUrl : undefined, reportLanguage);
          newResults.push({
            ...analysis,
            userId: user?.uid
          });
          
          if (window.gtag) {
            window.gtag('event', 'analysis_success', {
              cv_name: file.name,
              match_score: analysis.matchScore,
              jd_type: jdInputMode
            });
          }
          
          setAnalysisProgress(fileBaseProgress + (1 / totalFiles) * 75);
          
          // Increment usage count for each CV analyzed
          if (user?.uid) {
            incrementUsageCount(user.uid).catch(console.error);
          }
        }
      } else {
        setAnalysisStatus(reportLanguage === 'vi' ? 'Đang đọc nội dung CV...' : 'Reading CV content...');
        setAnalysisProgress(25);
        
        setAnalysisStatus(reportLanguage === 'vi' ? 'Đang phân tích nội dung CV...' : 'Analyzing CV content...');
        setAnalysisProgress(45);
        
        const analysis = await analyzeCV(jd, cvText, 'text/plain', 'CV_Pasted.txt', jdInputMode === 'link' ? jdUrl : undefined, reportLanguage);
        newResults.push({
          ...analysis,
          userId: user?.uid
        });
        
        if (window.gtag) {
          window.gtag('event', 'analysis_success', {
            cv_name: 'Pasted Text',
            match_score: analysis.matchScore,
            jd_type: jdInputMode
          });
        }
        setAnalysisProgress(90);
        
        // Increment usage count
        if (user?.uid) {
          incrementUsageCount(user.uid).catch(console.error);
        }
      }

      setAnalysisStatus(reportLanguage === 'vi' ? 'Đang tổng hợp kết quả...' : 'Synthesizing results...');
      setAnalysisProgress(95);
      setResults(newResults);
      setHistory(prev => [...newResults, ...prev].slice(0, 20)); // Keep last 20
      
      // Save to Firestore history if logged in
      if (user?.uid) {
        saveToHistory(newResults).catch(console.error);
      }

      if (newResults.length === 1) {
        setSelectedResult(newResults[0]);
      }
      setAnalysisProgress(100);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Đã xảy ra lỗi trong quá trình phân tích.');
    } finally {
      setTimeout(() => {
        setIsAnalyzing(false);
        setAnalysisStatus(null);
        setAnalysisProgress(0);
      }, 500);
    }
  };

  const clearHistory = async () => {
    if (window.confirm('Bạn có chắc chắn muốn xóa toàn bộ lịch sử không?')) {
      setHistory([]);
      if (user?.uid) {
        try {
          await clearUserHistory(user.uid);
        } catch (err) {
          console.error("Error clearing history:", err);
        }
      }
    }
  };

  const deleteHistoryItem = async (id: string) => {
    setHistory(prev => prev.filter(item => item.id !== id));
    if (user?.uid) {
      try {
        await deleteFromHistory(user.uid, id);
      } catch (err) {
        console.error("Error deleting history item:", err);
      }
    }
  };

  if (isLoadingProfile) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mx-auto mb-4" />
          <p className="text-slate-600 font-medium">
            Đang xác thực tài khoản...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans selection:bg-indigo-100">
      <div id="dashboard-root" className="h-full">
      <h1 className="sr-only">{t.atsOptimization}</h1>

      {/* In-App Browser Warning Banner */}
      <AnimatePresence>
        {showInAppWarning && isInAppBrowser && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-amber-50 border-b border-amber-200 overflow-hidden sticky top-0 z-[60] shadow-sm"
          >
            <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center shrink-0">
                  <AlertCircle className="w-5 h-5 text-amber-600" />
                </div>
                <div className="text-sm text-amber-800">
                  <p className="font-bold mb-0.5">{t.inAppBrowserWarning}</p>
                  <p className="opacity-90">{t.inAppBrowserAction}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                <button 
                  onClick={() => window.open(window.location.href, '_blank')}
                  className="flex-1 sm:flex-none px-4 py-2 bg-amber-600 text-white text-xs font-bold rounded-lg hover:bg-amber-700 transition-all flex items-center justify-center gap-2 shadow-sm"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  {t.openInExternalBrowser}
                </button>
                <button 
                  onClick={() => setShowInAppWarning(false)}
                  className="p-2 text-amber-500 hover:bg-amber-100 rounded-lg transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => { setActiveTab('analyze'); setSelectedResult(null); }}>
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200">
              <FileSearch className="text-white w-6 h-6" />
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-800 hidden sm:inline">thanhnghiep<span className="text-indigo-600">.top</span></span>
          </div>
            
            <div className="flex items-center gap-2 sm:gap-4">
              <nav className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                {user && (
                  <>
                    <button 
                      onClick={() => { setActiveTab('analyze'); setSelectedResult(null); }}
                      className={cn(
                        "flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-lg text-sm font-bold transition-all cursor-pointer hover:scale-105 active:scale-95",
                        activeTab === 'analyze' && !selectedResult ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                      )}
                    >
                      <LayoutDashboard className="w-4 h-4" />
                      <span className="hidden md:inline">{t.analyze}</span>
                    </button>
                    <button 
                      onClick={() => { 
                        setActiveTab('history'); 
                        setSelectedResult(null); 
                        if (window.gtag) window.gtag('event', 'view_history');
                      }}
                      className={cn(
                        "flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-lg text-sm font-bold transition-all cursor-pointer hover:scale-105 active:scale-95",
                        activeTab === 'history' && !selectedResult ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                      )}
                    >
                      <HistoryIcon className="w-4 h-4" />
                      <span className="hidden md:inline">{t.history}</span>
                    </button>
                  </>
                )}
                { (userProfile?.role === 'admin' || user?.email?.toLowerCase() === (import.meta.env.VITE_ADMIN_EMAIL || "").toLowerCase()) && (
                  <button 
                    onClick={() => { setActiveTab('admin'); setSelectedResult(null); }}
                    className={cn(
                      "flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-lg text-sm font-bold transition-all relative cursor-pointer hover:scale-105 active:scale-95",
                      activeTab === 'admin' && !selectedResult ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                    )}
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span className="hidden md:inline">{t.admin}</span>
                    {newUsersCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] flex items-center justify-center rounded-full border-2 border-white animate-pulse">
                        {newUsersCount}
                      </span>
                    )}
                  </button>
                )}
              </nav>

              <div className="h-8 w-px bg-slate-200 mx-1 hidden md:block" />

              {/* Language Switcher */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                <button 
                  onClick={() => setReportLanguage('vi')}
                  className={cn(
                    "px-2 py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer hover:scale-110 active:scale-90",
                    reportLanguage === 'vi' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
                  )}
                >
                  VI
                </button>
                <button 
                  onClick={() => setReportLanguage('en')}
                  className={cn(
                    "px-2 py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer hover:scale-110 active:scale-90",
                    reportLanguage === 'en' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
                  )}
                >
                  EN
                </button>
              </div>

              <div className="h-8 w-px bg-slate-200 mx-1 hidden md:block" />

              {user ? (
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="relative">
                    <button 
                      onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                      className="flex items-center focus:outline-none cursor-pointer"
                    >
                      {(userProfile?.photoURL || user.photoURL) ? (
                        <img src={userProfile?.photoURL || user.photoURL || ''} alt={user.displayName || ''} className="w-9 h-9 rounded-full border-2 border-white shadow-sm hover:border-indigo-200 transition-all" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 border-2 border-white shadow-sm hover:border-indigo-200 transition-all">
                          <UserIcon className="w-5 h-5" />
                        </div>
                      )}
                    </button>
                    
                    <AnimatePresence>
                      {isUserMenuOpen && (
                        <>
                          <div className="fixed inset-0 z-[55] cursor-pointer" onClick={() => setIsUserMenuOpen(false)} />
                          <motion.div 
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2, ease: "easeOut" }}
                            className="absolute top-full right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl p-2 z-[60] min-w-[200px]"
                          >
                            <div className="px-4 py-3 border-b border-slate-100 mb-1 bg-slate-50/50 rounded-t-2xl">
                              <div className="text-sm font-bold text-slate-800 truncate">{user.displayName}</div>
                              <div className="text-[10px] text-slate-400 truncate font-medium">{user.email}</div>
                            </div>
                            <button 
                              onClick={() => { handleLogout(); setIsUserMenuOpen(false); }}
                              className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-bold text-red-500 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
                            >
                              <LogOut className="w-4 h-4" />
                              {t.logout}
                            </button>
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button 
                    onClick={handleLogin}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 sm:bg-white sm:text-slate-700 sm:border sm:border-slate-200 sm:shadow-sm sm:hover:bg-slate-50 cursor-pointer"
                  >
                    <LogIn className="w-4 h-4 sm:text-indigo-600" />
                    <span className="hidden xs:inline sm:inline">{t.login}</span>
                  </button>
                  {window.self !== window.top && (
                    <button 
                      onClick={() => window.open(window.location.href, '_blank')}
                      className="p-2 bg-slate-100 text-slate-500 rounded-xl hover:bg-slate-200 transition-all cursor-pointer"
                      title="Mở trong tab mới để đăng nhập dễ hơn"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'privacy' ? (
          <PrivacyPolicyPage onBack={() => setActiveTab('analyze')} />
        ) : activeTab === 'terms' ? (
          <TermsOfServicePage onBack={() => setActiveTab('analyze')} />
        ) : activeTab === 'support' ? (
          <SupportDevelopmentPage 
            onBack={() => setActiveTab('analyze')} 
            language={reportLanguage}
          />
        ) : !user ? (
          <div className="flex flex-col items-center w-full">
            {/* Hero Section */}
            <div className="text-center py-20 px-4 w-full">
              <h1 className="text-5xl sm:text-7xl font-black tracking-tighter mb-6 text-slate-900">
                {t.heroTitle} <span className="text-indigo-600">Smart Insights</span>
              </h1>
              <p className="text-xl text-slate-600 mb-10 max-w-2xl mx-auto leading-relaxed">
                {t.heroDesc}
              </p>
              <div className="flex flex-col items-center gap-4 mb-16">
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <button onClick={handleLogin} className="px-8 py-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 cursor-pointer hover:scale-105 active:scale-95">{t.startNow}</button>
                  <a href="https://hr.thanhnghiep.top" target="_blank" rel="noopener noreferrer" className="px-8 py-4 bg-white text-slate-900 border border-slate-200 rounded-xl font-bold hover:bg-slate-50 transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer hover:scale-105 active:scale-95">
                    Dành cho nhà tuyển dụng <ArrowRight className="w-5 h-5" />
                  </a>
                </div>
                <p className="text-sm font-medium text-slate-500">{t.heroSub}</p>
              </div>
              {/* Dashboard Preview */}
              <div className="max-w-5xl mx-auto bg-white p-4 rounded-2xl shadow-2xl border border-slate-100">
                <img src="https://thanhnghiep.top/CVMatcher/cv-dash.jpg" alt="Dashboard Preview" className="rounded-xl w-full h-auto" referrerPolicy="no-referrer" />
              </div>
            </div>


            {/* Problem Section */}
            <div className="py-20 max-w-6xl w-full px-4">
              <h2 className="text-4xl font-black text-center mb-16 tracking-tight text-slate-900">{t.problemTitle}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-8 mb-12">
                {[
                  { icon: FileText, text: t.problemItem1 },
                  { icon: Search, text: t.problemItem2 },
                  { icon: Target, text: t.problemItem3 },
                  { icon: Clock, text: t.problemItem4 },
                  { icon: AlertCircle, text: t.problemItem5 }
                ].map((item, i) => (
                  <div key={i} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all text-center flex flex-col items-center">
                    <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-6">
                      <item.icon className="w-8 h-8" />
                    </div>
                    <div className="text-sm font-bold text-slate-900 leading-snug">{item.text}</div>
                  </div>
                ))}
              </div>
              <div className="max-w-4xl mx-auto p-6 bg-slate-50 rounded-2xl text-slate-900 font-bold text-center border border-slate-200">
                {t.problemResult}
              </div>
            </div>

            {/* Why Choose */}
            <div className="py-20 max-w-6xl w-full px-4">
              <h2 className="text-4xl font-black text-center mb-16 tracking-tight">{t.whyTitle}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                {[
                  { icon: Target, title: t.feature1Title, desc: t.feature1Desc },
                  { icon: CheckCircle2, title: t.feature2Title, desc: t.feature2Desc },
                  { icon: Brain, title: t.feature3Title, desc: t.feature3Desc },
                  { icon: Activity, title: t.feature4Title, desc: t.feature4Desc },
                  { icon: Key, title: t.feature5Title, desc: t.feature5Desc },
                  { icon: TrendingUp, title: t.feature6Title, desc: t.feature6Desc },
                  { icon: FileText, title: t.feature7Title, desc: t.feature7Desc },
                  { icon: Download, title: t.feature8Title, desc: t.feature8Desc }
                ].map((item, i) => (
                  <div key={i} className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all text-center flex flex-col items-center">
                    <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-6">
                      <item.icon className="w-8 h-8" />
                    </div>
                    <div className="text-lg font-black text-slate-900 mb-4">{item.title}</div>
                    <div className="text-sm text-slate-500 leading-relaxed">{item.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* How It Works */}
            <div className="py-20 w-full bg-slate-50">
              <div className="max-w-6xl mx-auto px-4">
                <h2 className="text-4xl font-black text-center mb-16 tracking-tight text-slate-900">{t.howItWorksTitle}</h2>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-8 relative">
                  {[
                    { title: t.howItWorksStep1Title, desc: t.howItWorksStep1Desc },
                    { title: t.howItWorksStep2Title, desc: t.howItWorksStep2Desc },
                    { title: t.howItWorksStep3Title, desc: t.howItWorksStep3Desc },
                    { title: t.howItWorksStep4Title, desc: t.howItWorksStep4Desc }
                  ].map((step, i) => (
                    <div key={i} className="relative flex flex-col items-center text-center">
                      <div className="w-20 h-20 bg-white text-indigo-600 rounded-full flex items-center justify-center font-black text-3xl mb-6 shadow-sm border border-slate-100">
                        {i + 1}
                      </div>
                      <div className="text-lg font-black text-slate-900 mb-2">{step.title}</div>
                      <div className="text-sm text-slate-500 leading-relaxed max-w-[200px]">{step.desc}</div>
                      {i < 3 && (
                        <div className="hidden md:block absolute top-10 -right-4 text-slate-300">
                          <ChevronRight className="w-8 h-8" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-center text-slate-500 mt-16 font-medium">{t.howItWorksFooter}</p>
              </div>
            </div>

            {/* Demo Result Section */}
            <div className="py-20 w-full bg-white rounded-t-3xl">
              <div className="max-w-4xl mx-auto px-4">
                <h2 className="text-4xl font-black text-center mb-16 tracking-tight text-slate-900">{t.resultTitle}</h2>
                <div className="bg-slate-50 p-8 rounded-3xl border border-slate-100 shadow-sm">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mb-10">
                    <div>
                      <div className="flex justify-between mb-2 text-sm font-bold text-slate-700"><span>{t.matchingScore}</span><span>72%</span></div>
                      <div className="w-full bg-slate-200 rounded-full h-3"><div className="bg-indigo-600 h-3 rounded-full" style={{width: '72%'}}></div></div>
                    </div>
                    <div>
                      <div className="flex justify-between mb-2 text-sm font-bold text-slate-700"><span>{t.atsScore}</span><span>81%</span></div>
                      <div className="w-full bg-slate-200 rounded-full h-3"><div className="bg-emerald-500 h-3 rounded-full" style={{width: '81%'}}></div></div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                      <h4 className="font-bold text-slate-900 mb-4">{t.missingSkills}</h4>
                      <div className="flex flex-wrap gap-2">
                        {['SQL', 'Communication', 'Leadership'].map(skill => <span key={skill} className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold">{skill}</span>)}
                      </div>
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 mb-4">{t.strengths}</h4>
                      <div className="flex flex-wrap gap-2">
                        {['UX Design', 'Figma', 'User Research'].map(skill => <span key={skill} className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">{skill}</span>)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-10">
                    <h4 className="font-bold text-slate-900 mb-4">{t.suggestions}</h4>
                    <ul className="space-y-2 text-sm text-slate-600">
                      {[t.suggestion1, t.suggestion2, t.suggestion3].map((s, i) => <li key={i} className="flex items-start gap-2">✅ {s}</li>)}
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="py-20 w-full bg-slate-900 text-white text-center">
              <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-12">
                <div><div className="text-5xl font-black mb-2"><Counter from={0} to={35} suffix="+" /></div><div className="text-slate-400 font-medium">{t.stats1}</div></div>
                <div><div className="text-5xl font-black mb-2"><Counter from={0} to={98} suffix="%" /></div><div className="text-slate-400 font-medium">{t.stats2}</div></div>
                <div><div className="text-5xl font-black mb-2"><Counter from={0} to={2} suffix="M+" /></div><div className="text-slate-400 font-medium">{t.stats3}</div></div>
              </div>
            </div>

            {/* Target Users Section */}
            <section className="w-full py-20 bg-white rounded-b-3xl">
              <div className="container mx-auto px-4 text-center">
                <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-12">{t.targetUsersTitle}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
                  {[
                    { label: t.targetUsersItem1, icon: GraduationCap },
                    { label: t.targetUsersItem2, icon: Search },
                    { label: t.targetUsersItem3, icon: Users },
                    { label: t.targetUsersItem4, icon: Globe },
                    { label: t.targetUsersItem5, icon: FileCheck },
                  ].map((item, index) => (
                    <div key={index} className="p-6 bg-slate-50 rounded-2xl border border-slate-100 hover:shadow-md transition-shadow flex flex-col items-center gap-4">
                      <item.icon className="w-8 h-8 text-indigo-600" />
                      <p className="font-semibold text-slate-800">{item.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* CTA Section */}
            <section className="w-full py-12 px-4">
              <div className="container mx-auto max-w-5xl bg-indigo-600 rounded-3xl p-8 md:p-16 text-center shadow-xl">
                <h2 className="text-2xl md:text-4xl font-bold text-white mb-8 tracking-tight">{t.ctaTitle}</h2>
                <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-6">
                  <button 
                    onClick={handleLogin}
                    className="px-8 py-4 bg-white text-indigo-600 font-bold rounded-full text-lg hover:bg-slate-100 transition-all shadow-lg hover:shadow-indigo-300/50 cursor-pointer hover:scale-105 active:scale-95"
                  >
                    {t.ctaBtn}
                  </button>
                  <a 
                    href="https://hr.thanhnghiep.top" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="px-8 py-4 bg-indigo-500 text-white font-bold rounded-full text-lg hover:bg-indigo-400 transition-all shadow-lg hover:shadow-indigo-400/50 flex items-center justify-center gap-2 cursor-pointer hover:scale-105 active:scale-95"
                  >
                    Dành cho nhà tuyển dụng <ArrowRight className="w-4 h-4" />
                  </a>
                </div>
                <p className="text-indigo-100 font-medium text-sm">{t.ctaSub}</p>
              </div>
            </section>

            {/* FAQ Section */}
            <section className="w-full py-20 bg-slate-50">
              <div className="w-full max-w-3xl mx-auto px-4">
                <h2 className="text-3xl md:text-4xl font-black text-center mb-12 tracking-tight text-slate-900">{t.faqTitle}</h2>
                <div className="space-y-4">
                  {t.faqItems.map((item: any, index: number) => (
                    <div 
                      key={index} 
                      className="w-full bg-white rounded-2xl border border-slate-200 overflow-hidden transition-all hover:border-indigo-200"
                    >
                      <button 
                        onClick={() => setOpenFaqIndex(openFaqIndex === index ? null : index)}
                        className="w-full flex items-center justify-between p-6 text-left focus:outline-none"
                      >
                        <span className="font-bold text-slate-800 pr-8 flex-1">{item.q}</span>
                        <div className={cn(
                          "shrink-0 w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center transition-transform duration-300",
                          openFaqIndex === index ? "rotate-180 bg-indigo-50 text-indigo-600" : "text-slate-400"
                        )}>
                          <ChevronDown className="w-5 h-5" />
                        </div>
                      </button>
                      <AnimatePresence initial={false}>
                        {openFaqIndex === index && (
                          <motion.div 
                            key="content"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
                            style={{ overflow: 'hidden' }}
                          >
                            <div className="px-6 pb-6 text-slate-600 text-sm leading-relaxed whitespace-pre-line border-t border-slate-50 pt-4">
                              {item.a}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>
        ) : user && userProfile?.hasPermission === false && userProfile?.role !== 'admin' && user.email?.toLowerCase() !== (import.meta.env.VITE_ADMIN_EMAIL || "").toLowerCase() ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 bg-red-100 rounded-3xl flex items-center justify-center mb-6">
              <UserX className="w-10 h-10 text-red-600" />
            </div>
            <h2 className="text-3xl font-black text-slate-900 mb-4">Tài khoản bị khóa</h2>
            <p className="text-slate-600 max-w-md mb-8">
              Tài khoản của bạn đã bị quản trị viên tạm khóa. Vui lòng liên hệ <a href={`mailto:${import.meta.env.VITE_FEEDBACK_RECIPIENT_EMAIL || 'admin@example.com'}`} className="text-indigo-600 font-bold hover:underline">{import.meta.env.VITE_FEEDBACK_RECIPIENT_EMAIL || 'admin@example.com'}</a> để được hỗ trợ.
            </p>
          </div>
        ) : activeTab === 'admin' && (userProfile?.role === 'admin' || user?.email?.toLowerCase() === (import.meta.env.VITE_ADMIN_EMAIL || "").toLowerCase()) ? (
          <div className="space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-3xl font-black text-slate-900 tracking-tight">Quản lý người dùng</h2>
                <p className="text-slate-500 text-sm">Cấp quyền hoặc thu hồi quyền truy cập ứng dụng.</p>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Tìm kiếm email..."
                  value={userSearchTerm}
                  onChange={(e) => setUserSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all w-full sm:w-64"
                />
              </div>
            </div>

            {newUsersCount > 0 && (
              <div className="bg-indigo-50 border border-indigo-100 rounded-3xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                    <UserPlus className="w-6 h-6 text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-indigo-900">Người dùng mới đăng ký</h3>
                    <p className="text-indigo-700 text-xs">Có {newUsersCount} người dùng mới vừa tham gia hệ thống.</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {allUsers.filter(u => u.isNew && u.role !== 'admin').map(u => (
                    <div key={u.uid} className="bg-white p-4 rounded-2xl border border-indigo-200 shadow-sm flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 overflow-hidden">
                        {u.photoURL ? (
                          <img src={u.photoURL} alt="" className="w-10 h-10 rounded-full" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                            <UserIcon className="w-5 h-5" />
                          </div>
                        )}
                        <div className="overflow-hidden">
                          <div className="text-sm font-bold text-slate-800 truncate">{u.displayName || 'N/A'}</div>
                          <div className="text-[10px] text-slate-400 truncate">{u.email}</div>
                        </div>
                      </div>
                      <button 
                        onClick={async () => {
                          try {
                            await markUserAsRead(u.uid);
                          } catch (err: any) {
                            setError("Không thể đánh dấu đã đọc: " + err.message);
                          }
                        }}
                        className="p-2 bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 transition-all shadow-md shadow-indigo-100"
                        title="Đánh dấu đã xem"
                      >
                        <Check className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Người dùng</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Vai trò</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Trạng thái</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Số lần dùng</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Ngày tham gia</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {allUsers
                      .filter(u => u.email.toLowerCase().includes(userSearchTerm.toLowerCase()))
                      .map((u) => (
                      <tr key={u.uid} className={cn("hover:bg-slate-50/50 transition-colors", u.isNew && "bg-indigo-50/30")}>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            {u.photoURL ? (
                              <img src={u.photoURL} alt="" className="w-8 h-8 rounded-full" />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                                <UserIcon className="w-4 h-4" />
                              </div>
                            )}
                            <div>
                              <div className="flex items-center gap-2">
                                <div className="text-sm font-bold text-slate-800">{u.displayName || 'N/A'}</div>
                                {u.isNew && (
                                  <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-600 text-[8px] font-black uppercase rounded-full">Mới</span>
                                )}
                              </div>
                              <div className="text-xs text-slate-400">{u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider",
                              u.role === 'admin' ? "bg-purple-100 text-purple-600" : "bg-slate-100 text-slate-600"
                            )}>
                              {u.role}
                            </span>
                            {u.uid !== user?.uid && (
                              <button 
                                onClick={async () => {
                                  if (window.confirm(`Bạn có chắc muốn đổi vai trò của ${u.email} thành ${u.role === 'admin' ? 'user' : 'admin'}?`)) {
                                    try {
                                      await updateUserRole(u.uid, u.role === 'admin' ? 'user' : 'admin');
                                    } catch (err: any) {
                                      setError("Không thể đổi vai trò: " + err.message);
                                    }
                                  }
                                }}
                                className="p-1 text-slate-400 hover:text-indigo-600 transition-colors"
                                title="Đổi vai trò"
                              >
                                <UserCog className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            {u.hasPermission ? (
                              <>
                                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                <span className="text-xs font-bold text-emerald-600">Hoạt động</span>
                              </>
                            ) : (
                              <>
                                <div className="w-2 h-2 rounded-full bg-red-500" />
                                <span className="text-xs font-bold text-red-600">Đã khóa</span>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="px-2 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-black">
                              {u.usageCount || 0}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-xs text-slate-500 font-medium">
                          {new Date(u.createdAt).toLocaleDateString('vi-VN')}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {u.uid !== user?.uid && (
                              <>
                                <button 
                                  onClick={async () => {
                                    try {
                                      await updateUserPermission(u.uid, !u.hasPermission);
                                    } catch (err: any) {
                                      setError("Không thể thay đổi quyền: " + err.message);
                                    }
                                  }}
                                  className={cn(
                                    "p-2 rounded-xl transition-all",
                                    u.hasPermission 
                                      ? "text-red-500 hover:bg-red-50" 
                                      : "text-emerald-500 hover:bg-emerald-50"
                                  )}
                                  title={u.hasPermission ? "Khóa tài khoản" : "Mở khóa tài khoản"}
                                >
                                  {u.hasPermission ? <UserX className="w-5 h-5" /> : <UserCheck className="w-5 h-5" />}
                                </button>
                                <button 
                                  onClick={async () => {
                                    if (window.confirm(`Bạn có chắc muốn XÓA vĩnh viễn người dùng ${u.email}? Hành động này không thể hoàn tác.`)) {
                                      try {
                                        await deleteUser(u.uid);
                                      } catch (err: any) {
                                        setError("Không thể xóa người dùng: " + err.message);
                                      }
                                    }
                                  }}
                                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                                  title="Xóa người dùng"
                                >
                                  <Trash2 className="w-5 h-5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : activeTab === 'analyze' ? (
          <div className="space-y-12">
            {/* Hero Section */}
            <section className="text-center max-w-2xl mx-auto mb-10">
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 mb-3 leading-tight">
                {t.heroTitle} <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600">Smart Insights</span>
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                {t.atsOptimizationDesc}
              </p>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Left Column: Inputs (5 cols) */}
              <div className="lg:col-span-5 space-y-6">
                <section 
                  className={cn(
                    "bg-white p-6 rounded-2xl shadow-sm border transition-all relative",
                    isDraggingJD ? "border-indigo-500 bg-indigo-50/30 ring-2 ring-indigo-500/20" : "border-slate-200"
                  )}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingJD(true); }}
                  onDragLeave={(e) => { e.stopPropagation(); setIsDraggingJD(false); }}
                  onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingJD(false); handleJDFileChange(e); }}
                >
                  {isDraggingJD && (
                    <div 
                      className="absolute inset-0 z-20 bg-indigo-600/10 backdrop-blur-[2px] border-2 border-dashed border-indigo-500 rounded-2xl flex flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-200"
                      onDragOver={(e) => e.preventDefault()}
                      onDragLeave={() => setIsDraggingJD(false)}
                      onDrop={(e) => { e.preventDefault(); setIsDraggingJD(false); handleJDFileChange(e); }}
                    >
                      <div className="bg-white p-4 rounded-2xl shadow-xl flex flex-col items-center gap-2">
                        <Upload className="w-8 h-8 text-indigo-600 animate-bounce" />
                        <span className="text-sm font-black text-indigo-600 uppercase tracking-widest">Thả file JD vào đây</span>
                      </div>
                    </div>
                  )}
                  <div className="flex flex-col gap-3 mb-4">
                    <div className="flex items-center gap-2">
                      <FileText className="w-5 h-5 text-indigo-600" />
                      <h3 className="text-lg font-semibold">{t.jdTitle}</h3>
                    </div>
                    <p className="text-xs text-slate-500 -mt-2">
                      {t.jdDesc}
                    </p>
                    <div className="flex items-center justify-between">
                      <div className="flex bg-slate-100 p-1 rounded-lg">
                        <button 
                          onClick={() => setJdInputMode('text')}
                          className={cn(
                            "px-3 py-1 text-[10px] font-bold rounded-md transition-all cursor-pointer hover:scale-105 active:scale-95",
                            jdInputMode === 'text' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"
                          )}
                        >
                          {t.textMode}
                        </button>
                        <button 
                          onClick={() => setJdInputMode('link')}
                          className={cn(
                            "px-3 py-1 text-[10px] font-bold rounded-md transition-all cursor-pointer hover:scale-105 active:scale-95",
                            jdInputMode === 'link' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"
                          )}
                        >
                          {t.linkMode}
                        </button>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {user && (
                          <>
                            <button 
                              onClick={() => setIsSavedJDsModalOpen(true)}
                              className="text-xs font-bold text-slate-500 hover:text-indigo-600 flex items-center gap-1 bg-slate-100 px-2 py-1 rounded-lg transition-all cursor-pointer hover:scale-105 active:scale-95"
                              title="Mở danh sách JD đã lưu"
                            >
                              <FolderOpen className="w-3 h-3" />
                              {t.jdStore}
                            </button>
                            {jdInputMode === 'text' && jd.trim() && (
                              <button 
                                onClick={handleSaveJD}
                                disabled={isSavingJD}
                                className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 bg-indigo-50 px-2 py-1 rounded-lg transition-all disabled:opacity-50 cursor-pointer hover:scale-105 active:scale-95"
                                title="Lưu JD hiện tại"
                              >
                                {isSavingJD ? <Loader2 className="w-3 h-3 animate-spin" /> : <BookmarkPlus className="w-3 h-3" />}
                                {t.saveJd}
                              </button>
                            )}
                          </>
                        )}
                        {/* JD file upload indicator hidden as requested */}
                      </div>
                    </div>
                    <input 
                      type="file"
                      ref={jdFileInputRef}
                      className="hidden"
                      accept=".pdf,.doc,.docx,.txt,image/*"
                      onChange={handleJDFileChange}
                    />
                  </div>
                  {jdInputMode === 'text' ? (
                    <div className="relative group">
                      <textarea
                        value={jd}
                        onChange={(e) => setJd(e.target.value)}
                        placeholder={t.placeholderJD}
                        onDragOver={(e) => { e.preventDefault(); setIsDraggingJD(true); }}
                        onDrop={(e) => { e.preventDefault(); setIsDraggingJD(false); handleJDFileChange(e); }}
                        className="w-full h-64 p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all resize-none text-slate-700 bg-slate-50/50 text-sm"
                      />
                      {/* JD hover upload button hidden as requested */}
                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex items-start gap-2 text-[10px] text-slate-500 italic">
                          <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                          <span>{reportLanguage === 'vi' ? 'Mẹo: Dán link hoặc kéo thả file trực tiếp vào đây để AI tự trích xuất nội dung.' : 'Tip: Paste link or drag and drop file directly here for AI to extract content.'}</span>
                        </div>
                        {jd && (
                          <button 
                            onClick={() => setJd('')}
                            className="text-[10px] font-bold text-slate-400 hover:text-red-500 transition-colors uppercase tracking-widest cursor-pointer hover:scale-105 active:scale-95"
                          >
                            {t.clearBtn}
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="relative flex items-center">
                        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                          <Search className="w-5 h-5 text-slate-400" />
                        </div>
                        <input
                          type="url"
                          value={jdUrl}
                          onChange={(e) => setJdUrl(e.target.value)}
                          placeholder={t.placeholderLink}
                          className="w-full h-12 pl-12 pr-32 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-slate-700 bg-slate-50/50 text-sm"
                        />
                        <div className="absolute inset-y-0 right-1.5 flex items-center">
                          <button
                            onClick={handleExtractJD}
                            disabled={isExtractingJD || !jdUrl.trim()}
                            className={cn(
                              "h-9 px-4 rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-1.5",
                              isExtractingJD 
                                ? "bg-slate-100 text-slate-400 cursor-not-allowed" 
                                : "bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm active:scale-95"
                            )}
                          >
                            {isExtractingJD ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                {reportLanguage === 'vi' ? 'Đang lấy...' : 'Extracting...'}
                              </>
                            ) : (
                              <>
                                <Zap className="w-3.5 h-3.5" />
                                {reportLanguage === 'vi' ? 'Trích xuất' : 'Extract'}
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                      {(jd || jdUrl) && (
                        <div className="mt-2 flex justify-end">
                          <button 
                            onClick={() => {
                              setJd('');
                              setJdUrl('');
                            }}
                            className="text-[10px] font-bold text-slate-400 hover:text-red-500 transition-colors uppercase tracking-widest"
                          >
                            {t.clearBtn}
                          </button>
                        </div>
                      )}
                  </div>
                )}
              </section>

              <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex flex-col gap-3 mb-4">
                  <div className="flex items-center gap-2">
                    <Upload className="w-5 h-5 text-indigo-600" />
                    <h2 className="text-lg font-semibold">{t.cvTitle}</h2>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex bg-slate-100 p-1 rounded-lg">
                      <button 
                        onClick={() => setCvInputMode('file')}
                        className={cn(
                          "px-3 py-1 text-[10px] font-bold rounded-md transition-all",
                          cvInputMode === 'file' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"
                        )}
                      >
                        FILE
                      </button>
                      <button 
                        onClick={() => setCvInputMode('text')}
                        className={cn(
                          "px-3 py-1 text-[10px] font-bold rounded-md transition-all",
                          cvInputMode === 'text' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"
                        )}
                      >
                        {t.textMode}
                      </button>
                    </div>
                      {/* CV file upload button hidden as requested */}
                  </div>
                </div>
                
                {cvInputMode === 'file' ? (
                  <>
                    <div 
                      className={cn(
                        "border-2 border-dashed rounded-xl p-6 transition-all cursor-pointer text-center relative",
                        isDraggingCV ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:border-indigo-400 hover:bg-slate-50"
                      )}
                      onClick={() => document.getElementById('cv-upload')?.click()}
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingCV(true); }}
                      onDragLeave={(e) => { e.stopPropagation(); setIsDraggingCV(false); }}
                      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleCVDrop(e); }}
                    >
                      {files.length > 0 && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setFiles([]);
                            setCvText('');
                          }}
                          className="absolute top-2 right-2 p-1.5 bg-white/80 backdrop-blur-sm rounded-lg text-slate-400 hover:text-red-500 transition-all shadow-sm border border-slate-100"
                          title={t.clearBtn}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <input 
                        id="cv-upload"
                        type="file" 
                        multiple
                        className="hidden" 
                        accept=".pdf,.doc,.docx,.txt,image/*"
                        onChange={handleFileChange}
                      />
                      <Upload className={cn("w-8 h-8 mx-auto mb-2 transition-colors", isDraggingCV ? "text-indigo-500" : "text-slate-400")} />
                      <p className="text-sm font-medium text-slate-600 mb-2">
                        {isDraggingCV ? (reportLanguage === 'vi' ? "Thả file vào đây" : "Drop file here") : (reportLanguage === 'vi' ? "Nhấn để tải lên CV (Hỗ trợ kéo thả file PDF, Word, Ảnh)" : "Click to upload CV (Supports PDF, Word, Images)")}
                      </p>
                      <div className="flex items-center justify-center gap-4 mt-2">
                        <div className="flex flex-col items-center gap-1">
                          <div className="w-8 h-8 bg-red-50 rounded-lg flex items-center justify-center">
                            <FileText className="w-4 h-4 text-red-500" />
                          </div>
                          <span className="text-[8px] font-bold text-slate-400 uppercase">PDF</span>
                        </div>
                        <div className="flex flex-col items-center gap-1">
                          <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                            <FileText className="w-4 h-4 text-blue-500" />
                          </div>
                          <span className="text-[8px] font-bold text-slate-400 uppercase">DOCX</span>
                        </div>
                        <div className="flex flex-col items-center gap-1">
                          <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
                            <FileText className="w-4 h-4 text-slate-500" />
                          </div>
                          <span className="text-[8px] font-bold text-slate-400 uppercase">TXT</span>
                        </div>
                        <div className="flex flex-col items-center gap-1">
                          <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center">
                            <FileText className="w-4 h-4 text-amber-500" />
                          </div>
                          <span className="text-[8px] font-bold text-slate-400 uppercase">IMG</span>
                        </div>
                      </div>
                    </div>

                    {uploadProgress !== null && (
                      <div className="mt-4">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-bold text-indigo-600 uppercase">{t.processingFile}</span>
                          <span className="text-[10px] font-bold text-indigo-600">{uploadProgress}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${uploadProgress}%` }}
                            className="h-full bg-indigo-500 rounded-full"
                          />
                        </div>
                      </div>
                    )}

                    {files.length > 0 && (
                      <div className="mt-4 space-y-2">
                        {files.map((f, i) => (
                          <div key={i} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg border border-slate-100 group">
                            <div className="flex items-center gap-2 overflow-hidden">
                              <FileText className="w-4 h-4 text-indigo-500 shrink-0" />
                              <span className="text-xs font-medium text-slate-700 truncate">{f.name}</span>
                            </div>
                            <button onClick={() => removeFile(i)} className="text-slate-400 hover:text-red-500 transition-colors">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="relative group">
                    <textarea
                      value={cvText}
                      onChange={(e) => setCvText(e.target.value)}
                      placeholder={t.placeholderCV}
                      className="w-full h-48 p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all resize-none text-slate-700 bg-slate-50/50 text-sm"
                    />
                    {cvText && (
                      <div className="mt-2 flex justify-end">
                        <button 
                          onClick={() => setCvText('')}
                          className="text-[10px] font-bold text-slate-400 hover:text-red-500 transition-colors uppercase tracking-widest"
                        >
                          {t.clearBtn}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </section>

              <div className="flex items-center justify-between mb-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
                    <Globe className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t.reportLanguageLabel}</p>
                    <p className="text-xs font-bold text-slate-700">{reportLanguage === 'vi' ? t.vietnamese : t.english}</p>
                  </div>
                </div>
                <div className="flex bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
                  <button
                    onClick={() => setReportLanguage('vi')}
                    className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${
                      reportLanguage === 'vi' 
                        ? 'bg-indigo-600 text-white shadow-sm' 
                        : 'text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    VI
                  </button>
                  <button
                    onClick={() => setReportLanguage('en')}
                    className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${
                      reportLanguage === 'en' 
                        ? 'bg-indigo-600 text-white shadow-sm' 
                        : 'text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    EN
                  </button>
                </div>
              </div>

              <button
                onClick={handleAnalyze}
                disabled={isAnalyzing}
                className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold text-lg shadow-lg shadow-indigo-200 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {cvInputMode === 'file' ? (reportLanguage === 'vi' ? `Đang phân tích ${files.length} CV...` : `Analyzing ${files.length} CVs...`) : t.analyzingBtn}
                  </>
                ) : (
                  <>
                    <TrendingUp className="w-5 h-5" />
                    {t.analyze}
                  </>
                )}
              </button>

              <p className="text-[10px] text-slate-400 text-center mt-2">
                This site is protected by reCAPTCHA and the Google 
                <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline mx-1">Privacy Policy</a> and 
                <a href="https://policies.google.com/terms" target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline mx-1">Terms of Service</a> apply.
              </p>

            </div>

            {/* Right Column: Results (7 cols) */}
            <div className="lg:col-span-7">
              <AnimatePresence mode="wait">
                {isAnalyzing ? (
                  <motion.div 
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="h-full min-h-[500px] flex flex-col items-center justify-center text-center p-8 bg-white rounded-3xl border border-slate-200 shadow-sm"
                  >
                    <div className="relative mb-8">
                      <div className="w-24 h-24 border-4 border-indigo-100 rounded-full"></div>
                      <motion.div 
                        className="absolute top-0 left-0 w-24 h-24 border-4 border-indigo-600 rounded-full border-t-transparent"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      />
                      <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 text-indigo-600" />
                    </div>
                    
                    <div className="w-full max-w-md mb-8">
                      <div className="flex justify-between items-end mb-2">
                        <div className="text-left">
                          <h3 className="text-xl font-bold text-slate-800">{analysisStatus || t.aiThinking}</h3>
                          <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">
                            {t.analysisProgress}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="text-2xl font-black text-indigo-600">{Math.round(analysisProgress)}%</span>
                        </div>
                      </div>
                      
                      <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200 p-0.5">
                        <motion.div 
                          className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full shadow-sm"
                          initial={{ width: 0 }}
                          animate={{ width: `${analysisProgress}%` }}
                          transition={{ duration: 0.5 }}
                        />
                      </div>
                      
                      <div className="flex justify-between mt-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        <span>{reportLanguage === 'vi' ? 'Khởi tạo' : 'Start'}</span>
                        <span>{reportLanguage === 'vi' ? 'Ước tính: ' : 'Est: '} {Math.max(0, Math.round((100 - analysisProgress) * 0.15))}s {reportLanguage === 'vi' ? 'còn lại' : 'left'}</span>
                        <span>{reportLanguage === 'vi' ? 'Hoàn tất' : 'Done'}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-4 w-full max-w-md">
                      {[
                        { step: 1, label: reportLanguage === 'vi' ? 'Đọc CV' : 'Read CV', min: 15 },
                        { step: 2, label: reportLanguage === 'vi' ? 'Phân tích' : 'Analyze', min: 40 },
                        { step: 3, label: reportLanguage === 'vi' ? 'Đối chiếu' : 'Match', min: 70 },
                        { step: 4, label: reportLanguage === 'vi' ? 'Báo cáo' : 'Report', min: 95 }
                      ].map((s) => (
                        <div key={s.step} className="flex flex-col items-center gap-2">
                          <div className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black transition-all duration-500",
                            analysisProgress >= s.min 
                              ? "bg-indigo-600 text-white shadow-lg shadow-indigo-100 scale-110" 
                              : "bg-slate-100 text-slate-400"
                          )}>
                            {analysisProgress >= s.min ? <Check className="w-4 h-4" /> : s.step}
                          </div>
                          <span className={cn(
                            "text-[8px] font-bold uppercase tracking-tighter",
                            analysisProgress >= s.min ? "text-indigo-600" : "text-slate-400"
                          )}>{s.label}</span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                ) : results.length > 0 ? (
                  <motion.div 
                    key="results-list"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-8"
                  >
                    {/* Comparison Overview if multiple */}
                    {results.length > 1 && (
                      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                        <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                          <Layers className="w-5 h-5 text-indigo-600" />
                          {t.detailedComparison}
                        </h3>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left">
                            <thead>
                              <tr className="border-b border-slate-100">
                                <th className="pb-4 text-sm font-bold text-slate-400 uppercase tracking-wider">{reportLanguage === 'vi' ? 'Ứng viên / CV' : 'Candidate / CV'}</th>
                                <th className="pb-4 text-sm font-bold text-slate-400 uppercase tracking-wider text-center">{reportLanguage === 'vi' ? 'Điểm số' : 'Score'}</th>
                                <th className="pb-4 text-sm font-bold text-slate-400 uppercase tracking-wider text-center">{reportLanguage === 'vi' ? 'Xác suất' : 'Probability'}</th>
                                <th className="pb-4 text-sm font-bold text-slate-400 uppercase tracking-wider text-right">{reportLanguage === 'vi' ? 'Hành động' : 'Action'}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                              {results.sort((a, b) => b.matchScore - a.matchScore).map((res) => (
                                <tr 
                                  key={res.id} 
                                  onClick={() => setSelectedResult(res)}
                                  className="group hover:bg-slate-50/50 transition-colors cursor-pointer"
                                >
                                  <td className="py-4">
                                    <div className="flex items-center gap-3">
                                      <div className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center font-bold text-xs">
                                        {res.cvName?.substring(0, 2).toUpperCase()}
                                      </div>
                                      <span className="font-bold text-slate-700">{res.cvName}</span>
                                    </div>
                                  </td>
                                  <td className="py-4 text-center">
                                    <div className={cn(
                                      "inline-flex flex-col items-center justify-center w-14 h-14 rounded-2xl font-black text-sm border-2",
                                      res.matchScore > 80 ? "bg-emerald-50 border-emerald-100 text-emerald-600" : 
                                      res.matchScore > 60 ? "bg-indigo-50 border-indigo-100 text-indigo-600" : "bg-amber-50 border-amber-100 text-amber-600"
                                    )}>
                                      <span className="text-lg leading-none">{res.matchScore}</span>
                                      <span className="text-[8px] uppercase tracking-tighter opacity-60">ATS</span>
                                    </div>
                                  </td>
                                  <td className="py-4 text-center">
                                    <span className="text-xs font-bold px-2 py-1 bg-slate-100 rounded-full text-slate-600">
                                      {res.successProbability}
                                    </span>
                                  </td>
                                  <td className="py-4 text-right">
                                    <div className="p-2 text-slate-400 group-hover:text-indigo-600 group-hover:bg-indigo-50 rounded-lg transition-all inline-block">
                                      <ChevronRight className="w-5 h-5" />
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Detailed Result View */}
                    {selectedResult && (
                      <div className="space-y-6" id="analysis-result">
                        <div className="flex items-center justify-between mb-8">
                          <button 
                            onClick={() => {
                              setSelectedResult(null);
                            }}
                            className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 font-bold text-sm transition-all group cursor-pointer hover:scale-105 active:scale-95"
                          >
                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center group-hover:bg-indigo-50 transition-colors">
                              <ChevronRight className="w-4 h-4 rotate-180" />
                            </div>
                            {results.length > 1 ? t.backToList : t.back}
                          </button>
                          
                          <div className="flex items-center gap-3">
                            <div className="text-right hidden sm:block">
                              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{t.analysisTime}</div>
                              <div className="text-sm font-bold text-slate-700">{new Date(selectedResult.timestamp).toLocaleString(reportLanguage === 'vi' ? 'vi-VN' : 'en-US')}</div>
                            </div>
                          </div>
                        </div>

                        <div className="mb-6">
                          <div className="flex items-center gap-2 mb-1">
                            <Target className="w-5 h-5 text-indigo-600" />
                            <h3 className="text-xl font-bold text-slate-800">
                              {t.detailedAnalysis} <span className="text-indigo-600">{selectedResult.jobTitle || selectedResult.cvName}</span>
                            </h3>
                          </div>
                          {selectedResult.jdTitle && (
                            <div className="flex items-start gap-2 ml-7 mt-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
                              <FileSearch className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                              <div className="flex flex-col gap-1">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{t.comparisonJD}</span>
                                <p className="text-xs text-slate-600 leading-relaxed italic whitespace-pre-line line-clamp-5 break-all">
                                  {selectedResult.jdTitle}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Tab Navigation - Sticky Header */}
                        <div id="tab-navigation" className="sticky top-16 z-40 bg-white/80 backdrop-blur-xl py-4 -mx-4 px-4 mb-8 border-b border-slate-200/50 flex items-center justify-between shadow-sm overflow-hidden transition-all duration-300">
                          <div className="flex items-center gap-1.5 p-1.5 bg-slate-200/50 backdrop-blur-md rounded-[2rem] w-full sm:w-fit shadow-inner overflow-x-auto scrollbar-hide no-scrollbar border border-white/50">
                            {[
                              { id: 'analysis', icon: Activity, label: t.analyze },
                              { id: 'comparison', icon: FileSearch, label: reportLanguage === 'vi' ? 'So sánh' : 'Comparison' },
                              { id: 'optimization', icon: Zap, label: t.optimized }
                            ].map((tab) => (
                              <button
                                key={tab.id}
                                onClick={() => {
                                  setResultTab(tab.id as any);
                                  setTimeout(() => document.getElementById(`${tab.id}-content`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
                                }}
                                className={cn(
                                  "px-5 sm:px-10 py-3 sm:py-3.5 rounded-[1.5rem] text-[10px] sm:text-xs font-black uppercase tracking-[0.1em] transition-all flex items-center gap-2.5 shrink-0 cursor-pointer hover:scale-105 active:scale-95",
                                  resultTab === tab.id 
                                    ? "bg-white text-indigo-600 shadow-xl shadow-indigo-100/50 ring-1 ring-slate-200" 
                                    : "text-slate-500 hover:text-indigo-600 hover:bg-white/60"
                                )}
                              >
                                <tab.icon className={cn("w-4 h-4", resultTab === tab.id ? "animate-pulse" : "")} />
                                {tab.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {resultTab === 'analysis' && (
                          <div id="analysis-content" className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 scroll-mt-24">
                            {/* ATS Score Card */}
                            <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 flex flex-col md:flex-row items-center gap-8">
                          <div className="relative shrink-0">
                            <svg className="w-32 h-32 transform -rotate-90">
                              <circle
                                cx="64"
                                cy="64"
                                r="58"
                                stroke="currentColor"
                                strokeWidth="8"
                                fill="transparent"
                                className="text-slate-100"
                              />
                              <motion.circle
                                cx="64"
                                cy="64"
                                r="58"
                                stroke="currentColor"
                                strokeWidth="8"
                                fill="transparent"
                                strokeDasharray={364.4}
                                initial={{ strokeDashoffset: 364.4 }}
                                animate={{ strokeDashoffset: 364.4 - (364.4 * selectedResult.matchScore) / 100 }}
                                strokeLinecap="round"
                                className={cn(
                                  selectedResult.matchScore > 80 ? "text-emerald-500" : 
                                  selectedResult.matchScore > 60 ? "text-indigo-500" : "text-amber-500"
                                )}
                              />
                            </svg>
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
                              <span className="text-4xl font-black text-slate-800 leading-none">{selectedResult.matchScore}</span>
                              <span className="text-xs font-bold text-slate-400 block">/ 100</span>
                            </div>
                          </div>
                          <div className="text-center md:text-left">
                            <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-black uppercase tracking-widest mb-2">
                              <Sparkles className="w-3 h-3" />
                              {t.atsCompatibilityScore}
                            </div>
                            <h3 className="text-2xl font-black text-slate-800 mb-2">{t.atsScore}</h3>
                            <p className="text-sm text-slate-500 max-w-md leading-relaxed mb-4">
                              {t.atsDesc}
                            </p>
                            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                              <p className="text-sm font-medium text-slate-700 leading-relaxed">
                                {selectedResult.matchScore >= 80 
                                  ? (reportLanguage === 'vi' ? 'CV của bạn rất phù hợp với vị trí này. Hãy tự tin ứng tuyển!' : 'Your CV is a great match for this position. Apply with confidence!')
                                  : selectedResult.matchScore >= 60
                                  ? (reportLanguage === 'vi' ? 'CV của bạn khá phù hợp. Hãy tối ưu thêm các từ khóa để tăng cơ hội.' : 'Your CV is a good match. Optimize with more keywords to increase your chances.')
                                  : (reportLanguage === 'vi' ? 'CV cần cải thiện đáng kể để phù hợp với yêu cầu. Hãy xem kỹ các gợi ý bên dưới.' : 'Your CV needs significant improvement to match the requirements. Review the suggestions below carefully.')
                                }
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Score Breakdown */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
                            <h4 className="text-sm font-bold text-slate-800 mb-6">{t.scoreDistribution}</h4>
                            <div className="h-64">
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={[
                                  { label: t.skills, score: selectedResult.categoryScores.skills },
                                  { label: t.experience, score: selectedResult.categoryScores.experience },
                                  { label: t.tools, score: selectedResult.categoryScores.tools },
                                  { label: t.education, score: selectedResult.categoryScores.education },
                                ]}>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                  <XAxis dataKey="label" fontSize={10} />
                                  <YAxis fontSize={10} />
                                  <Tooltip cursor={{fill: 'transparent'}} />
                                  <Bar dataKey="score" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                          
                          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
                            <h4 className="text-sm font-bold text-slate-800 mb-6">{t.skillDistribution}</h4>
                            <div className="h-64">
                              <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                  <Pie
                                    data={(() => {
                                      const counts: Record<string, number> = {};
                                      selectedResult.matchingPoints.forEach(p => counts[p.category] = (counts[p.category] || 0) + 1);
                                      return Object.entries(counts).map(([name, value]) => ({ name, value }));
                                    })()}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                  >
                                    {(() => {
                                      const counts: Record<string, number> = {};
                                      selectedResult.matchingPoints.forEach(p => counts[p.category] = (counts[p.category] || 0) + 1);
                                      return Object.entries(counts).map((_, index) => (
                                        <Cell key={`cell-${index}`} fill={['#4f46e5', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'][index % 5]} />
                                      ));
                                    })()}
                                  </Pie>
                                  <Tooltip />
                                </PieChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        </div>
                        

                        {/* Pass Probability Section */}
                        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
                          <div className="flex flex-col md:flex-row md:items-center gap-6">
                            <div className="flex flex-col items-center justify-center p-6 bg-slate-50 rounded-2xl min-w-[200px]">
                              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 text-center">{t.passProb}</div>
                              <div className={cn(
                                "text-3xl font-black px-6 py-2 rounded-xl",
                                (selectedResult.passProbability === t.high || selectedResult.passProbability === 'High' || selectedResult.passProbability === 'Cao') ? "bg-emerald-100 text-emerald-600" :
                                (selectedResult.passProbability === t.medium || selectedResult.passProbability === 'Medium' || selectedResult.passProbability === 'Trung bình') ? "bg-indigo-100 text-indigo-600" : "bg-amber-100 text-amber-600"
                              )}>
                                {selectedResult.passProbability}
                              </div>
                            </div>
                            <div className="flex-1 space-y-4">
                              <div>
                                <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-1">
                                  <AlertCircle className="w-4 h-4 text-indigo-500" />
                                  {t.explanation}
                                </h4>
                                <p className="text-sm text-slate-600 leading-relaxed">{selectedResult.passExplanation}</p>
                              </div>
                              <div>
                                <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-1">
                                  <Target className="w-4 h-4 text-indigo-500" />
                                  {t.mainFactor}
                                </h4>
                                <p className="text-sm text-slate-600 font-medium">{selectedResult.mainFactor}</p>
                              </div>
                            </div>
                          </div>
                        </div>

                            <div className="space-y-4">
                              {/* Matching Points Accordion */}
                          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden transition-all duration-300">
                            <button 
                              onClick={() => setOpenSections(prev => prev.includes('matching') ? prev.filter(s => s !== 'matching') : [...prev, 'matching'])}
                              className="w-full px-6 py-5 flex items-center justify-between hover:bg-slate-50 transition-colors text-left"
                            >
                              <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-2xl bg-emerald-100 flex items-center justify-center text-emerald-600">
                                  <CheckCircle2 className="w-5 h-5" />
                                </div>
                                <div>
                                  <h4 className="font-bold text-slate-800">{t.matchingPoints}</h4>
                                  <p className="text-xs text-slate-400 font-medium">{t.matchingPointsDesc}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-bold uppercase tracking-wider border border-emerald-100">
                                  {selectedResult.matchingPoints.length} {t.matchingPointsCount}
                                </span>
                                {openSections.includes('matching') ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                              </div>
                            </button>
                            
                            <AnimatePresence>
                              {openSections.includes('matching') && (
                                <motion.div 
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.3, ease: 'easeInOut' }}
                                >
                                  <div className="px-6 pb-8 pt-2 border-t border-slate-100">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-4">
                                      {['Skills', 'Soft Skills', 'Hard Skills', 'Technical Skills', 'Experience', 'Tools', 'Education'].map(cat => {
                                        const points = selectedResult.matchingPoints.filter(p => p.category === cat);
                                        if (points.length === 0) return null;
                                        
                                        const catLabelMap: Record<string, string> = {
                                          'Skills': reportLanguage === 'vi' ? 'Kỹ năng chung' : 'General Skills',
                                          'Soft Skills': reportLanguage === 'vi' ? 'Kỹ năng mềm' : 'Soft Skills',
                                          'Hard Skills': reportLanguage === 'vi' ? 'Kỹ năng cứng' : 'Hard Skills',
                                          'Technical Skills': reportLanguage === 'vi' ? 'Kỹ năng kỹ thuật' : 'Technical Skills',
                                          'Experience': reportLanguage === 'vi' ? 'Kinh nghiệm' : 'Experience',
                                          'Tools': reportLanguage === 'vi' ? 'Công cụ' : 'Tools',
                                          'Education': reportLanguage === 'vi' ? 'Học vấn' : 'Education'
                                        };
                                        const catLabel = catLabelMap[cat] || cat;

                                        return (
                                          <div key={cat} className="space-y-3">
                                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                              <div className="w-1 h-1 rounded-full bg-emerald-500" />
                                              {catLabel}
                                            </div>
                                            <ul className="space-y-2.5">
                                              {points.map((p, i) => (
                                                <li key={i} className="text-sm text-slate-600 flex items-start gap-2.5 p-3 bg-emerald-50/30 rounded-xl border border-emerald-100/50 hover:border-emerald-200 transition-colors">
                                                  <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                                                  {p.content}
                                                </li>
                                              ))}
                                            </ul>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>

                          {/* Missing Gaps Accordion */}
                          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden transition-all duration-300">
                            <button 
                              onClick={() => setOpenSections(prev => prev.includes('missing') ? prev.filter(s => s !== 'missing') : [...prev, 'missing'])}
                              className="w-full px-6 py-5 flex items-center justify-between hover:bg-slate-50 transition-colors text-left"
                            >
                              <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-2xl bg-amber-100 flex items-center justify-center text-amber-600">
                                  <AlertCircle className="w-5 h-5" />
                                </div>
                                <div>
                                  <h4 className="font-bold text-slate-800">{t.missingGaps}</h4>
                                  <p className="text-xs text-slate-400 font-medium">{t.missingGapsDesc}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-600 text-[10px] font-bold uppercase tracking-wider border border-amber-100">
                                  {selectedResult.missingGaps.length} {t.missingGapsCount}
                                </span>
                                {openSections.includes('missing') ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                              </div>
                            </button>
                            
                            <AnimatePresence>
                              {openSections.includes('missing') && (
                                <motion.div 
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.3, ease: 'easeInOut' }}
                                >
                                  <div className="px-6 pb-8 pt-2 border-t border-slate-100">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-4">
                                      {['Skills', 'Soft Skills', 'Hard Skills', 'Technical Skills', 'Experience', 'Keywords'].map(cat => {
                                        const gaps = selectedResult.missingGaps.filter(g => g.category === cat);
                                        if (gaps.length === 0) return null;
                                        
                                        const catLabelMap: Record<string, string> = {
                                          'Skills': reportLanguage === 'vi' ? 'Kỹ năng chung' : 'General Skills',
                                          'Soft Skills': reportLanguage === 'vi' ? 'Kỹ năng mềm' : 'Soft Skills',
                                          'Hard Skills': reportLanguage === 'vi' ? 'Kỹ năng cứng' : 'Hard Skills',
                                          'Technical Skills': reportLanguage === 'vi' ? 'Kỹ năng kỹ thuật' : 'Technical Skills',
                                          'Experience': reportLanguage === 'vi' ? 'Kinh nghiệm' : 'Experience',
                                          'Keywords': reportLanguage === 'vi' ? 'Từ khóa' : 'Keywords'
                                        };
                                        const catLabel = catLabelMap[cat] || cat;

                                        return (
                                          <div key={cat} className="space-y-3">
                                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                              <div className="w-1 h-1 rounded-full bg-amber-500" />
                                              {catLabel}
                                            </div>
                                            <ul className="space-y-2.5">
                                              {gaps.map((g, i) => (
                                                <li key={i} className="text-sm text-slate-600 flex items-start gap-2.5 p-3 bg-amber-50/30 rounded-xl border border-amber-100/50 hover:border-amber-200 transition-colors">
                                                  <X className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                                                  {g.content}
                                                </li>
                                              ))}
                                            </ul>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </div>
                      </div>
                    )}

                      {resultTab === 'comparison' && (
                        <div id="comparison-content" className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 scroll-mt-24">
                          {/* Detailed Comparison Section - Always Full */}
                          {selectedResult.detailedComparison && (
                            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                              <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-2xl bg-indigo-100 flex items-center justify-center text-indigo-600 shadow-sm">
                                      <FileSearch className="w-5 h-5" />
                                    </div>
                                    <div>
                                      <h4 className="font-black text-slate-800 uppercase tracking-tight">{t.detailedComparison}</h4>
                                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{t.detailedComparisonDesc}</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <span className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest shadow-md shadow-indigo-100">
                                      {Object.values(selectedResult.detailedComparison).flat().length} {t.detailedComparisonCount}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              
                              <div className="px-6 pb-8 pt-6">
                                <div className="space-y-12">
                                  {Object.entries(selectedResult.detailedComparison).map(([category, items]) => {
                                    if (!Array.isArray(items) || items.length === 0) return null;
                                    const categoryLabelMap: Record<string, string> = {
                                      'skills': t.skills,
                                      'experience': t.experience,
                                      'tools': t.tools,
                                      'education': t.education,
                                      'keywords': reportLanguage === 'vi' ? 'Từ khóa' : 'Keywords'
                                    };
                                    const categoryLabel = categoryLabelMap[category] || category;

                                    return (
                                      <div key={category} className="space-y-6">
                                        <div className="flex items-center gap-3">
                                          <h5 className="text-[11px] font-black text-slate-800 uppercase tracking-[0.2em] flex items-center gap-2 bg-slate-100 px-3 py-1 rounded-lg">
                                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                                            {categoryLabel}
                                          </h5>
                                          <div className="h-px bg-slate-100 flex-1" />
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                          {items.map((item, i) => (
                                            <div key={i} className={cn(
                                              "p-6 rounded-3xl border transition-all flex flex-col group relative overflow-hidden",
                                              item.status === 'matched' ? "bg-emerald-50/20 border-emerald-100 hover:border-emerald-300" : 
                                              item.status === 'partial' ? "bg-amber-50/20 border-amber-100 hover:border-amber-300" : 
                                              "bg-rose-50/20 border-rose-100 hover:border-rose-300"
                                            )}>
                                              {/* Status Icon Indicator */}
                                              <div className={cn(
                                                "absolute -top-2 -right-2 w-12 h-12 rotate-12 opacity-10 group-hover:opacity-20 transition-opacity",
                                                item.status === 'matched' ? "text-emerald-600" : 
                                                item.status === 'partial' ? "text-amber-600" : 
                                                "text-rose-600"
                                              )}>
                                                {item.status === 'matched' ? <CheckCircle2 className="w-full h-full" /> : 
                                                 item.status === 'partial' ? <Activity className="w-full h-full" /> : 
                                                 <AlertCircle className="w-full h-full" />}
                                              </div>

                                              <div className="flex items-start justify-between gap-4 mb-4">
                                                <div className="font-black text-slate-800 text-sm leading-tight group-hover:text-indigo-600 transition-colors">{item.requirement}</div>
                                                <div className={cn(
                                                  "px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest shrink-0 shadow-sm",
                                                  item.status === 'matched' ? "bg-emerald-500 text-white" : 
                                                  item.status === 'partial' ? "bg-amber-500 text-white" : 
                                                  "bg-rose-500 text-white"
                                                )}>
                                                  {item.status === 'matched' ? t.matched : item.status === 'partial' ? t.partial : t.missing}
                                                </div>
                                              </div>
                                              
                                              {item.cvEvidence && (
                                                <div className="mb-4 p-4 bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-100 text-xs text-slate-600 italic shadow-sm">
                                                  <span className="font-black text-[9px] uppercase tracking-widest text-slate-400 not-italic block mb-2 flex items-center gap-1.5">
                                                    <div className="w-1 h-1 bg-slate-300 rounded-full" />
                                                    {t.evidence}
                                                  </span>
                                                  "{item.cvEvidence}"
                                                </div>
                                              )}
                                              
                                              {item.improvement && (
                                                <div className="mt-auto pt-4 border-t border-slate-100/50">
                                                  <div className="flex items-start gap-2.5 text-xs text-slate-500 leading-relaxed">
                                                    <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                                                    <span className="font-medium">{item.improvement}</span>
                                                  </div>
                                                </div>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {resultTab === 'optimization' && (
                        <div id="optimization-content" className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 scroll-mt-24">
                          {/* ATS & Rewriting */}
                          <div className="bg-white rounded-[2.5rem] p-8 border border-slate-200 shadow-sm">
                          <div className="flex flex-col gap-10">
                            <div>
                              <h4 className="font-bold mb-4 flex items-center gap-2 text-indigo-600">
                                <Sparkles className="w-5 h-5" />
                                {t.atsKeywords}
                              </h4>
                              <div className="flex flex-wrap gap-2.5">
                                {selectedResult.atsKeywords.map((kw, i) => (
                                  <motion.span 
                                    key={i} 
                                    whileHover={{ scale: 1.05, y: -2 }}
                                    className="px-4 py-1.5 bg-gradient-to-r from-indigo-50 to-violet-50 text-indigo-600 border border-indigo-100/50 rounded-full text-xs font-bold shadow-sm hover:shadow-md hover:border-indigo-200 transition-all cursor-default"
                                  >
                                    {kw}
                                  </motion.span>
                                ))}
                              </div>
                            </div>
                            
                            <div className="h-px bg-slate-100 w-full" />

                            <div>
                              <h4 className="font-bold mb-6 flex items-center gap-2 text-emerald-600 text-lg">
                                <RefreshCcw className="w-6 h-6" />
                                {t.rewriteSuggestions}
                              </h4>
                              <div className="space-y-10">
                                {Object.entries(
                                  selectedResult.rewriteSuggestions.reduce((acc, s) => {
                                    const key = s.section || (reportLanguage === 'vi' ? 'Khác' : 'Other');
                                    if (!acc[key]) acc[key] = [];
                                    acc[key].push(s);
                                    return acc;
                                  }, {} as Record<string, typeof selectedResult.rewriteSuggestions>)
                                ).map(([section, suggestions]) => (
                                  <div key={section} className="space-y-4">
                                    <div className="flex items-center gap-3 mb-4">
                                      <div className="h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent flex-1" />
                                      <span className="text-[11px] font-black uppercase tracking-[0.4em] text-emerald-600 bg-emerald-50/50 backdrop-blur-sm px-6 py-1.5 rounded-full border border-emerald-100/50 shadow-sm">
                                        {section}
                                      </span>
                                      <div className="h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent flex-1" />
                                    </div>
                                    
                                    <div className="grid grid-cols-1 gap-6">
                                      {suggestions.map((s, i) => (
                                        <div key={i} className="bg-white p-6 rounded-[2rem] border border-slate-100 hover:border-indigo-200 transition-all group relative overflow-hidden shadow-sm hover:shadow-md">
                                          
                                          <div className="relative space-y-6">
                                            {s.original && (
                                              <div className="space-y-3">
                                                <div className="flex items-center justify-between">
                                                  <div className="text-[10px] text-slate-400 uppercase font-black tracking-widest flex items-center gap-2">
                                                    <div className="w-1.5 h-1.5 bg-slate-200 rounded-full" />
                                                    {t.original}
                                                  </div>
                                                </div>
                                                <div className="text-xs text-slate-400 font-medium italic opacity-80 bg-slate-50/50 p-4 rounded-2xl border border-slate-100/50 leading-relaxed">
                                                  {s.original}
                                                </div>
                                              </div>
                                            )}
                                            
                                            <div className="space-y-3">
                                              <div className="flex items-center justify-between">
                                                <div className="text-[10px] text-emerald-600 uppercase font-black tracking-widest flex items-center gap-2">
                                                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                                                  {t.optimized}
                                                </div>
                                                <button 
                                                  onClick={() => {
                                                    navigator.clipboard.writeText(s.optimized);
                                                    setCopiedId(`suggestion-${i}`);
                                                    setTimeout(() => setCopiedId(null), 2000);
                                                  }}
                                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 rounded-xl text-[10px] font-black uppercase tracking-tight transition-all border border-slate-200 hover:border-emerald-200 shadow-sm"
                                                >
                                                  {copiedId === `suggestion-${i}` ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                                  {copiedId === `suggestion-${i}` ? t.copied : t.copy}
                                                </button>
                                              </div>
                                              <div className="text-sm text-slate-800 font-bold leading-relaxed bg-emerald-50 p-6 rounded-2xl border border-emerald-100 group-hover:border-emerald-300 transition-all shadow-sm ring-4 ring-emerald-50/20">
                                                {s.optimized}
                                              </div>
                                            </div>
                                            
                                            <div className="pt-5 border-t border-slate-100 flex items-start gap-4">
                                              <div className="w-8 h-8 bg-indigo-50 rounded-xl flex items-center justify-center shrink-0 border border-indigo-100">
                                                <Sparkles className="w-4 h-4 text-indigo-600" />
                                              </div>
                                              <div className="space-y-1">
                                                <div className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">{t.reason}</div>
                                                <p className="text-xs text-slate-600 leading-relaxed font-medium">
                                                  {s.explanation}
                                                </p>
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {selectedResult.fullRewrittenCV && (
                              <>
                                <div className="h-px bg-slate-100 w-full" />
                                <div>
                                  <h4 className="font-bold mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-indigo-600 text-lg">
                                    <div className="flex items-center gap-3">
                                      <div className="w-10 h-10 bg-indigo-100 rounded-2xl flex items-center justify-center shadow-sm">
                                        <FileText className="w-5 h-5" />
                                      </div>
                                      <span className="font-black tracking-tight">{t.fullRewrittenCV}</span>
                                    </div>
                                    <div className="flex items-center gap-2 no-print">
                                      <button 
                                        onClick={() => {
                                          if (selectedResult.fullRewrittenCV) {
                                            navigator.clipboard.writeText(selectedResult.fullRewrittenCV);
                                            setCopiedId('full-cv');
                                            setTimeout(() => setCopiedId(null), 2000);
                                          }
                                        }}
                                        className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-sm hover:shadow-md cursor-pointer hover:scale-105 active:scale-95"
                                      >
                                        {copiedId === 'full-cv' ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                                        {copiedId === 'full-cv' ? t.copied : reportLanguage === 'vi' ? 'Copy MD' : 'Copy MD'}
                                      </button>
                                      
                                      <button 
                                        onClick={() => window.print()}
                                        className="flex items-center gap-2 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-200 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-sm hover:shadow-md cursor-pointer hover:scale-105 active:scale-95"
                                      >
                                        <Printer className="w-4 h-4" />
                                        {t.printOptimized}
                                      </button>

                                      <button 
                                        onClick={() => {
                                          const blob = new Blob([selectedResult.fullRewrittenCV || ''], { type: 'text/markdown' });
                                          const url = URL.createObjectURL(blob);
                                          const a = document.createElement('a');
                                          a.href = url;
                                          a.download = `Optimized_CV_${selectedResult.cvName}.md`;
                                          a.click();
                                        }}
                                        className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-xl shadow-indigo-500/20 cursor-pointer hover:scale-105 active:scale-95"
                                      >
                                        <Download className="w-4 h-4" />
                                        {t.download}
                                      </button>
                                    </div>
                                  </h4>
                                  
                                  <div className="relative bg-slate-100/50 p-4 md:p-12 rounded-[3.5rem] border border-slate-200/50 max-w-none overflow-hidden mt-6 group/paper">
                                    {/* Paper decorative background elements */}
                                    <div className="absolute inset-0 bg-white/30 backdrop-blur-[2px] opacity-0 group-hover/paper:opacity-100 transition-opacity duration-700" />
                                    
                                    {/* Premium Badge */}
                                    <div className="absolute top-8 right-8 z-20 pointer-events-none no-print">
                                      <motion.div 
                                        initial={{ rotate: -12, scale: 0.8, opacity: 0 }}
                                        animate={{ rotate: -12, scale: 1, opacity: 1 }}
                                        className="px-6 py-2.5 bg-gradient-to-br from-amber-400 to-amber-600 text-white font-black text-[10px] uppercase tracking-[0.2em] rounded-lg shadow-xl border-2 border-amber-300 flex items-center gap-2"
                                      >
                                        <Sparkles className="w-4 h-4 fill-white" />
                                        {t.premiumOptimizedBadge}
                                      </motion.div>
                                    </div>

                                    <div id="printable-cv" className="relative bg-white p-12 md:p-24 rounded-sm shadow-[0_30px_60px_-12px_rgba(0,0,0,0.15),0_18px_36px_-18px_rgba(0,0,0,0.3)] border-t-[8px] border-indigo-600 mx-auto max-w-[850px] min-h-[1100px] transform transition-transform duration-500 group-hover/paper:scale-[1.01] hover:shadow-[0_40px_80px_-15px_rgba(0,0,0,0.2)]">
                                      {/* Watermark effect */}
                                      <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-[0.03] select-none flex items-center justify-center rotate-[-35deg] no-print">
                                        <span className="text-8xl font-black whitespace-nowrap tracking-[1em]">PREMIUM OPTIMIZED CV</span>
                                      </div>

                                      <div className="markdown-body break-words relative z-10">
                                        <Markdown 
                                          key={selectedResult.id}
                                          remarkPlugins={[remarkGfm, remarkBreaks]}
                                          rehypePlugins={[rehypeRaw, rehypeSanitize]}
                                          components={{
                                            h1: ({node, ...props}) => <h1 className="text-5xl font-black mt-2 mb-10 border-b-2 border-slate-100 pb-8 text-slate-900 text-center uppercase tracking-tight" {...props} />,
                                            h2: ({node, ...props}) => <h2 className="text-lg font-black mt-14 mb-6 text-indigo-700 flex items-center gap-3 uppercase tracking-[0.2em] bg-slate-50 -mx-6 px-6 py-2.5 rounded-r-lg border-l-4 border-indigo-600" {...props} />,
                                            h3: ({node, ...props}) => <h3 className="text-md font-bold mt-8 mb-4 text-slate-800 border-b border-slate-100 pb-2" {...props} />,
                                            p: ({node, ...props}) => <p className="mb-5 text-slate-700 leading-[1.8] text-[15px] font-medium" {...props} />,
                                            ul: ({node, ...props}) => <ul className="list-none pl-0 mb-8 space-y-3.5 text-slate-700 text-[15px] font-medium" {...props} />,
                                            li: ({node, ...props}) => (
                                              <li className="flex items-start gap-3 group/li" {...props}>
                                                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-[10px] shrink-0 group-hover/li:scale-150 transition-transform bg-indigo-500 shadow-[0_0_4px_rgba(79,70,229,0.3)]" />
                                                <span>{props.children}</span>
                                              </li>
                                            ),
                                            strong: ({node, ...props}) => <strong className="font-bold text-slate-900" {...props} />,
                                            hr: ({node, ...props}) => <hr className="my-12 border-slate-100" {...props} />,
                                          }}
                                        >
                                          {selectedResult.fullRewrittenCV.replace(/^(#+)([^#\s])/gm, '$1 $2')}
                                        </Markdown>
                                        <div className="hidden print:block mt-12 pt-8 border-t border-slate-200 text-center text-[10px] text-slate-400 font-medium italic">
                                          cv.thanhnghiep.top - Công cụ phân tích CV thông minh giúp bạn tối ưu hóa hồ sơ.
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                      {/* Rating Section */}
                                <div className="mt-12 pt-8 border-t border-slate-200">
                                  <div className="bg-slate-50 rounded-3xl p-8 border border-slate-200">
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                      <div>
                                        <h3 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2">
                                          <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
                                          {t.rateResults}
                                        </h3>
                                        <p className="text-sm text-slate-500">
                                          {t.rateResultsDesc}
                                        </p>
                                      </div>
                                      
                                      {!isRatingSubmitted ? (
                                        <div className="flex flex-col gap-4">
                                          <div className="flex items-center gap-2">
                                            {[1, 2, 3, 4, 5].map((star) => (
                                              <button
                                                key={star}
                                                onClick={() => setUserRating(star)}
                                                className="p-1 transition-transform hover:scale-110"
                                              >
                                                <Star 
                                                  className={cn(
                                                    "w-8 h-8",
                                                    userRating >= star ? "text-amber-500 fill-amber-500" : "text-slate-300"
                                                  )} 
                                                />
                                              </button>
                                            ))}
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-2 text-emerald-600 font-bold">
                                          <CheckCircle2 className="w-5 h-5" />
                                          {t.thankYouRating}
                                          <div className="flex items-center gap-1 ml-2">
                                            {[1, 2, 3, 4, 5].map((star) => (
                                              <Star 
                                                key={star}
                                                className={cn(
                                                  "w-4 h-4",
                                                  userRating >= star ? "text-amber-500 fill-amber-500" : "text-slate-200"
                                                )} 
                                              />
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                    
                                    {!isRatingSubmitted && userRating > 0 && (
                                      <motion.div 
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="mt-6 space-y-4"
                                      >
                                        <div className="relative">
                                          <textarea
                                            value={userFeedback}
                                            onChange={(e) => setUserFeedback(e.target.value)}
                                            placeholder={reportLanguage === 'vi' ? 'Bạn có góp ý gì để kết quả chính xác hơn không? (Tùy chọn)' : 'Do you have any suggestions to make the results more accurate? (Optional)'}
                                            className="w-full bg-white border border-slate-200 rounded-2xl p-4 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none min-h-[100px] resize-none"
                                          />
                                          <MessageSquare className="absolute right-4 bottom-4 w-5 h-5 text-slate-300" />
                                        </div>
                                        <button
                                          disabled={isSubmittingRating}
                                          onClick={async () => {
                                            if (!user || !selectedResult) return;
                                            setIsSubmittingRating(true);
                                            try {
                                              await rateAnalysis(user.uid, selectedResult.id, userRating, userFeedback);
                                              setIsRatingSubmitted(true);
                                              // Update history locally
                                              setHistory(prev => prev.map(h => h.id === selectedResult.id ? { ...h, rating: userRating, feedback: userFeedback } : h));
                                            } catch (err: any) {
                                              setError(reportLanguage === 'vi' ? "Không thể gửi đánh giá: " + err.message : "Failed to send rating: " + err.message);
                                            } finally {
                                              setIsSubmittingRating(false);
                                            }
                                          }}
                                          className="w-full py-3 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer hover:scale-105 active:scale-95"
                                        >
                                          {isSubmittingRating ? <Loader2 className="w-5 h-5 animate-spin" /> : t.submitRating}
                                        </button>
                                      </motion.div>
                                    )}
                                    
                                    {isRatingSubmitted && userFeedback && (
                                      <div className="mt-6 p-4 bg-white rounded-2xl border border-slate-100 italic text-sm text-slate-600">
                                        "{userFeedback}"
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                  </motion.div>
                ) : (
                  <motion.div 
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="h-full min-h-[500px] flex flex-col items-center justify-center text-center p-8 bg-slate-50 rounded-3xl border border-slate-200 border-dashed"
                  >
                    <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-sm mb-6">
                      <TrendingUp className="w-10 h-10 text-slate-300" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-800 mb-2">{t.readyToAnalyze}</h3>
                    <p className="text-sm text-slate-500 max-w-xs">
                      {t.readyToAnalyzeDesc}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      ) : (
          /* History View */
          <section className="max-w-5xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
              <div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">{t.analysisHistory}</h2>
                <p className="text-sm text-slate-500">{t.historyDesc}</p>
              </div>
              {history.length > 0 && (
                <button 
                  onClick={clearHistory}
                  className="flex items-center gap-2 text-sm font-bold text-red-500 hover:text-red-600 transition-colors px-4 py-2 bg-red-50 rounded-xl border border-red-100 cursor-pointer hover:scale-105 active:scale-95"
                >
                  <Trash2 className="w-4 h-4" />
                  {t.clearHistory}
                </button>
              )}
            </div>

            {history.length === 0 ? (
              <div className="text-center py-24 bg-white rounded-[2rem] border border-slate-200 shadow-sm">
                <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center mx-auto mb-6">
                  <HistoryIcon className="w-10 h-10 text-slate-200" />
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-2">Chưa có lịch sử</h3>
                <p className="text-slate-500 max-w-sm mx-auto">Hãy bắt đầu bằng cách tải lên CV và phân tích để lưu lại kết quả tại đây.</p>
                <button 
                  onClick={() => setActiveTab('analyze')}
                  className="mt-8 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 cursor-pointer hover:scale-105 active:scale-95"
                >
                  Phân tích ngay
                </button>
              </div>
            ) : (
              <div className="space-y-8">
                {/* History Analytics Dashboard */}
                {history.length >= 2 && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm"
                    >
                      <div className="flex items-center justify-between mb-6">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                          <TrendingUp className="w-5 h-5 text-indigo-500" />
                          Xu hướng điểm số
                        </h3>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Gần đây</span>
                      </div>
                      <div className="h-48 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={[...history].reverse().slice(-10).map(h => ({ name: new Date(h.timestamp).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }), score: h.matchScore }))}>
                            <defs>
                              <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                            <YAxis domain={[0, 100]} hide />
                            <Tooltip 
                              contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                              itemStyle={{ fontWeight: 'bold', color: '#6366f1' }}
                            />
                            <Area type="monotone" dataKey="score" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorScore)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </motion.div>

                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 }}
                      className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm"
                    >
                      <div className="flex items-center justify-between mb-6">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                          <BarChart3 className="w-5 h-5 text-emerald-500" />
                          Phân bổ chất lượng CV
                        </h3>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tổng quan</span>
                      </div>
                      <div className="h-48 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={[
                            { name: 'Thấp', count: history.filter(h => h.matchScore < 60).length, color: '#f59e0b' },
                            { name: 'T.Bình', count: history.filter(h => h.matchScore >= 60 && h.matchScore <= 80).length, color: '#6366f1' },
                            { name: 'Cao', count: history.filter(h => h.matchScore > 80).length, color: '#10b981' }
                          ]}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                            <Tooltip 
                              cursor={{ fill: '#f8fafc' }}
                              contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                            />
                            <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                              {[
                                { color: '#f59e0b' },
                                { color: '#6366f1' },
                                { color: '#10b981' }
                              ].map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </motion.div>
                  </div>
                )}

                {/* Search and Filters */}
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col lg:flex-row gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type="text"
                      placeholder="Tìm kiếm theo tên CV hoặc vị trí công việc..."
                      value={historySearchQuery}
                      onChange={(e) => setHistorySearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
                      <Filter className="w-3.5 h-3.5 text-slate-400" />
                      <select 
                        value={historyScoreFilter}
                        onChange={(e) => setHistoryScoreFilter(e.target.value as any)}
                        className="bg-transparent text-xs font-bold text-slate-600 focus:outline-none cursor-pointer"
                      >
                        <option value="all">Tất cả điểm số</option>
                        <option value="high">Điểm cao ({'>'}80)</option>
                        <option value="medium">Trung bình (60-80)</option>
                        <option value="low">Điểm thấp ({'<'}60)</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <select 
                        value={historyDateFilter}
                        onChange={(e) => setHistoryDateFilter(e.target.value as any)}
                        className="bg-transparent text-xs font-bold text-slate-600 focus:outline-none cursor-pointer"
                      >
                        <option value="all">Mọi thời gian</option>
                        <option value="today">Hôm nay</option>
                        <option value="week">7 ngày qua</option>
                        <option value="month">30 ngày qua</option>
                      </select>
                    </div>
                    {(historySearchQuery || historyScoreFilter !== 'all' || historyDateFilter !== 'all') && (
                      <button 
                        onClick={() => {
                          setHistorySearchQuery('');
                          setHistoryScoreFilter('all');
                          setHistoryDateFilter('all');
                        }}
                        className="text-xs font-bold text-indigo-600 hover:text-indigo-700 px-2"
                      >
                        Xóa bộ lọc
                      </button>
                    )}
                  </div>
                </div>

                {/* Results Count */}
                <div className="flex items-center justify-between px-2">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                    Hiển thị {filteredHistory.length} kết quả
                  </p>
                </div>

                {/* History List */}
                {filteredHistory.length === 0 ? (
                  <div className="text-center py-20 bg-slate-50/50 rounded-3xl border border-dashed border-slate-200">
                    <Search className="w-10 h-10 text-slate-200 mx-auto mb-4" />
                    <p className="text-slate-500 text-sm">Không tìm thấy kết quả phù hợp với bộ lọc.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {filteredHistory.sort((a, b) => b.timestamp - a.timestamp).map((item) => (
                      <motion.article 
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        key={item.id} 
                        className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-6 group hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer relative overflow-hidden"
                        onClick={() => {
                          setSelectedResult(item);
                          setResults([item]);
                          setActiveTab('analyze');
                        }}
                      >
                        {/* Visual Indicator on the side */}
                        <div className={cn(
                          "absolute left-0 top-0 bottom-0 w-1.5",
                          item.matchScore > 80 ? "bg-emerald-500" : 
                          item.matchScore > 60 ? "bg-indigo-500" : "bg-amber-500"
                        )} />

                        <div className="flex items-center gap-5 flex-1 min-w-0">
                          <div className={cn(
                            "w-16 h-16 rounded-2xl flex flex-col items-center justify-center font-black text-xl border-2 shrink-0",
                            item.matchScore > 80 ? "bg-emerald-50 border-emerald-100 text-emerald-600" : 
                            item.matchScore > 60 ? "bg-indigo-50 border-indigo-100 text-indigo-600" : "bg-amber-50 border-amber-100 text-amber-600"
                          )}>
                            <span className="leading-none">{item.matchScore}</span>
                            <span className="text-[9px] uppercase tracking-tighter opacity-60">ATS</span>
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-bold text-slate-800 truncate text-lg group-hover:text-indigo-600 transition-colors">{item.cvName}</h3>
                              {item.matchScore > 85 && (
                                <div className="bg-emerald-100 text-emerald-700 text-[8px] font-black uppercase px-1.5 py-0.5 rounded flex items-center gap-1 shrink-0">
                                  <Sparkles className="w-2 h-2" />
                                  Top Match
                                </div>
                              )}
                            </div>
                            <p className="text-sm text-slate-500 font-medium truncate">
                              {(item.jobTitle || item.jdTitle || 'Không rõ vị trí').split('\n')[0]}
                            </p>
                            <div className="flex items-center gap-4 mt-3">
                              <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                <Clock className="w-3 h-3" />
                                {new Date(item.timestamp).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                              </div>
                              <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                <Target className="w-3 h-3" />
                                {item.successProbability}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Mini Visual Stats */}
                        <div className="flex items-center gap-8 shrink-0">
                          <div className="hidden lg:flex items-center gap-4">
                            {item.categoryScores && (
                              <div 
                                className="flex gap-1.5 cursor-help" 
                                title={`Kỹ năng (K): ${item.categoryScores.skills}%\nKinh nghiệm (N): ${item.categoryScores.experience}%\nCông cụ (C): ${item.categoryScores.tools}%\nHọc vấn (H): ${item.categoryScores.education}%`}
                              >
                                {[
                                  { key: 'skills', label: 'K', color: 'bg-indigo-400' },
                                  { key: 'experience', label: 'N', color: 'bg-emerald-400' },
                                  { key: 'tools', label: 'C', color: 'bg-amber-400' },
                                  { key: 'education', label: 'H', color: 'bg-purple-400' }
                                ].map((cat) => {
                                  const score = item.categoryScores[cat.key as keyof typeof item.categoryScores] || 0;
                                  return (
                                    <div key={cat.key} className="flex flex-col items-center gap-1">
                                      <div className="w-1.5 h-8 bg-slate-100 rounded-full overflow-hidden flex flex-col justify-end">
                                        <motion.div 
                                          initial={{ height: 0 }}
                                          animate={{ height: `${score}%` }}
                                          className={cn("w-full rounded-full", cat.color)}
                                        />
                                      </div>
                                      <span className="text-[7px] font-black text-slate-300 uppercase">{cat.label}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteHistoryItem(item.id);
                              }}
                              className="p-2.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                              title="Xóa kết quả"
                            >
                              <Trash2 className="w-4.5 h-4.5" />
                            </button>
                            <div className="p-2.5 bg-slate-50 text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 rounded-xl transition-all">
                              <ChevronRight className="w-5 h-5" />
                            </div>
                          </div>
                        </div>
                      </motion.article>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        )}
      </main>

      {/* Saved JDs Modal */}
      <AnimatePresence>
        {isSavedJDsModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-indigo-600 text-white">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center">
                    <Bookmark className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">Kho JD đã lưu</h2>
                    <p className="text-xs text-indigo-100">Chọn một JD để sử dụng ngay</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsSavedJDsModalOpen(false)}
                  className="w-10 h-10 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input 
                    type="text"
                    placeholder="Tìm kiếm JD theo tên..."
                    value={savedJDSearchTerm}
                    onChange={(e) => setSavedJDSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  />
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6">
                {savedJDs.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                      <BookmarkPlus className="w-8 h-8 text-slate-300" />
                    </div>
                    <h3 className="text-slate-600 font-bold">Chưa có JD nào được lưu</h3>
                    <p className="text-sm text-slate-400 mt-1">Hãy lưu các JD bạn thường xuyên sử dụng để tiết kiệm thời gian.</p>
                  </div>
                ) : savedJDs.filter(jd => jd.title.toLowerCase().includes(savedJDSearchTerm.toLowerCase())).length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-slate-400 text-sm italic">Không tìm thấy JD nào khớp với từ khóa "{savedJDSearchTerm}"</p>
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {savedJDs
                      .filter(jd => jd.title.toLowerCase().includes(savedJDSearchTerm.toLowerCase()))
                      .map((savedJd) => (
                      <div 
                        key={savedJd.id}
                        className="group p-4 rounded-2xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all cursor-pointer flex items-start justify-between gap-4"
                        onClick={() => handleLoadSavedJD(savedJd.content)}
                      >
                        <div className="flex-1 min-w-0 overflow-hidden">
                          <h4 className="font-bold text-slate-800 break-words group-hover:text-indigo-600 transition-colors leading-tight">
                            {savedJd.title}
                          </h4>
                          <div className="flex items-center gap-2 mt-2">
                            <Clock className="w-3 h-3 text-slate-400" />
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                              {new Date(savedJd.timestamp).toLocaleDateString('vi-VN')}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 self-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteSavedJD(savedJd.id);
                            }}
                            className="w-8 h-8 rounded-full bg-white text-rose-500 shadow-sm border border-slate-100 flex items-center justify-center hover:bg-rose-50 transition-colors"
                            title="Xóa JD này"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <div className="w-8 h-8 rounded-full bg-indigo-600 text-white shadow-sm flex items-center justify-center">
                            <ArrowRight className="w-4 h-4" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="p-6 bg-slate-50 border-t border-slate-100">
                <button 
                  onClick={() => setIsSavedJDsModalOpen(false)}
                  className="w-full py-3 rounded-2xl bg-white border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 transition-all shadow-sm"
                >
                  Đóng
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Save JD Name Modal */}
      <AnimatePresence>
        {isSaveJDNameModalOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-indigo-600 text-white">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center">
                    <BookmarkPlus className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="text-xl font-bold">Đặt tên cho JD</h2>
                </div>
                <button 
                  onClick={() => setIsSaveJDNameModalOpen(false)}
                  className="w-10 h-10 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">
                    Tên gợi nhớ
                  </label>
                  <input 
                    type="text"
                    value={jdSaveTitle}
                    onChange={(e) => setJdSaveTitle(e.target.value)}
                    placeholder="Ví dụ: JD Frontend Developer - Công ty A"
                    className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-slate-700 bg-slate-50/50 text-sm"
                    autoFocus
                  />
                </div>
                <p className="text-xs text-slate-500 italic">
                  Tên này sẽ giúp bạn dễ dàng tìm kiếm lại JD trong Kho JD sau này.
                </p>
              </div>
              
              <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
                <button 
                  onClick={() => setIsSaveJDNameModalOpen(false)}
                  className="flex-1 py-3 rounded-2xl bg-white border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 transition-all shadow-sm"
                >
                  Hủy
                </button>
                <button 
                  onClick={confirmSaveJD}
                  disabled={isSavingJD || !jdSaveTitle.trim()}
                  className="flex-1 py-3 rounded-2xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSavingJD ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Lưu ngay
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

            {/* Trusted By */}
            {!user && (
              <div className="py-12 text-center w-full bg-slate-50 border-y border-slate-100">
                <p className="text-slate-500 mb-8 font-medium">{t.trustedBy}</p>
                <div className="flex flex-wrap gap-12 justify-center text-slate-400 font-bold text-xl sm:text-2xl opacity-60">
                  <a href="https://www.vietnamworks.com/" target="_blank" rel="noopener noreferrer" className="hover:text-indigo-600 transition-all duration-300 hover:scale-110 active:scale-95 cursor-pointer">VietnamWorks</a>
                  <a href="https://itviec.com/" target="_blank" rel="noopener noreferrer" className="hover:text-amber-500 transition-all duration-300 hover:scale-110 active:scale-95 cursor-pointer">ITviec</a>
                  <a href="https://www.topcv.vn/" target="_blank" rel="noopener noreferrer" className="hover:text-emerald-600 transition-all duration-300 hover:scale-110 active:scale-95 cursor-pointer">TopCV</a>
                  <a href="https://careerviet.vn/" target="_blank" rel="noopener noreferrer" className="hover:text-blue-700 transition-all duration-300 hover:scale-110 active:scale-95 cursor-pointer">CareerViet</a>
                  <a href="https://jobsgo.vn/" target="_blank" rel="noopener noreferrer" className="hover:text-orange-500 transition-all duration-300 hover:scale-110 active:scale-95 cursor-pointer">JobsGO</a>
                  <a href="https://www.linkedin.com/" target="_blank" rel="noopener noreferrer" className="hover:text-blue-600 transition-all duration-300 hover:scale-110 active:scale-95 cursor-pointer">LinkedIn</a>
                </div>
              </div>
            )}
      <footer className="bg-white border-t border-slate-200 py-12 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <FileSearch className="text-indigo-600 w-6 h-6" />
                <span className="text-lg font-bold tracking-tight text-slate-800">thanhnghiep<span className="text-indigo-600">.top</span></span>
              </div>
              <p className="text-sm text-slate-500 leading-relaxed">
                {t.footerDesc}
              </p>
            </div>
            <div>
              <h4 className="font-bold text-slate-800 mb-4">Từ khóa phổ biến</h4>
              <ul className="text-sm text-slate-500 space-y-2">
                <li>Công cụ so sánh CV</li>
                <li>ATS resume checker</li>
                <li>CV và job description</li>
                <li>Cải thiện CV cho hệ thống ATS</li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-slate-800 mb-4">Liên hệ</h4>
              <p className="text-sm text-slate-500">
                Email: <a href={`mailto:${import.meta.env.VITE_FEEDBACK_RECIPIENT_EMAIL || 'admin@example.com'}`} className="hover:text-indigo-600 transition-colors">{import.meta.env.VITE_FEEDBACK_RECIPIENT_EMAIL || 'admin@example.com'}</a><br />
                Website: thanhnghiep.top<br />
                <button 
  onClick={() => { 
    setActiveTab('support'); 
    window.scrollTo(0, 0); 
  }}
  className="text-indigo-600 hover:text-indigo-700 font-bold transition-all duration-200 flex items-center gap-2 mt-2 w-fit cursor-pointer hover:scale-105 active:scale-95 group"
>
  <Heart 
    className="w-4 h-4 fill-indigo-600 transition-transform duration-200 group-hover:scale-125 group-hover:rotate-12" 
  />
  <span className="group-hover:underline">Hỗ trợ phát triển</span>
</button>
              </p>
            </div>
          </div>
          <div className="border-t border-slate-100 mt-8 pt-8 text-center text-xs text-slate-400">
            <div className="flex justify-center gap-4 mb-2">
              <button onClick={() => { setActiveTab('privacy'); window.scrollTo(0,0); }} className="hover:text-indigo-600 transition-colors">Chính sách bảo mật</button>
              <button onClick={() => { setActiveTab('terms'); window.scrollTo(0,0); }} className="hover:text-indigo-600 transition-colors">Điều khoản dịch vụ</button>
            </div>
            © 2026 thanhnghiep.top. Tất cả quyền được bảo lưu.
          </div>
        </div>
      </footer>

      {/* Error Toast UI */}
      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0, x: -20, y: 0, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: -20, scale: 0.9 }}
            className="fixed bottom-6 left-6 z-[200] max-w-[calc(100vw-3rem)] sm:max-w-md w-full sm:w-auto"
          >
            <div className="bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] border border-slate-200 overflow-hidden flex items-stretch ring-1 ring-black/5">
              <div className="w-1.5 bg-rose-500 shrink-0" />
              <div className="flex-1 p-4 flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-rose-50 flex items-center justify-center shrink-0 mt-0.5">
                  <AlertCircle className="w-5 h-5 text-rose-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">
                    {reportLanguage === 'vi' ? 'Thông báo lỗi' : 'Error Message'}
                  </h4>
                  <div className="text-sm font-bold text-slate-700 leading-relaxed pr-8">
                    {error}
                  </div>
                </div>
                <button 
                  onClick={() => setError(null)}
                  className="absolute top-3 right-3 w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center transition-colors text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>

      {/* 🚀 DEDICATED PRINT VIEW - Isolated from Dashboard UI */}
      {selectedResult && (
        <div id="cv-print-root" className="min-h-screen bg-white">
          <div className="max-w-[210mm] mx-auto bg-white p-[20mm]">
            <div className="markdown-body">
              <Markdown 
                key={`print-${selectedResult.id}`}
                remarkPlugins={[remarkGfm, remarkBreaks]}
                rehypePlugins={[rehypeRaw, rehypeSanitize]}
                components={{
                  h1: ({node, ...props}) => <h1 className="text-3xl font-bold mb-8 text-center border-b-2 border-slate-100 pb-6" {...props} />,
                  h2: ({node, ...props}) => <h2 className="text-lg font-bold mt-10 mb-4 pb-1 border-b border-indigo-100 text-indigo-700" {...props} />,
                  p: ({node, ...props}) => <p className="mb-4 text-slate-800 leading-relaxed" {...props} />,
                  ul: ({node, ...props}) => <ul className="list-disc pl-6 mb-6 space-y-2" {...props} />,
                  li: ({node, ...props}) => <li className="text-slate-700" {...props} />,
                  strong: ({node, ...props}) => <strong className="font-bold text-slate-900" {...props} />,
                }}
              >
                {selectedResult.fullRewrittenCV.replace(/^(#+)([^#\s])/gm, '$1 $2')}
              </Markdown>
            </div>
            
            {/* Professional Footer for Print */}
            <div className="mt-20 pt-8 border-t border-slate-200 text-center text-[10px] text-slate-400 italic">
              cv.thanhnghiep.top - Công cụ phân tích CV thông minh giúp bạn tối ưu hóa hồ sơ.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
