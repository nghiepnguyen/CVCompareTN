import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from '../AuthContext';
import { useUI } from '../UIContext';
import { formatLabel } from '../../translations';
import { trackEvent } from '../../lib/ga4';
import { supabase } from '../../lib/supabase';
import { AnalysisResult, analyzeCV, extractJDFromUrl } from '../../services/ai';
import {
  saveToHistory,
  deleteFromHistory,
  clearUserHistory,
  incrementUsageCount,
  getUserHistory,
} from '../../services/historyService';
import { useGoogleReCaptcha } from 'react-google-recaptcha-v3';
import { checkAnalyticsQuota } from '../../services/analyticsQuotaService';
import type { AnalysisRunContextType } from './types';

const AnalysisRunContext = createContext<AnalysisRunContextType | undefined>(undefined);

export function AnalysisRunProvider({ children }: { children: React.ReactNode }) {
  const { user, userProfile, setError, refreshUserProfile } = useAuth();
  const { reportLanguage, t } = useUI();
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
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const loadHistory = useCallback(async () => {
    if (user?.id) {
      setIsLoadingHistory(true);
      try {
        const userHistory = await getUserHistory(user.id);
        setHistory(userHistory);
      } catch (err) {
        console.error('Error loading history:', err);
      } finally {
        setIsLoadingHistory(false);
      }
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) {
      void loadHistory();
    } else {
      setHistory([]);
    }
  }, [user?.id, loadHistory]);

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
      const pdfBase64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      return { data: await pdfBase64Promise, mimeType: 'application/pdf' };
    }
    if (isDocx) {
      const arrayBuffer = await file.arrayBuffer();
      const mammoth = (await import('mammoth')).default;
      const result = await mammoth.extractRawText({ arrayBuffer });
      return { data: cleanText(result.value), mimeType: 'text/plain' };
    }
    if (isImage) {
      const reader = new FileReader();
      const imageBase64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      return { data: await imageBase64Promise, mimeType: file.type };
    }
    const text = await file.text();
    return { data: cleanText(text), mimeType: 'text/plain' };
  };

  const handleExtractJD = async () => {
    if (!jdUrl.trim()) {
      setError('Vui lòng nhập liên kết JD.');
      return;
    }
    try {
      new URL(jdUrl);
    } catch {
      setError('Liên kết không hợp lệ. Vui lòng kiểm tra lại.');
      return;
    }

    setIsExtractingJD(true);
    setError(null);
    try {
      const extractedText = await extractJDFromUrl(jdUrl);
      setJd(extractedText);
      setJdInputMode('text');
      trackEvent('jd_create', { method: 'extract_url' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message || 'Không thể trích xuất nội dung từ liên kết này.');
    } finally {
      setIsExtractingJD(false);
    }
  };

  const handleAnalyze = async () => {
    if (jdInputMode === 'text' && !jd.trim()) return setError('Vui lòng cung cấp Mô tả công việc (JD).');
    if (jdInputMode === 'link' && !jdUrl.trim()) return setError('Vui lòng cung cấp liên kết JD.');
    if (cvInputMode === 'file' && files.length === 0) return setError('Vui lòng tải lên ít nhất một CV.');
    if (cvInputMode === 'text' && !cvText.trim()) return setError('Vui lòng dán nội dung CV của bạn.');

    const plannedRuns = cvInputMode === 'file' ? files.length : 1;
    if (user?.id && userProfile?.role !== 'admin') {
      try {
        const quota = await checkAnalyticsQuota(user.id, plannedRuns);
        if (!quota.allowed) {
          const limitText =
            quota.limit != null
              ? formatLabel(t.monthlyUsageLimitExceededDetail, {
                  used: String(quota.used),
                  limit: String(quota.limit),
                })
              : '';
          setError(limitText ? `${t.monthlyUsageLimitExceeded} ${limitText}` : t.monthlyUsageLimitExceeded);
          return;
        }
      } catch (err) {
        console.error('Quota check failed:', err);
      }
    }

    setIsAnalyzing(true);
    setAnalysisProgress(0);
    setAnalysisStatus(reportLanguage === 'vi' ? 'Đang chuẩn bị...' : 'Preparing...');
    setError(null);
    setResults([]);

    try {
      setAnalysisProgress(5);
      const isLocal =
        window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

      if (isLocal) {
        setAnalysisProgress(10);
      } else {
        if (!executeRecaptcha) {
          setError('Hệ thống xác thực reCAPTCHA chưa sẵn sàng. Vui lòng thử lại sau.');
          setIsAnalyzing(false);
          return;
        }
        const token = await executeRecaptcha('analyze_cv');
        const { data: verifyData, error: verifyError } = await supabase.functions.invoke(
          'verify-recaptcha',
          { body: { token } }
        );

        if (verifyError || !verifyData?.success) {
          setError('Xác nhận reCAPTCHA thất bại (điểm tin cậy thấp). Vui lòng thử lại.');
          setIsAnalyzing(false);
          return;
        }
        setAnalysisProgress(10);
      }
    } catch (err) {
      console.error('Lỗi xác thực reCAPTCHA:', err);
    }

    trackEvent('analyze_cv', {
      input_mode: cvInputMode,
      jd_mode: jdInputMode,
      cv_count: cvInputMode === 'file' ? files.length : 1,
    });

    try {
      const newResults: AnalysisResult[] = [];
      setAnalysisStatus(reportLanguage === 'vi' ? 'Đang đọc CV...' : 'Reading CV...');
      setAnalysisProgress(15);

      if (cvInputMode === 'file') {
        const totalFiles = files.length;
        for (let i = 0; i < totalFiles; i++) {
          const file = files[i];
          const fileBaseProgress = 15 + (i / totalFiles) * 75;

          setAnalysisStatus(
            reportLanguage === 'vi' ? `Đang đọc file: ${file.name}` : `Reading file: ${file.name}`
          );
          setAnalysisProgress(fileBaseProgress + 5);

          const { data, mimeType } = await processFile(file);

          setAnalysisStatus(
            reportLanguage === 'vi' ? `Đang phân tích: ${file.name}` : `Analyzing: ${file.name}`
          );
          setAnalysisProgress(fileBaseProgress + 15);

          const analysis = await analyzeCV(
            jd,
            data,
            mimeType,
            file.name,
            jdInputMode === 'link' ? jdUrl : undefined,
            reportLanguage
          );
          newResults.push({ ...analysis, userId: user?.id });

          trackEvent('analysis_success', {
            match_score: analysis.matchScore,
            jd_type: jdInputMode,
            input_mode: 'file',
          });
          setAnalysisProgress(fileBaseProgress + (1 / totalFiles) * 75);
          if (user?.id) incrementUsageCount(user.id).catch(console.error);
        }
      } else {
        setAnalysisStatus(
          reportLanguage === 'vi' ? 'Đang đọc nội dung CV...' : 'Reading CV content...'
        );
        setAnalysisProgress(25);
        setAnalysisStatus(
          reportLanguage === 'vi' ? 'Đang phân tích nội dung CV...' : 'Analyzing CV content...'
        );
        setAnalysisProgress(45);

        const analysis = await analyzeCV(
          jd,
          cvText,
          'text/plain',
          'CV_Pasted.txt',
          jdInputMode === 'link' ? jdUrl : undefined,
          reportLanguage
        );
        newResults.push({ ...analysis, userId: user?.id });

        trackEvent('analysis_success', {
          match_score: analysis.matchScore,
          jd_type: jdInputMode,
          input_mode: 'text',
        });
        setAnalysisProgress(90);
        if (user?.id) incrementUsageCount(user.id).catch(console.error);
      }

      setAnalysisStatus(
        reportLanguage === 'vi' ? 'Đang tổng hợp kết quả...' : 'Synthesizing results...'
      );
      setAnalysisProgress(95);
      setResults(newResults);
      setHistory((prev) => [...newResults, ...prev].slice(0, 20));

      if (user?.id) saveToHistory(newResults).catch(console.error);
      if (newResults.length === 1) setSelectedResult(newResults[0]);

      setAnalysisProgress(100);
    } catch (err: unknown) {
      console.error(err);
      const message = err instanceof Error ? err.message : String(err);
      setError(message || 'Đã xảy ra lỗi trong quá trình phân tích.');
    } finally {
      if (user?.id) void refreshUserProfile();
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
      if (user?.id) {
        try {
          await clearUserHistory(user.id);
        } catch (err) {
          console.error('Error clearing history:', err);
        }
      }
    }
  };

  const deleteHistoryItem = async (id: string) => {
    setHistory((prev) => prev.filter((item) => item.id !== id));
    if (user?.id) {
      try {
        await deleteFromHistory(user.id, id);
      } catch (err) {
        console.error('Error deleting history item:', err);
      }
    }
  };

  return (
    <AnalysisRunContext.Provider
      value={{
        jd,
        setJd,
        jdInputMode,
        setJdInputMode,
        jdUrl,
        setJdUrl,
        cvText,
        setCvText,
        cvInputMode,
        setCvInputMode,
        files,
        setFiles,
        isAnalyzing,
        analysisStatus,
        analysisProgress,
        results,
        setResults,
        history,
        setHistory,
        selectedResult,
        setSelectedResult,
        isExtractingJD,
        isLoadingHistory,
        handleAnalyze,
        handleExtractJD,
        clearHistory,
        deleteHistoryItem,
      }}
    >
      {children}
    </AnalysisRunContext.Provider>
  );
}

export function useAnalysisRun(): AnalysisRunContextType {
  const context = useContext(AnalysisRunContext);
  if (context === undefined) {
    throw new Error('useAnalysisRun must be used within AnalysisRunProvider');
  }
  return context;
}
