// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { AnalysisResult, ParsedCV } from '../../services/ai';

vi.mock('../../context/UIContext', () => ({
  useUI: () => ({
    t: new Proxy({}, { get: (_t, key) => String(key) }),
    reportLanguage: 'vi',
  }),
}));

vi.mock('../../context/AnalysisContext', () => ({
  useAnalysis: () => ({ parsedCVGeneratingIds: new Set(['r1']) }),
}));

import { ParsedCVTab } from '../../components/views/result/ParsedCVTab';
import { normalizeParsedCV } from '../../services/ai/parsedCvNormalize';
import { UI_LABELS } from '../../translations';

// Legacy history.parsed_cv shape: still carries relevant_score.
const parsedCV = normalizeParsedCV({
  personal_information: { full_name: 'Nguyen Van A', contact: {}, summary: '' },
  ats_evaluation: {
    years_of_experience: 4,
    relevant_score: 37,
    key_match_highlights: ['React'],
    missing_keywords: ['Kafka'],
  },
}) as ParsedCV;

const base = { id: 'r1', matchScore: 82 } as AnalysisResult;

describe('ParsedCVTab (Stage 3.8B)', () => {
  afterEach(cleanup);

  it('survives parsedCV arriving after mount and shows no secondary score', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { rerender } = render(<ParsedCVTab selectedResult={base} />);
    expect(screen.getByText('Đang trích xuất dữ liệu CV...')).toBeTruthy();

    // Same component instance, parsedCV now populated: hook count must not change.
    rerender(<ParsedCVTab selectedResult={{ ...base, parsedCV }} />);

    expect(screen.getByText('React')).toBeTruthy();
    expect(screen.getByText('Kafka')).toBeTruthy();
    // Legacy row (no canonical table): old parse arrays keep their old label.
    expect(screen.getByText('parsedMissingKeywords')).toBeTruthy();
    expect(screen.queryByText(/37/)).toBeNull();
    expect(screen.queryByText('parsedRelevance')).toBeNull();
    expect(screen.queryByText('parsedScoreDiscrepancy')).toBeNull();
    expect(errors.mock.calls.flat().join(' ')).not.toMatch(/hooks/i);
    errors.mockRestore();
  });

  it('renders canonical matched/missing requirements, not parse output (Stage 3.9B)', () => {
    const result = {
      ...base,
      parsedCV,
      detailedComparison: {
        skills: [{ requirement: 'Expert SQL', status: 'matched', priority: 'required' }],
        tools: [
          { requirement: 'Cloud warehouse (BigQuery, Snowflake or Redshift)', status: 'matched', priority: 'required' },
          { requirement: 'Looker', status: 'missing', priority: 'required' },
          { requirement: 'statsmodels', status: 'partial', priority: 'required' },
        ],
        experience: [], education: [], keywords: [],
      },
    } as AnalysisResult;
    render(<ParsedCVTab selectedResult={result} />);

    expect(screen.getByText('Expert SQL')).toBeTruthy();
    expect(screen.getByText('Looker')).toBeTruthy();
    expect(screen.getByText('parsedMissingRequirements')).toBeTruthy();
    expect(screen.queryByText('parsedMissingKeywords')).toBeNull();
    expect(screen.queryByText('statsmodels')).toBeNull(); // partial is not missing
    // Legacy parse arrays are ignored once canonical rows exist.
    expect(screen.queryByText('React')).toBeNull();
    expect(screen.queryByText('Kafka')).toBeNull();
  });

  it('labels the canonical missing block as requirements in both languages', () => {
    expect(UI_LABELS.vi.parsedMissingRequirements).toBe('Yêu cầu còn thiếu');
    expect(UI_LABELS.en.parsedMissingRequirements).toBe('Missing requirements');
  });
});
