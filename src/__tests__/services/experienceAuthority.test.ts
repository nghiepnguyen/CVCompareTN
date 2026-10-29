import { describe, expect, it } from 'vitest';
import { inspectWorkTimeline, selectExperience } from '../../services/ai/experienceAuthority';
import { normalizeParsedCV, computeYearsOfExperience } from '../../services/ai/parsedCvNormalize';

const asOf = new Date('2026-10-15T00:00:00Z');
const job = (start = '', end = '', is_current: unknown = false, company = 'Acme', job_title = 'Engineer') => ({
  company, job_title, duration: { start, end, is_current }, responsibilities: [], achievements: [],
});
const evidence = (jobs: ReturnType<typeof job>[]) => jobs.map(j =>
  `${j.company} | ${j.job_title} | ${j.duration.start} - ${j.duration.is_current === true ? 'Present' : j.duration.end}`
).join('\n');
const inspect = (jobs: unknown[], sourceText?: string) => inspectWorkTimeline(jobs, { sourceText, asOf });
const normalize = (jobs: unknown[], model: unknown, sourceText?: string) => normalizeParsedCV({
  work_experience: jobs, ats_evaluation: { years_of_experience: model },
}, { sourceText, asOf })!;

describe('timeline inspection', () => {
  it.each([
    ['single', [job('01/2020', '12/2020')], 1],
    ['sequential/adjacent', [job('01/2020', '12/2020'), job('01/2021', '12/2021')], 2],
    ['overlap', [job('01/2020', '12/2022'), job('01/2021', '12/2023')], 4],
    ['duplicate', [job('01/2020', '12/2022'), job('01/2020', '12/2022')], 3],
    ['gap', [job('01/2020', '12/2020'), job('01/2022', '12/2022')], 2],
    ['current', [job('01/2020', 'Present', true)], 6.8],
    ['English months', [job('Jan 2020', 'December 2020')], 1],
    ['ISO months', [job('2020-01', '2020-12')], 1],
    ['intern and freelance', [job('01/2020', '12/2020', false, 'A', 'Intern'), job('01/2021', '12/2021', false, 'B', 'Freelance')], 2],
  ] as const)('uses union coverage for complete %s timeline', (_name, jobs, years) => {
    const timeline = inspect([...jobs], evidence([...jobs]));
    expect(timeline).toMatchObject({ completeness: 'COMPLETE', sourceSupport: 'verified', years });
    expect(selectExperience(99, timeline)).toBe(years);
  });

  it.each([
    ['undated', job('', '')],
    ['malformed', job('Jan-2021', 'Dec-2025')],
    ['missing current start', job('', 'Present', true)],
    ['reversed', job('12/2022', '01/2020')],
    ['malformed current flag', job('01/2020', '12/2020', 'false')],
    ['raw null', null],
    ['raw primitive', 'five years'],
  ])('retains the raw %s entry as incompleteness', (_name, extra) => {
    const dated = job('01/2018', '12/2021');
    const jobs = [dated, extra];
    expect(inspect(jobs, evidence([dated]))).toMatchObject({ completeness: 'PARTIAL', years: 4 });
  });

  it('does not replace a valid 9-year estimate with a 4-year subtotal', () => {
    const jobs = [job('01/2018', '12/2021'), job('', '', false, 'Earlier', 'Senior Engineer')];
    expect(normalize(jobs, 9, evidence([jobs[0]]) + '\nEarlier | Senior Engineer | 5 years, dates not provided').ats_evaluation.years_of_experience).toBe(9);
  });

  it.each([{ jobs: [] }, { jobs: [job()] }, { jobs: [job('bad', 'bad')] }, { jobs: [null] }])('marks unusable timelines unavailable: $jobs', ({ jobs }) => {
    const timeline = inspect(jobs);
    expect(timeline).toMatchObject({ completeness: 'UNAVAILABLE', years: null });
    expect(selectExperience(5, timeline)).toBe(5);
  });

  it('does not grant authority to fabricated dates in an undated role', () => {
    const jobs = [job('01/2019', '01/2024')];
    const sourceText = 'Acme | Engineer | 5 years. Calendar dates not provided.';
    expect(inspect(jobs, sourceText)).toMatchObject({ completeness: 'UNAVAILABLE', sourceSupport: 'unknown' });
    expect(normalize(jobs, 5, sourceText).ats_evaluation.years_of_experience).toBe(5);
  });

  it.each([undefined, 'Acme\nEngineer\n01/2020 - 12/2020', 'Other | Engineer | 01/2020 - 12/2020', 'Acme | Other | 01/2020 - 12/2020'])('keeps unavailable or unassociated source evidence unknown: %s', (sourceText) => {
    const jobs = [job('01/2020', '12/2020')];
    expect(inspect(jobs, sourceText)).toMatchObject({ sourceSupport: 'unknown', completeness: 'UNAVAILABLE' });
    expect(normalize(jobs, 8, sourceText).ats_evaluation.years_of_experience).toBe(8);
  });

  it('cannot borrow dates from another role on the same line', () => {
    const jobs = [job('01/2020', '12/2020')];
    const sourceText = 'Acme | Engineer | 01/2010 - 12/2011; Other | Manager | 01/2020 - 12/2020';
    expect(inspect(jobs, sourceText).sourceSupport).toBe('unknown');
  });

  it('cannot borrow the sole date pair from another role after an undated role', () => {
    const jobs = [job('01/2020', '12/2020')];
    const sourceText = 'Acme | Engineer | dates not provided; Other | Manager | 01/2020 - 12/2020';
    const timeline = inspect(jobs, sourceText);
    expect(timeline).toMatchObject({ completeness: 'UNAVAILABLE', sourceSupport: 'unknown' });
    expect(selectExperience(9, timeline)).toBe(9);
  });

  it('does not grant exact-month authority to year-only dates', () => {
    const jobs = [job('2018', '2022')];
    const timeline = inspect(jobs, evidence(jobs));
    expect(timeline).toMatchObject({ completeness: 'PARTIAL', years: 4.1 });
    expect(selectExperience(5, timeline)).toBe(5);
  });

  it('excludes future-only roles and caps explicit future ends at asOf', () => {
    const future = [job('01/2028', '12/2028')];
    expect(inspect(future, evidence(future))).toMatchObject({ completeness: 'UNAVAILABLE', years: null });
    expect(computeYearsOfExperience(future as never, asOf)).toBeNull();
    const crossing = [job('01/2020', '12/2030')];
    const timeline = inspect(crossing, evidence(crossing));
    expect(timeline).toMatchObject({ completeness: 'PARTIAL', years: 6.8 });
    expect(selectExperience(7, timeline)).toBe(7);
    expect(selectExperience(NaN, timeline)).toBe(6.8);
    expect(computeYearsOfExperience(crossing as never, asOf)).toBe(6.8);
  });

  it('requires actual boolean true for current-role arithmetic', () => {
    const jobs = [job('01/2020', '12/2020', 'false')];
    expect(normalize(jobs, 1, evidence(jobs)).work_experience[0].duration.is_current).toBe(false);
    expect(computeYearsOfExperience(jobs as never, asOf)).toBeNull();
  });
});

describe('experience selection', () => {
  const jobs = [job('01/2020', '12/2020'), job()];
  const partial = () => inspect(jobs, evidence([jobs[0]]));

  it.each([-1, Infinity, NaN, '5 years nonsense', '', ' ', 'Infinity', '0x10', false, null, undefined])('rejects invalid model value %s', model => {
    expect(selectExperience(model, inspect([]))).toBe(0);
    expect(selectExperience(model, partial())).toBe(1);
  });

  it('accepts numeric legacy strings without accepting junk prefixes', () => {
    expect(selectExperience('7.5', inspect([]))).toBe(7.5);
  });

  it('preserves legitimate zero but resolves source-backed positive conflicts', () => {
    expect(selectExperience(0, inspect([]))).toBe(0);
    expect(selectExperience(0, partial())).toBe(1);
    expect(selectExperience(0, inspect(jobs))).toBe(0);
  });

  it('uses a valid model estimate for partial source-backed coverage', () => {
    expect(selectExperience(9, partial())).toBe(9);
  });
});

describe('history experience snapshots', () => {
  it.each(['2026-10-15T00:00:00Z', '2027-04-15T00:00:00Z'])('keeps stored 6.8 at %s', date => {
    const stored = { work_experience: [job('01/2020', 'Present', true)], ats_evaluation: { years_of_experience: 6.8, relevant_score: 70, missing_keywords: ['Legacy'] } };
    const result = normalizeParsedCV(stored, { mode: 'history', asOf: new Date(date) })!;
    expect(result.ats_evaluation).toEqual(stored.ats_evaluation);
    expect(normalizeParsedCV(result, { mode: 'history', asOf: new Date(date) })).toEqual(result);
  });

  it('preserves stored zero even with ongoing work entries', () => {
    expect(normalizeParsedCV({ work_experience: [job('01/2020', '', true)], ats_evaluation: { years_of_experience: 0 } }, { mode: 'history' })!.ats_evaluation.years_of_experience).toBe(0);
  });
});
