import { describe, it, expect } from 'vitest';
import { normalizeTextualMonthYear } from '../../lib/cvDates';

describe('normalizeTextualMonthYear', () => {
  it.each([
    ['Jan 2022', '01/2022'],
    ['January 2022', '01/2022'],
    ['feb 2023', '02/2023'],
    ['MARCH 2021', '03/2021'],
    ['Apr 2020', '04/2020'],
    ['May 2019', '05/2019'],
    ['Jun 2018', '06/2018'],
    ['June 2018', '06/2018'],
    ['Jul 2017', '07/2017'],
    ['Aug 2019', '08/2019'],
    ['Sep 2024', '09/2024'],
    ['Sept 2024', '09/2024'],
    ['Sept. 2024', '09/2024'],
    ['September 2024', '09/2024'],
    ['Oct 2016', '10/2016'],
    ['Nov 2015', '11/2015'],
    ['December, 2014', '12/2014'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeTextualMonthYear(input)).toBe(expected);
  });

  it('rewrites month-year inside a range and keeps the rest', () => {
    expect(normalizeTextualMonthYear('Jan 2022 – Present')).toBe('01/2022 – Present');
    expect(normalizeTextualMonthYear('Aug 2019 – Dec 2021')).toBe('08/2019 – 12/2021');
  });

  it('never invents a month for year-only or already-numeric dates', () => {
    expect(normalizeTextualMonthYear('2022')).toBe('2022');
    expect(normalizeTextualMonthYear('2018 - 2022')).toBe('2018 - 2022');
    expect(normalizeTextualMonthYear('06/2022 - nay')).toBe('06/2022 - nay');
    expect(normalizeTextualMonthYear('Tháng 6/2022')).toBe('Tháng 6/2022');
  });

  it('leaves words that merely contain a month name alone', () => {
    expect(normalizeTextualMonthYear('Summary 2022')).toBe('Summary 2022');
    expect(normalizeTextualMonthYear('Dismay 2022')).toBe('Dismay 2022');
    expect(normalizeTextualMonthYear('May')).toBe('May');
  });
});
