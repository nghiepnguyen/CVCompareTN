# M2-C2A — Production Migration Safety Preflight

Date: 2026-11-16 · Branch `feat/m2c2-monthly-quota-integrity` · Production baseline `375b13e`
Migration: `supabase/migrations/20261116000000_analytics_quota_reservations.sql`
sha256 (after this preflight): `c67fbae5668d28fefe7841988ff2ebd1feff55c18d982b656b623190c4293820`
Method: static review, read-only production catalog queries, local Supabase (PG 17.6, same as prod). No production writes, no Gemini, nothing pushed.

## 1. Gates

| Gate | Result | Evidence |
|---|---|---|
| Destructive operations | PASS | Top-level DDL is only CREATE TABLE/INDEX/FUNCTION, COMMENT, ALTER (own table RLS), REVOKE/GRANT. No DROP/ALTER of existing objects. UPDATEs exist only inside function bodies (runtime). |
| Existing object modifications | PASS | Prod has no objects named `analytics_quota%` / `*_analytics_quota` (catalog query), so `CREATE OR REPLACE` / `IF NOT EXISTS` cannot replace or silently skip anything. Legacy `check_analytics_quota` / `increment_usage_count` untouched (md5 equal before/after). |
| Locking | PASS | Migration takes `ShareRowExclusiveLock` on `profiles` (FK creation): blocks profile writes, not reads, for ~13 ms locally; prod `profiles` has 36 rows, new table empty. |
| Atomicity | PASS | Supabase CLI applies each migration file in one transaction: a probe migration failing after a CREATE left nothing behind and was not recorded. CREATEs and REVOKEs commit together → no window where defaults expose the functions. |
| Default privileges | PASS (fixed) | Prod `pg_default_acl` grants EXECUTE on new functions and ALL on new tables to anon/authenticated/service_role. Migration revokes explicitly. Preflight found internal helpers still EXECUTE-able by `service_role` → migration amended to revoke them (direct calls could skip the profile lock). |
| RLS / SECURITY DEFINER | PASS | RLS on, no policies, no anon/authenticated table grants; 3 RPCs definer with `search_path=""`, schema-qualified; helpers invoker, revoked from everyone. |
| Prod schema dependencies | PASS | All `profiles` columns/types present; `gen_random_uuid()` present; 9/10 dependency functions byte-identical to local replay (md5). See drift note §4. |
| Fresh migration replay | PASS | `supabase db reset`: 89 migrations (prod head `20261105000000` + this one), no errors; repeated after amendment. |
| SQL security assertions | PASS | `supabase/tests/analytics_quota_reservations.test.sql` all passed (now also asserts service_role cannot call helpers). |
| Real DB concurrency | PASS | `scripts/db-quota-concurrency.ts` 12/12 ×4 runs; `scripts/db-quota-plan-concurrency.ts` 7/7 ×4 runs (real `activate_pro_plan`, `admin_set_user_plan`, expiry, rollover, late commit, mixed storm). |
| Lock ordering / deadlocks | PASS | All ledger RPCs lock `profiles` → reservation. `activate_pro_plan` locks `payments` → `profiles`; `admin_set_user_plan` / `sync_profile_usage_month` lock only `profiles`. No cycle possible. `pg_stat_database.deadlocks` = 0 after all runs; no "deadlock detected" in logs. |
| Legacy compatibility | PASS | With the ledger present, legacy check/increment behave unchanged (see committed usage, enforce limit); deployed prod code never calls the new objects. |
| Rollback | PASS | Rollback with live ledger rows: table + 7 functions dropped, `usage_count` preserved, legacy RPCs work; re-apply clean. Note: rollback leaves the `schema_migrations` row → `supabase migration repair --status reverted 20261116000000` before any re-apply (now documented in the rollback file). |
| Push procedure / version set | PASS | Prod vs branch version sets differ by exactly `20261116000000`; dry-run from the M2-C2 checkout lists only it (§5). |
| Unresolved critical risks | PASS | None. Open items below are non-critical. |

## 2. Plan-change concurrency (real RPCs)
| Scenario | Result |
|---|---|
| P1 20 reserves racing `activate_pro_plan` (free→pro) | reserved 12/20 (before upgrade: limit 5; after: 100); usage = 4 + commits; ≤ limit |
| P2 10 commits racing `admin_set_user_plan(free)` at usage 90 | all settled once; invariant holds (downgrade resets usage to 0 — existing behaviour) |
| P3 plan expiry mid-flight, commits + 10 new reserves | demoted to free once; charged + new reserves ≤ 5 |
| P4 rollover racing 4 prior-cycle commits + 10 reserves | 4 `prior_cycle` uncharged, 5 reserved, usage reset to 0 |
| P5 late commit after upgrade + TTL expiry, double commit | committed once (`late_commit`), usage +1 |
| P6 mixed storm (commits, uncertain, upgrade, downgrade, 15 reserves) | no RPC errors, invariant holds |

## 3. Local segfault investigation (local only; production not probed)
- Reproduces only when the **login role is `postgres`** (privileged under `supautils`, `session_preload_libraries=supautils`), the session switches role (`SET [LOCAL] ROLE authenticated`) and calls a **non-inlined function it lacks EXECUTE on** — any language, definer or invoker, any schema.
- Does **not** reproduce: same SQL from the `authenticator` login (PostgREST's role) → clean `ERROR: permission denied for function`; generic errors (division by zero) and table permission errors under the switched role; IMMUTABLE SQL functions (inlined at plan time); real PostgREST requests (Postgres logs the clean permission error).
- Prod has the same PG 17.6 + supautils preload, so the bug is likely latent there, reachable only from a `postgres`-login session (owner / SQL editor). No app path uses that combination; the migration runs as `postgres` without role switching.
- Not caused by this migration (pre-existing functions crash the same way). Recommendation: never run `SET ROLE … ; SELECT revoked_fn()` as `postgres` in production; report upstream to Supabase (supautils).

## 4. Findings outside the migration
- **Pre-existing drift:** prod `get_default_monthly_analytics_limit()` falls back to `20`, repo migration `20260912000000` (recorded as applied) sets `5`. Inert while `app_settings.default_monthly_analytics_limit = 5` (current prod value); legacy and new paths call the same function. Fix separately.

## 5. Production apply + verification (for the approval step)
Candidate: commit `1844d94` (migration amended after the M2-C2 approval of `68c4c9f`: helpers also revoked from `service_role`), sha256 `c67fbae5668d28fefe7841988ff2ebd1feff55c18d982b656b623190c4293820`.

Version-set evidence (read-only, 2026-11-16): production `schema_migrations` (88 versions) vs `supabase/migrations` at `1844d94` (89) differ by exactly `20261116000000`; nothing exists only in production. `supabase db push --dry-run --linked` from the M2-C2 checkout: "Would push these migrations: 20261116000000_analytics_quota_reservations.sql" only.

1. Apply **only from a clean checkout at `1844d94`** linked to the project — **never from the main checkout** (currently `feat/p3a-interview-prep` with uncommitted edits; it does not contain this migration, and any future local-only migration there would be pushed too).
2. Re-run `supabase db push --dry-run --linked` immediately before applying; it must list only `20261116000000`, otherwise stop.
3. Apply: `supabase db push --linked`.
4. Immediately run `supabase db query --linked -f supabase/tests/analytics_quota_reservations.prod_verify.sql` (SELECT-only). All 16 rows must be `ok = true`: migration recorded; RLS on, no policies, no anon/authenticated table grants; column + constraint md5; exactly 7 functions with expected md5 / definer / `search_path` / grants; legacy check/increment md5 unchanged; ledger empty.
5. Watch production for 15 minutes (legacy app still deployed): `/api/analyze` error rate and latency unchanged; no lock waits on `profiles`.

**Rollback triggers (migration stage, before any app deploy):** any verify row false; any anon/authenticated privilege on the new objects; analyze error rate or latency regression attributable to the migration. Action: run `supabase/rollback/20261116000000_analytics_quota_reservations.sql`, then `supabase migration repair --status reverted 20261116000000`.
**Later (app deploy stage, separate approval):** sustained `quota_unavailable` 503s, any `quota_settlement_unavailable`, 429 monthly for users under limit, or reservations stuck `reserved` past TTL → roll back the app first, then the migration if needed.

## 6. Changes made during preflight
- Migration: revoke internal helpers from `service_role` (function bodies unchanged; md5 of definitions unchanged).
- SQL test: asserts service_role cannot execute helpers.
- New `scripts/db-quota-plan-concurrency.ts`; `npm run test:db:quota` runs both concurrency suites.
- New read-only `supabase/tests/analytics_quota_reservations.prod_verify.sql`.
- Rollback file: migration-history repair note.

## 7. Remaining risks (non-critical)
- Concurrent waived-commit path (`over_limit_waived`) exercised single-session only; under concurrency the downgrade landed after commits.
- Supabase-side supautils crash (latent, owner-session only).
- Repo/prod drift in `get_default_monthly_analytics_limit` fallback.
- DB suites not in CI.

## 8. Recommendation
**GO** for applying migration `20261116000000` at commit `1844d94` (sha256 `c67fbae5…3820`) to production, only from the M2-C2 checkout after a dry-run that lists only this migration, followed immediately by the read-only verification script, with the rollback triggers above. App deploy, push and Preview remain separate approvals.
