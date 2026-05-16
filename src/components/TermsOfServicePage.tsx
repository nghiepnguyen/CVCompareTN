import React, { useState } from 'react';
import { FileText, CheckCircle, AlertTriangle, Scale, ArrowLeft, Share2, Check } from 'lucide-react';
import { useUI } from '../context/UIContext';

export const TermsOfServicePage = ({ onBack }: { onBack: () => void }) => {
  const { t, reportLanguage } = useUI();
  const [copied, setCopied] = useState(false);

  const handleCopyLink = () => {
    const base = reportLanguage === 'en' ? '/en' : '';
    const url = new URL(`${window.location.origin}${base}/terms`);
    navigator.clipboard.writeText(url.toString());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const prohibitedItems = [t.termsS2Item1, t.termsS2Item2, t.termsS2Item3];

  return (
    <div className="max-w-4xl mx-auto py-12 px-4">
      <div className="flex items-center justify-between mb-8">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 transition-colors font-bold text-sm cursor-pointer hover:scale-105 active:scale-95"
        >
          <ArrowLeft className="w-4 h-4" />
          {t.legalBackHome}
        </button>

        <button
          type="button"
          onClick={handleCopyLink}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-50 transition-all shadow-sm cursor-pointer hover:scale-105 active:scale-95"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4 text-emerald-500" />
              {t.copied}
            </>
          ) : (
            <>
              <Share2 className="w-4 h-4" />
              {t.legalShareLink}
            </>
          )}
        </button>
      </div>

      <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
        <div className="bg-indigo-600 p-12 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 -mt-12 -mr-12 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
          <div className="relative z-10">
            <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center mb-6">
              <FileText className="w-8 h-8" />
            </div>
            <h1 className="text-4xl font-black tracking-tight mb-4">{t.termsPageTitle}</h1>
            <p className="text-indigo-100 text-lg max-w-xl leading-relaxed">{t.termsHeroSubtitle}</p>
          </div>
        </div>

        <div className="p-12 text-slate-700 space-y-10">
          <section className="space-y-4">
            <div className="flex items-center gap-3 text-indigo-600 mb-2">
              <CheckCircle className="w-6 h-6" />
              <h2 className="text-2xl font-black tracking-tight">{t.termsS1Title}</h2>
            </div>
            <p className="leading-relaxed">{t.termsS1Body}</p>
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-3 text-indigo-600 mb-2">
              <Scale className="w-6 h-6" />
              <h2 className="text-2xl font-black tracking-tight">{t.termsS2Title}</h2>
            </div>
            <p className="leading-relaxed">{t.termsS2Intro}</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              {prohibitedItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-3 text-indigo-600 mb-2">
              <AlertTriangle className="w-6 h-6" />
              <h2 className="text-2xl font-black tracking-tight">{t.termsS3Title}</h2>
            </div>
            <p className="leading-relaxed">{t.termsS3Body}</p>
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-3 text-indigo-600 mb-2">
              <FileText className="w-6 h-6" />
              <h2 className="text-2xl font-black tracking-tight">{t.termsS4Title}</h2>
            </div>
            <p className="leading-relaxed">{t.termsS4Body}</p>
          </section>

          <div className="pt-8 border-t border-slate-100 text-sm text-slate-400 text-center">
            {t.termsLastUpdated}
          </div>
        </div>
      </div>
    </div>
  );
};
