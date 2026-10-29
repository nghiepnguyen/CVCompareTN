// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { UI_LABELS } from '../../translations';
import { CANONICAL_PROBABILITY_VERSION } from '../../services/ai/canonicalProbability';
import type { AnalysisResult } from '../../services/ai';

vi.mock('../../context/UIContext', () => ({
  useUI: () => ({ t: UI_LABELS.en, reportLanguage: 'en' }),
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: () => null,
  BarChart: () => null,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  RadarChart: () => null,
  PolarGrid: () => null,
  PolarAngleAxis: () => null,
  PolarRadiusAxis: () => null,
  Radar: () => null,
}));

import { AnalysisDetailsTab } from '../../components/views/result/AnalysisDetailsTab';

const result = {
  id: 'r1',
  timestamp: 0,
  matchScore: 78,
  categoryScores: {
    skills: 80, softSkills: 70, hardSkills: 75, technicalSkills: 80,
    experience: 70, tools: 75, languageSkills: 60, education: 80,
  },
  successProbability: 'Medium',
  passProbability: 'Medium',
  passExplanation: 'Some evidence.',
  mainFactor: 'Role fit',
  atsKeywords: ['SQL'],
  rewriteSuggestions: [],
  matchingPoints: [{ category: 'Skills', content: 'Legacy strength' }],
  missingGaps: [
    { category: 'Skills', content: 'Legacy gap', impact: 'High' },
    { category: 'Skills', content: 'communication / problem solving', impact: 'High' },
  ],
  detailedComparison: {
    skills: [
      { requirement: 'SQL', status: 'matched', priority: 'required', cvEvidence: 'Wrote SQL models' },
      { requirement: 'Looker', status: 'partial', priority: 'required' },
    ],
    experience: [],
    tools: [{ requirement: 'Airflow', status: 'missing', priority: 'nice-to-have' }],
    education: [],
    keywords: [],
  },
  formatAssessment: undefined,
} as unknown as AnalysisResult;

describe('AnalysisDetailsTab — Stage 3.12B requirement authority', () => {
  afterEach(cleanup);

  it('renders canonical matched/partial/missing requirements and ignores free-text duplicates', async () => {
    render(<AnalysisDetailsTab selectedResult={result} />);

    expect(screen.getByText('SQL')).toBeTruthy();
    expect(screen.queryByText('Legacy strength')).toBeNull();

    fireEvent.click(screen.getByText('Partial Requirements'));
    await waitFor(() => expect(screen.getByText('Looker')).toBeTruthy());

    fireEvent.click(screen.getByText('Missing Gaps'));
    await waitFor(() => expect(screen.getByText('Airflow')).toBeTruthy());

    expect(screen.queryByText('Legacy gap')).toBeNull();
    expect(screen.queryByText('communication / problem solving')).toBeNull();
  });
});


describe('AnalysisDetailsTab — Stage 3.13C probability authority', () => {
  afterEach(cleanup);

  it('canonical row renders canonical passProbability and hides model explanation', () => {
    render(<AnalysisDetailsTab selectedResult={{
      ...result,
      probabilityVersion: CANONICAL_PROBABILITY_VERSION,
      passProbability: 'Medium',
      successProbability: 'High',
      passExplanation: 'Model prose that must not render.',
    } as AnalysisResult} />);

    expect(screen.getByText('Medium')).toBeTruthy();
    expect(screen.queryByText('High')).toBeNull();
    expect(screen.queryByText('Model prose that must not render.')).toBeNull();
  });

  it('canonical row with missing passProbability renders an em dash, never successProbability', () => {
    render(<AnalysisDetailsTab selectedResult={{
      ...result,
      probabilityVersion: CANONICAL_PROBABILITY_VERSION,
      passProbability: '',
      successProbability: 'High',
      passExplanation: 'Model prose.',
    } as AnalysisResult} />);

    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.queryByText('High')).toBeNull();
  });

  it('legacy row keeps the stored passProbability and its explanation', () => {
    render(<AnalysisDetailsTab selectedResult={{
      ...result,
      passProbability: 'Medium',
      successProbability: 'High',
      passExplanation: 'Legacy evidence.',
    } as AnalysisResult} />);

    expect(screen.getByText('Medium')).toBeTruthy();
    expect(screen.getByText('Legacy evidence.')).toBeTruthy();
  });

  it('unknown version preserves stored value and never keeps model prose', () => {
    render(<AnalysisDetailsTab selectedResult={{
      ...result,
      probabilityVersion: 'canonical-score-v2',
      passProbability: 'Low',
      successProbability: 'High',
      passExplanation: 'Future prose.',
    } as AnalysisResult} />);

    expect(screen.getByText('Low')).toBeTruthy();
    expect(screen.queryByText('High')).toBeNull();
    expect(screen.queryByText('Future prose.')).toBeNull();
  });
});
