import React from 'react';
import { motion } from 'motion/react';
import { FileText, Search, FolderOpen, BookmarkPlus, Loader2, Zap, Upload, X, Trash2, Globe, TrendingUp, AlertCircle, Check } from 'lucide-react';
import { useAnalysis } from '../../context/AnalysisContext';
import { useUI } from '../../context/UIContext';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../lib/utils';
import { supabase } from '../../lib/supabase';

export function AnalysisInputView() {
  const { user } = useAuth();
  const {
    jd, setJd, jdInputMode, setJdInputMode, jdUrl, setJdUrl,
    cvText, setCvText, cvInputMode, setCvInputMode, files, setFiles,
    isAnalyzing, isExtractingJD, isSavingJD,
    handleAnalyze, handleExtractJD
  } = useAnalysis();
  const { t, reportLanguage, setReportLanguage, setIsSavedJDsModalOpen, setIsSaveJDNameModalOpen } = useUI();

  const [isDraggingJD, setIsDraggingJD] = React.useState(false);
  const [isDraggingCV, setIsDraggingCV] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState<number | null>(null);
  const jdFileInputRef = React.useRef<HTMLInputElement>(null);

  const handleJDFileChange = async (e: React.ChangeEvent<HTMLInputElement> | React.DragEvent) => {
    let file: File | null = null;
    if ('dataTransfer' in e) {
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) file = e.dataTransfer.files[0];
    } else {
      if (e.target.files && e.target.files.length > 0) file = e.target.files[0];
    }
    if (!file) return;

    try {
      const isDocx = file.name.endsWith('.docx');
      const isPdf = file.type === 'application/pdf' || file.name.endsWith('.pdf');
      
      let extractedText = '';
      if (isPdf) {
        const reader = new FileReader();
        const pdfBase64 = await new Promise<string>((resolve) => {
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
        
        const { data: extractData, error: extractError } = await supabase.functions.invoke('extract-pdf', {
          body: { base64Data: pdfBase64 }
        });
        
        if (extractError) throw extractError;
        extractedText = extractData.text;
      } else if (isDocx) {
        extractedText = 'Extracted DOCX text...';
      } else {
        extractedText = await file.text();
      }
      
      setJd(extractedText);
      setJdInputMode('text');
    } catch (err: any) {
      console.error(err);
    }
    if (jdFileInputRef.current) jdFileInputRef.current.value = '';
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      setFiles(prev => [...prev, ...selectedFiles]);
    }
  };

  const handleCVDrop = (e: React.DragEvent) => {
    setIsDraggingCV(false);
    if (e.dataTransfer.files) {
      const droppedFiles = Array.from(e.dataTransfer.files);
      setFiles(prev => [...prev, ...droppedFiles]);
    }
  };

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const handleSaveJD = () => {
    setIsSaveJDNameModalOpen(true);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
        {/* Left Column: Job Description */}
        <section 
          className={cn(
            "bg-surface p-4 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] shadow-sm border transition-all relative flex flex-col h-full",
            isDraggingJD ? "border-accent bg-accent-light/30 ring-4 ring-accent/10" : "border-border"
          )}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingJD(true); }}
          onDragLeave={(e) => { e.stopPropagation(); setIsDraggingJD(false); }}
          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingJD(false); handleJDFileChange(e); }}
        >
          {isDraggingJD && (
            <div 
              className="absolute inset-0 z-20 bg-accent/10 backdrop-blur-[2px] border-2 border-dashed border-accent rounded-[2.5rem] flex flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-200"
              onDragOver={(e) => e.preventDefault()}
              onDragLeave={() => setIsDraggingJD(false)}
              onDrop={(e) => { e.preventDefault(); setIsDraggingJD(false); handleJDFileChange(e); }}
            >
              <div className="bg-surface p-4 rounded-2xl shadow-xl flex flex-col items-center gap-2">
                <Upload className="w-8 h-8 text-accent animate-bounce" />
                <span className="text-sm font-black text-accent uppercase tracking-widest">Thả file JD vào đây</span>
              </div>
            </div>
          )}
          
          <div className="flex flex-col gap-5 h-full">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-accent-light flex items-center justify-center text-accent">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-text-main tracking-tight">{t.jdTitle}</h3>
                  <p className="text-[10px] text-text-light font-bold uppercase tracking-widest">
                    {t.jdDesc}
                  </p>
                </div>
              </div>
              
              <div className="flex bg-surface-secondary p-1 rounded-xl">
                <button 
                  onClick={() => setJdInputMode('text')}
                  className={cn(
                    "px-4 py-2 sm:py-1.5 text-[10px] font-black uppercase tracking-tight rounded-lg transition-all cursor-pointer hover:scale-105 active:scale-95",
                    jdInputMode === 'text' ? "bg-surface text-accent shadow-sm" : "text-text-muted"
                  )}
                >
                  {t.textMode}
                </button>
                <button 
                  onClick={() => setJdInputMode('link')}
                  className={cn(
                    "px-4 py-2 sm:py-1.5 text-[10px] font-black uppercase tracking-tight rounded-lg transition-all cursor-pointer hover:scale-105 active:scale-95",
                    jdInputMode === 'link' ? "bg-surface text-accent shadow-sm" : "text-text-muted"
                  )}
                >
                  {t.linkMode}
                </button>
              </div>
            </div>

            <div className="h-[200px] sm:h-[240px] w-full flex flex-col">
              {jdInputMode === 'text' ? (
                <div className="flex-1 flex flex-col relative group">
                  <textarea
                    value={jd}
                    onChange={(e) => setJd(e.target.value)}
                    placeholder={t.placeholderJD}
                    className="flex-1 w-full p-4 sm:p-6 rounded-[1.5rem] sm:rounded-[2rem] border border-border focus:ring-4 focus:ring-accent/10 focus:border-accent transition-all resize-none text-text-main bg-surface-secondary/30 text-sm font-medium leading-relaxed"
                  />
                  {jd && (
                    <button 
                      onClick={() => setJd('')}
                      className="absolute bottom-3 right-3 sm:bottom-4 sm:right-4 bg-surface/80 backdrop-blur-md px-3 py-1.5 rounded-lg text-[10px] font-black text-text-muted hover:text-error transition-all uppercase tracking-widest cursor-pointer shadow-sm border border-border hover:scale-105 active:scale-95 flex items-center gap-1.5 z-10"
                    >
                      <X className="w-3 h-3" />
                      {t.clearBtn}
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex flex-col justify-center py-2 sm:py-4">
                  <div className="relative flex items-center">
                    <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
                      <Globe className="w-5 h-5 text-text-light" />
                    </div>
                    <input
                      type="url"
                      value={jdUrl}
                      onChange={(e) => setJdUrl(e.target.value)}
                      placeholder={t.placeholderLink}
                      className="w-full h-14 pl-14 pr-32 rounded-2xl border border-border focus:ring-4 focus:ring-accent/10 focus:border-accent transition-all text-text-main bg-surface-secondary/30 text-sm font-medium"
                    />
                    <div className="absolute inset-y-0 right-2 flex items-center">
                      <button
                        onClick={handleExtractJD}
                        disabled={isExtractingJD || !jdUrl.trim()}
                        className={cn(
                          "h-11 px-6 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2",
                          isExtractingJD 
                            ? "bg-surface-secondary text-text-muted cursor-not-allowed" 
                            : "bg-accent text-white hover:bg-accent/90 shadow-md active:scale-95"
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
                  {jd && (
                    <div className="p-4 rounded-2xl bg-accent-light/50 border border-accent-light/50 text-[11px] text-accent line-clamp-3 font-medium">
                      <div className="flex items-center gap-2 mb-1">
                        <Check className="w-3 h-3" />
                        <span className="font-black uppercase tracking-widest">Đã trích xuất nội dung</span>
                      </div>
                      {jd}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* JD Actions Footer */}
            <div className="mt-auto pt-4 flex items-center gap-3">
              {user && (
                <>
                  <button 
                    onClick={() => setIsSavedJDsModalOpen(true)}
                    className="flex-1 h-12 sm:h-14 flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest text-text-muted bg-surface-secondary hover:bg-surface-muted rounded-2xl transition-all cursor-pointer hover:scale-[1.02] active:scale-95"
                  >
                    <FolderOpen className="w-4 h-4" />
                    {t.jdStore}
                  </button>
                  {jdInputMode === 'text' && jd.trim() && (
                    <button 
                      onClick={handleSaveJD}
                      disabled={isSavingJD}
                      className="flex-1 h-12 sm:h-14 flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest text-accent bg-accent-light hover:bg-accent-light/80 rounded-2xl transition-all disabled:opacity-50 cursor-pointer hover:scale-[1.02] active:scale-95 border border-accent-light"
                    >
                      {isSavingJD ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookmarkPlus className="w-4 h-4" />}
                      {t.saveJd}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
          <input 
            type="file"
            ref={jdFileInputRef}
            className="hidden"
            accept=".pdf,.doc,.docx,.txt,image/*"
            onChange={handleJDFileChange}
          />
        </section>

        {/* Right Column: CV Upload */}
        <section className="bg-surface p-4 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] shadow-sm border border-border flex flex-col h-full">
          <div className="flex flex-col gap-5 h-full">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-accent-light flex items-center justify-center text-accent">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-text-main tracking-tight">{t.cvTitle}</h3>
                  <p className="text-[10px] text-text-light font-bold uppercase tracking-widest">
                    {reportLanguage === 'vi' ? 'Tải lên hồ sơ ứng tuyển' : 'Upload application profile'}
                  </p>
                </div>
              </div>

              <div className="flex bg-surface-secondary p-1 rounded-xl">
                <button 
                  onClick={() => setCvInputMode('file')}
                  className={cn(
                    "px-4 py-2 sm:py-1.5 text-[10px] font-black uppercase tracking-tight rounded-lg transition-all cursor-pointer",
                    cvInputMode === 'file' ? "bg-surface text-accent shadow-sm" : "text-text-muted"
                  )}
                >
                  FILE
                </button>
                <button 
                  onClick={() => setCvInputMode('text')}
                  className={cn(
                    "px-4 py-2 sm:py-1.5 text-[10px] font-black uppercase tracking-tight rounded-lg transition-all cursor-pointer",
                    cvInputMode === 'text' ? "bg-surface text-accent shadow-sm" : "text-text-muted"
                  )}
                >
                  {t.textMode}
                </button>
              </div>
            </div>

            <div className="flex-1 flex flex-col">
              {cvInputMode === 'file' ? (
                <div className="flex-1 flex flex-col">
                  <div 
                    className={cn(
                      "flex-1 border-2 border-dashed rounded-[2rem] p-4 sm:p-8 transition-all cursor-pointer flex flex-col items-center justify-center text-center relative overflow-hidden group/cv",
                      isDraggingCV ? "border-accent bg-accent-light/50 ring-4 ring-accent/10" : "border-border hover:border-accent hover:bg-surface-secondary/50"
                    )}
                    onClick={() => document.getElementById('cv-upload')?.click()}
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingCV(true); }}
                    onDragLeave={(e) => { e.stopPropagation(); setIsDraggingCV(false); }}
                    onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleCVDrop(e); }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent to-surface-secondary/30 pointer-events-none" />
                    
                    <div className="relative z-10 flex flex-col items-center">
                      <div className={cn(
                        "w-16 h-16 rounded-[1.5rem] flex items-center justify-center mb-4 transition-all duration-500 group-hover/cv:scale-110",
                        isDraggingCV ? "bg-accent text-white" : "bg-accent-light text-accent"
                      )}>
                        <Upload className={cn("w-8 h-8", isDraggingCV && "animate-bounce")} />
                      </div>
                      <p className="text-sm font-black text-text-main mb-2 tracking-tight">
                        {isDraggingCV ? (reportLanguage === 'vi' ? "Thả ngay vào đây!" : "Drop it now!") : (reportLanguage === 'vi' ? "Kéo thả hoặc Nhấn để tải lên" : "Drag & Drop or Click to Upload")}
                      </p>
                      <p className="text-[10px] text-text-light font-bold uppercase tracking-widest">
                        PDF, DOCX, TXT, IMG
                      </p>
                    </div>

                    {files.length > 0 && (
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setFiles([]);
                          setCvText('');
                        }}
                        className="absolute top-4 right-4 p-2 bg-surface/90 backdrop-blur-md rounded-xl text-text-muted hover:text-error transition-all shadow-md border border-border cursor-pointer hover:scale-110 active:scale-90"
                      >
                        <Trash2 className="w-4 h-4" />
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
                  </div>

                  {uploadProgress !== null && (
                    <div className="mt-4 space-y-2">
                      <div className="flex items-center justify-between px-2">
                        <span className="text-[10px] font-black text-accent uppercase tracking-widest">{t.processingFile}</span>
                        <span className="text-[10px] font-black text-accent">{uploadProgress}%</span>
                      </div>
                      <div className="h-2 w-full bg-surface-secondary rounded-full overflow-hidden p-0.5">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${uploadProgress}%` }}
                          className="h-full bg-accent rounded-full shadow-[0_0_8px_rgba(var(--color-accent-rgb),0.4)]"
                        />
                      </div>
                    </div>
                  )}

                  {files.length > 0 && (
                    <div className="mt-4 h-24 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                      {files.map((f, i) => (
                        <motion.div 
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          key={i} 
                          className="flex items-center justify-between p-2.5 bg-surface-secondary rounded-xl border border-border group/item hover:border-accent transition-all"
                        >
                          <div className="flex items-center gap-2 overflow-hidden">
                            <div className="w-7 h-7 rounded-lg bg-surface flex items-center justify-center shadow-sm">
                              <FileText className="w-3.5 h-3.5 text-accent" />
                            </div>
                            <span className="text-[11px] font-black text-text-main truncate tracking-tight">{f.name}</span>
                          </div>
                          <button onClick={() => removeFile(i)} className="p-1 text-text-light hover:text-error hover:bg-error-light rounded-lg transition-all">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex flex-col relative group">
                  <textarea
                    value={cvText}
                    onChange={(e) => setCvText(e.target.value)}
                    placeholder={t.placeholderCV}
                    className="flex-1 w-full p-4 sm:p-6 rounded-[1.5rem] sm:rounded-[2rem] border border-border focus:ring-4 focus:ring-accent/10 focus:border-accent transition-all resize-none text-text-main bg-surface-secondary/30 text-sm font-medium leading-relaxed"
                  />
                  {cvText && (
                    <button 
                      onClick={() => setCvText('')}
                      className="absolute bottom-3 right-3 sm:bottom-4 sm:right-4 bg-surface/80 backdrop-blur-md px-3 py-1.5 rounded-lg text-[10px] font-black text-text-muted hover:text-error transition-all uppercase tracking-widest cursor-pointer shadow-sm border border-border hover:scale-105 active:scale-95 flex items-center gap-1.5 z-10"
                    >
                      <X className="w-3 h-3" />
                      {t.clearBtn}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Footer Actions: Language & Analyze */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-6">
        <div className="flex-1 flex items-center gap-3 sm:gap-4 bg-surface px-4 sm:px-5 rounded-2xl sm:rounded-3xl border border-border shadow-sm !h-[52px] sm:!h-16 min-h-[52px] sm:min-h-16">
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-accent-light rounded-lg sm:rounded-xl flex items-center justify-center">
              <Globe className="w-4 h-4 sm:w-5 sm:h-5 text-accent" />
            </div>
            <span className="hidden md:inline text-[10px] font-black text-text-light uppercase tracking-[0.15em] whitespace-nowrap">
              {t.reportLanguageLabel}
            </span>
          </div>
          
          <div className="flex-1 flex bg-surface-secondary p-1 rounded-xl">
            <button
              onClick={() => setReportLanguage('vi')}
              className={cn(
                "flex-1 py-1.5 text-[10px] sm:text-[11px] font-black rounded-lg transition-all cursor-pointer whitespace-nowrap",
                reportLanguage === 'vi' ? "bg-surface text-accent shadow-sm" : "text-text-muted hover:text-accent"
              )}
            >
              VI
            </button>
            <button
              onClick={() => setReportLanguage('en')}
              className={cn(
                "flex-1 py-1.5 text-[10px] sm:text-[11px] font-black rounded-lg transition-all cursor-pointer whitespace-nowrap",
                reportLanguage === 'en' ? "bg-surface text-accent shadow-sm" : "text-text-muted hover:text-accent"
              )}
            >
              EN
            </button>
          </div>
        </div>

          <button
            onClick={handleAnalyze}
            disabled={isAnalyzing}
            className={cn(
              "w-full sm:flex-1 !h-[52px] sm:!h-16 min-h-[52px] sm:min-h-16 rounded-2xl sm:rounded-3xl font-black text-base sm:text-lg uppercase tracking-widest transition-all flex items-center justify-center gap-3 sm:gap-4 relative overflow-hidden group shrink-0",
            isAnalyzing 
              ? "bg-surface-secondary text-text-muted cursor-not-allowed border border-border" 
              : "bg-accent text-white hover:bg-accent/90 hover:shadow-2xl hover:shadow-accent/50 active:scale-95 cursor-pointer shadow-[0_20px_50px_-12px_rgba(var(--color-accent-rgb),0.4)]"
          )}
        >
          {isAnalyzing ? (
            <div className="flex items-center gap-3 animate-pulse">
              <Loader2 className="w-7 h-7 animate-spin" />
              <span className="text-base font-bold">
                {cvInputMode === 'file' 
                  ? (reportLanguage === 'vi' ? `Đang phân tích ${files.length} hồ sơ...` : `Analyzing ${files.length} profiles...`) 
                  : t.analyzingBtn}
              </span>
            </div>
          ) : (
            <>
              <TrendingUp className="w-6 h-6 group-hover:translate-y-[-2px] group-hover:translate-x-[2px] transition-transform" />
              <span>{t.analyze}</span>
              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
            </>
          )}
        </button>
      </div>

      <p className="text-[10px] text-text-light text-center font-medium max-w-md mx-auto">
        Bằng cách nhấn phân tích, bạn đồng ý với các 
        <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer" className="text-accent hover:underline mx-1">Chính sách bảo mật</a> và 
        <a href="https://policies.google.com/terms" target="_blank" rel="noreferrer" className="text-accent hover:underline mx-1">Điều khoản sử dụng</a> của hệ thống.
      </p>
    </div>
  );
}
