import { expect, it, vi } from 'vitest';
import { deriveRequirementInsights } from '../../services/ai/resultPayloadNormalize';

const rows = vi.hoisted(() => [
  {
    id: 'canonical-1',
    analysis_id: 'canonical-1',
    timestamp: '2026-10-15T00:00:00Z',
    // Stored free-text duplicates deliberately disagree with the canonical table.
    matching_points: [{ category: 'Skills', content: 'Legacy strength' }],
    missing_gaps: [{ category: 'Skills', content: 'Legacy gap' }],
    detailed_comparison: {
      skills: [{ requirement: 'SQL', status: 'matched', priority: 'required' }],
      tools: [{ requirement: 'Airflow', status: 'missing', priority: 'nice-to-have' }],
    },
  },
  {
    id: 'legacy-1',
    analysis_id: 'legacy-1',
    timestamp: '2026-09-15T00:00:00Z',
    matching_points: [{ category: 'Skills', content: 'Legacy strength' }],
    missing_gaps: [{ category: 'Skills', content: 'Legacy gap' }],
    detailed_comparison: {},
  },
]);

vi.mock('../../lib/supabase', () => ({
  withAuthRetry: (fn: () => Promise<unknown>) => fn(),
  supabase: { from: () => {
    const query = {
      select: () => query, eq: () => query, order: () => query, gte: () => query,
      limit: async () => ({ data: rows, error: null }),
    };
    return query;
  } },
}));

import { getUserHistory } from '../../services/historyService';

it('derives from canonical detailedComparison for stored canonical rows', async () => {
  const [canonical] = await getUserHistory('user-1', 'pro');
  const insights = deriveRequirementInsights(canonical.detailedComparison, {
    matchingPoints: canonical.matchingPoints,
    missingGaps: canonical.missingGaps,
  });

  expect(insights.source).toBe('canonical');
  expect(insights.matched.map((i) => i.requirement)).toEqual(['SQL']);
  expect(insights.missing.map((i) => i.requirement)).toEqual(['Airflow']);
  // The stored free-text duplicate is not promoted over canonical data.
  expect([...insights.matched, ...insights.missing].map((i) => i.requirement)).not.toContain('Legacy strength');
  expect([...insights.matched, ...insights.missing].map((i) => i.requirement)).not.toContain('Legacy gap');
});

it('keeps the legacy fallback for rows without a usable canonical table', async () => {
  const [, legacy] = await getUserHistory('user-1', 'pro');
  const insights = deriveRequirementInsights(legacy.detailedComparison, {
    matchingPoints: legacy.matchingPoints,
    missingGaps: legacy.missingGaps,
  });

  expect(insights.source).toBe('legacy');
  expect(insights.matched.map((i) => i.requirement)).toEqual(['Legacy strength']);
  expect(insights.missing.map((i) => i.requirement)).toEqual(['Legacy gap']);
});
