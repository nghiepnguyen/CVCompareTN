import { describe, expect, it } from 'vitest';
import { matchBandLabel } from '../../lib/matchBand';
import { UI_LABELS } from '../../translations';

describe('matchBandLabel (E1: match-score terminology, presentation only)', () => {
  it('maps canonical and legacy VI band values to localized match labels', () => {
    expect(['High', 'Medium', 'Low'].map((v) => matchBandLabel(v, UI_LABELS.vi))).toEqual(['Phù hợp cao', 'Phù hợp trung bình', 'Phù hợp thấp']);
    expect(['High', 'Medium', 'Low'].map((v) => matchBandLabel(v, UI_LABELS.en))).toEqual(['High match', 'Moderate match', 'Low match']);
    expect(matchBandLabel('Trung bình', UI_LABELS.en)).toBe('Moderate match');
  });

  it('shows unknown legacy text and placeholders unchanged', () => {
    expect(matchBandLabel('—', UI_LABELS.vi)).toBe('—');
    expect(matchBandLabel('', UI_LABELS.vi)).toBe('');
    expect(matchBandLabel('Rất tốt', UI_LABELS.en)).toBe('Rất tốt');
  });

  it('no surface label claims a probability any more', () => {
    for (const lang of ['vi', 'en'] as const) {
      const t = UI_LABELS[lang];
      for (const s of [t.passProb, t.probabilityHistoryLabel, t.comparisonColProbability, t.panelProbability]) {
        expect(s).not.toMatch(/probab|khả năng|xác suất/i);
      }
    }
  });
});
