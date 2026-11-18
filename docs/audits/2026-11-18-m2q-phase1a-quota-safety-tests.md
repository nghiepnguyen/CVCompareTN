# M2-Q Phase 1A — Quota ledger safety regression tests

- Date: 2026-11-18. Baseline `main` `e545711`.
- Design and owner decisions: `docs/audits/2026-11-18-m2q-quota-ledger-reliability-audit.md` (audit PR #86).
  - Q-D1: keep the ledger forever.
  - Q-D2: no global expiry sweep.
  - Q-D3: no purge of expired reservations.
  - Q-D4: personal result store deferred.
- Scope: **tests only.** No runtime change, no migration, no production access, no Gemini call.

## Path review

Every reserve, commit, refund and idempotency path was re-read before the tests were written. Nothing deletes ledger rows:

- **Database:** `reserve`, `commit` and `release_analytics_quota`; `analytics_quota_expire` and `analytics_quota_mark_uncertain`; `claim_candidate_analysis`; `save_candidate_analysis_attempt`; the three pg_cron jobs.
- **Server:** `_server-lib/quota/monthlyQuota.ts` and `_server-lib/analyze/handler.ts`.
- **Client:** `analysisService.analyzeCV` and the `RecruiterContext` run loop.

The only cascade into the ledger is account deletion (`profiles` ON DELETE CASCADE).

## Added

| File | What |
|---|---|
| `supabase/tests/m2q_quota_safety.test.sql` | S1 static catalog guards. S2 open-candidate evidence. S3 expired reservation kept, no global sweep. S4 replay never charges. Runs every pg_cron job command except `storage-cleanup` (HTTP only). |
| `scripts/db-m2q-quota-safety.ts` (`npm run test:db:m2q`) | Real PostgREST concurrency: two tabs × 8 candidates; 20 parallel replays of one key; evidence under parallel sweeps and claims; idle user's expired row under other users' traffic. |
| `src/__tests__/services/m2qQuotaSafety.test.ts` | Client rejects 503 and 409 quota answers. Repository scan: no SQL DELETE/TRUNCATE, supabase-js `.delete()` or cron job targets the ledger. Pattern self-test. |
| `src/__tests__/services/m2c2MonthlyQuota.test.ts` | 4 new cases: every commit answer other than `committed` returns 503 `quota_settlement_unavailable` without the result. |

## Mutation checks (each guarantee broken on purpose)

SQL mutants run inside the test transaction (rolled back). PostgREST mutants are applied to the local database, the script is run, and the original function definitions are restored (md5 checked). After the `m4` mutant the database was reset with `supabase db reset`.

| Mutant | SQL test | PostgREST script | Vitest |
|---|---|---|---|
| m1 new function `DELETE FROM` the ledger | KILLED (S1 static) | — | — |
| m2 maintenance job deletes via dynamic SQL (evades regex) | KILLED (S2) | — | — |
| m3 expiry sweeps every user (global sweep) | KILLED (S3) | KILLED (case 4) | — |
| m4 reserve dedupe removed | KILLED (S4) | KILLED (cases 1, 2, 3) | — |
| m5 claim reads `committed` as "never ran" | KILLED (S2) | KILLED (case 3) | — |
| m6 expiry deletes instead of settling | KILLED (S2) | — | — |
| m7 cron job deletes from the ledger | KILLED (S1 cron) | — | — |
| m8 new cron job calls a dynamic-SQL delete function | KILLED (S2, via cron command) | — | — |
| m9 claim row lock removed (race) | survives (single session cannot race) | KILLED 3/3 runs (owners 1–8 per candidate) | — |
| V1 commit accepts any non-`conflict` answer | — | — | KILLED (3 cases) |
| V2 client resolves non-ok responses | — | — | KILLED (3 cases) |
| V3 migration with `DELETE FROM` the ledger | — | — | KILLED (scan) |
| V4 server code `.from(ledger).delete()` | — | — | KILLED (scan) |
| V5 recruiter run loop dispatches on `active` (both claim gates removed) | — | — | KILLED (existing `m2d3Recruiter`: "a claim reported active (two tabs) is skipped without a Gemini call") |

The first SQL run of m4 and m5 failed for the wrong reason: the assertion message used `text || jsonb`, which parses the text as JSON. The messages now use `::text`, and both mutants fail with the real assertion.

## Gaps and remaining risks

- **Two tabs, one Gemini call, end to end:** not tested through the real `/api/analyze` with a mocked Gemini against a real database.
  - The database part is proven: one owner per candidate and one `reserved` row per owner. `/api/analyze` reaches Gemini only after `reserved`.
  - The client gate is proven by the existing vitest `m2d3Recruiter`: "a claim reported active (two tabs) is skipped without a Gemini call".
- **`service_role` still has DELETE on the ledger** (`GRANT ALL`). The repository scan covers code, not manual dashboard SQL. Revoking it needs a migration, which is out of scope and needs separate approval (backlog Q-6).
- **Static scan limits:** dynamic SQL evades the regexes (m2, m8). The behavioral S2 run of every cron job covers scheduled jobs. A non-scheduled function called from app code with dynamic SQL would only be caught if a test exercises it.
- **DB tests are not in CI** (Q-4). Only the vitest files run in CI.
- **Unchanged debt:** P1-2 personal-flow lost results (Q-D4 deferred), P1-3 recruiter paid result lost on reload, P1-4 withheld result after a commit failure.
- **Production:** not touched. The read-only retention preflight (audit PR) has not been run.
