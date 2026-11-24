import { probabilityTone } from '../services/ai/canonicalProbability';
import type { UiLabels } from '../translations';

type BandLabels = Pick<UiLabels, 'matchBandHigh' | 'matchBandMedium' | 'matchBandLow'>;

/**
 * Display label for the stored score band (High/Medium/Low, or legacy VI values).
 * Presentation only: the stored value and the 80/60 thresholds are unchanged.
 * Unrecognized legacy free text is shown as stored.
 */
export function matchBandLabel(value: string, t: BandLabels): string {
  switch (probabilityTone(value)) {
    case 'high': return t.matchBandHigh;
    case 'medium': return t.matchBandMedium;
    case 'low': return t.matchBandLow;
    default: return value;
  }
}
