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
  {
    id: 'p0-1',
    analysis_id: 'p0-1',
    timestamp: '2026-11-01T00:00:00Z',
    matching_points: [],
    missing_gaps: [],
    detailed_comparison: {
      skills: [{ requirement: 'SQL', status: 'matched', priority: 'required' }],
      education: [{
        requirement: 'IELTS 6.5', status: 'missing', priority: 'required',
        verification: 'unknown', jdEvidence: 'IELTS 6.5 or above',
      }],
    },
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

it('P0: verification/jdEvidence round-trip through history; pre-P0 rows stay without them', async () => {
  const [, , canonical] = await getUserHistory('user-1', 'pro');
  expect(canonical.detailedComparison.education[0]).toMatchObject({
    verification: 'unknown', jdEvidence: 'IELTS 6.5 or above',
  });
  // Rows saved before P0 must not be shown as "unverified".
  expect(canonical.detailedComparison.skills[0]).not.toHaveProperty('verification');
  expect(canonical.detailedComparison.skills[0]).not.toHaveProperty('jdEvidence');
  // Requirement-status authority unchanged: unknown is still listed as missing, not a new bucket.
  const insights = deriveRequirementInsights(canonical.detailedComparison);
  expect(insights.missing.map((i) => i.requirement)).toEqual(['IELTS 6.5']);
});
