// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { UI_LABELS } from '../../translations';
import { CANONICAL_PROBABILITY_VERSION } from '../../services/ai/canonicalProbability';
import type { AnalysisResult } from '../../services/ai';
import type { CandidateCV } from '../../context/recruiter';

const state = vi.hoisted(() => ({ history: [] as AnalysisResult[] }));

vi.mock('../../context/UIContext', () => ({
  useUI: () => ({ t: UI_LABELS.en, setActiveTab: vi.fn(), reportLanguage: 'en', isDarkMode: false }),
}));

vi.mock('../../context/AnalysisContext', () => ({
  useAnalysis: () => ({
    history: state.history,
    setHistory: vi.fn(),
    clearHistory: vi.fn(),
    deleteHistoryItem: vi.fn(),
    setSelectedResult: vi.fn(),
    setResults: vi.fn(),
    isLoadingHistory: false,
  }),
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, effectivePlan: 'pro' }),
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => children ?? null,
  AreaChart: () => null,
  Area: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  BarChart: () => null,
  Bar: () => null,
  Cell: () => null,
}));

import { HistoryView } from '../../components/views/HistoryView';
import { ComparisonOverview } from '../../components/views/result/ComparisonOverview';
import { CandidatePanel } from '../../components/recruiter/CandidatePanel';

const base = {
  id: 'c1',
  timestamp: 1,
  jobTitle: 'Data Analyst',
  jdTitle: 'Data Analyst JD',
  cvName: 'Canonical CV',
  matchScore: 80,
  categoryScores: { skills: 80, softSkills: 80, hardSkills: 80, technicalSkills: 80, experience: 80, tools: 80, languageSkills: 0, education: 80 },
  matchingPoints: [],
  missingGaps: [],
  atsKeywords: [],
  rewriteSuggestions: [],
  detailedComparison: { skills: [], experience: [], tools: [], education: [], keywords: [] },
  mainFactor: 'SQL experience',
} as unknown as AnalysisResult;

const canonical: AnalysisResult = {
  ...base,
  id: 'canonical',
  cvName: 'Canonical CV',
  successProbability: 'High',
  passProbability: 'Medium',
  probabilityVersion: CANONICAL_PROBABILITY_VERSION,
  passExplanation: 'Model prose',
};

const legacy: AnalysisResult = {
  ...base,
  id: 'legacy',
  cvName: 'Legacy CV',
  matchScore: 90,
  successProbability: 'High',
  passProbability: 'Low',
  passExplanation: 'Legacy prose',
};

const candidate = {
  id: 'candidate-1',
  campaignId: 'campaign-1',
  candidateName: 'Canonical Candidate',
  fileName: 'cv.pdf',
  filePath: 'path/cv.pdf',
  fileSize: 1,
  parsedText: null,
  analysisResult: canonical as unknown as Record<string, unknown>,
  matchScore: 80,
  status: 'done',
  errorMessage: null,
  hrStatus: 'new',
  hrNote: null,
  analyzedAt: '2026-10-29T00:00:00Z',
  createdAt: '2026-10-29T00:00:00Z',
} as unknown as CandidateCV;

afterEach(cleanup);

describe('probability consumer migration — Stage 3.13C', () => {
  it('HistoryView reads canonical passProbability and keeps legacy successProbability', () => {
    state.history = [canonical, legacy];
    render(<HistoryView />);

    expect(screen.getAllByText('Screening probability').length).toBeGreaterThan(0);
    expect(screen.getByText('Medium')).toBeTruthy(); // canonical
    expect(screen.getByText('High')).toBeTruthy(); // legacy successProbability
    expect(screen.queryByText('Low')).toBeNull(); // legacy passProbability is not read
  });

  it('ComparisonOverview reads canonical passProbability and keeps legacy successProbability', () => {
    render(<ComparisonOverview results={[canonical, legacy]} setSelectedResult={vi.fn()} />);

    expect(screen.getAllByText('Screening probability').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Medium').length).toBeGreaterThan(0);
    expect(screen.getAllByText('High').length).toBeGreaterThan(0);
    expect(screen.queryByText('Low')).toBeNull();
  });

  it('CandidatePanel reads canonical passProbability, never the successProbability mirror', () => {
    render(
      <CandidatePanel
        candidate={candidate}
        onClose={vi.fn()}
        onUpdateHrStatus={vi.fn()}
      />
    );

    expect(screen.getAllByText('Screening probability').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Medium').length).toBeGreaterThan(0);
    expect(screen.queryByText('High')).toBeNull();
  });
});
