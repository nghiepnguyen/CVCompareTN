import { describe, it, expect } from 'vitest';
import { requirementCoveredByLetter } from '../../../_server-lib/ai/suggestionGuard';
import { acceptReviewerFindings, sanitizeRequirements } from '../../../_server-lib/ai/applicationReviewService';

const covered = (requirement: string, letter: string, cvEvidence?: string) => requirementCoveredByLetter({ requirement, cvEvidence }, letter);

describe('production regressions (P1B smoke 2026-11-02)', () => {
  // Canonical requirements from the production analysis; letters are the P1A output wording.
  const requirements = sanitizeRequirements([
    { requirement: '3+ years of React', status: 'matched', cvEvidence: '4 years of experience building React... (03/2021 - Present)' },
    { requirement: 'Component tests', status: 'matched', cvEvidence: 'wrote tests with Jest' },
  ], (s) => s);
  const gap = (requirementId: number, letter: string) =>
    acceptReviewerFindings([{ category: 'requirement_gap', requirementId, message: 'not mentioned' }], { letter, cvText: '', requirements, deterministicConcepts: [] }).findings;

  it('"3+ years of React" vs a letter about React and TypeScript web apps → gap dropped', () => {
    expect(gap(0, 'I am a frontend developer with 4 years of experience building React and TypeScript web apps.')).toEqual([]);
  });

  it('"Component tests" (evidence: Jest) vs a letter that tests with Jest → gap dropped (EN and VI)', () => {
    expect(gap(1, 'I documented components in Storybook and implemented comprehensive testing with Jest.')).toEqual([]);
    expect(gap(1, 'Tôi đã sử dụng Storybook để viết tài liệu và viết các bài kiểm tra với Jest.')).toEqual([]);
  });

  it('the same requirements stay gaps when the letter really omits them', () => {
    expect(gap(0, 'I build accessible web pages with HTML and CSS.')).toHaveLength(1);
    expect(gap(1, 'I build React and TypeScript web apps.')).toHaveLength(1);
  });
});

describe('requirementCoveredByLetter: covered', () => {
  it('technology named in the requirement', () => {
    expect(covered('3+ years of React', 'I build React and TypeScript web applications.')).toBe(true);
    expect(covered('Experience with Jest', 'I use Jest for testing.')).toBe(true);
    expect(covered('Proficiency in Figma', 'My workflow includes Figma and design systems.')).toBe(true);
    expect(covered('Storybook', 'I document components in Storybook.')).toBe(true);
  });

  it('no numeric threshold needed: coverage is not satisfaction', () => {
    expect(covered('5+ years of React', 'I have worked with React on product teams.')).toBe(true);
  });

  it('possessive and filler words do not block coverage', () => {
    expect(covered("Bachelor's degree in related field", 'I hold a Bachelor of Software Engineering.')).toBe(true);
  });

  it('alternatives ("or"): one alternative is enough', () => {
    const req = 'Experience with design systems or component libraries';
    expect(covered(req, 'I built a shared component library used by 3 product teams.')).toBe(true);
    expect(covered(req, 'I would welcome the chance to contribute to your design system.')).toBe(true);
  });

  it('cvEvidence bridge only for requirements without a named technology', () => {
    expect(covered('Component tests', 'I test everything with Jest.', 'wrote tests with Jest')).toBe(true);
    // A named technology must be in the letter itself; evidence cannot stand in for it.
    expect(covered('TypeScript', 'I build React web apps.', 'React and TypeScript web apps')).toBe(false);
  });
});

describe('requirementCoveredByLetter: real gaps stay', () => {
  it('different technology in the letter', () => {
    expect(covered('Jest', 'I build React and TypeScript web apps.')).toBe(false);
    expect(covered('Figma', 'I work with React, TypeScript and Jest.')).toBe(false);
    expect(covered('Next.js', 'I build React apps with Nest and Node.')).toBe(false);
    expect(covered('Biết Next.js', 'I build React apps.')).toBe(false);
  });

  it('concept without a technology name', () => {
    expect(covered('User research', 'I focus on UI design and prototyping.')).toBe(false);
  });

  it('evidence terms absent from the letter → not covered; no evidence → not covered', () => {
    expect(covered('Component tests', 'I build React web apps.', 'wrote tests with Jest')).toBe(false);
    expect(covered('Component tests', 'I build React web apps.')).toBe(false);
  });

  it('whole tokens only: React ≠ Reactive, Go ≠ Google', () => {
    expect(covered('React', 'I build reactive interfaces.')).toBe(false);
    expect(covered('Go', 'I worked at Google.')).toBe(false);
  });
});

describe('requirementCoveredByLetter: generic overlap is not coverage', () => {
  it('generic words alone do not cover', () => {
    expect(covered('React application development', 'I have extensive application development experience.')).toBe(false);
    expect(covered('Figma design systems', 'I have extensive design experience.')).toBe(false);
    expect(covered('Strong communication skills', 'I have strong skills.')).toBe(false);
  });
});

describe('requirementCoveredByLetter: multi-concept (all named concepts required)', () => {
  it('React + TypeScript needs both', () => {
    expect(covered('React and TypeScript', 'I build React and TypeScript web apps.')).toBe(true);
    expect(covered('React and TypeScript', 'I work with React.')).toBe(false);
    expect(covered('React and TypeScript', 'I work with TypeScript.')).toBe(false);
    expect(covered('React and TypeScript', 'I develop web applications.')).toBe(false);
  });

  it('acronym plus concept: Accessibility (WCAG) needs both', () => {
    expect(covered('Accessibility (WCAG)', 'I care about accessibility.')).toBe(false);
    expect(covered('Accessibility (WCAG)', 'I test accessibility against WCAG.')).toBe(true);
  });
});

describe('requirementCoveredByLetter: languages', () => {
  it('EN requirement → VI letter', () => {
    expect(covered('3+ years of React', 'Tôi xây dựng ứng dụng web bằng React và TypeScript.')).toBe(true);
    expect(covered('Figma', 'Tôi xây dựng ứng dụng web bằng React.')).toBe(false);
  });

  it('VI requirement → VI letter', () => {
    expect(covered('Kinh nghiệm với React và TypeScript', 'Tôi có kinh nghiệm xây dựng ứng dụng bằng React và TypeScript.')).toBe(true);
    expect(covered('Kỹ năng nghiên cứu người dùng', 'Tôi thiết kế giao diện và nguyên mẫu.')).toBe(false);
    expect(covered('Kỹ năng nghiên cứu người dùng', 'Tôi thực hiện nghiên cứu người dùng cho từng tính năng.')).toBe(true);
  });

  it('VI requirement → EN letter (technology names carry over)', () => {
    expect(covered('Kinh nghiệm với Jest', 'I write component tests with Jest.')).toBe(true);
    expect(covered('Kinh nghiệm với Jest', 'I write React components.')).toBe(false);
  });
});

describe('requirementCoveredByLetter: product names and leading qualifiers (P1B.1 review)', () => {
  it('a two-word product name needs both words (no partial-name coverage)', () => {
    expect(covered('Google Analytics', 'I run Google Ads campaigns.')).toBe(false);
    expect(covered('Google Analytics', 'I report weekly results in Google Analytics.')).toBe(true);
    expect(covered('Data Studio', 'I use Android Studio.')).toBe(false);
  });

  it('a leading qualifier is not a required concept (EN and VI)', () => {
    expect(covered('Deep understanding of React', 'I build React apps.')).toBe(true);
    expect(covered('Practical experience with Docker', 'I deploy services with Docker.')).toBe(true);
    expect(covered('Am hiểu React', 'Tôi xây dựng ứng dụng bằng React.')).toBe(true);
    expect(covered('Nắm vững TypeScript', 'I write TypeScript every day.')).toBe(true);
    expect(covered('Ưu tiên ứng viên biết Next.js', 'I build Next.js apps.')).toBe(true);
    expect(covered('Deep understanding of React', 'I build Vue apps.')).toBe(false);
  });

  it('evidence quotes ignore generic section words', () => {
    expect(covered('Design tools', 'I prototype in Figma.', 'Listed in Skills: Figma')).toBe(true);
  });
});

