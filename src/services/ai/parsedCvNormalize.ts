import type {
  ATSEvaluation,
  ParsedCV,
  ParsedEducation,
  ParsedPersonalInformation,
  ParsedProject,
  ParsedSkills,
  ParsedWorkExperience,
} from "./types.js";
import { inspectWorkTimeline, selectExperience, validExperience, type ExperienceContext } from "./experienceAuthority.js";
export { computeYearsOfExperience } from "./experienceAuthority.js";
import { normalizeTextualMonthYear } from "../../lib/cvDates.js";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

// Whole-value placeholders models write into required contact fields when the
// CV has none (seen in the 2026-10-28 Gemini benchmark). Matched on the whole
// value after lowercasing, trimming, folding "_" to a space and dropping
// trailing dots — so a real value that merely contains one of these words
// (e.g. "N/A Studio") is kept. Bracketed templates like "[Email]" count too.
const CONTACT_PLACEHOLDERS = new Set([
  "not provided",
  "not provided in cv",
  "not available",
  "not specified",
  "not mentioned",
  "n/a",
  "na",
  "none",
  "null",
  "undefined",
  "-",
  "chưa cung cấp",
  "chưa cung cấp trong cv",
  "không cung cấp",
  "không có",
  "không có thông tin",
]);

function contactValue(v: unknown): string {
  if (typeof v !== "string") return "";
  const key = v.normalize("NFC").toLowerCase().replace(/[_\s]+/g, " ").trim().replace(/\.+$/, "");
  if (CONTACT_PLACEHOLDERS.has(key) || /^\[[^\]]*\]$/.test(key)) return "";
  return v;
}

/**
 * Coerces Gemini / DB JSON into a full ParsedCV shape so UI never reads undefined nested fields.
 * Returns undefined only when there is no usable object (null, non-object, or empty {}).
 */
export interface ParsedCvNormalizationContext extends ExperienceContext {
  mode?: 'new' | 'history';
}

export function normalizeParsedCV(raw: unknown, context: ParsedCvNormalizationContext = {}): ParsedCV | undefined {
  if (!isRecord(raw)) return undefined;
  if (Object.keys(raw).length === 0) return undefined;

  const piRaw = isRecord(raw.personal_information) ? raw.personal_information : {};
  const cRaw = isRecord(piRaw.contact) ? piRaw.contact : {};

  const personal_information: ParsedPersonalInformation = {
    full_name: typeof piRaw.full_name === "string" ? piRaw.full_name : "",
    contact: {
      email: contactValue(cRaw.email),
      phone: contactValue(cRaw.phone),
      location: contactValue(cRaw.location),
      ...(contactValue(cRaw.linkedin).trim() ? { linkedin: contactValue(cRaw.linkedin) } : {}),
      ...(contactValue(cRaw.website_portfolio).trim()
        ? { website_portfolio: contactValue(cRaw.website_portfolio) }
        : {}),
    },
    summary: typeof piRaw.summary === "string" ? piRaw.summary : "",
  };

  const education: ParsedEducation[] = Array.isArray(raw.education)
    ? raw.education.filter(isRecord).map((e) => {
        let graduation_year = 0;
        if (typeof e.graduation_year === "number" && Number.isFinite(e.graduation_year)) {
          graduation_year = e.graduation_year;
        } else if (typeof e.graduation_year === "string") {
          const n = parseInt(e.graduation_year, 10);
          graduation_year = Number.isFinite(n) ? n : 0;
        }
        return {
          degree: typeof e.degree === "string" ? e.degree : "",
          institution: typeof e.institution === "string" ? e.institution : "",
          major: typeof e.major === "string" ? e.major : "",
          graduation_year,
          ...(typeof e.gpa === "string" && e.gpa.trim() ? { gpa: e.gpa } : {}),
        };
      })
    : [];

  const work_experience: ParsedWorkExperience[] = Array.isArray(raw.work_experience)
    ? raw.work_experience.filter(isRecord).map((w) => {
        const dur = isRecord(w.duration) ? w.duration : {};
        return {
          company: typeof w.company === "string" ? w.company : "",
          job_title: typeof w.job_title === "string" ? w.job_title : "",
          duration: {
            start: typeof dur.start === "string" ? normalizeTextualMonthYear(dur.start) : "",
            end: typeof dur.end === "string" ? normalizeTextualMonthYear(dur.end) : "",
            is_current: dur.is_current === true,
          },
          responsibilities: Array.isArray(w.responsibilities)
            ? w.responsibilities.filter((x): x is string => typeof x === "string")
            : [],
          achievements: Array.isArray(w.achievements)
            ? w.achievements.filter((x): x is string => typeof x === "string")
            : [],
        };
      })
    : [];

  const sk = isRecord(raw.skills) ? raw.skills : {};
  const languagesRaw = Array.isArray(sk.languages) ? sk.languages : [];
  const skills: ParsedSkills = {
    technical_skills: Array.isArray(sk.technical_skills)
      ? sk.technical_skills.filter((x): x is string => typeof x === "string")
      : [],
    soft_skills: Array.isArray(sk.soft_skills)
      ? sk.soft_skills.filter((x): x is string => typeof x === "string")
      : [],
    hard_skills: Array.isArray(sk.hard_skills)
      ? sk.hard_skills.filter((x): x is string => typeof x === "string")
      : [],
    tools_software: Array.isArray(sk.tools_software)
      ? sk.tools_software.filter((x): x is string => typeof x === "string")
      : [],
    languages: languagesRaw.filter(isRecord).map((l) => ({
      language: typeof l.language === "string" ? l.language : "",
      proficiency: typeof l.proficiency === "string" ? l.proficiency : "",
    })),
  };

  const projects: ParsedProject[] = Array.isArray(raw.projects)
    ? raw.projects.filter(isRecord).map((p) => ({
        name: typeof p.name === "string" ? p.name : "",
        description: typeof p.description === "string" ? p.description : "",
        tech_stack: Array.isArray(p.tech_stack)
          ? p.tech_stack.filter((x): x is string => typeof x === "string")
          : [],
        ...(typeof p.link === "string" && p.link.trim() ? { link: p.link } : {}),
      }))
    : [];

  const certifications: string[] = Array.isArray(raw.certifications)
    ? raw.certifications.filter((x): x is string => typeof x === "string")
    : [];

  const ats = isRecord(raw.ats_evaluation) ? raw.ats_evaluation : {};
  // Legacy history.parsed_cv rows (pre Stage 3.9B) may carry these arrays;
  // keep them readable but never add them to new payloads.
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : undefined);
  const highlights = strings(ats.key_match_highlights);
  const missingKw = strings(ats.missing_keywords);
  // History contains the selected snapshot, not the original model estimate; never recalculate it at today's date.
  const years_of_experience = context.mode === 'history'
    ? validExperience(ats.years_of_experience) ?? 0
    : selectExperience(ats.years_of_experience, inspectWorkTimeline(raw.work_experience, context));
  // Legacy history.parsed_cv rows (pre Stage 3.8B) may carry relevant_score;
  // keep it readable but never invent one for new payloads.
  const legacyScore =
    typeof ats.relevant_score === "number" ? ats.relevant_score
    : typeof ats.relevant_score === "string" ? parseFloat(ats.relevant_score)
    : NaN;

  const ats_evaluation: ATSEvaluation = {
    years_of_experience,
    ...(Number.isFinite(legacyScore) ? { relevant_score: legacyScore } : {}),
    ...(highlights ? { key_match_highlights: highlights } : {}),
    ...(missingKw ? { missing_keywords: missingKw } : {}),
  };

  return {
    personal_information,
    education,
    work_experience,
    skills,
    projects,
    certifications,
    ats_evaluation,
  };
}
