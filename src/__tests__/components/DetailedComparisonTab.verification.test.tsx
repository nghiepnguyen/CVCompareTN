// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { UI_LABELS } from '../../translations';
import type { AnalysisResult } from '../../services/ai';

vi.mock('../../context/UIContext', () => ({
  useUI: () => ({ t: UI_LABELS.vi, reportLanguage: 'vi' }),
}));

import { DetailedComparisonTab } from '../../components/views/result/DetailedComparisonTab';

const withRows = (education: unknown[]) =>
  ({ detailedComparison: { skills: [], experience: [], tools: [], keywords: [], education } }) as unknown as AnalysisResult;

afterEach(cleanup);

describe('DetailedComparisonTab — P0 verification', () => {
  it('pre-P0 rows (no verification) render as before, with no verification label', () => {
    render(<DetailedComparisonTab selectedResult={withRows([{ requirement: 'IELTS 6.5', status: 'missing', priority: 'required' }])} />);
    expect(screen.getByText('IELTS 6.5')).toBeTruthy();
    expect(screen.getByText(UI_LABELS.vi.missing)).toBeTruthy();
    expect(screen.queryByText(UI_LABELS.vi.verificationLabel)).toBeNull();
  });

  it('shows Đạt / Không đạt / Chưa xác minh next to the unchanged status badge', () => {
    render(<DetailedComparisonTab selectedResult={withRows([
      { requirement: 'A', status: 'matched', cvEvidence: 'a', verification: 'met' },
      { requirement: 'B', status: 'missing', cvEvidence: 'IELTS 6.0', verification: 'unmet' },
      { requirement: 'C', status: 'missing', verification: 'unknown' },
    ])} />);
    expect(screen.getAllByText(UI_LABELS.vi.verificationLabel)).toHaveLength(3);
    expect(screen.getByText(UI_LABELS.vi.verificationUnmet)).toBeTruthy();
    expect(screen.getByText(UI_LABELS.vi.verificationUnknown)).toBeTruthy();
    // "Đạt" is both the matched status badge and the met verification badge.
    expect(screen.getAllByText('Đạt')).toHaveLength(2);
    expect(screen.queryByText(/%/)).toBeNull(); // no new percentage/score
  });
});
