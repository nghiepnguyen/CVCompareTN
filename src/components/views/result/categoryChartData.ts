import { AnalysisResult, deriveRequirementInsights } from '../../../services/ai';
import type { UiLabels } from '../../../translations/types';
import { getMatchingCategoryLabel } from './matchingCategoryLabels';

type CategoryKey = keyof NonNullable<AnalysisResult['categoryScores']>;
type RequirementInsights = ReturnType<typeof deriveRequirementInsights>;

const CATEGORY_KEYS: { key: CategoryKey; category: string }[] = [
  { key: 'skills', category: 'Skills' },
  { key: 'softSkills', category: 'Soft Skills' },
  { key: 'hardSkills', category: 'Hard Skills' },
  { key: 'technicalSkills', category: 'Technical Skills' },
  { key: 'experience', category: 'Experience' },
  { key: 'tools', category: 'Tools' },
  { key: 'languageSkills', category: 'Language Skills' },
  { key: 'education', category: 'Education' },
];

/**
 * Single source of truth for category score charts (result detail + history list):
 * AI's own categoryScores, filtered to categories that were actually evaluated.
 */
export function deriveCategoryChartData(
  result: AnalysisResult,
  t: UiLabels,
  insights: RequirementInsights = deriveRequirementInsights(result.detailedComparison, {
    matchingPoints: result.matchingPoints,
    missingGaps: result.missingGaps,
  })
) {
  const hasEvidence = new Set<string>();
  [...insights.matched, ...insights.partial, ...insights.missing]
    .forEach((item) => item.category && hasEvidence.add(item.category));

  return CATEGORY_KEYS.map(({ key, category }) => {
    const score = result.categoryScores?.[key];
    // A 0 with no matching/missing evidence means the AI never assessed this
    // category (e.g. JD has no language requirement) — not an actual score of 0.
    const evaluated = (typeof score === 'number' && score > 0) || hasEvidence.has(category);
    return {
      key,
      name: getMatchingCategoryLabel(category, t),
      value: typeof score === 'number' ? score : 0,
      evaluated,
    };
  }).filter((d) => d.evaluated);
}
