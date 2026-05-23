import React from 'react';
import { Sparkles } from 'lucide-react';
import { useUI } from '../../context/UIContext';
import { cn } from '../../lib/utils';

type UpgradePromptProps = {
  feature: string;
  className?: string;
};

export function UpgradePrompt({ feature, className }: UpgradePromptProps) {
  const { t, setActiveTab } = useUI();

  return (
    <div
      className={cn(
        'rounded-2xl border border-amber-500/30 bg-amber-400/10 p-6 text-center space-y-4',
        className
      )}
    >
      <div className="flex justify-center">
        <Sparkles className="size-8 text-amber-500" />
      </div>
      <p className="text-sm font-medium text-text-main">
        {t.upgradePromptFeature.replace('{feature}', feature)}
      </p>
      <button
        type="button"
        onClick={() => setActiveTab('upgrade')}
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-500/40 bg-amber-400/20 px-6 py-3 text-xs font-black uppercase tracking-widest text-amber-700 dark:text-amber-300 cursor-pointer transition-all hover:scale-105 active:scale-95"
      >
        {t.upgradeCta}
      </button>
    </div>
  );
}
