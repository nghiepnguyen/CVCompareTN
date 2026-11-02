// Project time zone: ICT (UTC+7). Storage stays UTC; day/month boundaries and
// display use ICT. See docs/11_timezone.md.
export const VN_TIME_ZONE = 'Asia/Ho_Chi_Minh';

// Vietnam has no DST, so a fixed +7h offset is exact.
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** ICT calendar parts of an instant. `m` is 0-based like Date#getMonth. */
export function vnDateParts(d: Date): { y: number; m: number; day: number } {
  const vn = new Date(d.getTime() + VN_OFFSET_MS);
  return { y: vn.getUTCFullYear(), m: vn.getUTCMonth(), day: vn.getUTCDate() };
}

/** Instant of 00:00 ICT on the ICT day of `d`, shifted by `addDays`/`addMonths`. */
export function vnStartOfDay(d: Date, addDays = 0, addMonths = 0): Date {
  const { y, m, day } = vnDateParts(d);
  return new Date(Date.UTC(y, m + addMonths, day + addDays) - VN_OFFSET_MS);
}

/** Initial quota cycle for a new profile; must match public.current_quota_cycle(reset_day). */
export function vnSignupQuotaCycle(now: Date): { resetDay: number; usageMonth: string } {
  const { y, m, day } = vnDateParts(now);
  const resetDay = Math.min(day, 28);
  const pad = (n: number) => String(n).padStart(2, '0');
  return { resetDay, usageMonth: `${y}-${pad(m + 1)}-${pad(resetDay)}` };
}

const locale = (lang: 'vi' | 'en') => (lang === 'vi' ? 'vi-VN' : 'en-US');

/** Instant (UTC ISO) shown as an ICT calendar date. */
export function formatVnDate(iso: string, lang: 'vi' | 'en'): string {
  return new Date(iso).toLocaleDateString(locale(lang), { timeZone: VN_TIME_ZONE, day: '2-digit', month: 'short', year: 'numeric' });
}

/** Instant (UTC ISO) shown as ICT date + time. */
export function formatVnDateTime(iso: string, lang: 'vi' | 'en'): string {
  return new Date(iso).toLocaleString(locale(lang), { timeZone: VN_TIME_ZONE, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** A plain `YYYY-MM-DD` date (e.g. a deadline): no instant, so no time-zone shift. */
export function formatPlainDate(ymd: string, lang: 'vi' | 'en'): string {
  return new Date(`${ymd}T00:00:00Z`).toLocaleDateString(locale(lang), { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' });
}

/** Today's ICT calendar date as `YYYY-MM-DD`. */
export function vnTodayYmd(now = new Date()): string {
  const { y, m, day } = vnDateParts(now);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${y}-${pad(m + 1)}-${pad(day)}`;
}
