import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, Check, BookmarkPlus, X } from 'lucide-react';

export interface SaveJdNameModalProps {
  isOpen: boolean;
  onClose: () => void;
  jdSaveTitle: string;
  onJdSaveTitleChange: (value: string) => void;
  onConfirm: () => void;
  isSavingJD: boolean;
  t: {
    saveJdModalTitle: string;
    saveJdNameLabel: string;
    saveJdNamePlaceholder: string;
    saveJdHint: string;
    saveJdSaving: string;
    saveJdConfirm: string;
  };
}

export function SaveJdNameModal({
  isOpen,
  onClose,
  jdSaveTitle,
  onJdSaveTitleChange,
  onConfirm,
  isSavingJD,
  t,
}: SaveJdNameModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-primary/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            className="bg-surface w-full max-w-md rounded-t-[2.5rem] sm:rounded-3xl shadow-2xl overflow-hidden"
          >
            <div className="p-6 border-b border-border flex items-center justify-between bg-accent text-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center">
                  <BookmarkPlus className="w-5 h-5 text-white" />
                </div>
                <h2 className="text-xl font-bold">{t.saveJdModalTitle}</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-10 h-10 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer hover:scale-105 active:scale-95"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-8">
              <label className="block text-xs font-black text-text-light uppercase tracking-widest mb-3">
                {t.saveJdNameLabel}
              </label>
              <input
                type="text"
                autoFocus
                placeholder={t.saveJdNamePlaceholder}
                value={jdSaveTitle}
                onChange={(e) => onJdSaveTitleChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && jdSaveTitle.trim() && !isSavingJD) {
                    onConfirm();
                  }
                }}
                className="w-full px-5 py-4 bg-surface-secondary border border-border rounded-2xl text-text-main font-bold focus:ring-2 focus:ring-accent focus:border-transparent transition-all mb-2"
              />
              <p className="text-[10px] text-text-light font-medium italic">{t.saveJdHint}</p>
            </div>

            <div className="p-6 bg-surface-secondary border-t border-border flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3.5 rounded-2xl bg-surface border border-border text-text-muted font-bold text-sm hover:bg-surface-secondary transition-all cursor-pointer hover:scale-105 active:scale-95"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={!jdSaveTitle.trim() || isSavingJD}
                className="flex-1 py-3.5 rounded-2xl bg-accent text-white font-bold text-sm hover:bg-accent-hover transition-all shadow-lg shadow-accent-light disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer hover:scale-105 active:scale-95"
              >
                {isSavingJD ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t.saveJdSaving}
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    {t.saveJdConfirm}
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
