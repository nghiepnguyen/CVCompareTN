import type {
  ATSEvaluation,
  ParsedCV,
  ParsedEducation,
  ParsedPersonalInformation,
  ParsedProject,
  ParsedSkills,
  ParsedWorkExperience,
} from "./types";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Coerces Gemini / DB JSON into a full ParsedCV shape so UI never reads undefined nested fields.
 * Returns undefined only when there is no usable object (null, non-object, or empty {}).
 */
export function normalizeParsedCV(raw: unknown): ParsedCV | undefined {
  if (!isRecord(raw)) return undefined;
  if (Object.keys(raw).length === 0) return undefined;

  const piRaw = isRecord(raw.personal_information) ? raw.personal_information : {};
  const cRaw = isRecord(piRaw.contact) ? piRaw.contact : {};

  const personal_information: ParsedPersonalInformation = {
    full_name: typeof piRaw.full_name === "string" ? piRaw.full_name : "",
    contact: {
      email: typeof cRaw.email === "string" ? cRaw.email : "",
      phone: typeof cRaw.phone === "string" ? cRaw.phone : "",
      location: typeof cRaw.location === "string" ? cRaw.location : "",
      ...(typeof cRaw.linkedin === "string" && cRaw.linkedin.trim()
        ? { linkedin: cRaw.linkedin }
        : {}),
      ...(typeof cRaw.website_portfolio === "string" && cRaw.website_portfolio.trim()
        ? { website_portfolio: cRaw.website_portfolio }
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
            start: typeof dur.start === "string" ? dur.start : "",
            end: typeof dur.end === "string" ? dur.end : "",
            is_current: Boolean(dur.is_current),
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
  const highlights = Array.isArray(ats.key_match_highlights)
    ? ats.key_match_highlights.filter((x): x is string => typeof x === "string")
    : [];
  const missingKw = Array.isArray(ats.missing_keywords)
    ? ats.missing_keywords.filter((x): x is string => typeof x === "string")
    : [];
  let years_of_experience = 0;
  if (typeof ats.years_of_experience === "number" && Number.isFinite(ats.years_of_experience)) {
    years_of_experience = ats.years_of_experience;
  } else if (typeof ats.years_of_experience === "string") {
    const y = parseFloat(ats.years_of_experience);
    years_of_experience = Number.isFinite(y) ? y : 0;
  }
  let relevant_score = 0;
  if (typeof ats.relevant_score === "number" && Number.isFinite(ats.relevant_score)) {
    relevant_score = ats.relevant_score;
  } else if (typeof ats.relevant_score === "string") {
    const r = parseFloat(ats.relevant_score);
    relevant_score = Number.isFinite(r) ? r : 0;
  }

  const ats_evaluation: ATSEvaluation = {
    years_of_experience,
    relevant_score,
    key_match_highlights: highlights,
    missing_keywords: missingKw,
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
