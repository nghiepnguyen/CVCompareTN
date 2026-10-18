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
