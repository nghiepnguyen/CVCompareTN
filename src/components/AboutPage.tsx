import React from 'react';
import { ArrowLeft, Users, Target, Code, Heart, Sparkles, MessageCircle } from 'lucide-react';
import { useUI } from '../context/UIContext';
import { cn } from '../lib/utils';

export function AboutPage({ onBack }: { onBack: () => void }) {
  const { t, setActiveTab } = useUI();

  return (
    <div className="max-w-4xl mx-auto py-8 sm:py-12 px-4">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs font-bold text-text-light mb-8">
        <button
          type="button"
          onClick={onBack}
          className="hover:text-accent transition-colors cursor-pointer"
        >
          {t.aboutBackHome}
        </button>
        <span>/</span>
        <span className="text-text-muted">{t.aboutPageTitle}</span>
      </nav>

      {/* Hero */}
      <div className="mb-16">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-text-main tracking-tight mb-4 font-sans">
          {t.aboutHeroTitle}
        </h1>
        <p className="text-base text-text-muted leading-relaxed max-w-2xl">
          {t.aboutHeroSub}
        </p>
      </div>

      {/* Mission */}
      <section className="mb-14">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
            <Target className="w-5 h-5 text-accent" />
          </div>
          <h2 className="text-xl font-bold text-text-main">{t.aboutMissionTitle}</h2>
        </div>
        <p className="text-sm text-text-muted leading-relaxed pl-13">{t.aboutMissionBody}</p>
      </section>

      {/* Story */}
      <section className="mb-14">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
            <Heart className="w-5 h-5 text-emerald-500" />
          </div>
          <h2 className="text-xl font-bold text-text-main">{t.aboutStoryTitle}</h2>
        </div>
        <p className="text-sm text-text-muted leading-relaxed pl-13">{t.aboutStoryBody}</p>
      </section>

      {/* Technology */}
      <section className="mb-14">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
            <Code className="w-5 h-5 text-purple-500" />
          </div>
          <h2 className="text-xl font-bold text-text-main">{t.aboutTechTitle}</h2>
        </div>
        <p className="text-sm text-text-muted leading-relaxed pl-13">{t.aboutTechBody}</p>
      </section>

      {/* Team */}
      <section className="mb-14">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <Users className="w-5 h-5 text-blue-500" />
          </div>
          <h2 className="text-xl font-bold text-text-main">{t.aboutTeamTitle}</h2>
        </div>
        <p className="text-sm text-text-muted leading-relaxed pl-13">{t.aboutTeamBody}</p>
      </section>

      {/* Contact */}
      <section className="mb-14">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
            <MessageCircle className="w-5 h-5 text-amber-500" />
          </div>
          <h2 className="text-xl font-bold text-text-main">{t.aboutContactTitle}</h2>
        </div>
        <p className="text-sm text-text-muted leading-relaxed pl-13">{t.aboutContactBody}</p>
      </section>

      {/* CTA */}
      <div className="mt-16 p-8 rounded-3xl bg-white/[0.03] border border-white/[0.06] text-center">
        <h3 className="text-lg font-bold text-text-main mb-3">{t.aboutHeroSub}</h3>
        <button
          type="button"
          onClick={() => {
            setActiveTab('analyze');
            window.scrollTo(0, 0);
          }}
          className={cn(
            'inline-flex items-center gap-2 px-6 py-3 rounded-xl',
            'bg-accent text-white font-bold text-sm',
            'hover:bg-accent-hover transition-all cursor-pointer',
            'hover:scale-105 active:scale-95'
          )}
        >
          <Sparkles className="w-4 h-4" />
          {t.aboutCta}
        </button>
      </div>
    </div>
  );
}