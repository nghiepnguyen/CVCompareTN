import React from 'react';
import { motion } from 'motion/react';
import { LayoutDashboard, History as HistoryIcon, Bookmark, Settings } from 'lucide-react';
import { cn } from '../lib/utils';
import type { Tab } from '../context/UIContext';
import type { AnalysisResult } from '../services/ai';

export interface MobileBottomNavProps {
  activeTab: Tab;
  selectedResult: AnalysisResult | null;
  setActiveTab: (tab: Tab) => void;
  setSelectedResult: (result: null) => void;
  onOpenSavedJds: () => void;
  showAdmin: boolean;
  labels: {
    analyze: string;
    history: string;
    mobileJdStore: string;
    admin: string;
  };
}

export function MobileBottomNav({
  activeTab,
  selectedResult,
  setActiveTab,
  setSelectedResult,
  onOpenSavedJds,
  showAdmin,
  labels,
}: MobileBottomNavProps) {
  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-surface/90 backdrop-blur-xl border-t border-border px-4 py-2 flex items-center justify-around pb-safe">
      {(
        [
          { tab: 'analyze' as const, icon: LayoutDashboard, label: labels.analyze },
          { tab: 'history' as const, icon: HistoryIcon, label: labels.history },
        ] as const
      ).map((item) => (
        <button
          key={item.tab}
          type="button"
          onClick={() => {
            setActiveTab(item.tab);
            setSelectedResult(null);
          }}
          className={cn(
            'flex flex-col items-center gap-1 p-2 min-w-[64px] transition-all active:scale-90 cursor-pointer hover:scale-105',
            activeTab === item.tab && !selectedResult ? 'text-accent' : 'text-text-light'
          )}
        >
          <item.icon
            className={cn(
              'w-6 h-6',
              activeTab === item.tab && !selectedResult ? 'stroke-[2.5px]' : 'stroke-2'
            )}
          />
          <span className="text-[10px] font-bold uppercase tracking-tight">{item.label}</span>
          {activeTab === item.tab && !selectedResult && (
            <motion.div layoutId="activeTabDot" className="w-1 h-1 bg-accent rounded-full" />
          )}
        </button>
      ))}
      <button
        type="button"
        onClick={onOpenSavedJds}
        className="flex flex-col items-center gap-1 p-2 min-w-[64px] transition-all active:scale-90 cursor-pointer hover:scale-105 text-text-light"
      >
        <Bookmark className="w-6 h-6 stroke-2" />
        <span className="text-[10px] font-bold uppercase tracking-tight">{labels.mobileJdStore}</span>
      </button>
      {showAdmin && (
        <button
          type="button"
          onClick={() => {
            setActiveTab('admin');
            setSelectedResult(null);
          }}
          className={cn(
            'flex flex-col items-center gap-1 p-2 min-w-[64px] transition-all active:scale-90 cursor-pointer hover:scale-105',
            activeTab === 'admin' ? 'text-accent' : 'text-text-light'
          )}
        >
          <Settings className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-tight">{labels.admin}</span>
        </button>
      )}
    </nav>
  );
}
