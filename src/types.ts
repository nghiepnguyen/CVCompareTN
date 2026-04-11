export interface Candidate {
  skills: string[];
  experienceYears: number;
  jobTitle: string;
  industry: string;
  education: string;
  projects: string[];
}

export interface JobDescription {
  requiredSkills: string[];
  minExperienceYears: number;
  targetJobTitle: string;
  industry: string;
  educationLevel: string;
  projectRequirements: string[];
}

export interface MatchScoreBreakdown {
  skills: number;
  experience: number;
  jobTitle: number;
  industry: number;
  education: number;
  projects: number;
  total: number;
}
