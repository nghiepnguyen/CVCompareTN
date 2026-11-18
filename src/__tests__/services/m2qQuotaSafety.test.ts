// M2-Q Phase 1A: client-side and repository-level quota ledger guarantees.
// Owner decisions Q-D1..Q-D3 (2026-11-18): the ledger is kept forever, with no
// purge and no global expiry sweep. The database side is covered by
// supabase/tests/m2q_quota_safety.test.sql and scripts/db-m2q-quota-safety.ts.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { analyzeCV } from '../../services/ai/analysisService';

const ROOT = join(__dirname, '../../..');

afterEach(() => vi.unstubAllGlobals());

describe('client never treats an unsettled analysis as a result', () => {
  it.each([
    [503, { error: 'Quota settlement unavailable', code: 'quota_settlement_unavailable', retryable: true }],
    [409, { error: 'Duplicate request', code: 'duplicate_request', state: 'committed' }],
    [503, { error: 'Quota verification unavailable', code: 'quota_unavailable', retryable: true }],
  ])('HTTP %i %o rejects', async (status, payload) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(payload), { status })));
    await expect(analyzeCV('jd', 'cv', 'text/plain')).rejects.toThrow();
  });
});

// Every place that could ship a deletion of ledger rows: migrations, server
// code, API handlers, the client and local scripts. Test files are excluded
// (this file spells the patterns out).
const SCANNED = ['supabase/migrations', '_server-lib', 'api', 'server', 'src', 'scripts', 'server.ts'];
const TABLE = 'analytics_quota_reservations';
const SQL_DELETE = new RegExp(`(delete\\s+from|truncate(\\s+table)?)\\s+(only\\s+)?("?public"?\\.)?"?${TABLE}`, 'i');
const JS_DELETE = new RegExp(`from\\(\\s*['"\`]${TABLE}['"\`]\\s*\\)[^;]*?\\.delete\\(`, 's');
const CRON = new RegExp(`cron\\.schedule\\([^;]*${TABLE}`, 'is');

function files(path: string): string[] {
  const abs = join(ROOT, path);
  if (statSync(abs).isFile()) return [abs];
  return readdirSync(abs, { withFileTypes: true }).flatMap((e) => {
    if (e.name === 'node_modules' || e.name === '__tests__' || /\.test\.(ts|tsx)$/.test(e.name)) return [];
    return e.isDirectory() ? files(join(path, e.name)) : /\.(sql|ts|tsx|js|mjs)$/.test(e.name) ? [join(abs, e.name)] : [];
  });
}

describe('no cleanup path deletes quota ledger rows (Q-D1 keep forever)', () => {
  const scanned = SCANNED.flatMap(files);

  it('scans the expected sources', () => {
    const rel = scanned.map((f) => relative(ROOT, f));
    expect(rel).toContain('supabase/migrations/20261116000000_analytics_quota_reservations.sql');
    expect(rel).toContain('_server-lib/quota/monthlyQuota.ts');
    expect(rel.length).toBeGreaterThan(100);
  });

  it('no SQL DELETE/TRUNCATE, supabase-js .delete() or cron job targets the ledger', () => {
    const offenders = scanned.filter((f) => {
      const text = readFileSync(f, 'utf8');
      return SQL_DELETE.test(text) || JS_DELETE.test(text) || CRON.test(text);
    }).map((f) => relative(ROOT, f));
    expect(offenders).toEqual([]);
  });

  it('the patterns catch the deletions they are meant to catch', () => {
    expect(SQL_DELETE.test(`DELETE FROM public.${TABLE} WHERE expires_at < now()`)).toBe(true);
    expect(SQL_DELETE.test(`truncate table ${TABLE}`)).toBe(true);
    expect(JS_DELETE.test(`svc.from('${TABLE}')\n  .delete()\n  .lt('created_at', x)`)).toBe(true);
    expect(CRON.test(`SELECT cron.schedule('purge', '0 1 * * *', 'DELETE FROM ${TABLE}')`)).toBe(true);
    expect(SQL_DELETE.test(`DELETE FROM public.api_rate_limits`)).toBe(false);
  });
});
