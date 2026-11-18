# M2-Q Phase 2C — Atomic Recruiter Settlement: Implementation Report

- Date: 2026-11-18
- Branch: `fix/m2q-phase2c-atomic-settlement`, from `origin/main` @ `0b2410c`. Local only: not pushed, no PR.
- Design source: audit commit `c49919e` (branch `audit/m2q-phase2c-commit-recovery`, not modified here). That audit report is not on `main` yet. This report repeats what is needed.
- Owner approval: **offline implementation only.** No push, PR, merge, deploy or production migration. No live Gemini call. No change to quota policy or forgiveness policy. No pending-result store.
- Evidence: a fresh local Supabase stack started with `scripts/ci/db-stack.sh`: Postgres 17.6.1.106, PostgREST v14.10, and `authenticator` statement and lock timeouts of 8 s. Gemini was mocked. **Local tests are not evidence of production readiness** (see §7).

---

## 1. Implementation summary

**Problem (audit RC1–RC3).** `/api/analyze` committed the quota charge in one transaction and saved the recruiter result in a second one. A commit that Postgres finished *after* the API had given up charged the user and lost the result. This covers a timed-out RPC that kept running and a lost response. The server also answered the same 503 code for "rolled back" and for "unknown", and the browser released the candidate row on that code.

**Change (audit Option D + B(iii)).**

1. **Migration `20261118000000`.** New RPC `commit_analytics_quota_and_save_candidate`. It runs the existing commit and then the existing fenced save in one transaction. The save part runs in a subtransaction, so a save error never undoes the charge.
2. **Server.**
   - Recruiter requests now call that one RPC.
   - Settlement is classified as `committed | failed | unknown`. `failed` requires a Postgres SQLSTATE on every attempt. Anything else that fails is `unknown`.
   - A `unknown` outcome returns a new 503 code, `quota_settlement_unknown`.
   - The personal path keeps the two-step commit. Only its classification changed.
3. **Browser (recruiter).** On `quota_settlement_unknown`:
   - the row is kept `analyzing` with its lease clock;
   - no release, no browser save, no new key;
   - the candidates are reloaded now and once more after 12 s.
4. **Fallback save.** `/api/recruiter/save-analysis` rounds a decimal `matchScore` for the integer `match_score` column. Before this change, 72.5 failed with `22P02` after the charge.

### Changed files (`git diff --stat origin/main`: 22 files before this report)

| File | Change |
|---|---|
| `supabase/migrations/20261118000000_commit_and_save_candidate_analysis.sql` | **new**, additive RPC |
| `_server-lib/quota/monthlyQuota.ts` | SQLSTATE classification, `SettleOutcome`, `commitAndSaveCandidate`. `commitMonthlyQuota` now returns `SettleOutcome` |
| `_server-lib/analyze/handler.ts` | atomic call for recruiters; `quota_settlement_unknown` vs `quota_settlement_unavailable` |
| `_server-lib/recruiter/serverSave.ts` | removed `saveCandidateResult` (the save now runs inside the RPC); kept `checkCandidateAttempt` |
| `_server-lib/recruiter/saveAnalysis.ts` | `Math.round(matchScore)` for the integer column |
| `src/context/recruiter/RecruiterContext.tsx`, `analysisLease.ts` | no-release branch, delayed reload (`LATE_SETTLEMENT_RELOAD_MS` = 12 s), guarded so it never replaces another campaign's list |
| `src/services/ai/analysisService.ts` | `quota_settlement_unknown` uses the existing "quota unavailable" message |
| `supabase/tests/commit_and_save_candidate.test.sql` | **new**: decision table, grants and definer checks |
| `supabase/tests/commit_and_save_candidate.prod_verify.sql` | **new**: read-only before/after snapshot for the release |
| `src/__tests__/db/m2q2cAtomicSettlement.db.test.ts` | **new**: 13 real-DB cases with fault injection |
| `scripts/ci/db-tests.sh` | vitest DB floor raised from 16 to 29 passing tests |
| 9 existing test files | updated to the new contract (commit outcome type, atomic RPC, unknown code) |

No new Vercel function: still 9 `.ts` handlers under `api/` and `api/recruiter/`, under the AGENTS.md cap of 9. The Express route (`server/routes/analyze.ts`, `recruiter.ts`) shares the same handlers, so the two stay in parity.

---

## 2. Migration and RPC contract

```sql
public.commit_analytics_quota_and_save_candidate(
  p_user_id         uuid,     -- verified JWT user (server only)
  p_reservation_id  uuid,     -- from reserve_analytics_quota for this request key
  p_candidate_id    uuid,
  p_attempt_id      uuid,     -- = idempotency key = candidate claim attempt
  p_analysis_result jsonb,
  p_match_score     numeric   -- decimals accepted (72.5); rounded for the integer column
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
-- EXECUTE: service_role only (revoked from PUBLIC, anon, authenticated)
```

Body, in one transaction:

1. `v_commit := public.commit_analytics_quota(p_user_id, p_reservation_id)`. This is the existing function, called unchanged:
   - same argument checks (22023, raised before any lock);
   - same lock order: `profiles` first, then the reservation row;
   - same decision table: charged, replay, late_commit, already_charged, over_limit_waived, prior_cycle, not_found, conflict.

   The commit does **not** depend on the candidate. Gemini already ran for this reservation.
2. If the status is not `committed`, it returns `v_commit || {save: 'skipped'}`. Nothing is saved without a charge (or the existing waived commit).
3. `BEGIN … EXCEPTION WHEN OTHERS` (a subtransaction):
   - `p_candidate_id` and `p_attempt_id` must be non-NULL (22023). A NULL attempt would otherwise reach the legacy NULL-attempt branch of the fence.
   - It then calls `public.save_candidate_analysis_attempt(p_user_id, p_candidate_id, p_attempt_id, p_analysis_result, round(p_match_score)::integer)`. This is the existing M2-D3 fence, called unchanged:
     - the campaign owner must be `p_user_id` (otherwise 42501);
     - the row must be `analyzing` under the same attempt;
     - a row already `done` under the same attempt is a replay;
     - a row owned by another attempt returns `superseded` or `not_owner` without writing.
   - On error it returns `v_commit || {save: 'failed', save_error: <SQLSTATE>}`. Only the subtransaction rolls back; the charge stays.
4. Otherwise it returns `v_commit || {save: <saved|superseded|not_owner>, save_replay: bool}`.

`query_canceled` (57014, statement timeout) is not caught by `WHEN OTHERS`. It rolls back the whole call, charge included, so nothing is left half-done. If the client receives it, that is a confirmed rollback.

Additive only: no table or column change, no change to existing functions or grants (verified with `existing_fn_md5` and `building_blocks` in the prod_verify script), no backfill. `commit_analytics_quota` and `save_candidate_analysis_attempt` stay for the personal path and for app rollback.

### Server classification (`settle()` in `_server-lib/quota/monthlyQuota.ts`)

| What one attempt sees | Meaning |
|---|---|
| Status reply, `status = 'committed'` | **confirmed committed**. Stop. |
| Status reply, anything else (`not_found`, `conflict`) | confirmed not committed. Stop, no retry. Neither state can follow a commit that landed. |
| `error.code` matches `^(?!08\|57P)[0-9A-Z]{5}$` (a real Postgres SQLSTATE: function raise, 57014, 55P03, 40001…) | that statement rolled back. Retry. |
| No call made because the deadline was reached | nothing sent. Treated like a rollback. |
| Anything else: `withTimeout` fired, abort, `fetch failed`, a gateway or PostgREST error without a SQLSTATE (`PGRST…`, HTML 502/503/504), connection-class 08/57P, an unreadable body | **unknown**: the statement may still be running. Retry. |

Final outcome:
- `committed` if any attempt answered `committed`;
- otherwise `failed` only if *every* attempt was definitive;
- otherwise `unknown`.

Retries are capped at 3, with a 3 s RPC timeout each and 150/400 ms backoff, inside the 65 s request deadline. Each retry sends the **same** reservation id and payload, so it is an idempotent replay answered from the ledger (`replay: true`), never a second charge. Gemini is never re-run.

HTTP answers:
- `committed`: 200 with `serverSave` (recruiter).
- `failed`: 503 `{code: 'quota_settlement_unavailable', retryable: true}`. Same as before.
- `unknown`: 503 `{code: 'quota_settlement_unknown', retryable: false}`, with Sentry message `quota_commit_unknown` and log `[quota_settlement_unknown]`.

No release is called in either failure case. That is unchanged: TTL expiry settles the reservation under the existing policy.

**Postgres after the HTTP request ends.** A client-side timeout or abort does not cancel the statement; PostgREST v14 does not cancel the backend. The statement runs until it finishes or hits the role's `statement_timeout` (8 s locally). For recruiters, a late commit now lands the result in the same transaction (proven in test 3). The browser's delayed reload at 12 s, more than 8 s, shows `done`.

---

## 3. State transition diagram

```
 candidate: analyzing(attempt K)        ledger K: reserved           (after claim + reserve, unchanged)
                     │
              Gemini result (memory)
                     │
        ┌────────────┴───────────── ATOMIC RPC (1 tx) ──────────────────────────────┐
        │ commit_analytics_quota(K)  [profiles → reservation]                        │
        │   not committed → {status, save:skipped}           (nothing written)       │
        │   committed     → SAVEPOINT fenced save [candidate → campaign counters]    │
        │                      ok        → candidate done(K)        save:saved       │
        │                      not owned → untouched                save:not_owner / superseded
        │                      error     → ROLLBACK TO SAVEPOINT    save:failed (charge kept)
        └────────────────────────────────────────────────────────────────────────────┘
                     │
   server sees ──────┼──────────────────────────────────────────────────────────────
   committed reply   → 200 {result, serverSave}; browser: saved → done; failed → fallback save (same K)
   all SQLSTATE      → 503 quota_settlement_unavailable; ledger reserved; browser releases → error
                        → claim: active (live reservation) → after TTL outcome_unknown (needs_confirm)
   any unknown       → 503 quota_settlement_unknown; browser: KEEP analyzing, no release, reload now + 12 s
                        • late tx lands → ledger committed + candidate done(K) → reload shows done, claim = done
                        • nothing lands → ledger reserved → claim active ≤ 360 s → TTL → uncertain
                          (forgiven 1st/2nd per cycle, else charged: existing D1 policy) → outcome_unknown
```

Lock order (unchanged for existing paths, checked against triggers): profile → reservation → candidate → campaign.
- `claim_candidate_analysis` locks the candidate row only. Its ledger read is a plain SELECT.
- The browser release and the fallback save lock the candidate row only.
- The candidate/campaign triggers (`enforce_account_unlocked`, `enforce_plan_caps`) read `profiles` with a plain SELECT, without `FOR UPDATE/SHARE`.

No path takes candidate then profile, so there is no deadlock cycle. The full CI suite reported `deadlocks=0`.

---

## 4. Test results (local stack, Gemini mocked)

| Run | Result |
|---|---|
| `scripts/ci/db-tests.sh` on a freshly reset stack (the same path as the required "Database tests" check) | **30 suites, 0 failed, deadlocks=0**. Includes the new `sql:commit_and_save_candidate` and `vitest:src/__tests__/db` (29 passed, 0 skipped). The stub harness also replays all migrations, including the new one, on vanilla Postgres 16 |
| `npx vitest run` (all unit tests) | 108 files passed, 3 skipped (DB files without a stack); **1538 passed**, 29 skipped |
| `npm run lint`, `npm run lint:api` | pass |
| `npm run build` | pass |

### Required cases

| # | Case | Where | Result |
|---|---|---|---|
| 1 | Normal commit and save | DB 1; SQL 1 | one atomic call; `committed/charged`; usage 1; row `done` under K |
| 2 | Commit succeeds, response lost | DB 2; SQL 2; unit | the replay returns `committed replay` and `saved replay`; usage 1; no rewrite of the row |
| 3 | Commit completes after server timeout | DB 3 (profile row held 12 s) | 503 `quota_settlement_unknown` after the 3 attempts. A read during the window shows `reserved`. After the lock frees: `committed/charged` **and** row `done` under K, score 70. Claim returns `done`. 1 Gemini call |
| 4 | Confirmed PostgreSQL rollback | DB 4 (a real 22023 from Postgres on each attempt); SQL 9; unit | 503 `quota_settlement_unavailable`; ledger `reserved`; usage 0; row not saved |
| 5 | Unknown outcome | DB 5a (landed: 503 unknown, row `done`, claim `done`), DB 5b (nothing landed: 503 unknown, row `analyzing`, claim `active`); unit (throw, gateway, PGRST, 08006, unreadable body, mixed attempts) | never a 200, never a `matchScore` in the body |
| 6 | Save fails, charge remains | DB 6 (row deleted during Gemini); SQL 4 (score 150: 22023), NaN | `committed/charged`, `serverSave: failed`, one RPC call (a save failure is not retried as a settlement failure); the fallback save works afterwards |
| 7 | Decimal 72.5 | DB 7; SQL 3; unit (handler and fallback route) | `match_score` 73 and `analysis_result.matchScore` 72.5; fallback route sends 73 |
| 8 | Same-key retries and concurrency | DB 8; DB 2; existing `m2q1bServerSave.db` parallel case; `test:db:claim` | concurrent duplicate gets 409; replay after settle gets 409; 1 Gemini call, 1 charge, 1 save |
| 9 | Cross-account | DB 9 (real PostgREST); SQL 5 | B on A's candidate: 409 at the gate, no reservation, no Gemini. Direct RPC with B's id and A's candidate: B charged for B's own reservation, `save_error 42501`, A's row untouched. A's reservation under B's id: `not_found/skipped`. anon and authenticated calls: `42501` |
| 10 | Stale attempt | DB 10; SQL 6 | `not_owner` when the row is owned by a newer attempt (untouched); `superseded` when it is done under a newer attempt (score kept) |
| 11 | Lease expiration during settlement | DB 11; SQL 10 | after forced lease and TTL expiry plus the user's next reserve: `uncertain/forgiven`, then `committed/charged/late_commit` (existing rule); saved; usage 1 |
| 12 | Personal flow | DB 12; unit `m2c2MonthlyQuota`, `m2q1bServerSave` | two-step `commit_analytics_quota`, never the atomic RPC, no `serverSave`; unknown gives 503 `quota_settlement_unknown` with the same UI message |
| — | Browser contract | unit `m2d3Recruiter` (3 new, 1 extended) | unknown: no release, no save, no re-claim or new key, kept `analyzing` with its lease clock; reloads now and at 12 s and shows `done`; the delayed reload never replaces another campaign's list; `quota_settlement_unavailable` still releases |

### Audit coverage gaps closed

- **Cross-account in real-DB tests:** DB 9 (PostgREST plus GoTrue tokens, both directions, and both browser roles denied) and SQL 5.
- **Unknown never treated as success, with real-DB fault injection:**
  - DB 3: a real late-landing commit;
  - DB 5a and 5b: a real commit whose answer is lost, and a call that never left;
  - DB 4: a real SQLSTATE rollback, as the contrast case.

### Mutation testing

Each mutant was applied, run, and then reverted:
- SQL mutants by `CREATE OR REPLACE` / `GRANT` / `ALTER`, restored, and checked equal to the original with `pg_get_functiondef`, grants and `proconfig`;
- TS mutants on top of commit `0385a71`, restored with `git checkout -- <file>`.

Suites run: the new SQL suite, plus vitest `m2q2cAtomicSettlement.db`, `m2d3Recruiter`, `m2q1bServerSave`, `m2c2MonthlyQuota`.

| Mutant | Killed by |
|---|---|
| SQL MA: save even when not committed | SQL 5 (cross reservation); DB 9 |
| SQL MB: no savepoint (a save error rolls back the charge) | SQL 4; DB 6, DB 9 |
| SQL MC: commit only if the row is still owned | SQL 6; DB 6, DB 10 |
| SQL MD: `trunc` instead of `round` | SQL 3; DB 7 |
| SQL ME: NULL attempt reaches the fence | SQL 8 |
| SQL MF: replay charges again | SQL 2; DB 2 |
| SQL MG: EXECUTE granted to authenticated | SQL permissions; DB 9 |
| SQL MH: `search_path` reset | SQL permissions |
| TS MT1: unknown treated as success | DB 2, 3, 5a, 5b, … (14 tests) |
| TS MT2: transport errors classified definitive | DB 3, 5a, 5b, 12; unit (13 tests) |
| TS MT3: browser releases on unknown | `m2d3Recruiter` ×2 |
| TS MT4: recruiter uses the two-step commit | 28 tests |
| TS MT5: 08/57P treated as definitive | unit ×2 |
| TS MT6: no delayed reload | `m2d3Recruiter` ×1 |

**14/14 killed.** ME and MH are killed only by the SQL suite. That is acceptable because the SQL suite runs in the required check.

---

## 5. Billing invariants

| Invariant | Status | Evidence |
|---|---|---|
| I1 No result exposed or saved without confirmed settlement | holds | the save only runs after `committed` in the same tx (MA killed); handler 200 only on `committed` (MT1 killed); DB 3/4/5 |
| I2 Never charge the same key twice | holds | the inner commit is idempotent; replay = no write (SQL 2, DB 2/3: usage 1; MF killed) |
| I3 Never forgive a committed charge | holds | existing commit decision table unchanged (md5 check); a save error keeps the charge (SQL 4, MB killed) |
| I4/I9 Never overwrite a newer attempt | holds | existing fence unchanged (SQL 6, DB 10) |
| I5 Monthly and hourly enforcement | unchanged | reserve check and hourly slot untouched; `over_limit_waived` is pre-existing (SQL 11) |
| I6 No client billing or ownership claims | holds | `p_user_id` from the verified token; RPC is service_role only (DB 9) |
| I7 Ledger never deleted or rewritten | holds | RPC body has no DELETE (SQL check); `m2q_quota_safety` S1 still passes |
| I8 No cross-account persistence | holds | campaign-owner check inside the fence returns 42501 and the row is untouched (SQL 5, DB 9) |
| I10 No silent Gemini re-run on unknown | holds | no automatic retry; the browser keeps the row; claim returns `active` / `done` / `needs_confirm` (DB 3, 5b) |

**Quota policy: unchanged.** No change to limits, forgiveness (K = 2), TTL (360 s), lease (600 s), reserve or commit rules, or the expiry rule.

---

## 6. Security findings

- **SECURITY DEFINER:**
  - Owner is `postgres` (migration role), the same as every other ledger RPC.
  - It calls only two existing definer functions, both schema-qualified.
  - No dynamic SQL.
  - `SET search_path = ''`, asserted in SQL; mutant MH killed.
- **Grants:**
  - REVOKE ALL from PUBLIC, anon, authenticated and service_role, then GRANT EXECUTE to service_role.
  - Verified with `has_function_privilege` in SQL and with real anon and authenticated calls answering 42501 (DB 9).
  - Existing grants unchanged: `building_blocks` and `existing_fn_md5` in prod_verify.
  - Exactly one overload, so PostgREST has no ambiguity.
- **Input validation:**
  - commit args: NULL raises 22023 before any lock (SQL 9);
  - candidate or attempt NULL: `save: failed`, never the legacy NULL fence (SQL 8);
  - score: numeric; NaN, NULL or out of range give `save: failed`; the charge is kept (SQL 4);
  - the server additionally validates both UUIDs before quota (unchanged).
- **Transaction boundary:**
  - commit and save run in one tx, the save in a subtransaction;
  - `query_canceled` aborts the whole tx (no partial state).
- **Information exposure:**
  - `save_error` (a SQLSTATE) stays on the server; the client only sees `serverSave: failed`;
  - 503 bodies carry no provider or database detail.
- **No privilege escalation:** the RPC can do only what service_role could already do with the two existing RPCs. It adds no write path to any table.
- **Open, pre-existing (not changed here):** service_role DELETE/TRUNCATE grant on the ledger (Q-6, visible in prod_verify `ledger_grants`).

---

## 7. Known limitations

1. **Production timeouts are unverified.** Locally the `authenticator` statement and lock timeouts are 8 s. The 12 s delayed reload assumes the production statement timeout is ≤ about 10 s. If it is longer, the row still shows `analyzing` until the lease (10 min, bounded, existing 2A behaviour) or a manual reload. **Run `select rolname, rolconfig from pg_roles where rolname in ('authenticator','service_role')` read-only on production before release.**
2. **Personal path.** Charged-and-lost on an unknown outcome is still possible (audit scenario P). A manual retry is a second charge. A full fix needs a personal result store, which is deferred by owner decision Q-D4. Only the error code changed.
3. **Nothing landed or crash** (audit E/L): the reservation expires and the existing forgiveness policy applies.
4. **Unknown from a pre-dispatch outage now keeps the row `analyzing`.** Example: the DB link is down before the commit leaves the process, so the handler cannot tell it apart from a lost answer. Previously the row went to `error`. It stays until the lease or TTL, and then `outcome_unknown` asks the owner to confirm. This is deliberate (fail safe), and shown in DB 5b.
5. **Monitoring:** new Sentry message `quota_commit_unknown` and log `[quota_settlement_unknown]`. Dashboards or alerts that key on `quota_commit_failed` should add it.
6. **The real-DB fault injection is in-process** (the admin-client wrapper plus a Postgres lock holder). It does not exercise Vercel, Kong/PgBouncer or the production PostgREST version.
7. The audit report (`c49919e`) is not on `main`. Land it with or before this change, or link it.

---

## 8. Migration-first release plan (each step needs its own owner approval)

1. Review and merge. CI must pass "Database tests" and "Lint, Test & Build" (required by ruleset). Note that a merge to `main` auto-deploys the app (memory: main merge = prod deploy). So **the migration must be applied to production before the merge**, or the app path below must be the one shipped first.
2. Read-only on production: `pg_roles` timeouts, then `supabase/tests/commit_and_save_candidate.prod_verify.sql` (**before** snapshot).
3. Apply migration `20261118000000` to production. It is additive, and the deployed app does not call it yet.
4. Run prod_verify again (**after**). The expected diff:
   - `m2q2c_recorded_times` 0 → 1;
   - `new_fn` absent → `definer=true config=search_path="" anon=false authenticated=false service_role=true`;
   - every other row identical, `ledger_rows` excepted (live traffic).
5. Merge the app. The Vercel prod deploy follows.
6. Production smoke on the test account, recruiter flow, 1 real Gemini call. This needs its own approval for that paid call.
   - Expect `serverSave=saved`, one ledger row `committed/charged` for the attempt, the row `done`, and no browser `save-analysis` call.
   - The unknown path is not testable in production without fault injection. It is offline-verified only.
7. Watch Sentry `quota_commit_unknown` / `quota_commit_failed` rates.

## 9. Rollback strategy

- **App rollback:** redeploy the previous build. It uses `commit_analytics_quota` and `save_candidate_analysis_attempt`, which this migration did not touch. The new RPC then sits unused and harmless. No data migration to undo: rows written by the new RPC are ordinary `done` candidates and `committed` ledger rows.
- **Migration rollback (only if required):** `DROP FUNCTION public.commit_analytics_quota_and_save_candidate(uuid,uuid,uuid,uuid,jsonb,numeric);` *after* the app no longer calls it. No ledger or candidate data depends on it.
- A browser bundle still cached from before the deploy treats `quota_settlement_unknown` as a generic AiRequestError and releases the row. That is the same as today's behaviour for `quota_settlement_unavailable`, so it is no regression.

---

## 10. GO / NO-GO

**GO for review (offline). NOT production-ready yet.** The design was implementable without weakening billing safety. The existing commit and fence contracts are reused unchanged inside one transaction, and every invariant in §5 holds on the local stack. 14/14 mutants were killed.

Before production:
- owner review;
- the production timeout check (§7.1);
- the migration-first release (§8) with its separate approvals;
- a production smoke test.
