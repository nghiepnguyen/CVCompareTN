import { supabase, withAuthRetry } from "../lib/supabase";
import type { AnalysisResult, ParsedCV } from "./ai";

/** Cover letter as currently shown in the result dialog (P1A/P1B, session only). */
export interface CurrentCoverLetter {
  content: string;
  language: 'vi' | 'en';
  employerName: string;
  roleTitle: string;
}

export interface SaveApplicationInput {
  result: AnalysisResult;
  parsedCV: ParsedCV;
  jd: string;
  coverLetter: CurrentCoverLetter | null;
}

// Canonical requirement status + verification at save time (not the full analysis payload).
export function requirementSnapshotOf(result: AnalysisResult) {
  const d = result.detailedComparison;
  if (!d) return [];
  return [d.skills, d.experience, d.tools, d.education, d.keywords]
    .flatMap((items) => items ?? [])
    .map(({ requirement, status, priority, cvEvidence, verification }) => ({
      requirement, status, ...(priority && { priority }), ...(cvEvidence && { cvEvidence }), ...(verification && { verification }),
    }));
}

/**
 * P2A: one atomic RPC creates the application and its immutable CV/JD(/letter)
 * snapshots. Idempotent per analysis: `created: false` means it was already
 * saved and the earlier snapshots were kept unchanged. No AI call, no quota.
 */
export async function saveApplication({ result, parsedCV, jd, coverLetter }: SaveApplicationInput): Promise<{ id: string; created: boolean }> {
  // analyze falls back to this literal when the model returns no title.
  const role = coverLetter?.roleTitle || (result.jobTitle !== 'Job Position' ? result.jobTitle : '');
  const { data, error } = await withAuthRetry(() =>
    supabase.rpc('save_application', {
      p_source_analysis_id: result.id,
      p_language: result.presentationLanguage || result.language || 'vi',
      p_role_title: role?.slice(0, 200) || null,
      p_company_name: coverLetter?.employerName.slice(0, 200) || null,
      p_cv_parsed: parsedCV,
      p_cv_file_name: result.cvName?.slice(0, 255) || null,
      p_jd_text: jd,
      p_analysis: {
        matchScore: result.matchScore,
        passProbability: result.passProbability,
        ...(result.scoreVersion && { scoreVersion: result.scoreVersion }),
        ...(result.probabilityVersion && { probabilityVersion: result.probabilityVersion }),
        requirements: requirementSnapshotOf(result),
      },
      p_cover_letter_text: coverLetter?.content || null,
      p_cover_letter_language: coverLetter?.language || null,
    })
  );
  if (error) throw error;
  return data as { id: string; created: boolean };
}
