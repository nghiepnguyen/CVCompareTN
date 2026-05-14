import React, { createContext, useContext, useState, useRef } from 'react';
import mammoth from 'mammoth';
import { useAuth } from './AuthContext';
import { useUI } from './UIContext';
import { 
  AnalysisResult, 
  analyzeCV, 
  extractJDFromUrl, 
  extractTextFromImage,
} from '../services/aiService';
import {
  saveToHistory, 
  deleteFromHistory, 
  clearUserHistory, 
  incrementUsageCount,
  saveJDToProfile,
  getSavedJDs,
  deleteSavedJD,
  getUserHistory,
  SavedJD
} from '../services/historyService';
import { useGoogleReCaptcha } from 'react-google-recaptcha-v3';

interface AnalysisContextType {
  jd: string;
  setJd: React.Dispatch<React.SetStateAction<string>>;
  jdInputMode: 'text' | 'link';
  setJdInputMode: React.Dispatch<React.SetStateAction<'text' | 'link'>>;
  jdUrl: string;
  setJdUrl: React.Dispatch<React.SetStateAction<string>>;
  cvText: string;
  setCvText: React.Dispatch<React.SetStateAction<string>>;
  cvInputMode: 'file' | 'text';
  setCvInputMode: React.Dispatch<React.SetStateAction<'file' | 'text'>>;
  files: File[];
  setFiles: React.Dispatch<React.SetStateAction<File[]>>;
  
  isAnalyzing: boolean;
  analysisStatus: string | null;
  analysisProgress: number;
  results: AnalysisResult[];
  setResults: React.Dispatch<React.SetStateAction<AnalysisResult[]>>;
  history: AnalysisResult[];
  setHistory: React.Dispatch<React.SetStateAction<AnalysisResult[]>>;
  selectedResult: AnalysisResult | null;
  setSelectedResult: React.Dispatch<React.SetStateAction<AnalysisResult | null>>;
  
  isExtractingJD: boolean;
  savedJDs: SavedJD[];
  setSavedJDs: React.Dispatch<React.SetStateAction<SavedJD[]>>;
  isSavingJD: boolean;
  isLoadingHistory: boolean;
  isLoadingSavedJDs: boolean;
  
  handleAnalyze: () => Promise<void>;
  handleExtractJD: () => Promise<void>;
  clearHistory: () => Promise<void>;
  deleteHistoryItem: (id: string) => Promise<void>;
  loadSavedJDs: () => Promise<void>;
  confirmSaveJD: (title: string) => Promise<void>;
  handleDeleteSavedJD: (jdId: string) => Promise<void>;
}

const AnalysisContext = createContext<AnalysisContextType | undefined>(undefined);

export function AnalysisProvider({ children }: { children: React.ReactNode }) {
  const { user, setError } = useAuth();
  const { reportLanguage } = useUI();
  const { executeRecaptcha } = useGoogleReCaptcha();

  const [jd, setJd] = useState('');
  const [jdInputMode, setJdInputMode] = useState<'text' | 'link'>('text');
  const [jdUrl, setJdUrl] = useState('');
  const [cvText, setCvText] = useState('');
  const [cvInputMode, setCvInputMode] = useState<'file' | 'text'>('file');
  const [files, setFiles] = useState<File[]>([]);
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState<string | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [history, setHistory] = useState<AnalysisResult[]>([]);
  const [selectedResult, setSelectedResult] = useState<AnalysisResult | null>(null);
  
  const [isExtractingJD, setIsExtractingJD] = useState(false);
  const [savedJDs, setSavedJDs] = useState<SavedJD[]>([]);
  const [isSavingJD, setIsSavingJD] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isLoadingSavedJDs, setIsLoadingSavedJDs] = useState(false);

  const loadHistory = async () => {
    if (user?.uid) {
      setIsLoadingHistory(true);
      try {
        const userHistory = await getUserHistory(user.uid);
        setHistory(userHistory);
      } catch (err) {
        console.error("Error loading history:", err);
      } finally {
        setIsLoadingHistory(false);
      }
    }
  };

  const loadSavedJDs = async () => {
    if (user?.uid) {
      setIsLoadingSavedJDs(true);
      try {
        const jds = await getSavedJDs(user.uid);
        setSavedJDs(jds);
      } catch (err) {
        console.error("Error loading saved JDs:", err);
      } finally {
        setIsLoadingSavedJDs(false);
      }
    }
  };

  // Load user data when user changes
  React.useEffect(() => {
    if (user?.uid) {
      loadHistory();
      loadSavedJDs();
    } else {
      setHistory([]);
      setSavedJDs([]);
    }
  }, [user?.uid]);

  const cleanText = (text: string): string => {
    return text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n\n').trim();
  };

  const processFile = async (file: File): Promise<{ data: string; mimeType: string }> => {
    const isPdf = file.type === 'application/pdf' || file.name.endsWith('.pdf');
    const isDocx = file.name.endsWith('.docx');
    const isImage = file.type.startsWith('image/');

    if (isPdf) {
      const reader = new FileReader();
      const pdfBase64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      return { data: await pdfBase64Promise, mimeType: 'application/pdf' };
    } else if (isDocx) {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      return { data: cleanText(result.value), mimeType: 'text/plain' };
    } else if (isImage) {
      const reader = new FileReader();
      const imageBase64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      return { data: await imageBase64Promise, mimeType: file.type };
    } else {
      const text = await file.text();
      return { data: cleanText(text), mimeType: 'text/plain' };
    }
  };

  const handleExtractJD = async () => {
    if (!jdUrl.trim()) {
      setError("Vui lòng nhập liên kết JD.");
      return;
    }
    try {
      new URL(jdUrl);
    } catch {
      setError("Liên kết không hợp lệ. Vui lòng kiểm tra lại.");
      return;
    }

    setIsExtractingJD(true);
    setError(null);
    try {
      const extractedText = await extractJDFromUrl(jdUrl);
      setJd(extractedText);
      setJdInputMode('text');
      if (window.gtag) window.gtag('event', 'jd_create', { method: 'extract_url', url: jdUrl });
    } catch (err: any) {
      setError(err.message || "Không thể trích xuất nội dung từ liên kết này.");
    } finally {
      setIsExtractingJD(false);
    }
  };

  const handleAnalyze = async () => {
    if (jdInputMode === 'text' && !jd.trim()) return setError('Vui lòng cung cấp Mô tả công việc (JD).');
    if (jdInputMode === 'link' && !jdUrl.trim()) return setError('Vui lòng cung cấp liên kết JD.');
    if (cvInputMode === 'file' && files.length === 0) return setError('Vui lòng tải lên ít nhất một CV.');
    if (cvInputMode === 'text' && !cvText.trim()) return setError('Vui lòng dán nội dung CV của bạn.');

    setIsAnalyzing(true);
    setAnalysisProgress(0);
    setAnalysisStatus(reportLanguage === 'vi' ? 'Đang chuẩn bị...' : 'Preparing...');
    setError(null);
    setResults([]);

    try {
      setAnalysisProgress(5);
      const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      
      if (isLocal) {
        setAnalysisProgress(10);
      } else {
        if (!executeRecaptcha) {
          setError('Hệ thống xác thực reCAPTCHA chưa sẵn sàng. Vui lòng thử lại sau.');
          setIsAnalyzing(false);
          return;
        }
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
      }
    } catch (err) {
      console.error('Lỗi xác thực reCAPTCHA:', err);
    }

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
          newResults.push({ ...analysis, userId: user?.uid });
          
          if (window.gtag) {
            window.gtag('event', 'analysis_success', { cv_name: file.name, match_score: analysis.matchScore, jd_type: jdInputMode });
          }
          setAnalysisProgress(fileBaseProgress + (1 / totalFiles) * 75);
          if (user?.uid) incrementUsageCount(user.uid).catch(console.error);
        }
      } else {
        setAnalysisStatus(reportLanguage === 'vi' ? 'Đang đọc nội dung CV...' : 'Reading CV content...');
        setAnalysisProgress(25);
        setAnalysisStatus(reportLanguage === 'vi' ? 'Đang phân tích nội dung CV...' : 'Analyzing CV content...');
        setAnalysisProgress(45);
        
        const analysis = await analyzeCV(jd, cvText, 'text/plain', 'CV_Pasted.txt', jdInputMode === 'link' ? jdUrl : undefined, reportLanguage);
        newResults.push({ ...analysis, userId: user?.uid });
        
        if (window.gtag) {
          window.gtag('event', 'analysis_success', { cv_name: 'Pasted Text', match_score: analysis.matchScore, jd_type: jdInputMode });
        }
        setAnalysisProgress(90);
        if (user?.uid) incrementUsageCount(user.uid).catch(console.error);
      }

      setAnalysisStatus(reportLanguage === 'vi' ? 'Đang tổng hợp kết quả...' : 'Synthesizing results...');
      setAnalysisProgress(95);
      setResults(newResults);
      setHistory(prev => [...newResults, ...prev].slice(0, 20));
      
      if (user?.uid) saveToHistory(newResults).catch(console.error);
      if (newResults.length === 1) setSelectedResult(newResults[0]);
      
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



  const confirmSaveJD = async (title: string) => {
    if (!user) return;
    setIsSavingJD(true);
    try {
      await saveJDToProfile(user.uid, title, jd);
      await loadSavedJDs();
      if (window.gtag) window.gtag('event', 'jd_create', { method: 'manual' });
    } catch (err: any) {
      setError("Lỗi khi lưu JD: " + err.message);
    } finally {
      setIsSavingJD(false);
    }
  };

  const handleDeleteSavedJD = async (jdId: string) => {
    if (!user) return;
    if (!window.confirm('Bạn có chắc chắn muốn xóa JD này khỏi kho lưu trữ không?')) return;
    try {
      await deleteSavedJD(user.uid, jdId);
      await loadSavedJDs();
    } catch (err: any) {
      setError("Lỗi khi xóa JD: " + err.message);
    }
  };

  return (
    <AnalysisContext.Provider value={{
      jd, setJd, jdInputMode, setJdInputMode, jdUrl, setJdUrl,
      cvText, setCvText, cvInputMode, setCvInputMode, files, setFiles,
      isAnalyzing, analysisStatus, analysisProgress, results, setResults,
      history, setHistory, selectedResult, setSelectedResult,
      isExtractingJD, savedJDs, setSavedJDs, isSavingJD,
      handleAnalyze, handleExtractJD, clearHistory, deleteHistoryItem,
      loadSavedJDs, confirmSaveJD, handleDeleteSavedJD,
      isLoadingHistory, isLoadingSavedJDs
    }}>
      {children}
    </AnalysisContext.Provider>
  );
}

export const useAnalysis = () => {
  const context = useContext(AnalysisContext);
  if (context === undefined) {
    throw new Error('useAnalysis must be used within an AnalysisProvider');
  }
  return context;
};
