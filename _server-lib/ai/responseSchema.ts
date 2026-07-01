const comparisonItemSchema = {
  type: 'OBJECT',
  properties: {
    requirement: { type: 'STRING' },
    status: { type: 'STRING', enum: ['matched', 'partial', 'missing'] },
    cvEvidence: { type: 'STRING' },
    improvement: { type: 'STRING' },
  },
  required: ['requirement', 'status'],
};

export const ANALYSIS_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    jobTitle: { type: 'STRING' },
    matchScore: { type: 'NUMBER' },
    categoryScores: {
      type: 'OBJECT',
      properties: {
        skills: { type: 'NUMBER' },
        experience: { type: 'NUMBER' },
        tools: { type: 'NUMBER' },
        education: { type: 'NUMBER' },
      },
      required: ['skills', 'experience', 'tools', 'education'],
    },
    matchingPoints: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          category: { type: 'STRING' },
          content: { type: 'STRING' },
        },
        required: ['category', 'content'],
      },
    },
    missingGaps: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          category: { type: 'STRING' },
          content: { type: 'STRING' },
          impact: { type: 'STRING', enum: ['High', 'Medium', 'Low'] },
        },
        required: ['category', 'content', 'impact'],
      },
    },
    successProbability: { type: 'STRING', enum: ['High', 'Medium', 'Low'] },
    passProbability: { type: 'STRING', enum: ['High', 'Medium', 'Low'] },
    passExplanation: { type: 'STRING' },
    mainFactor: { type: 'STRING' },
    atsKeywords: { type: 'ARRAY', items: { type: 'STRING' } },
    rewriteSuggestions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          section: { type: 'STRING' },
          original: { type: 'STRING' },
          optimized: { type: 'STRING' },
          explanation: { type: 'STRING' },
        },
        required: ['section', 'original', 'optimized', 'explanation'],
      },
    },
    detailedComparison: {
      type: 'OBJECT',
      properties: {
        skills: { type: 'ARRAY', items: comparisonItemSchema },
        experience: { type: 'ARRAY', items: comparisonItemSchema },
        tools: { type: 'ARRAY', items: comparisonItemSchema },
        education: { type: 'ARRAY', items: comparisonItemSchema },
        keywords: { type: 'ARRAY', items: comparisonItemSchema },
      },
      required: ['skills', 'experience', 'tools', 'education'],
    },
    parsedCV: {
      type: 'OBJECT',
      properties: {
        personal_information: {
          type: 'OBJECT',
          properties: {
            full_name: { type: 'STRING' },
            contact: {
              type: 'OBJECT',
              properties: {
                email: { type: 'STRING' },
                phone: { type: 'STRING' },
                location: { type: 'STRING' },
                linkedin: { type: 'STRING' },
                website_portfolio: { type: 'STRING' },
              },
              required: ['email', 'phone', 'location'],
            },
            summary: { type: 'STRING' },
          },
          required: ['full_name', 'contact', 'summary'],
        },
        education: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              degree: { type: 'STRING' },
              institution: { type: 'STRING' },
              major: { type: 'STRING' },
              graduation_year: { type: 'INTEGER' },
              gpa: { type: 'STRING' },
            },
            required: ['degree', 'institution', 'major', 'graduation_year'],
          },
        },
        work_experience: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              company: { type: 'STRING' },
              job_title: { type: 'STRING' },
              duration: {
                type: 'OBJECT',
                properties: {
                  start: { type: 'STRING' },
                  end: { type: 'STRING' },
                  is_current: { type: 'BOOLEAN' },
                },
                required: ['start', 'end', 'is_current'],
              },
              responsibilities: { type: 'ARRAY', items: { type: 'STRING' } },
              achievements: { type: 'ARRAY', items: { type: 'STRING' } },
            },
            required: ['company', 'job_title', 'duration', 'responsibilities', 'achievements'],
          },
        },
        skills: {
          type: 'OBJECT',
          properties: {
            technical_skills: { type: 'ARRAY', items: { type: 'STRING' } },
            soft_skills: { type: 'ARRAY', items: { type: 'STRING' } },
            tools_software: { type: 'ARRAY', items: { type: 'STRING' } },
            languages: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  language: { type: 'STRING' },
                  proficiency: { type: 'STRING' },
                },
                required: ['language', 'proficiency'],
              },
            },
          },
          required: ['technical_skills', 'soft_skills', 'tools_software', 'languages'],
        },
        projects: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              name: { type: 'STRING' },
              description: { type: 'STRING' },
              tech_stack: { type: 'ARRAY', items: { type: 'STRING' } },
              link: { type: 'STRING' },
            },
            required: ['name', 'description', 'tech_stack'],
          },
        },
        certifications: { type: 'ARRAY', items: { type: 'STRING' } },
        ats_evaluation: {
          type: 'OBJECT',
          properties: {
            years_of_experience: { type: 'NUMBER' },
            relevant_score: { type: 'NUMBER' },
            key_match_highlights: { type: 'ARRAY', items: { type: 'STRING' } },
            missing_keywords: { type: 'ARRAY', items: { type: 'STRING' } },
          },
          required: ['years_of_experience', 'relevant_score', 'key_match_highlights', 'missing_keywords'],
        },
      },
      required: ['personal_information', 'education', 'work_experience', 'skills', 'projects', 'certifications', 'ats_evaluation'],
    },
  },
  required: [
    'jobTitle', 'matchScore', 'categoryScores', 'matchingPoints', 'missingGaps',
    'successProbability', 'passProbability', 'passExplanation', 'mainFactor',
    'atsKeywords', 'rewriteSuggestions', 'detailedComparison', 'parsedCV',
  ],
};
