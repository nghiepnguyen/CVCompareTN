import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Check, CheckCircle2, AlertCircle, Activity, Target, ChevronDown, ChevronUp, X } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { useUI } from '../../../context/UIContext';
import {
  AnalysisResult,
  deriveRequirementInsights,
  formatProbability,
  probabilityTone,
  resolveProbability,
  SCORE_HIGH_MIN,
  SCORE_MEDIUM_MIN,
} from '../../../services/ai';
import { getMatchingCategoryLabel } from './matchingCategoryLabels';
import { FormatAssessmentCard } from './FormatAssessmentCard';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';

interface AnalysisDetailsTabProps {
  selectedResult: AnalysisResult;
}

export const AnalysisDetailsTab = React.memo(function AnalysisDetailsTab({ selectedResult }: AnalysisDetailsTabProps) {
  const { t, reportLanguage } = useUI();
  // Canonical analyses whose Vietnamese localization fell back to English.
  const showsEnglishFallback =
    !!selectedResult.scoreVersion && selectedResult.presentationLanguage === 'en' && reportLanguage === 'vi';
  const [openSections, setOpenSections] = React.useState<string[]>(['matching']);

  // Stage 3.12B: requirement lists come from canonical detailedComparison.
  // matchingPoints/missingGaps are read only for genuinely legacy results with
  // no usable canonical table (history compatibility).
  // Stage 3.13C: one resolver decides canonical vs legacy vs unknown version.
  const probability = resolveProbability(selectedResult, 'analysis');
  const probabilityValue = formatProbability(probability);
  const showPassExplanation = probability.source === 'legacy' && !!selectedResult.passExplanation;

  const requirementInsights = React.useMemo(
    () => deriveRequirementInsights(selectedResult.detailedComparison, {
      matchingPoints: selectedResult.matchingPoints,
      missingGaps: selectedResult.missingGaps,
    }),
    [selectedResult.detailedComparison, selectedResult.matchingPoints, selectedResult.missingGaps]
  );

  // Single source of truth for both charts: AI's own categoryScores, so the bar
  // and radar always agree and share the same category set/order.
  const categoryChartData = React.useMemo(() => {
    const CATEGORY_KEYS: { key: keyof NonNullable<AnalysisResult['categoryScores']>; category: string }[] = [
      { key: 'skills', category: 'Skills' },
      { key: 'softSkills', category: 'Soft Skills' },
      { key: 'hardSkills', category: 'Hard Skills' },
      { key: 'technicalSkills', category: 'Technical Skills' },
      { key: 'experience', category: 'Experience' },
      { key: 'tools', category: 'Tools' },
      { key: 'languageSkills', category: 'Language Skills' },
      { key: 'education', category: 'Education' },
    ];

    const hasEvidence = new Set<string>();
    [...requirementInsights.matched, ...requirementInsights.partial, ...requirementInsights.missing]
      .forEach((item) => item.category && hasEvidence.add(item.category));

    return CATEGORY_KEYS.map(({ key, category }) => {
      const score = selectedResult.categoryScores?.[key];
      // A 0 with no matching/missing evidence means the AI never assessed this
      // category (e.g. JD has no language requirement) — not an actual score of 0.
      const evaluated = (typeof score === 'number' && score > 0) || hasEvidence.has(category);
      return {
        name: getMatchingCategoryLabel(category, t),
        value: typeof score === 'number' ? score : 0,
        evaluated,
      };
    }).filter((d) => d.evaluated);
  }, [selectedResult.categoryScores, requirementInsights, t]);

  return (
    <div id="analysis-content" className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 scroll-mt-24">
      {showsEnglishFallback && (
        <p className="rounded-2xl border border-border bg-surface-secondary px-4 py-3 text-sm text-text-muted">
          {t.analysisShownInEnglish}
        </p>
      )}
      {/* ATS Score Card */}
      <div className="bg-surface p-5 sm:p-8 rounded-3xl shadow-sm border border-border flex flex-col md:flex-row items-center gap-8">
        <div className="relative shrink-0">
          <svg className="w-32 h-32 transform -rotate-90">
            <circle
              cx="64"
              cy="64"
              r="58"
              stroke="currentColor"
              strokeWidth="8"
              fill="transparent"
              className="text-surface-muted"
            />
            <motion.circle
              cx="64"
              cy="64"
              r="58"
              stroke="currentColor"
              strokeWidth="8"
              fill="transparent"
              strokeDasharray={364.4}
              initial={{ strokeDashoffset: 364.4 }}
              animate={{ strokeDashoffset: 364.4 - (364.4 * selectedResult.matchScore) / 100 }}
              strokeLinecap="round"
              className={cn(
                selectedResult.matchScore >= SCORE_HIGH_MIN ? "text-success" :
                selectedResult.matchScore >= SCORE_MEDIUM_MIN ? "text-accent" : "text-warning"
              )}
            />
          </svg>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
            <span className="text-4xl font-black text-text-main leading-none">{selectedResult.matchScore}</span>
            <span className="text-xs font-bold text-text-light block">/ 100</span>
          </div>
        </div>
        <div className="text-center md:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-accent-light text-accent rounded-full text-[10px] font-black uppercase tracking-widest mb-2">
            <Sparkles className="w-3 h-3" />
            {t.atsCompatibilityScore}
          </div>
          <h3 className="text-2xl font-black text-text-main mb-2">{t.atsScore}</h3>
          <p className="text-sm text-text-muted max-w-md leading-relaxed mb-4">
            {t.atsDesc}
          </p>
          <div className="bg-surface-secondary p-4 rounded-2xl border border-border">
            <p className="text-sm font-medium text-text-main leading-relaxed">
              {selectedResult.matchScore >= SCORE_HIGH_MIN
                ? t.matchVerdictHigh
                : selectedResult.matchScore >= SCORE_MEDIUM_MIN
                ? t.matchVerdictMid
                : t.matchVerdictLow}
            </p>
          </div>
        </div>
      </div>

      <FormatAssessmentCard formatAssessment={selectedResult.formatAssessment} />

      {/* Score Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="min-w-0 bg-surface p-6 rounded-3xl shadow-sm border border-border">
          <h4 className="text-sm font-bold text-text-main mb-6">{t.scoreDistribution}</h4>
          <div className="h-64 min-h-[256px] w-full min-w-0 shrink-0">
            {categoryChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={256} debounce={32} minWidth={0}>
              <BarChart data={categoryChartData.map((d) => ({ label: d.name, score: d.value }))} margin={{ bottom: 24 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                <XAxis dataKey="label" fontSize={10} tick={{ fill: 'var(--color-text-light)' }} axisLine={{ stroke: 'var(--color-border)' }} angle={-35} textAnchor="end" interval={0} height={50} />
                <YAxis fontSize={10} tick={{ fill: 'var(--color-text-light)' }} axisLine={{ stroke: 'var(--color-border)' }} />
                <Tooltip cursor={{fill: 'transparent'}} contentStyle={{ backgroundColor: 'var(--color-surface-secondary)', border: '1px solid var(--color-border)', borderRadius: '8px', color: 'var(--color-text-main)' }} />
                <Bar dataKey="score" fill="var(--color-accent)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center px-4 text-text-muted text-sm">
                <p>{t.noChartMatchingPoints}</p>
              </div>
            )}
          </div>
        </div>

        <div className="min-w-0 bg-surface p-6 rounded-3xl shadow-sm border border-border">
          <h4 className="text-sm font-bold text-text-main mb-6">{t.skillDistribution}</h4>
          <div className="h-64 min-h-[256px] w-full min-w-0 shrink-0">
            {categoryChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={256} debounce={32} minWidth={0}>
              <RadarChart data={categoryChartData} outerRadius="70%">
                <PolarGrid stroke="var(--color-border)" />
                <PolarAngleAxis dataKey="name" fontSize={10} tick={{ fill: 'var(--color-text-light)' }} />
                <PolarRadiusAxis domain={[0, 100]} tickCount={5} fontSize={10} tick={{ fill: 'var(--color-text-light)' }} allowDecimals={false} />
                <Radar
                  dataKey="value"
                  stroke="var(--color-accent)"
                  fill="var(--color-accent)"
                  fillOpacity={0.4}
                />
                <Tooltip
                  formatter={(value: number) => [`${value}%`, t.skillDistribution]}
                  contentStyle={{ backgroundColor: 'var(--color-surface-secondary)', border: '1px solid var(--color-border)', borderRadius: '8px', color: 'var(--color-text-main)' }}
                />
              </RadarChart>
            </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center px-4 text-text-muted text-sm">
                <p>{t.noChartMatchingPoints}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Pass Probability Section */}
      <div className="min-w-0 bg-surface p-6 rounded-3xl shadow-sm border border-border">
        <div className="flex flex-col md:flex-row md:items-center gap-6">
          <div className="flex flex-col items-center justify-center p-6 bg-surface-secondary rounded-2xl min-w-[200px]">
            <div className="text-[10px] font-black text-text-light uppercase tracking-widest mb-2 text-center">{t.passProb}</div>
            <div className={cn(
              "text-3xl font-black px-6 py-2 rounded-xl",
              probabilityTone(probability.value) === 'high' ? "bg-success-light text-success" :
              probabilityTone(probability.value) === 'medium' ? "bg-accent-light text-accent" : "bg-warning-light text-warning"
            )}>
              {probabilityValue}
            </div>
          </div>
          <div className="flex-1 space-y-4">
            {showPassExplanation && (
              <div>
                <h4 className="text-sm font-bold text-text-main flex items-center gap-2 mb-1">
                  <AlertCircle className="w-4 h-4 text-accent" />
                  {t.explanation}
                </h4>
                <p className="text-sm text-text-muted leading-relaxed">{selectedResult.passExplanation}</p>
              </div>
            )}
            <div>
              <h4 className="text-sm font-bold text-text-main flex items-center gap-2 mb-1">
                <Target className="w-4 h-4 text-accent" />
                {t.mainFactor}
              </h4>
              <p className="text-sm text-text-muted font-medium">{selectedResult.mainFactor}</p>
            </div>
          </div>
        </div>
      </div>

      {requirementInsights.matched.length === 0 &&
        requirementInsights.partial.length === 0 &&
        requirementInsights.missing.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-surface-secondary/80 px-4 py-3 text-center text-sm text-text-muted">
          {t.noMatchingGapsData}
        </div>
      )}

      <div className="space-y-4">
        {[
          {
            id: 'matching', items: requirementInsights.matched,
            title: t.matchingPoints, desc: t.matchingPointsDesc, countLabel: t.matchingPointsCount,
            icon: CheckCircle2, bulletIcon: Check,
            iconWrap: 'bg-success-light text-success',
            pill: 'bg-success-light text-success border-success-light',
            dot: 'bg-success shadow-[0_0_8px_rgba(16,185,129,0.5)]',
            item: 'bg-success-light/10 border-success-light/30 hover:border-success-light',
            bullet: 'text-success',
          },
          {
            id: 'partial', items: requirementInsights.partial,
            title: t.partialRequirements, desc: t.partialRequirementsDesc, countLabel: t.partialRequirementsCount,
            icon: Activity, bulletIcon: Activity,
            iconWrap: 'bg-accent-light text-accent',
            pill: 'bg-accent-light text-accent border-accent/20',
            dot: 'bg-accent shadow-[0_0_8px_rgba(var(--color-accent-rgb),0.5)]',
            item: 'bg-accent-light/10 border-accent/20 hover:border-accent/40',
            bullet: 'text-accent',
          },
          {
            id: 'missing', items: requirementInsights.missing,
            title: t.missingGaps, desc: t.missingGapsDesc, countLabel: t.missingGapsCount,
            icon: AlertCircle, bulletIcon: X,
            iconWrap: 'bg-warning-light text-warning',
            pill: 'bg-warning-light text-warning border-warning-light',
            dot: 'bg-warning shadow-[0_0_8px_rgba(245,158,11,0.5)]',
            item: 'bg-warning-light/10 border-warning-light/30 hover:border-warning-light',
            bullet: 'text-warning',
          },
        ].filter((section) => section.id !== 'partial' || section.items.length > 0).map((section) => {
          const Icon = section.icon;
          const BulletIcon = section.bulletIcon;
          const isOpen = openSections.includes(section.id);
          return (
            <div key={section.id} className="bg-surface rounded-3xl shadow-sm border border-border overflow-hidden transition-all duration-300">
              <button
                onClick={() => setOpenSections(prev => prev.includes(section.id) ? prev.filter(s => s !== section.id) : [...prev, section.id])}
                className="w-full px-6 py-5 flex items-center justify-between hover:bg-surface-secondary transition-colors text-left"
              >
                <div className="flex items-center gap-4">
                  <div className={cn('w-10 h-10 rounded-2xl flex items-center justify-center', section.iconWrap)}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-text-main">{section.title}</h4>
                    <p className="text-xs text-text-light font-medium">{section.desc}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={cn('px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border shadow-sm', section.pill)}>
                    {section.items.length} {section.countLabel}
                  </span>
                  {isOpen ? <ChevronUp className="w-5 h-5 text-text-light" /> : <ChevronDown className="w-5 h-5 text-text-light" />}
                </div>
              </button>

              <AnimatePresence>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: 'easeInOut' }}
                  >
                    <div className="px-6 pb-8 pt-2 border-t border-border">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-4">
                        {Array.from(new Set(section.items.map((item) => item.category))).map((category) => {
                          const items = section.items.filter((item) => item.category === category);
                          if (items.length === 0) return null;
                          return (
                            <div key={category} className="space-y-4">
                              <div className="text-[11px] font-black text-text-main uppercase tracking-widest flex items-center gap-2">
                                <div className={cn('w-2 h-2 rounded-full', section.dot)} />
                                {getMatchingCategoryLabel(category, t)}
                              </div>
                              <ul className="space-y-3">
                                {items.map((item, i) => (
                                  <li key={i} className={cn('text-sm text-text-main font-medium flex items-start gap-3 p-4 rounded-2xl border transition-all group', section.item)}>
                                    <BulletIcon className={cn('w-4 h-4 shrink-0 mt-0.5 group-hover:scale-110 transition-transform', section.bullet)} />
                                    <span className="leading-relaxed">
                                      <span className="block">
                                        {item.requirement}
                                        {item.priority && (
                                          <span className={cn(
                                            'ml-2 inline-block align-middle rounded border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider',
                                            item.priority === 'required'
                                              ? 'border-border bg-surface-secondary text-text-main'
                                              : 'border-border bg-surface text-text-light',
                                          )}>
                                            {item.priority === 'required' ? t.requiredRequirement : t.preferredRequirement}
                                          </span>
                                        )}
                                      </span>
                                      {item.cvEvidence && (
                                        <span className="mt-1 block text-[11px] font-normal italic text-text-muted">{item.cvEvidence}</span>
                                      )}
                                      {!item.cvEvidence && item.improvement && (
                                        <span className="mt-1 block text-[11px] font-normal italic text-text-muted">{item.improvement}</span>
                                      )}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
});

