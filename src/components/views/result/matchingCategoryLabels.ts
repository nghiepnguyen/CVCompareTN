import type { UiLabels } from '../../../translations/types';

/** Map AI matching-point / gap category keys to localized labels. */
export function getMatchingCategoryLabel(cat: string, t: UiLabels): string {
  const map: Record<string, string> = {
    Skills: t.categoryGeneralSkills,
    'Soft Skills': t.categorySoftSkills,
    'Hard Skills': t.categoryHardSkills,
    'Technical Skills': t.categoryTechnicalSkills,
    Experience: t.experience,
    Tools: t.tools,
    Education: t.education,
    Keywords: t.categoryKeywords,
  };
  return map[cat] ?? cat;
}
