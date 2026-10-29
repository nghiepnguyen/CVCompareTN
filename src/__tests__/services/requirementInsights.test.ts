import { describe, expect, it } from 'vitest';
import {
  deriveParsedCvInsights,
  deriveRequirementInsights,
} from '../../services/ai/resultPayloadNormalize';
import type { ComparisonItem, DetailedComparison } from '../../services/ai/types';

const item = (
  requirement: string,
  status: ComparisonItem['status'],
  priority?: ComparisonItem['priority'],
  extra: Partial<ComparisonItem> = {}
): ComparisonItem => ({ requirement, status, ...(priority ? { priority } : {}), ...extra });

const dc = (over: Partial<DetailedComparison>): DetailedComparison => ({
  skills: [], experience: [], tools: [], education: [], keywords: [], ...over,
});

describe('deriveRequirementInsights — canonical authority', () => {
  it('derives matched, partial and missing from detailedComparison only', () => {
    const insights = deriveRequirementInsights(dc({
      skills: [item('SQL', 'matched', 'required'), item('Looker', 'partial', 'required')],
      tools: [item('Airflow', 'missing', 'nice-to-have')],
    }), {
      // Legacy duplicates must be ignored while a canonical table exists.
      matchingPoints: [{ content: 'Legacy strength' }],
      missingGaps: [{ content: 'Legacy gap' }],
    });

    expect(insights.source).toBe('canonical');
    expect(insights.matched.map((i) => i.requirement)).toEqual(['SQL']);
    expect(insights.partial.map((i) => i.requirement)).toEqual(['Looker']);
    expect(insights.missing.map((i) => i.requirement)).toEqual(['Airflow']);
    expect(insights.missing[0].priority).toBe('nice-to-have');
  });

  it('keeps partial distinct and never promotes it to missing', () => {
    const insights = deriveRequirementInsights(dc({
      experience: [item('5+ years of SQL experience', 'partial', 'required')],
    }));
    expect(insights.partial).toHaveLength(1);
    expect(insights.missing).toHaveLength(0);
    expect(insights.matched).toHaveLength(0);
  });

  it('orders required before nice-to-have before unknown, preserving canonical order', () => {
    const insights = deriveRequirementInsights(dc({
      skills: [
        item('Nice A', 'missing', 'nice-to-have'),
        item('Required A', 'missing', 'required'),
        item('Unknown A', 'missing'),
        item('Required B', 'missing', 'required'),
        item('Nice B', 'missing', 'nice-to-have'),
      ],
    }));
    expect(insights.missing.map((i) => i.requirement)).toEqual([
      'Required A', 'Required B', 'Nice A', 'Nice B', 'Unknown A',
    ]);
  });

  it('preserves canonical bucket order across categories', () => {
    const insights = deriveRequirementInsights(dc({
      skills: [item('Skill', 'matched', 'required')],
      experience: [item('Experience', 'matched', 'required')],
      tools: [item('Tool', 'matched', 'required')],
      education: [item('Education', 'matched', 'required')],
      keywords: [item('Keyword', 'matched', 'required')],
    }));
    expect(insights.matched.map((i) => i.category)).toEqual([
      'Skills', 'Experience', 'Tools', 'Education', 'Keywords',
    ]);
  });

  it('keeps an OR requirement as one matched row and surfaces no alternative as missing', () => {
    const insights = deriveRequirementInsights(dc({
      tools: [item('Experience with BigQuery or Snowflake', 'matched', 'required', { cvEvidence: 'Used Snowflake' })],
    }), { missingGaps: [{ content: 'BigQuery is missing' }] });

    expect(insights.matched.map((i) => i.requirement)).toEqual(['Experience with BigQuery or Snowflake']);
    expect(insights.missing).toEqual([]);
    expect(insights.matched[0].cvEvidence).toBe('Used Snowflake');
  });

  it('keeps an unsatisfied OR requirement as one missing row', () => {
    const insights = deriveRequirementInsights(dc({
      tools: [item('Experience with BigQuery or Snowflake', 'missing', 'required')],
    }));
    expect(insights.missing.map((i) => i.requirement)).toEqual(['Experience with BigQuery or Snowflake']);
  });

  it('does not merge AND requirements', () => {
    const insights = deriveRequirementInsights(dc({
      skills: [item('Python and SQL', 'partial', 'required')],
      tools: [item('Python', 'matched', 'required'), item('SQL', 'missing', 'required')],
    }));
    expect(insights.matched.map((i) => i.requirement)).toEqual(['Python']);
    expect(insights.missing.map((i) => i.requirement)).toEqual(['SQL']);
    expect(insights.partial.map((i) => i.requirement)).toEqual(['Python and SQL']);
  });

  it('never surfaces a missingGaps invention that has no canonical row', () => {
    const insights = deriveRequirementInsights(dc({
      skills: [item('SQL', 'matched', 'required')],
    }), { missingGaps: [{ content: 'communication / problem solving' }] });
    expect(insights.missing).toEqual([]);
    expect(insights.matched.map((i) => i.requirement)).toEqual(['SQL']);
  });
});

describe('deriveRequirementInsights — legacy fallback', () => {
  it('falls back to stored matchingPoints/missingGaps only without a canonical table', () => {
    const insights = deriveRequirementInsights(undefined, {
      matchingPoints: [{ content: 'React', category: 'Technical Skills' }] as never,
      missingGaps: [{ content: 'Kafka', impact: 'High' }] as never,
    });
    expect(insights.source).toBe('legacy');
    expect(insights.matched.map((i) => i.requirement)).toEqual(['React']);
    expect(insights.partial).toEqual([]);
    expect(insights.missing.map((i) => i.requirement)).toEqual(['Kafka']);
    expect(insights.missing[0].impact).toBe('High');
  });
});

describe('deriveParsedCvInsights — unchanged contract', () => {
  it('uses canonical matched/missing and excludes partial', () => {
    const insights = deriveParsedCvInsights(dc({
      skills: [item('SQL', 'matched', 'required'), item('Looker', 'missing', 'required')],
      experience: [item('5+ years', 'partial', 'required')],
    }), { key_match_highlights: ['Legacy'], missing_keywords: ['Legacy gap'] });

    expect(insights).toEqual({
      highlights: ['SQL'],
      missingRequirements: ['Looker'],
      source: 'canonical',
    });
  });

  it('keeps the legacy parse fallback only when no canonical table exists', () => {
    const insights = deriveParsedCvInsights(dc({}), {
      key_match_highlights: ['React'],
      missing_keywords: ['Kafka'],
    });
    expect(insights).toEqual({
      highlights: ['React'],
      missingRequirements: ['Kafka'],
      source: 'legacy',
    });
  });
});

describe('one derivation for every active surface', () => {
  it('gives Analysis, Parsed, recruiter and export the same status lists', () => {
    const comparison = dc({
      skills: [item('SQL', 'matched', 'required'), item('Looker', 'partial', 'required')],
      tools: [item('Airflow', 'missing', 'nice-to-have')],
    });
    const shared = deriveRequirementInsights(comparison);
    // All four consumers call this helper directly; assert the shared output
    // is stable and contains no free-text-only requirement.
    expect(shared.matched.map((i) => i.requirement)).toEqual(['SQL']);
    expect(shared.partial.map((i) => i.requirement)).toEqual(['Looker']);
    expect(shared.missing.map((i) => i.requirement)).toEqual(['Airflow']);
    expect(deriveParsedCvInsights(comparison).missingRequirements).toEqual(['Airflow']);
  });
});
