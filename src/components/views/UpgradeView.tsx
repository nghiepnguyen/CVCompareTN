import React, { useState } from 'react';
import type { UiLabels } from '../../translations/types';
import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronRight,
  Infinity,
  Loader2,
  Sparkles,
  Zap,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { createProCheckout } from '../../services/paymentService';
import { cn } from '../../lib/utils';
import { formatPlanExpiryDate, isProPlan } from '../../lib/planLimits';
import { formatLabel } from '../../translations';

type RowKey = 'analyses' | 'batch' | 'cv' | 'jd' | 'history' | 'export';

type FeatureRow = {
  key: RowKey;
  label: string;
  value: string;
  icon?: 'check' | 'infinity';
};

type FeatureRowKey = {
  key: RowKey;
  labelKey: keyof UiLabels;
  freeKey: keyof UiLabels;
  proKey: keyof UiLabels;
  icon?: 'check' | 'infinity';
};

const FEATURE_ROW_KEYS: FeatureRowKey[] = [
  { key: 'analyses', labelKey: 'upgradeCompareAnalyses', freeKey: 'upgradeFreeAnalyses', proKey: 'upgradeProAnalyses' },
  { key: 'batch', labelKey: 'upgradeCompareBatch', freeKey: 'upgradeFreeBatch', proKey: 'upgradeProBatch' },
  { key: 'cv', labelKey: 'upgradeCompareCV', freeKey: 'upgradeFreeCV', proKey: 'upgradeProCV' },
  { key: 'jd', labelKey: 'upgradeCompareJd', freeKey: 'upgradeFreeJd', proKey: 'upgradeProJd', icon: 'infinity' },
  { key: 'history', labelKey: 'upgradeCompareHistory', freeKey: 'upgradeFreeHistory', proKey: 'upgradeProHistory' },
  { key: 'export', labelKey: 'upgradeCompareExport', freeKey: 'upgradeFreeExport', proKey: 'upgradeProExport' },
];

function mapToFeatureRows(t: UiLabels): FeatureRow[] {
  return FEATURE_ROW_KEYS.map((r) => ({
    key: r.key,
    label: String(t[r.labelKey]),
    value: String(t[r.proKey]),
    icon: r.icon,
  }));
}

function mapToFreeRows(t: UiLabels): FeatureRow[] {
  return FEATURE_ROW_KEYS.map((r) => ({
    key: r.key,
    label: String(t[r.labelKey]),
    value: String(t[r.freeKey]),
    icon: r.icon,
  }));
}

function FeatureIcon({ type }: { type?: 'check' | 'infinity' }) {
  if (type === 'infinity') return <Infinity className="size-4 text-accent shrink-0" />;
  return <Check className="size-4 text-success shrink-0" />;
}

function PricingCard({
  plan,
  price,
  subtitle,
  features,
  highlighted,
  isCurrentPlan,
  onAction,
  isLoading,
  actionLabel,
}: {
  plan: string;
  price: string;
  subtitle: string;
  features: FeatureRow[];
  highlighted: boolean;
  isCurrentPlan: boolean;
  onAction: () => void;
  isLoading: boolean;
  actionLabel: string;
}) {
  return (
    <div
      className={cn(
        'relative flex flex-col rounded-2xl border-2 transition-colors duration-200',
        highlighted
          ? 'border-accent bg-accent/5'
          : 'border-border bg-surface hover:border-text-muted/40'
      )}
    >
      {highlighted && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-xs font-black uppercase tracking-widest text-white shadow-sm">
            <Zap className="size-3 fill-white" />
            Phổ biến
          </span>
        </div>
      )}

      <div className="flex flex-col items-center p-6 pt-8 text-center">
        <h3
          className={cn(
            'text-lg font-black uppercase tracking-wider',
            highlighted ? 'text-accent' : 'text-text-main'
          )}
        >
          {plan}
        </h3>
        <div className="mt-3 flex items-baseline gap-1">
          <span className="text-4xl font-black text-text-main">{price}</span>
          <span className="text-sm font-semibold text-text-muted">/tháng</span>
        </div>
        <p className="mt-1 text-xs text-text-muted">{subtitle}</p>
      </div>

      <div className="flex-1 border-t border-border px-5 py-5 space-y-3">
        {features.map((row) => (
          <div key={row.key} className="flex items-center gap-3 text-sm">
            <FeatureIcon type={row.icon} />
            <span className="flex-1 text-text-main font-medium">{row.label}</span>
            <span className="text-text-muted tabular-nums">{row.value}</span>
          </div>
        ))}
      </div>

      <div className="px-5 pb-5 pt-2">
        <button
          type="button"
          disabled={isCurrentPlan && highlighted || isLoading}
          onClick={onAction}
          className={cn(
            'inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-black uppercase tracking-widest transition-all duration-200 cursor-pointer',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
            isCurrentPlan
              ? 'bg-surface-secondary text-text-muted border border-border'
              : highlighted
                ? 'bg-accent text-white hover:bg-accent/90 active:bg-accent/80'
                : 'bg-surface-secondary text-text-main border border-border hover:border-text-muted/60'
          )}
        >
          {isLoading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : isCurrentPlan ? (
            'Gói hiện tại'
          ) : (
            <>
              {actionLabel}
              <ArrowRight className="size-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export function UpgradeView() {
  const { user, effectivePlan, userProfile } = useAuth();
  const { t, setActiveTab, reportLanguage } = useUI();
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const alreadyPro = userProfile?.role === 'admin' || isProPlan(effectivePlan);
  const planExpiryLabel =
    alreadyPro && userProfile?.planExpiresAt
      ? formatLabel(t.planExpiresUntil, {
          date: formatPlanExpiryDate(userProfile.planExpiresAt, reportLanguage) ?? '',
        })
      : null;

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
      setError(err instanceof Error ? err.message : t.checkoutError);
      setIsCheckingOut(false);
    }
  };

  const freeRows = mapToFreeRows(t);
  const proRows = mapToFeatureRows(t);

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 sm:py-16 space-y-12">
      {/* Hero */}
      <header className="text-center space-y-4">
        <div className="inline-flex items-center justify-center size-14 rounded-2xl bg-accent/10 border border-accent/30">
          <Sparkles className="size-7 text-accent" />
        </div>

        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-text-main">
          {t.upgradePageTitle}
        </h1>
        <p className="text-text-muted max-w-lg mx-auto leading-relaxed">
          {t.upgradePageDesc}
        </p>

        {planExpiryLabel && (
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-400/10 px-4 py-1.5 text-sm font-bold text-amber-600 dark:text-amber-400">
            <Sparkles className="size-3.5" />
            {planExpiryLabel}
          </div>
        )}

        {!alreadyPro && (
          <p className="text-xs text-text-muted">{t.planStackingNote}</p>
        )}
      </header>

      {/* Pricing Cards */}
      <div className="grid sm:grid-cols-2 gap-6 max-w-2xl mx-auto">
        <PricingCard
          plan={t.planFree}
          price="0đ"
          subtitle="Miễn phí trọn đời"
          features={freeRows}
          highlighted={false}
          isCurrentPlan={!alreadyPro}
          onAction={() => setActiveTab('analyze')}
          isLoading={false}
          actionLabel="Bắt đầu miễn phí"
        />
        <PricingCard
          plan={t.planPro}
          price="69.000đ"
          subtitle={t.planStackingNote}
          features={proRows}
          highlighted
          isCurrentPlan={alreadyPro}
          onAction={() => void handleUpgrade()}
          isLoading={isCheckingOut}
          actionLabel={t.upgradeCta}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 p-4 bg-error/10 border border-error/30 rounded-2xl max-w-2xl mx-auto">
          <AlertCircle className="size-5 text-error shrink-0 mt-0.5" />
          <p className="text-sm font-bold text-error">{error}</p>
        </div>
      )}

      {/* Guarantee / Trust */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-6 text-xs text-text-muted max-w-2xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-lg bg-success/10 border border-success/20 flex items-center justify-center">
            <Check className="size-4 text-success" />
          </div>
          <span>Hủy bất cứ lúc nào</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center">
            <Zap className="size-4 text-accent" />
          </div>
          <span>Kích hoạt ngay lập tức</span>
        </div>
      </div>

      {/* Back link */}
      <div className="text-center">
        <button
          type="button"
          onClick={() => setActiveTab('analyze')}
          className="text-sm text-text-muted hover:text-text-main transition-colors duration-200 cursor-pointer inline-flex items-center gap-1"
        >
          <ChevronRight className="size-4 rotate-180" />
          {t.paymentBackToApp}
        </button>
      </div>
    </div>
  );
}