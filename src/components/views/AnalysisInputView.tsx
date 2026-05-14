import React from 'react';
import { motion } from 'motion/react';
import { FileText, Search, FolderOpen, BookmarkPlus, Loader2, Zap, Upload, X, Trash2, Globe, TrendingUp, AlertCircle, Check } from 'lucide-react';
import { useAnalysis } from '../../context/AnalysisContext';
import { useUI } from '../../context/UIContext';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../lib/utils';

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
        extractedText = 'Extracted PDF text...';
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
            "bg-white p-4 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] shadow-sm border transition-all relative flex flex-col h-full",
            isDraggingJD ? "border-indigo-500 bg-indigo-50/30 ring-4 ring-indigo-500/10" : "border-slate-200"
          )}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingJD(true); }}
          onDragLeave={(e) => { e.stopPropagation(); setIsDraggingJD(false); }}
          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingJD(false); handleJDFileChange(e); }}
        >
          {isDraggingJD && (
            <div 
              className="absolute inset-0 z-20 bg-indigo-600/10 backdrop-blur-[2px] border-2 border-dashed border-indigo-500 rounded-[2.5rem] flex flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-200"
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
          
          <div className="flex flex-col gap-5 h-full">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-800 tracking-tight">{t.jdTitle}</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                    {t.jdDesc}
                  </p>
                </div>
              </div>
              
              <div className="flex bg-slate-100 p-1 rounded-xl">
                <button 
                  onClick={() => setJdInputMode('text')}
                  className={cn(
                    "px-4 py-2 sm:py-1.5 text-[10px] font-black uppercase tracking-tight rounded-lg transition-all cursor-pointer hover:scale-105 active:scale-95",
                    jdInputMode === 'text' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"
                  )}
                >
                  {t.textMode}
                </button>
                <button 
                  onClick={() => setJdInputMode('link')}
                  className={cn(
                    "px-4 py-2 sm:py-1.5 text-[10px] font-black uppercase tracking-tight rounded-lg transition-all cursor-pointer hover:scale-105 active:scale-95",
                    jdInputMode === 'link' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"
                  )}
                >
                  {t.linkMode}
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-[260px] flex flex-col gap-4">
              {jdInputMode === 'text' ? (
                <div className="flex-1 flex flex-col relative group">
                  <textarea
                    value={jd}
                    onChange={(e) => setJd(e.target.value)}
                    placeholder={t.placeholderJD}
                    className="flex-1 w-full min-h-[160px] sm:min-h-[240px] p-4 sm:p-6 rounded-[1.5rem] sm:rounded-[2rem] border border-slate-100 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all resize-none text-slate-700 bg-slate-50/30 text-sm font-medium leading-relaxed"
                  />
                  <div className="mt-3 flex items-center justify-between px-2">
                    <div className="flex items-start gap-2 text-[10px] text-slate-400 italic font-medium">
                      <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                      <span>{reportLanguage === 'vi' ? 'Dán link hoặc kéo thả file trực tiếp vào đây.' : 'Paste link or drag and drop file directly.'}</span>
                    </div>
                    {jd && (
                      <button 
                        onClick={() => setJd('')}
                        className="text-[11px] font-black text-slate-500 hover:text-red-500 transition-colors uppercase tracking-widest cursor-pointer hover:scale-110 active:scale-90 flex items-center gap-1"
                      >
                        <X className="w-3.5 h-3.5" />
                        {t.clearBtn}
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-4 justify-center py-10">
                  <div className="relative flex items-center">
                    <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
                      <Globe className="w-5 h-5 text-slate-300" />
                    </div>
                    <input
                      type="url"
                      value={jdUrl}
                      onChange={(e) => setJdUrl(e.target.value)}
                      placeholder={t.placeholderLink}
                      className="w-full h-14 pl-14 pr-32 rounded-2xl border border-slate-100 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-slate-700 bg-slate-50/30 text-sm font-medium"
                    />
                    <div className="absolute inset-y-0 right-2 flex items-center">
                      <button
                        onClick={handleExtractJD}
                        disabled={isExtractingJD || !jdUrl.trim()}
                        className={cn(
                          "h-11 px-6 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2",
                          isExtractingJD 
                            ? "bg-slate-100 text-slate-400 cursor-not-allowed" 
                            : "bg-indigo-600 text-white hover:bg-indigo-700 shadow-md active:scale-95"
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
                    <div className="p-4 rounded-2xl bg-indigo-50/50 border border-indigo-100/50 text-[11px] text-indigo-700 line-clamp-3 font-medium">
                      <div className="flex items-center gap-2 mb-1">
                        <Check className="w-3 h-3" />
                        <span className="font-black uppercase tracking-widest">Đã trích xuất nội dung</span>
                      </div>
                      {jd}
                    </div>
                  )}
                </div>
              )}

              {/* JD Actions Footer */}
              <div className="mt-auto pt-4 flex items-center gap-3">
                {user && (
                  <>
                    <button 
                      onClick={() => setIsSavedJDsModalOpen(true)}
                      className="flex-1 h-12 sm:h-14 flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-2xl transition-all cursor-pointer hover:scale-[1.02] active:scale-95"
                    >
                      <FolderOpen className="w-4 h-4" />
                      {t.jdStore}
                    </button>
                    {jdInputMode === 'text' && jd.trim() && (
                      <button 
                        onClick={handleSaveJD}
                        disabled={isSavingJD}
                        className="flex-1 h-12 sm:h-14 flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-2xl transition-all disabled:opacity-50 cursor-pointer hover:scale-[1.02] active:scale-95 border border-indigo-100"
                      >
                        {isSavingJD ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookmarkPlus className="w-4 h-4" />}
                        {t.saveJd}
                      </button>
                    )}
                  </>
                )}
              </div>
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
        <section className="bg-white p-4 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] shadow-sm border border-slate-200 flex flex-col h-full">
          <div className="flex flex-col gap-5 h-full">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-violet-50 flex items-center justify-center text-violet-600">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-800 tracking-tight">{t.cvTitle}</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                    {reportLanguage === 'vi' ? 'Tải lên hồ sơ ứng tuyển' : 'Upload application profile'}
                  </p>
                </div>
              </div>

              <div className="flex bg-slate-100 p-1 rounded-xl">
                <button 
                  onClick={() => setCvInputMode('file')}
                  className={cn(
                    "px-4 py-2 sm:py-1.5 text-[10px] font-black uppercase tracking-tight rounded-lg transition-all cursor-pointer",
                    cvInputMode === 'file' ? "bg-white text-violet-600 shadow-sm" : "text-slate-500"
                  )}
                >
                  FILE
                </button>
                <button 
                  onClick={() => setCvInputMode('text')}
                  className={cn(
                    "px-4 py-2 sm:py-1.5 text-[10px] font-black uppercase tracking-tight rounded-lg transition-all cursor-pointer",
                    cvInputMode === 'text' ? "bg-white text-violet-600 shadow-sm" : "text-slate-500"
                  )}
                >
                  {t.textMode}
                </button>
              </div>
            </div>

            <div className="flex-1 flex flex-col">
              {cvInputMode === 'file' ? (
                <div className="flex-1 flex flex-col gap-6">
                  <div 
                    className={cn(
                      "flex-1 border-2 border-dashed rounded-[2rem] p-8 transition-all cursor-pointer flex flex-col items-center justify-center text-center relative overflow-hidden group/cv",
                      isDraggingCV ? "border-violet-500 bg-violet-50/50 ring-4 ring-violet-500/10" : "border-slate-200 hover:border-violet-400 hover:bg-slate-50/50"
                    )}
                    onClick={() => document.getElementById('cv-upload')?.click()}
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingCV(true); }}
                    onDragLeave={(e) => { e.stopPropagation(); setIsDraggingCV(false); }}
                    onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleCVDrop(e); }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent to-slate-50/30 pointer-events-none" />
                    
                    <div className="relative z-10 flex flex-col items-center">
                      <div className={cn(
                        "w-16 h-16 rounded-[1.5rem] flex items-center justify-center mb-4 transition-all duration-500 group-hover/cv:scale-110",
                        isDraggingCV ? "bg-violet-500 text-white" : "bg-violet-50 text-violet-600"
                      )}>
                        <Upload className={cn("w-8 h-8", isDraggingCV && "animate-bounce")} />
                      </div>
                      <p className="text-sm font-black text-slate-800 mb-2 tracking-tight">
                        {isDraggingCV ? (reportLanguage === 'vi' ? "Thả ngay vào đây!" : "Drop it now!") : (reportLanguage === 'vi' ? "Kéo thả hoặc Nhấn để tải lên" : "Drag & Drop or Click to Upload")}
                      </p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
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
                        className="absolute top-4 right-4 p-2 bg-white/90 backdrop-blur-md rounded-xl text-slate-400 hover:text-red-500 transition-all shadow-md border border-slate-100 cursor-pointer hover:scale-110 active:scale-90"
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
                    <div className="space-y-2">
                      <div className="flex items-center justify-between px-2">
                        <span className="text-[10px] font-black text-violet-600 uppercase tracking-widest">{t.processingFile}</span>
                        <span className="text-[10px] font-black text-violet-600">{uploadProgress}%</span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden p-0.5">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${uploadProgress}%` }}
                          className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full shadow-[0_0_8px_rgba(139,92,246,0.4)]"
                        />
                      </div>
                    </div>
                  )}

                  {files.length > 0 && (
                    <div className="max-h-[140px] overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                      {files.map((f, i) => (
                        <motion.div 
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          key={i} 
                          className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100 group/item hover:border-violet-200 transition-all"
                        >
                          <div className="flex items-center gap-3 overflow-hidden">
                            <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shadow-sm">
                              <FileText className="w-4 h-4 text-violet-500" />
                            </div>
                            <span className="text-xs font-black text-slate-700 truncate tracking-tight">{f.name}</span>
                          </div>
                          <button onClick={() => removeFile(i)} className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
                            <X className="w-4 h-4" />
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
                    className="flex-1 w-full min-h-[160px] sm:min-h-[240px] p-4 sm:p-6 rounded-[1.5rem] sm:rounded-[2rem] border border-slate-100 focus:ring-4 focus:ring-violet-500/10 focus:border-violet-500 transition-all resize-none text-slate-700 bg-slate-50/30 text-sm font-medium leading-relaxed"
                  />
                  {cvText && (
                    <div className="mt-3 flex justify-end px-2">
                      <button 
                        onClick={() => setCvText('')}
                        className="text-[11px] font-black text-slate-500 hover:text-red-500 transition-colors uppercase tracking-widest cursor-pointer hover:scale-110 active:scale-90 flex items-center gap-1"
                      >
                        <X className="w-3.5 h-3.5" />
                        {t.clearBtn}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Footer Actions: Language & Analyze */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-6">
        <div className="flex-1 flex items-center gap-3 sm:gap-4 bg-white px-4 sm:px-5 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-sm !h-[52px] sm:!h-16 min-h-[52px] sm:min-h-16">
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-indigo-50 rounded-lg sm:rounded-xl flex items-center justify-center">
              <Globe className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600" />
            </div>
            <span className="hidden md:inline text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] whitespace-nowrap">
              {t.reportLanguageLabel}
            </span>
          </div>
          
          <div className="flex-1 flex bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setReportLanguage('vi')}
              className={cn(
                "flex-1 py-1.5 text-[10px] sm:text-[11px] font-black rounded-lg transition-all cursor-pointer whitespace-nowrap",
                reportLanguage === 'vi' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-indigo-600"
              )}
            >
              VI
            </button>
            <button
              onClick={() => setReportLanguage('en')}
              className={cn(
                "flex-1 py-1.5 text-[10px] sm:text-[11px] font-black rounded-lg transition-all cursor-pointer whitespace-nowrap",
                reportLanguage === 'en' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-indigo-600"
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
              ? "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200" 
              : "bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-2xl hover:shadow-indigo-300/50 active:scale-95 cursor-pointer shadow-[0_20px_50px_-12px_rgba(79,70,229,0.4)]"
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

      <p className="text-[10px] text-slate-400 text-center font-medium max-w-md mx-auto">
        Bằng cách nhấn phân tích, bạn đồng ý với các 
        <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline mx-1">Chính sách bảo mật</a> và 
        <a href="https://policies.google.com/terms" target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline mx-1">Điều khoản sử dụng</a> của hệ thống.
      </p>
    </div>
  );
}
