import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Save,
  Clock,
  Loader2,
  Target,
  FileSearch,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  TrendingDown,
  Zap,
  Eye,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useUI } from '../../context/UIContext';
import type { CandidateCV, HrStatus } from '../../context/recruiter';

interface CandidatePanelProps {
  candidate: CandidateCV | null;
  jdContent?: string;
  onClose: () => void;
  onUpdateHrStatus: (candidateId: string, status: HrStatus, note?: string) => Promise<void>;
}

function ScoreGauge({
  score,
  size = 'lg',
}: {
  score: number | null;
  size?: 'sm' | 'lg';
}) {
  const pct = score ?? 0;
  const color =
    score == null
      ? 'text-text-muted'
      : score >= 80
        ? 'text-success'
        : score >= 60
          ? 'text-amber-500'
          : 'text-error';
  const bg =
    score == null
      ? 'bg-text-muted'
      : score >= 80
        ? 'bg-success'
        : score >= 60
          ? 'bg-amber-500'
          : 'bg-error';

  const dims = size === 'lg' ? 'h-20 w-20' : 'h-14 w-14';
  const fontSize = size === 'lg' ? 'text-xl' : 'text-base';

  return (
    <div className={cn('relative flex items-center justify-center shrink-0', dims)}>
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 72 72">
        <circle
          cx="36"
          cy="36"
          r="31"
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          className="text-surface-secondary"
        />
        <circle
          cx="36"
          cy="36"
          r="31"
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
          className={color}
          strokeDasharray={`${2 * Math.PI * 31}`}
          strokeDashoffset={`${2 * Math.PI * 31 * (1 - pct / 100)}`}
          style={{ transition: 'stroke-dashoffset 0.8s ease' }}
        />
      </svg>
      <span className={cn('font-extrabold tabular-nums relative z-10', fontSize, color)}>
        {score != null ? score : '—'}
      </span>
    </div>
  );
}

export function CandidatePanel({
  candidate,
  jdContent,
  onClose,
  onUpdateHrStatus,
}: CandidatePanelProps) {
  const { t } = useUI();
  const [hrNote, setHrNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [noteStatus, setNoteStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [showJd, setShowJd] = useState(false);

  React.useEffect(() => {
    setHrNote(candidate?.hrNote ?? '');
    setShowJd(false);
  }, [candidate?.id, candidate?.hrNote]);

  const handleHrStatusChange = async (status: HrStatus) => {
    if (!candidate) return;
    setSaving(true);
    try {
      await onUpdateHrStatus(candidate.id, status, hrNote);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNote = async () => {
    if (!candidate) return;
    setNoteStatus('saving');
    try {
      await onUpdateHrStatus(candidate.id, candidate.hrStatus, hrNote);
      setNoteStatus('saved');
      setTimeout(() => setNoteStatus('idle'), 2500);
    } catch {
      setNoteStatus('error');
      setTimeout(() => setNoteStatus('idle'), 4000);
    }
  };

  const hrStatusOptions: { value: HrStatus; label: string; color: string }[] = [
    {
      value: 'new',
      label: t.tableHrStatusNew,
      color: 'border-border text-text-muted',
    },
    {
      value: 'shortlisted',
      label: t.tableHrStatusShortlisted,
      color: 'border-amber-500/30 text-amber-600 bg-amber-400/5',
    },
    {
      value: 'interviewing',
      label: t.tableHrStatusInterviewing,
      color: 'border-accent/30 text-accent bg-accent/5',
    },
    {
      value: 'rejected',
      label: t.tableHrStatusRejected,
      color: 'border-error/30 text-error bg-error/5',
    },
    {
      value: 'hired',
      label: t.tableHrStatusHired,
      color: 'border-success/30 text-success bg-success/5',
    },
  ];

  return (
    <AnimatePresence>
      {candidate && (
        <>
          {/* Mobile: Bottom Sheet */}
          <motion.div
            className="fixed inset-0 z-50 lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />
            <motion.div
              className="absolute bottom-0 left-0 right-0 max-h-[90vh] bg-surface border-t border-border rounded-t-2xl overflow-y-auto"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            >
              <CandidateDetail
                t={t}
                candidate={candidate}
                jdContent={jdContent}
                showJd={showJd}
                setShowJd={setShowJd}
                hrNote={hrNote}
                setHrNote={setHrNote}
                noteStatus={noteStatus}
                hrStatusOptions={hrStatusOptions}
                onHrStatusChange={handleHrStatusChange}
                onSaveNote={handleSaveNote}
                onClose={onClose}
                saving={saving}
              />
            </motion.div>
          </motion.div>

          {/* Desktop: Side Panel */}
          <div className="hidden lg:block w-80 xl:w-96 border-l border-border bg-surface/60 backdrop-blur-sm overflow-y-auto shrink-0">
            <CandidateDetail
              t={t}
              candidate={candidate}
              jdContent={jdContent}
              showJd={showJd}
              setShowJd={setShowJd}
              hrNote={hrNote}
              setHrNote={setHrNote}
              noteStatus={noteStatus}
              hrStatusOptions={hrStatusOptions}
              onHrStatusChange={handleHrStatusChange}
              onSaveNote={handleSaveNote}
              onClose={onClose}
              saving={saving}
            />
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

function StatusBadge({ candidate, t }: { candidate: CandidateCV; t: any }) {
  if (candidate.status === 'analyzing') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-accent/10 text-accent border border-accent/20">
        <Loader2 className="w-2.5 h-2.5 animate-spin" />
        {t.panelStatusAnalyzing}
      </span>
    );
  }
  if (candidate.status === 'pending') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-surface-secondary text-text-muted border border-border">
        <Clock className="w-2.5 h-2.5" />
        {t.panelStatusPending}
      </span>
    );
  }
  if (candidate.status === 'error') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-error/10 text-error border border-error/20">
        <AlertTriangle className="w-2.5 h-2.5" />
        {t.panelStatusError}
      </span>
    );
  }
  return null;
}

function CandidateDetail({
  t,
  candidate,
  jdContent,
  showJd,
  setShowJd,
  hrNote,
  setHrNote,
  noteStatus,
  hrStatusOptions,
  onHrStatusChange,
  onSaveNote,
  onClose,
  saving,
}: {
  t: any;
  candidate: CandidateCV;
  jdContent?: string;
  showJd: boolean;
  setShowJd: (v: boolean) => void;
  hrNote: string;
  setHrNote: (note: string) => void;
  noteStatus: 'idle' | 'saving' | 'saved' | 'error';
  hrStatusOptions: { value: HrStatus; label: string; color: string }[];
  onHrStatusChange: (status: HrStatus) => Promise<void>;
  onSaveNote: () => Promise<void>;
  onClose: () => void;
  saving: boolean;
}) {
  const result = candidate.analysisResult as Record<string, unknown> | null;
  const isDone = candidate.status === 'done';

  const matchedSkills: string[] = Array.isArray((result as any)?.matched)
    ? (result as any).matched
    : [];
  const missingSkills: string[] = Array.isArray((result as any)?.missing)
    ? (result as any).missing
    : [];

  return (
    <div className="divide-y divide-border">
      {/* ---- Header ---- */}
      <div className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-black text-text-main truncate leading-tight">
              {candidate.candidateName || candidate.fileName}
            </h3>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <StatusBadge candidate={candidate} t={t} />
              {candidate.fileName && (
                <span className="text-[10px] text-text-muted truncate flex items-center gap-1">
                  <FileText className="w-3 h-3" />
                  {candidate.fileName}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-lg text-text-muted hover:text-text-main cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Verdict */}
        {isDone && result && (
          <div className="grid grid-cols-2 gap-2">
            {/* Success Probability */}
            <div className="flex items-center gap-2 bg-surface-secondary border border-border rounded-xl px-3 py-2">
              <Target className="w-4 h-4 text-accent shrink-0" />
              <div className="min-w-0">
                <p className="text-[9px] text-text-muted uppercase tracking-wide">{t.panelProbability}</p>
                <p className="text-[11px] font-extrabold text-text-main truncate">
                  {(result as any)?.successProbability || (result as any)?.passProbability || '—'}
                </p>
              </div>
            </div>
            {/* Main Factor */}
            <div className="flex items-center gap-2 bg-surface-secondary border border-border rounded-xl px-3 py-2">
              <Zap className="w-4 h-4 text-amber-500 shrink-0" />
              <div className="min-w-0">
                <p className="text-[9px] text-text-muted uppercase tracking-wide">{t.panelMainFactor}</p>
                <p className="text-[11px] font-extrabold text-text-main truncate">
                  {(result as any)?.mainFactor || '—'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Score visualization */}
        <div className="flex items-center gap-4">
          <ScoreGauge score={candidate.matchScore} size="lg" />
          <div className="flex-1 space-y-2">
            {isDone && candidate.matchScore != null && (
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] font-extrabold uppercase tracking-wider">
                  <span className="text-text-muted">{t.panelMatchScore}</span>
                  <span
                    className={
                      candidate.matchScore >= 80
                        ? 'text-success'
                        : candidate.matchScore >= 60
                          ? 'text-amber-500'
                          : 'text-error'
                    }
                  >
                    {candidate.matchScore}%
                  </span>
                </div>
                <div className="h-1.5 bg-surface-secondary rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-500',
                      candidate.matchScore >= 80
                        ? 'bg-success'
                        : candidate.matchScore >= 60
                          ? 'bg-amber-500'
                          : 'bg-error',
                    )}
                    style={{ width: `${candidate.matchScore}%` }}
                  />
                </div>
              </div>
            )}
            <div className="flex gap-1.5">
              {candidate.status === 'done' && (
                <>
                  {candidate.matchScore != null && candidate.matchScore >= 80 ? (
                    <span className="text-[10px] font-bold text-success bg-success/10 px-2 py-0.5 rounded-md">
                      {t.panelVerdictPotential}
                    </span>
                  ) : candidate.matchScore != null && candidate.matchScore >= 60 ? (
                    <span className="text-[10px] font-bold text-amber-600 bg-amber-400/10 px-2 py-0.5 rounded-md">
                      {t.panelVerdictConsider}
                    </span>
                  ) : candidate.matchScore != null ? (
                    <span className="text-[10px] font-bold text-error bg-error/10 px-2 py-0.5 rounded-md">
                      {t.panelVerdictNotFit}
                    </span>
                  ) : null}
                </>
              )}
              {candidate.status === 'error' && (
                <span className="text-[10px] text-error">
                  {candidate.errorMessage || t.panelAnalysisError}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ---- HR Status ---- */}
      <div className="p-5 space-y-3">
        <p className="text-[10px] font-extrabold uppercase tracking-wider text-text-muted">
          {t.panelHrStatusLabel}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {hrStatusOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              disabled={saving}
              onClick={() => onHrStatusChange(opt.value)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all cursor-pointer hover:scale-105 active:scale-95',
                candidate.hrStatus === opt.value
                  ? cn(opt.color, 'ring-1 ring-offset-1 ring-current/20')
                  : 'border-border text-text-muted hover:border-text-muted/60',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ---- HR Note ---- */}
      <div className="p-5 space-y-2.5">
        <p className="text-[10px] font-extrabold uppercase tracking-wider text-text-muted">
          {t.panelHrNoteLabel}
        </p>
        <textarea
          value={hrNote}
          onChange={(e) => setHrNote(e.target.value)}
          placeholder={t.panelHrNotePlaceholder}
          rows={3}
          className="w-full bg-surface-secondary border border-border rounded-xl px-3 py-2 text-xs text-text-main placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"
        />
        <button
          type="button"
          disabled={saving || noteStatus === 'saving' || noteStatus === 'saved'}
          onClick={onSaveNote}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-surface-secondary border border-border text-text-main hover:border-accent/30 hover:text-accent cursor-pointer hover:scale-105 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {noteStatus === 'saving' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : noteStatus === 'saved' ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-success" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          {noteStatus === 'saving' ? t.panelSaving : noteStatus === 'saved' ? `${t.panelSaved} ✓` : t.panelSaveNote}
        </button>
        {noteStatus === 'error' && (
          <p className="text-[10px] font-bold text-error">{t.panelSaveError}</p>
        )}
      </div>

      {/* ---- Analysis Results (only if done) ---- */}
      {isDone && (
        <div className="p-5 space-y-4">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-text-muted">
            {t.panelAnalysisResult}
          </p>

          {/* Strengths */}
          {Array.isArray((result as any)?.matchingPoints) && (result as any).matchingPoints.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-success" />
                <span className="text-xs font-semibold text-text-main">
                  {t.panelStrengths} ({(result as any).matchingPoints.length})
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {(result as any).matchingPoints.slice(0, 4).map((pt: any, i: number) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-success/10 text-success border border-success/20"
                  >
                    {pt.content || pt}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Weaknesses */}
          {Array.isArray((result as any)?.missingGaps) && (result as any).missingGaps.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <TrendingDown className="w-3.5 h-3.5 text-error" />
                <span className="text-xs font-semibold text-text-main">
                  {t.panelWeaknesses} ({(result as any).missingGaps.length})
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {(result as any).missingGaps.slice(0, 4).map((gap: any, i: number) => (
                  <span
                    key={i}
                    className={cn(
                      'px-2 py-0.5 rounded-md text-[10px] font-bold border',
                      gap.impact === 'High'
                        ? 'bg-error/10 text-error border-error/20'
                        : gap.impact === 'Medium'
                          ? 'bg-amber-400/10 text-amber-600 border-amber-400/20'
                          : 'bg-surface-secondary text-text-muted border-border',
                    )}
                  >
                    {gap.content || gap}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Category Scores */}
          {candidate.analysisResult && (candidate.analysisResult as any).categoryScores && (
            <div className="space-y-2">
              <p className="text-[9px] font-extrabold uppercase tracking-wider text-text-muted">
                {t.panelCategoryScores}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { key: 'skills', label: t.panelCatSkill },
                  { key: 'experience', label: t.panelCatExperience },
                  { key: 'tools', label: t.panelCatTools },
                  { key: 'education', label: t.panelCatEducation },
                ] as const).map((cat) => {
                  const val = (candidate.analysisResult as any)?.categoryScores?.[cat.key] ?? 0;
                  const valNum = typeof val === 'number' ? val : 0;
                  return (
                    <div
                      key={cat.key}
                      className="bg-surface-secondary border border-border rounded-xl p-2.5"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-bold text-text-main">{cat.label}</span>
                        <span
                          className={cn(
                            'text-xs font-extrabold tabular-nums',
                            valNum >= 80
                              ? 'text-success'
                              : valNum >= 60
                                ? 'text-amber-500'
                                : 'text-error',
                          )}
                        >
                          {valNum}%
                        </span>
                      </div>
                      <div className="h-1 bg-surface rounded-full overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all duration-500',
                            valNum >= 80
                              ? 'bg-success'
                              : valNum >= 60
                                ? 'bg-amber-500'
                                : 'bg-error',
                          )}
                          style={{ width: `${valNum}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Matched Skills */}
          {matchedSkills.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                <span className="text-xs font-semibold text-text-main">
                  {t.panelMatchedSkills} ({matchedSkills.length})
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {matchedSkills.map((skill: string, i: number) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-success/10 text-success border border-success/20"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Missing Skills */}
          {missingSkills.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-error" />
                <span className="text-xs font-semibold text-text-main">
                  {t.panelMissingSkills} ({missingSkills.length})
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {missingSkills.map((skill: string, i: number) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-error/10 text-error border border-error/20"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Full result toggle */}
          {candidate.analysisResult && (
            <details className="group">
              <summary className="text-xs font-bold text-accent cursor-pointer hover:underline list-none flex items-center gap-1">
                <Eye className="w-3.5 h-3.5" />
                {t.panelViewFullDetail}
              </summary>
              <pre className="mt-2 p-3 bg-surface-secondary border border-border rounded-xl text-[10px] text-text-muted overflow-x-auto max-h-48 overflow-y-auto leading-relaxed">
                {JSON.stringify(candidate.analysisResult, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}

      {/* ---- JD Reference ---- */}
      {jdContent && (
        <div className="p-5 space-y-3">
          <button
            type="button"
            onClick={() => setShowJd(!showJd)}
            className="w-full flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-text-muted hover:text-text-main cursor-pointer transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <FileSearch className="w-3.5 h-3.5" />
              {t.detailJdLabel}
            </span>
            {showJd ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
          <AnimatePresence>
            {showJd && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="p-3 bg-surface-secondary border border-border rounded-xl text-[11px] text-text-muted leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap">
                  {jdContent}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}