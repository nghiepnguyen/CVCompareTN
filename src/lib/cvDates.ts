// English month names → number. Keys are lowercase; "sept" is a common
// variant of "sep". Every other accepted spelling is the 3-letter prefix or
// the full name.
const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

// "<Month> <YYYY>" with an optional dot/comma after the month ("Sept. 2024",
// "January, 2022"). A month without a year is left alone: it has no date
// meaning on its own, and a bare year must never gain an invented month.
const MONTH_YEAR = new RegExp(`\\b(${Object.keys(MONTHS).join('|')})\\.?,?\\s+((?:19|20)\\d{2})\\b`, 'gi');

/** Rewrites English textual month-year dates ("Jan 2022", "September 2024") to MM/YYYY. Year-only text is unchanged. */
export function normalizeTextualMonthYear(text: string): string {
  return text.replace(MONTH_YEAR, (_, month: string, year: string) =>
    `${String(MONTHS[month.toLowerCase()]).padStart(2, '0')}/${year}`
  );
}
