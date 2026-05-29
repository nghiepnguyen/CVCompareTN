import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Loader2,
  Search,
  FileText,
  Trash2,
  ArrowRight,
  Clock,
  X,
  HardDrive,
} from 'lucide-react';
import { formatLabel } from '../translations';
import type { SavedCV } from '../services/cvService';

export interface SavedCvsListModalProps {
  isOpen: boolean;
  onClose: () => void;
  savedCVs: SavedCV[];
  isLoading: boolean;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  reportLanguage: 'vi' | 'en';
  onLoadCV: (cv: SavedCV) => void;
  onDeleteCV: (cvId: string, filePath: string) => void;
  isLoadingCV: boolean;
  t: {
    cvStoreModalTitle: string;
    cvStoreModalSubtitle: string;
    cvStoreSearchPlaceholder: string;
    cvStoreLoading: string;
    cvStoreEmptyTitle: string;
    cvStoreEmptyDesc: string;
    cvStoreNoMatch: string;
    cvStoreDeleteTitle: string;
    cvStoreClose: string;
    cvStoreLoad: string;
  };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function SavedCvsListModal({
  isOpen,
  onClose,
  savedCVs,
  isLoading,
  searchTerm,
  onSearchTermChange,
  reportLanguage,
  onLoadCV,
  onDeleteCV,
  isLoadingCV,
  t,
}: SavedCvsListModalProps) {
  const filtered = savedCVs.filter((cv) =>
    cv.fileName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-primary/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            className="bg-surface w-full max-w-lg rounded-t-[2.5rem] sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[80vh]"
          >
            <div className="p-6 border-b border-border flex items-center justify-between bg-accent text-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center">
                  <HardDrive className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">{t.cvStoreModalTitle}</h2>
                  <p className="text-xs text-accent-light">{t.cvStoreModalSubtitle}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-10 h-10 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer hover:scale-105 active:scale-95"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="px-6 py-4 border-b border-border bg-surface-secondary/50">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-light" />
                <input
                  type="text"
                  placeholder={t.cvStoreSearchPlaceholder}
                  value={searchTerm}
                  onChange={(e) => onSearchTermChange(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-surface border border-border rounded-xl text-sm focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="w-10 h-10 text-accent animate-spin mb-4" />
                  <p className="text-sm font-bold text-text-light animate-pulse uppercase tracking-widest">
                    {t.cvStoreLoading}
                  </p>
                </div>
              ) : savedCVs.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-surface-secondary rounded-full flex items-center justify-center mx-auto mb-4">
                    <FileText className="w-8 h-8 text-text-light/50" />
                  </div>
                  <h3 className="text-text-muted font-bold">{t.cvStoreEmptyTitle}</h3>
                  <p className="text-sm text-text-light mt-1">{t.cvStoreEmptyDesc}</p>
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-slate-400 text-sm italic">
                    {formatLabel(t.cvStoreNoMatch, { term: searchTerm })}
                  </p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {filtered.map((cv) => (
                    <div
                      key={cv.cvId}
                      className="group p-4 rounded-2xl border border-border hover:border-accent/40 hover:bg-accent-light/30 transition-all flex items-start justify-between gap-4"
                    >
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <h4 className="font-bold text-text-main break-words group-hover:text-accent transition-colors leading-tight">
                          {cv.fileName}
                        </h4>
                        <div className="flex items-center gap-3 mt-2">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3 h-3 text-text-light" />
                            <span className="text-[10px] text-text-light font-bold uppercase tracking-wider">
                              {new Date(cv.timestamp).toLocaleDateString(
                                reportLanguage === 'vi' ? 'vi-VN' : 'en-US'
                              )}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <HardDrive className="w-3 h-3 text-text-light" />
                            <span className="text-[10px] text-text-light font-bold uppercase tracking-wider">
                              {formatFileSize(cv.fileSize)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 self-center">
                        <button
                          type="button"
                          onClick={() => onDeleteCV(cv.cvId, cv.filePath)}
                          className="w-8 h-8 rounded-full bg-surface text-error shadow-sm border border-border flex items-center justify-center hover:bg-error-light transition-colors cursor-pointer hover:scale-105 active:scale-95 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity"
                          title={t.cvStoreDeleteTitle}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onLoadCV(cv)}
                          disabled={isLoadingCV}
                          className="w-8 h-8 rounded-full bg-accent text-white shadow-sm flex items-center justify-center hover:bg-accent-hover transition-all cursor-pointer hover:scale-110 active:scale-95 disabled:opacity-50"
                          title={t.cvStoreLoad}
                        >
                          {isLoadingCV ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <ArrowRight className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-6 bg-surface-secondary border-t border-border">
              <button
                type="button"
                onClick={onClose}
                className="w-full py-3 rounded-2xl bg-surface border border-border text-text-muted font-bold text-sm hover:bg-surface-secondary transition-all shadow-sm cursor-pointer hover:scale-105 active:scale-95"
              >
                {t.cvStoreClose}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}