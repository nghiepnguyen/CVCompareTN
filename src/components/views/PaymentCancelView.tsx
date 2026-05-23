import React from 'react';
import { XCircle } from 'lucide-react';
import { useUI } from '../../context/UIContext';

export function PaymentCancelView() {
  const { t, setActiveTab } = useUI();

  return (
    <div className="max-w-lg mx-auto px-4 py-20 text-center space-y-6">
      <XCircle className="size-16 text-text-muted mx-auto" />
      <h1 className="text-2xl font-black text-text-main">{t.paymentCancelTitle}</h1>
      <p className="text-text-muted">{t.paymentCancelDesc}</p>
      <button
        type="button"
        onClick={() => setActiveTab('analyze')}
        className="inline-flex items-center justify-center rounded-xl border border-border bg-surface px-6 py-3 text-sm font-bold text-text-main cursor-pointer transition-all hover:scale-105 active:scale-95"
      >
        {t.paymentBackToApp}
      </button>
    </div>
  );
}
