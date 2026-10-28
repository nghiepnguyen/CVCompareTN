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
    expect(screen.queryByText(/37/)).toBeNull();
    expect(screen.queryByText('parsedRelevance')).toBeNull();
    expect(screen.queryByText('parsedScoreDiscrepancy')).toBeNull();
    expect(errors.mock.calls.flat().join(' ')).not.toMatch(/hooks/i);
    errors.mockRestore();
  });
});
