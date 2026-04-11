import { Candidate, JobDescription, MatchScoreBreakdown } from '../types';

export const calculateMatchScore = (candidate: Candidate, jd: JobDescription): MatchScoreBreakdown => {
  // 40% Skills
  const skillMatches = candidate.skills.filter(skill => 
    jd.requiredSkills.some(req => req.toLowerCase() === skill.toLowerCase())
  ).length;
  const skillsScore = jd.requiredSkills.length > 0 
    ? (skillMatches / jd.requiredSkills.length) * 100 
    : 100;

  // 20% Experience
  const experienceScore = Math.min((candidate.experienceYears / jd.minExperienceYears) * 100, 100);

  // 15% Job Title
  const jobTitleScore = candidate.jobTitle.toLowerCase() === jd.targetJobTitle.toLowerCase() ? 100 : 50;

  // 10% Industry
  const industryScore = candidate.industry.toLowerCase() === jd.industry.toLowerCase() ? 100 : 0;

  // 5% Education
  const educationScore = candidate.education.toLowerCase() === jd.educationLevel.toLowerCase() ? 100 : 50;

  // 10% Projects
  const projectMatches = candidate.projects.filter(proj => 
    jd.projectRequirements.some(req => req.toLowerCase() === proj.toLowerCase())
  ).length;
  const projectsScore = jd.projectRequirements.length > 0 
    ? (projectMatches / jd.projectRequirements.length) * 100 
    : 100;

  const total = 
    (skillsScore * 0.4) +
    (experienceScore * 0.2) +
    (jobTitleScore * 0.15) +
    (industryScore * 0.1) +
    (educationScore * 0.05) +
    (projectsScore * 0.1);

  return {
    skills: skillsScore,
    experience: experienceScore,
    jobTitle: jobTitleScore,
    industry: industryScore,
    education: educationScore,
    projects: projectsScore,
    total: Math.round(total)
  };
};
