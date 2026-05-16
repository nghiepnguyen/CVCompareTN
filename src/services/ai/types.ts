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
  relevant_score: number;
  key_match_highlights: string[];
  missing_keywords: string[];
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
  experience: number;
  tools: number;
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
}

export interface DetailedComparison {
  skills: ComparisonItem[];
  experience: ComparisonItem[];
  tools: ComparisonItem[];
  education: ComparisonItem[];
  keywords?: ComparisonItem[];
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
  successProbability: string;
  passProbability: string;
  passExplanation: string;
  mainFactor: string;
  atsKeywords: string[];
  rewriteSuggestions: RewriteSuggestion[];
  fullRewrittenCV?: string;
  cvUrl?: string;
  jdUrl?: string;
  detailedComparison: DetailedComparison;
  userId?: string;
  rating?: number;
  feedback?: string;
  language?: 'vi' | 'en';
  parsedCV?: ParsedCV;
}
