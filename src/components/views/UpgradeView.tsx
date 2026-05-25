import React, { useState } from 'react';
import { AlertCircle, Check, Loader2, Sparkles } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { createProCheckout } from '../../services/paymentService';
import { cn } from '../../lib/utils';
import { isProPlan } from '../../lib/planLimits';

const ROWS = [
  { key: 'analyses', freeKey: 'upgradeFreeAnalyses', proKey: 'upgradeProAnalyses' },
  { key: 'batch', freeKey: 'upgradeFreeBatch', proKey: 'upgradeProBatch' },
  { key: 'jd', freeKey: 'upgradeFreeJd', proKey: 'upgradeProJd' },
  { key: 'history', freeKey: 'upgradeFreeHistory', proKey: 'upgradeProHistory' },
  { key: 'export', freeKey: 'upgradeFreeExport', proKey: 'upgradeProExport' },
] as const;

const ROW_LABEL_KEYS = {
  analyses: 'upgradeCompareAnalyses',
  batch: 'upgradeCompareBatch',
  jd: 'upgradeCompareJd',
  history: 'upgradeCompareHistory',
  export: 'upgradeCompareExport',
} as const;

export function UpgradeView() {
  const { user, effectivePlan, userProfile } = useAuth();
  const { t, setActiveTab } = useUI();
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alreadyPro = userProfile?.role === 'admin' || isProPlan(effectivePlan);

  const handleUpgrade = async () => {
    if (!user) {
      setError(t.login);
      return;
    }
    if (alreadyPro) {
      setActiveTab('analyze');
      return;
    }
    setError(null);
    setIsCheckingOut(true);
    try {
      const { checkoutUrl } = await createProCheckout();
      window.location.href = checkoutUrl;
    } catch (err) {
      const message = err instanceof Error ? err.message : t.checkoutError;
      setError(message);
      setIsCheckingOut(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-12 space-y-10">
      <div className="text-center space-y-3">
        <div className="inline-flex items-center justify-center size-14 rounded-2xl bg-amber-400/20 border border-amber-500/30">
          <Sparkles className="size-7 text-amber-500" />
        </div>
        <h1 className="text-3xl font-black tracking-tight text-text-main">{t.upgradePageTitle}</h1>
        <p className="text-text-muted max-w-lg mx-auto">{t.upgradePageDesc}</p>
      </div>

      <div className="overflow-hidden rounded-3xl border border-border bg-surface shadow-sm">
        <div className="grid grid-cols-3 gap-0 border-b border-border bg-surface-secondary text-xs font-black uppercase tracking-widest text-text-muted">
          <div className="p-4" />
          <div className="p-4 text-center">{t.planFree}</div>
          <div className="p-4 text-center text-amber-600 dark:text-amber-400">{t.planPro}</div>
        </div>
        {ROWS.map((row) => (
          <div
            key={row.key}
            className="grid grid-cols-3 gap-0 border-b border-border last:border-b-0 text-sm"
          >
            <div className="p-4 font-bold text-text-main">{t[ROW_LABEL_KEYS[row.key]]}</div>
            <div className="p-4 text-center text-text-muted">{t[row.freeKey]}</div>
            <div className="p-4 text-center font-semibold text-text-main flex items-center justify-center gap-1">
              <Check className="size-4 text-success shrink-0" />
              {t[row.proKey]}
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div className="flex items-start gap-3 p-4 bg-error-light border border-error/20 rounded-2xl">
          <AlertCircle className="size-5 text-error shrink-0 mt-0.5" />
          <p className="text-sm font-bold text-error">{error}</p>
        </div>
      )}

      <div className="flex flex-col items-center gap-4">
        <p className="text-2xl font-black text-accent">{t.upgradePriceLabel}</p>
        <button
          type="button"
          disabled={isCheckingOut || alreadyPro}
          onClick={() => void handleUpgrade()}
          className={cn(
            'inline-flex items-center justify-center gap-2 rounded-2xl px-10 py-4 text-sm font-black uppercase tracking-widest cursor-pointer transition-all hover:scale-105 active:scale-95',
            alreadyPro
              ? 'bg-surface-secondary text-text-muted border border-border'
              : 'bg-accent text-white shadow-lg hover:shadow-xl'
          )}
        >
          {isCheckingOut ? (
            <Loader2 className="size-5 animate-spin" />
          ) : alreadyPro ? (
            t.planPro
          ) : (
            t.upgradeCta
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('analyze')}
          className="text-sm text-text-muted hover:text-text-main cursor-pointer"
        >
          {t.paymentBackToApp}
        </button>
      </div>
    </div>
  );
}
