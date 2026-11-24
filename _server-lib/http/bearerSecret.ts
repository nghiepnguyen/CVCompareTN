import { timingSafeEqual } from 'node:crypto';

/** Machine-to-machine bearer check (GitHub Actions jobs): unset or < 32 chars = always refuse. */
export function validBearerSecret(header: string | undefined, secret: string | undefined): boolean {
  const s = secret?.trim();
  if (!s || s.length < 32 || !header) return false;
  const expected = Buffer.from(`Bearer ${s}`);
  const actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
