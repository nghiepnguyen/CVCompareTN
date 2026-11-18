# M2-Q Phase 1B — Recruiter server-side save

- Date: 2026-11-18. Baseline `main` `b05e51d`.
- Branch `fix/m2q-recruiter-server-save`. **Local only:** not pushed, because a push builds a Vercel preview wired to the production database.
- Mode: audit, design, then offline implementation.
  - No migration, no new result store.
  - No change to pricing, quota limits or settlement rules.
  - No production access, no Gemini call.
- Implements audit option **Q-L1** (finding P1-3). See `docs/audits/2026-11-18-m2q-quota-ledger-reliability-audit.md` §7.
  - **Closes:** S8 (reload after the result came back); a 200 lost in transit after the save (new protection, replay-tested); and S3, except when the browser's release lands before the server save (§7).
  - **Does not close:** P1-4 and S6. When the commit is not verified, invariant 5 still forbids saving. The audit's Q-L1 row ("most S6") overstated this.

## 1. Architecture and data flow

**Before:**

```
browser: claim(attemptId) → POST /api/analyze {idempotencyKey: attemptId}
server:  auth → lock check → reserve → slot → Gemini → commit → 200 result
browser: POST /api/recruiter/save-analysis {attemptId, result} → fenced save
         ↑ any loss here (tab closed, reload, network, save error ×3) = paid result lost
```

**After:**

```
browser: claim(attemptId) → POST /api/analyze {idempotencyKey: attemptId, candidateId}
server:  validate (candidateId needs a client key) → auth → lock check
         → OWNERSHIP GATE (candidate in user's campaign, analyzing, this attempt) — before quota
         → reserve → slot → Gemini → commit
         → commit failed: 503 (unchanged), no save
         → commit ok: fenced save_candidate_analysis_attempt(user, candidate, attemptId, result)
         → 200 {...result, serverSave: saved | superseded | not_owner | failed}
browser: saved → done (no browser save)
         superseded / not_owner → drop result, reload (as today)
         failed / missing (old server) → existing browser save under the same attemptId
         request failed but release found the row no longer analyzing → reload (it may be done)
```

The candidate row is the only store of the result. Personal analysis sends no `candidateId`, so its request, response and server path are unchanged. A unit test pins the body shape, and a DB test proves no candidate row is written.

## 2. Design decisions

| Question | Answer |
|---|---|
| Where are the ids validated? | `candidateId` must be a UUID and is accepted **only** with a valid client `idempotencyKey` (400 before auth or quota). Otherwise the server would mint a random key that the fence always rejects, after a paid Gemini call. The ownership gate then checks the candidate: in a campaign owned by the verified user, `status = 'analyzing'`, `analysis_attempt_id = idempotencyKey`. It runs before reserve and the slot. Not owner → 409 `not_owner`. DB unreachable → 503 (fails closed). |
| When is the result saved? | Only after `commit_analytics_quota` returns `committed`, including waived and prior-cycle outcomes. The save is the same M2-D3 fenced RPC, with the attempt id equal to the request key. |
| Gemini ok, commit fails | Today's 503 `quota_settlement_unavailable`, byte for byte. No save, no result. The row stays `analyzing`, and the lease and claim recovery handle it as before. |
| Save fails or budget is short | `serverSave: 'failed'` and the result is still returned. The browser saves it under the same attempt id. The save runs only if at least 1 s of request budget is left, with timeout `min(3 s, remaining − 0.5 s)`, so it never pushes the response past the 65 s deadline. It never throws into the Gemini error path, so it can never trigger a quota release. |
| Lease expired / taken over | Before Gemini: the gate refuses, with no reservation. While the request runs, the live reservation makes any other claim `active`, so no takeover is possible (DB-tested). After the TTL plus a confirmed takeover: the fence returns `not_owner` or `superseded`, and the newer attempt is never overwritten. |
| Retries and the request key | One attempt = one key: the claim id. Re-analysis always means a new claim and a new key (unchanged). A resent request with the same key gets 409 `duplicate`, with no Gemini call and no charge. The browser's fallback save after a lost response is an idempotent fenced replay (`saved`, `replay: true`, no write). |
| Already-saved result in the browser | `serverSave: 'saved'` skips the browser save. If the response is lost, the fenced release finds the row no longer `analyzing` and returns false, so the browser reloads the row and shows it as done. If the release write itself fails, the local error state stays (M2-D2 behaviour). |
| `serverSave` field | Added only when `candidateId` was sent. Stripped by the browser before anything is stored or put in state. The server saves the result without it (unit and DB tests). |
| Migration? | **None.** It uses the existing `save_candidate_analysis_attempt` (granted to service_role), the existing columns, and a service-role read of `candidate_cvs`. |

## 3. Security and billing analysis

- **Authentication and ownership.**
  - `userId` comes only from the verified bearer token.
  - Ownership is checked twice: by the gate, through `recruitment_campaigns.user_id`, and by the fenced RPC, which raises `42501` for another user.
  - DB test: a second user using the owner's attempt id gets 409, no Gemini call, no ledger row.
- **Entitlement parity.** `/api/recruiter/save-analysis` checks auth and the account lock, not the plan. `/api/analyze` already checks both (the lock lookup fails closed), so no entitlement check is lost. Neither endpoint checks the recruiter plan: campaigns can only be created under plan caps.
- **Billing.**
  - The quota RPCs, TTL, forgiveness and settlement are unchanged.
  - The gate runs before quota, so a refused request costs nothing except an hourly-cap log row. That is the same as other pre-quota rejections (known P2-2).
  - The save runs after the commit and cannot change it. A failed save never releases quota.
  - Double charge is impossible within one key: DB test with two parallel requests (one Gemini call, one charge, the other gets 409).
- **Result exposure.**
  - No result is saved or returned before the commit is recorded.
  - The commit-failure body is unchanged; the Phase 1A `toEqual` test still passes.
- **Ledger.** Nothing deletes ledger rows. The Phase 1A repository scan and SQL guards pass.
- **Privacy.** No new copy of CV-derived data. The result goes to the same column the browser writes today.

## 4. Changed files

| File | Change |
|---|---|
| `_server-lib/recruiter/serverSave.ts` (new) | `checkCandidateAttempt` (gate, fails closed); `saveCandidateResult` (fenced save, never throws, budget-bounded) |
| `_server-lib/analyze/handler.ts` | `candidateId` validation; gate before quota; save after commit; `serverSave` in the body for recruiter requests only |
| `src/services/ai/analysisService.ts` | optional 12th arg `candidateId`; `ServerSave` type |
| `src/context/recruiter/RecruiterContext.tsx` | sends `candidate.id`; strips `serverSave`; handles `saved`, `superseded` and `not_owner` without a browser save; reloads when a release finds the row already settled |
| tests | `src/__tests__/services/m2q1bServerSave.test.ts` (18), 7 new cases in `src/__tests__/context/m2d3Recruiter.test.tsx`, `src/__tests__/db/m2q1bServerSave.db.test.ts` (9, real DB, env-gated) |

Express parity is automatic: `server/routes/analyze.ts` calls the same `handleAnalyze`. No new `api/` handler; the Vercel function count stays 14.

## 5. Tests

| Check | Result |
|---|---|
| `npm run lint`, `npm run lint:api`, `npm run build` | PASS |
| `npm test` | PASS: 108 files, 1517 tests; 9 skipped = the DB-gated file, as in CI |
| Real DB API test (local Supabase PG 17.6, 90 migrations; real `handleAnalyze`, GoTrue, PostgREST, quota and claim RPCs; Gemini mocked) | 9/9 PASS. Cases: happy path plus lost-response replay; two parallel requests with one key; stale attempt refused before quota; no takeover while running; takeover → `not_owner`; takeover plus newer save → `superseded`; commit not settled → 503, no save; intruder refused; personal request writes nothing |
| Server save racing a browser fallback save under the same attempt | Covered by `test:db:claim` (10 parallel replays under one attempt: no extra write, `analyzed_count = 1`) and the DB replay case above |
| Regressions on the same stack | SQL: `m2q_quota_safety`, `analytics_quota_reservations`, `candidate_analysis_ownership`, `save_candidate_analysis_ownership`, `api_rate_limit`, `purge_free_history`, `account_lock`, `campaign_caps`, `plan_caps` PASS. `test:db:quota` 12/12 + 7/7, `test:db:claim` 13/13, `test:db:m2q` 5/5. 0 deadlocks |
| CI | Not run: the branch is deliberately not pushed |

## 6. Mutation evidence

Each mutant was applied to the source, run against the unit suites (`m2q1bServerSave`, `m2d3Recruiter`, `m2c2MonthlyQuota`) and the real-DB file, then reverted.

| Mutant | Unit | Real DB |
|---|---|---|
| H1 save before commit | KILLED (2) | KILLED (1) |
| H2 save on a failed commit | KILLED (1) | KILLED (1) |
| H3 `candidateId` accepted without a client key | KILLED (1) | — (needs a keyless request) |
| H4 ownership gate removed | KILLED (4) | KILLED (2) |
| H5 gate ignores the attempt id | KILLED (1) | KILLED (1) |
| H6 gate ignores the campaign owner | KILLED (1) | KILLED (1) |
| H7 gate fails open on DB error | KILLED (2) | — (needs a DB outage) |
| H8 server save runs for personal requests | KILLED (1) | KILLED (1) |
| H9 save error escapes into the Gemini error path | KILLED (1) | — (needs an RPC throw) |
| C1 browser treats a missing `serverSave` as saved | KILLED (5) | — |
| C2 browser keeps `serverSave` in the stored result | KILLED (2) | — |
| C3 no reload after a lost response | KILLED (1) | — |
| C4 browser saves again after a server save | KILLED (1) | — |

The first C2 mutant was a syntax error and was redone as a valid one; only the valid run counts.

## 7. Remaining debt

- **Client timeout race (unchanged).** If the browser gives up (75 s) and releases the row while the server is still saving, the fence rejects the late save (`not_owner`). The result is paid and lost (`paid_result_lost` → confirmation dialog). The server deadline is 65 s, so this is rare. Fixing it would change M2-D3 release semantics and need a migration. **Corrected by Phase 2A** (`2026-11-18-m2q-phase2a-timeout-ownership-race.md`): a browser-only fix with no migration closes it.
- **Commit failure (P1-4) and S6** (all three commit responses lost) still withhold a paid result, with no save, as approved (A4) and required by invariant 5.
- **Gate does not check the lease** (optional hardening). A client that skips its own pre-dispatch lease check could have its lease expire between the gate and the reserve (≈ hourly check + reserve, a few seconds). Another tab could then claim the row before a ledger row exists. That is self-harm only, and was already possible before 1B (no gate at all). Requiring about 60 s of lease left in the gate would close it. Not implemented.
- **Personal flow (P1-2)** is unchanged by design (Q-D4 deferred).
- **Gate rejections** add an `analysis_log` error row that counts toward the hourly cap (P2-2).
- **Rollout.** Old browser tabs send no `candidateId` and keep the browser save. A new browser on an old server gets no `serverSave` and falls back to the browser save (tested). Deploy order: either.
- The DB tests still don't run in CI (Q-4); `service_role` still has DELETE on the ledger (Q-6).

## 8. GO / NO-GO

**GO for review and a PR**, with these conditions:

- No invariant needed relaxing.
- No migration, result store, billing change or ownership bypass was required.
- Before release:
  - the owner approves pushing; that triggers a production-wired preview, which must not be visited with real data unless the owner says so;
  - CI on the PR is green;
  - a production smoke test is planned on the recruiter test account after the owner merges.

**NO-GO** for merge or deploy without owner approval, per the brief.
