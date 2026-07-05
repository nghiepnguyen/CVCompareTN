const MATCHING_CATEGORY_ENUM = [
  'Skills', 'Soft Skills', 'Hard Skills', 'Technical Skills', 'Language Skills',
  'Experience', 'Tools', 'Education',
];

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
          category: { type: 'STRING', enum: MATCHING_CATEGORY_ENUM },
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
          category: { type: 'STRING', enum: MATCHING_CATEGORY_ENUM },
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
  },
  required: [
    'jobTitle', 'matchScore', 'categoryScores', 'matchingPoints', 'missingGaps',
    'successProbability', 'passProbability', 'passExplanation', 'mainFactor',
    'atsKeywords', 'rewriteSuggestions', 'detailedComparison',
  ],
};
