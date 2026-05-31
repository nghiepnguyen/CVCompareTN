import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Upload, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useUI } from '../../context/UIContext';

interface CreateCampaignModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (title: string, jdTitle: string, jdContent: string) => Promise<void>;
  savedJds?: { id: string; title: string; content: string }[];
}

export function CreateCampaignModal({
  open,
  onClose,
  onCreate,
  savedJds = [],
}: CreateCampaignModalProps) {
  const { t } = useUI();
  const [title, setTitle] = useState('');
  const [jdContent, setJdContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showJdPicker, setShowJdPicker] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError(t.createCampaignRequiredName);
      return;
    }
    if (!jdContent.trim()) {
      setError(t.createCampaignRequiredJd);
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      // Extract JD title from first line or use campaign title
      const jdTitle = jdContent.split('\n')[0]?.trim().slice(0, 100) || title;
      await onCreate(title.trim(), jdTitle, jdContent.trim());
      setTitle('');
      setJdContent('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.createCampaignError);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setJdContent(text);
    };
    reader.onerror = () => {
      setError(t.createCampaignJdFileError);
    };
    reader.readAsText(file);
  };

  const handleSelectSavedJd = (jd: { id: string; title: string; content: string }) => {
    setJdContent(jd.content);
    if (!title.trim()) {
      setTitle(jd.title);
    }
    setShowJdPicker(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <motion.div
            className="absolute inset-0 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="relative w-full sm:max-w-lg bg-surface border border-border sm:rounded-2xl rounded-t-2xl shadow-xl max-h-[90vh] overflow-y-auto"
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="text-base font-black text-text-main">{t.createCampaignTitle}</h2>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-text-muted hover:text-text-main cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {/* Campaign Title */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-text-main">
                  {t.createCampaignNameLabel}{' '}
                  <span className="text-error">{t.createCampaignRequiredMark}</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t.createCampaignNamePlaceholder}
                  className="w-full bg-surface-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-text-main placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
              </div>

              {/* JD Content */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-text-main">
                  {t.createCampaignJdLabel}{' '}
                  <span className="text-error">{t.createCampaignRequiredMark}</span>
                </label>
                <textarea
                  value={jdContent}
                  onChange={(e) => setJdContent(e.target.value)}
                  placeholder={t.createCampaignJdPlaceholder}
                  rows={8}
                  className="w-full bg-surface-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-text-main placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none font-mono text-xs"
                />
                <div className="flex items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-surface-secondary border border-border text-text-main cursor-pointer hover:scale-105 active:scale-95 transition-all">
                    <Upload className="w-3.5 h-3.5" />
                    {t.createCampaignUploadFile}
                    <input
                      type="file"
                      accept=".txt,.md,.pdf,.doc,.docx"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>

                  {savedJds.length > 0 && (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowJdPicker(!showJdPicker)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-surface-secondary border border-border text-text-main cursor-pointer hover:scale-105 active:scale-95 transition-all"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                        {t.createCampaignSelectJd}
                      </button>
                      {showJdPicker && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setShowJdPicker(false)} />
                          <div className="absolute top-full left-0 mt-1 z-20 w-64 bg-surface-secondary border border-border rounded-xl p-1 shadow-lg max-h-48 overflow-y-auto">
                            {savedJds.map((jd) => (
                              <button
                                key={jd.id}
                                type="button"
                                onClick={() => handleSelectSavedJd(jd)}
                                className="block w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-text-main hover:bg-surface cursor-pointer truncate"
                              >
                                {jd.title}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="p-3 bg-error/10 border border-error/20 rounded-xl">
                  <p className="text-xs font-bold text-error">{error}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-sm font-bold text-text-muted hover:text-text-main cursor-pointer transition-colors"
                >
                  {t.createCampaignCancel}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={cn(
                    'px-5 py-2 rounded-xl text-sm font-black uppercase tracking-wider bg-accent text-white cursor-pointer hover:scale-105 active:scale-95 transition-all',
                    isSubmitting && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  {isSubmitting ? t.createCampaignSubmitting : t.createCampaignSubmit}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}