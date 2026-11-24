# P1-B review hardening — cron integration, adversarial SQL review, G3 notice

- Date: 2026-11-24
- PR: #107 (`docs/p1-privacy-prep`, baseline `6614917`), stays **Draft**
- G3 UI: separate Draft PR, branch `feat/p1b-g3-admin-retention-notice` (off `main` `2e5881d`)
- Scope: technical review readiness of option B only. Legal retention decision (90 / 400 days) unchanged.
- Production: **not touched.** No production read or write, no migration, no cron activation, no deletion, no policy publication, no Gemini call, no VM. Everything ran on a disposable local Supabase stack (`scripts/ci/db-stack.sh`, project `cvfit_p1b`, ports 5532x, `supabase/postgres:17.6.1.106`, pg_cron 1.6.4) and in a local Vite dev server pointed at that stack.

**Verdict: P1-B technical readiness PASS. Production remains NO-GO** (legal gates G1, G9, G10 and owner gates G2/G2b open).

## 1. Adversarial review of `supabase/proposed/p1-log-retention/`

No P0 or P1 finding.

| # | Sev | Finding | Status |
|---|---|---|---|
| F1 | P2 | `scrub_expired_analysis_log_detail()` and `purge_expired_analysis_log()` were `GRANT EXECUTE … TO service_role`, but no API code calls them (only `_server-lib/analysisLog.ts` insert and `accountLock.ts` hourly count touch `analysis_log`). Both are in `public`, so any holder of the service key could run the irreversible scrub over `/rest/v1/rpc` — e.g. before the owner's counted first run (runbook step 4). Bounded by the settings floors, but unneeded. | **Fixed:** EXECUTE revoked from service_role in 01 and 03; test and `verify.prod.sql` now assert no API role can execute; PostgREST returns 403 (service key) / 401 (anon) for all three P1 functions. |
| F2 | P2 | A setting such as `99999999999` passed the `^[0-9]+$` check and then overflowed `::integer` with SQLSTATE 22003 instead of the documented 22023. Still fail-closed (raises before any change), but the error contract and tests only covered 22023. | **Fixed:** digits limited to `{1,4}`; tests add `99999999999`, `1e10`, `400.0`, `true`. |
| F3 | P2 (test) | `bool_and(prosecdef AND proconfig = ARRAY[...])` ignores NULLs, so a function created **without** `SET search_path` (NULL `proconfig`) passed the check. Found by mutation testing ("purge search_path unset" survived). Same pattern in `verify.prod.sql`. | **Fixed:** `IS NOT DISTINCT FROM` in the test and in `verify.prod.sql`. |
| F4 | P2 (test) | Ownership (`proowner = postgres`) was never asserted. | **Fixed:** asserted for all three functions in the test, `verify.prod.sql` and `cron_integration.sh`. |
| F5 | P2 (test) | `verify.prod.sql` `scrub_job_ok` checked schedule/active/user but not the command. | **Fixed.** |
| I1 | Info | `search_path = ''` everywhere; every object schema-qualified; built-ins resolve through implicit `pg_catalog`. No dynamic SQL, so no injection surface; the cron commands are literals. | OK |
| I2 | Info | Periods come only from `app_settings`. API roles have no INSERT/UPDATE/DELETE on it (`20261101250000`); `admin_update_app_setting` rejects both keys (tested). service_role can write it, but floors (rows ≥ 366, detail ≥ 90, detail ≤ rows) are enforced at run time, so a stolen service key cannot shorten retention below the legal floor. | OK |
| I3 | Info | `app_settings` is SELECT-able by anon and authenticated (existing policy). The retention values become publicly readable; they are not secret. | Accepted |
| I4 | Info | Transaction boundaries: validation happens before the single UPDATE / DELETE in the same function call; pg_cron runs each command in its own transaction, so a failure leaves nothing partial (proven via real cron runs, §2). | OK |
| I5 | Info | Races: concurrent `purge-fit-shadow` and scrub take row locks; READ COMMITTED re-checks the WHERE after a lock wait. Both jobs fired together every 2 s with no failed run and the right end state (§2). New inserts are always newer than any cutoff. | OK |
| I6 | Info | Boundaries: `created_at < now() - N days`; exactly-90 and exactly-400-day rows are kept (tested). `now()` is the transaction start; cron sessions run in GMT, so DST does not apply. | OK |
| I7 | Info | Cron privileges: API roles have no USAGE on schema `cron` (ACL exactly `{supabase_admin=UC, postgres=U*}`); `cron` is not a PostgREST schema (`PGRST106`). pg_cron's default PUBLIC SELECT on `cron.job` is unreachable without schema USAGE. Jobs run as `postgres` (probe job: `current_user = session_user = postgres`). | OK |
| I8 | Info | Fail-closed: invalid/missing settings make every cron run `failed` with the 22023 text; jobs stay active and retry daily. **Failure is only visible in `cron.job_run_details` / Postgres logs — there is no alerting.** `verify.prod.sql` shows `last_scrub_run`; the owner must check it after activation. | Recommendation (ops) |
| I9 | Info | PII: RAISE messages contain only numbers and key names. A canary string in `error_message` never appeared in `job_run_details` or the Postgres log. Preflight/verify output counts and md5 fingerprints of ids only. | OK |
| I10 | Info | Accidental execution: no `supabase/config.toml` in the repo; `db push` reads only `supabase/migrations`; `scripts/ci/db-tests.sh` runs `supabase/tests/*.test.sql`; the stub harness loads `/repo/migrations/*.sql`. Nothing loads `supabase/proposed/`. The new scripts refuse a non-local `SUPABASE_URL`. | OK |
| I11 | Info | RLS: the DEFINER functions run as `postgres` (BYPASSRLS), as intended; the P0-H ACL on `analysis_log` is unchanged (asserted). | OK |
| I12 | Info (env) | On the local image `supabase/postgres:17.6.1.106` (aarch64), **any** EXECUTE-denied function call made from a `postgres` psql session after `SET ROLE` segfaults the backend (reproduced with a trivial SQL function; denied table reads are fine). The same denial through PostgREST (`authenticator` → `SET LOCAL ROLE`) returns 42501 cleanly with no crash. Not caused by P1-B, not reachable from the API path tested; tests therefore check denial with `has_function_privilege` and over HTTP, never by calling. Worth reporting upstream; production not probed (would risk a crash). | Noted |

**Not changed:** the 90/400 periods, the floors, the two-stage design, the separate approval for 04.

## 2. pg_cron integration (real execution) — `cron_integration.sh`

Applies 01/02/04 to the disposable stack, commits synthetic rows, re-times the jobs with `cron.alter_job` to every 2 seconds, waits on `cron.job_run_details`, then restores every definition and asserts it byte-for-byte. **10/10 checks PASS** (~70 s):

| Task item | Result |
|---|---|
| 1 Extensions and permissions | pg_cron present; API roles: no `cron` USAGE, no PostgREST access; `/rpc` on all three P1 functions → 403/401 |
| 2 Actual scrub execution | Scrub job ran ≥3 times: 31/89-day rows keep detail, 91/92/399/401/402 scrubbed. Purge job ran ≥3 times: 401/402 deleted, 399 kept |
| 3 Ownership / execution role | Jobs `username = postgres`, database `postgres`; probe job saw `current_user = session_user = postgres`; functions owned by postgres |
| 4 Invalid settings | `365`, `99999999999`, missing detail key: every scrub **and** purge run `failed`, `return_message` carries the 22023 text |
| 5 No partial deletion | Full-row fingerprint identical across all failed runs (fresh scrubbable and expired rows present) |
| 6 fitShadow purge | `purge-fit-shadow` and scrub fired together ≥3 times each, 0 failed; 40-day row stripped to `{"v":1}`, 95-day row NULL |
| 7 Idempotency | Fingerprint after run 1 = after run 3 (scrub); purge repeat deletes nothing |
| 8 Billing / quota / history | Ledger, history (incl. a 500-day row), payments, admin_audit_log, profiles, `usage_count` unchanged |
| 9 Failure visibility | Failed runs recorded with reason; jobs stay `active`; canary row text absent from `job_run_details` and Postgres log |
| 10 Disable / rollback | `active := false` at a 2-second schedule → 0 runs in 7 s, rows untouched. `cron.unschedule` + `DROP FUNCTION` leaves the 4 existing jobs intact. Dropping functions **before** unscheduling makes each run fail visibly (`does not exist`), never silently — so the runbook order (unschedule, then drop) stands |

## 3. Mutation testing — `mutants.sh` (scripted, reproducible)

Each mutant is a copy of 01/02/03/04 with one defect, applied to a P1-clean stack exactly as production would apply it. The harness first proves the unmutated files pass. Result: see §6.

The first harness version re-applied the unmutated 01 before each mutant, which made seed and REVOKE mutants no-ops; fixed (clean, then apply only the mutant), and a baseline guard was added so a failing baseline can no longer count as kills.

## 4. G3 admin report notice (separate Draft PR)

- `src/components/views/AdminReportTab.tsx`: a `role="note"` block on its own row under the range selector / custom dates.
  - VI: "Chi tiết lỗi chỉ được lưu 90 ngày. Số liệu hoạt động tổng hợp dự kiến được lưu tối đa 400 ngày."
  - EN: "Error details are kept for 90 days. Aggregate activity data is planned to be kept for up to 400 days."
  - When a custom range starts before the first fully-detailed VN day (today − 89; part of day −90 is already scrubbed): "…error categories before that date no longer have details and may be empty. That does not mean there were no errors." This replaces the earlier draft's "Older ranges show zero", which would be false while row deletion (04) is unapproved.
- **Gated off:** shown only when `VITE_ANALYSIS_LOG_RETENTION_ACTIVE` is exactly `true`. Production does not set it, so merging the PR changes nothing visible. Runbook step 6 sets it in the release that applies 02.
- Static text, nothing focusable; at 375 px the note spans x 12–363. (The report page already overflows to 437 px at 375 because of the existing filter row's export button — pre-existing, not touched.)
- Tests: `src/__tests__/components/AdminReportTab.retention.test.tsx` (4 tests): hidden when unset or `"1"`; shown after the range buttons; warning boundary −90 warns / −89 does not; stale custom dates ignored for `30d`. **7/7 UI mutants killed.**
- Screenshots (local stack, local test admin only): `docs/audits/evidence/2026-11-24-p1b-g3-notice-en-desktop.jpg`, `…-vi-375px.jpg`.

## 5. Verification

See §6 for the numbers. No Gemini call anywhere (no AI route exercised; the dev server only loaded the admin report).

## 6. Results

| Check | Result |
|---|---|
| Existing DB suite, fresh stack, **without** P1 (`scripts/ci/db-tests.sh`) | 34 suites, 0 failed, deadlocks 0 |
| Existing DB suite, fresh stack, **with** 01 + 02 + 04 applied | 34 suites, 0 failed, deadlocks 0 |
| `purge_expired_analysis_log.test.sql` | PASS after 01; after 01+02; after 01+02+04 |
| `verify.prod.sql` run on the local stack after 01+02+04 (smoke of the script itself) | every `*_ok` = t; `purge_jobs` = 1; remaining = 0 |
| `cron_integration.sh` (real pg_cron execution) | 10/10 PASS |
| `mutants.sh` | **38/38 killed** (34 SQL incl. 4 rollup, 4 real-cron); both baselines pass |
| Security regression | PostgREST `/rpc` on scrub / purge / helper: 403 (service key), 401 (anon); `cron` schema not exposed (PGRST106) |
| G3: `npm run lint`, `npm run lint:api` | PASS |
| G3: `npx vitest run` | 134 files / 2063 tests passed, 76 skipped (DB-gated, as on main) |
| G3: `npm run build` | PASS |
| G3: UI mutants | 7/7 killed |
| Gemini / VM | none |

## 7. GO / NO-GO matrix

| Gate | Status |
|---|---|
| G1 counsel: scope of Decree 333 Art. 16.6/20.3 (Q1–Q3); B vs A vs longer | **OPEN** |
| G2 owner approves irreversible first scrub | **OPEN** |
| G2b owner approves row deletion (04) before ~2027-08-06 | **OPEN** |
| G3 admin notice | **PASS (engineering)** — Draft PR, gated off, not merged |
| G4 option B SQL + tests on disposable DB | **PASS** |
| G4b real pg_cron execution, fail-closed, rollback drill | **PASS** (new) |
| G4c adversarial SQL review | **PASS** — 0 P0/P1; 5 P2 fixed; I8 (no alerting on failed runs) is an ops recommendation |
| G5–G8 dump rule, Supabase/Sentry checks, policy approval | **OPEN** |
| G9 localization / cross-border transfer | **OPEN** (largest exposure) |
| G10 12-month auth/IP log | **OPEN** |
| G11 A3.4/A3.5 flags off | PASS |

**P1-B technical readiness: PASS. Production: NO-GO** until G1, G2 (and G2b for 04), G5–G8 are closed and the owner separately approves. G9/G10 are independent legal blockers.

## 8. How to reproduce (disposable stack only)

```bash
W=$(mktemp -d); scripts/ci/db-stack.sh "$W"     # remap 543xx ports first if 54321 is taken
P=supabase/proposed/p1-log-retention
supabase/proposed/p1-log-retention/cron_integration.sh "$W"
(cd "$W" && supabase db reset)
supabase/proposed/p1-log-retention/mutants.sh "$W"   # ~6 min; --no-cron skips the 4 real-cron mutants
(cd "$W" && supabase stop --no-backup)
```
