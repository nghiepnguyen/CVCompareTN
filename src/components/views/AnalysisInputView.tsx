import React from 'react';
import { motion } from 'motion/react';
import { FileText, Search, FolderOpen, BookmarkPlus, Loader2, Zap, Upload, X, Trash2, Globe, TrendingUp, AlertCircle } from 'lucide-react';
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
    <>
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
    </>
  );
}
