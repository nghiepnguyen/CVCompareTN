export interface ParsedPersonalInformation {
  full_name: string;
  contact: {
    email: string;
    phone: string;
    location: string;
    linkedin?: string;
    website_portfolio?: string;
  };
  summary: string;
}

export interface ParsedEducation {
  degree: string;
  institution: string;
  major: string;
  graduation_year: number;
  gpa?: string;
}

export interface ParsedWorkExperience {
  company: string;
  job_title: string;
  duration: {
    start: string;
    end: string;
    is_current: boolean;
  };
  responsibilities: string[];
  achievements: string[];
}

export interface ParsedSkills {
  technical_skills: string[];
  soft_skills: string[];
  hard_skills: string[];
  tools_software: string[];
  languages: {
    language: string;
    proficiency: string;
  }[];
}

export interface ParsedProject {
  name: string;
  description: string;
  tech_stack: string[];
  link?: string;
}

export interface ATSEvaluation {
  years_of_experience: number;
  /** Legacy only: present in history.parsed_cv rows written before Stage 3.8B; no longer generated or displayed. */
  relevant_score?: number;
  /** Legacy only (pre Stage 3.9B parse output); current UI derives these from canonical detailedComparison. */
  key_match_highlights?: string[];
  /** Legacy only (pre Stage 3.9B): literal JD keywords judged by the parse model. */
  missing_keywords?: string[];
}

export interface ParsedCV {
  personal_information: ParsedPersonalInformation;
  education: ParsedEducation[];
  work_experience: ParsedWorkExperience[];
  skills: ParsedSkills;
  projects: ParsedProject[];
  certifications: string[];
  ats_evaluation: ATSEvaluation;
}

export interface CategorizedScore {
  skills: number;
  softSkills: number;
  hardSkills: number;
  technicalSkills: number;
  experience: number;
  tools: number;
  languageSkills: number;
  education: number;
}

export interface CategorizedPoint {
  category: string;
  content: string;
}

export interface MissingGap {
  category: string;
  content: string;
  impact: 'High' | 'Medium' | 'Low';
}

export interface RewriteSuggestion {
  section: string;
  original: string;
  optimized: string;
  explanation: string;
}

export interface ComparisonItem {
  requirement: string;
  status: 'matched' | 'partial' | 'missing';
  cvEvidence?: string;
  improvement?: string;
  priority?: 'required' | 'nice-to-have';
  /**
   * P0: derived after the canonical analysis by deriveRequirementVerification
   * (requirementVerification.ts) — never authored by Gemini, never an input to
   * status or any score. Absent on results analyzed before P0.
   */
  verification?: 'met' | 'unmet' | 'unknown';
}

export interface FormatAssessment {
  analysisAvailable: boolean;
  overallAtsParseabilityScore: number;
  hasMultiColumnLayout: boolean;
  hasTablesOrGraphics: boolean;
  hasStandardSectionHeadings: boolean;
  contactInfoInHeaderFooter: boolean;
  fontConsistencyIssue: boolean;
  dateFormatConsistent: boolean;
  isLikelyScannedImage: boolean;
  formatIssues: string[];
}

export interface DetailedComparison {
  skills: ComparisonItem[];
  experience: ComparisonItem[];
  tools: ComparisonItem[];
  education: ComparisonItem[];
  keywords: ComparisonItem[];
}

export interface AnalysisResult {
  id: string;
  timestamp: number;
  jdTitle?: string;
  jobTitle?: string;
  cvName?: string;
  matchScore: number;
  categoryScores: CategorizedScore;
  matchingPoints: CategorizedPoint[];
  missingGaps: MissingGap[];
  /**
   * @deprecated Compatibility mirror of `passProbability` on canonical rows.
   * Legacy rows keep their historical model-authored value; never an independent
   * authority. Do not read directly — use `resolveProbability()`.
   */
  successProbability: string;
  /** Canonical probability (Stage 3.13B contract A) or a legacy stored value. */
  passProbability: string;
  /**
   * @deprecated Empty on canonical rows (probability is deterministic); kept for
   * legacy history display only.
   */
  passExplanation: string;
  /** Canonical probability contract version. Absent = legacy model-authored probability. */
  probabilityVersion?: string;
  mainFactor: string;
  atsKeywords: string[];
  rewriteSuggestions: RewriteSuggestion[];
  fullRewrittenCV?: string;
  cvUrl?: string;
  detailedComparison: DetailedComparison;
  formatAssessment?: FormatAssessment;
  userId?: string;
  rating?: number;
  feedback?: string;
  language?: 'vi' | 'en';
  parsedCV?: ParsedCV;
  /** MatchScore scoring version; absent = legacy UI-language-coupled scoring. */
  scoreVersion?: string;
  /** Language the analysis prose was actually delivered in (may be 'en' when VI localization fell back). */
  presentationLanguage?: 'vi' | 'en';
}
