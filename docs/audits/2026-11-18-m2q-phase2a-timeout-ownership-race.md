# M2-Q Phase 2A — Timeout & ownership race audit

- Date: 2026-11-18. Baseline `main` `7c6fea8` (Phase 1B, production-verified).
- Branch `audit/m2q-timeout-race`. **Local only:** not pushed, because a push builds a Vercel preview wired to the production database.
- Constraints:
  - no production writes, migration, live Gemini call, deploy or merge;
  - no change to quota or billing;
  - production was only read, with SELECT aggregates in the Dashboard SQL editor.
- **Outcome:** the race is real and deterministically reproduced. It is fixed by a browser-only change, with no migration and no server change. This corrects the Phase 1B report (§7), which said a fix "would need a migration".

## 1. Question

Can the browser's 75 s timeout release a recruiter candidate before the server finishes quota settlement and its fenced save?

**Yes.** The trigger is not only the timeout: any fetch failure after dispatch does it.

## 2. Timeout and abort paths

| Layer | Bound | Source |
|---|---|---|
| Browser `fetch('/api/analyze')` | `AbortSignal.timeout(75_000)`, from fetch start (covers upload, queueing, cold start, handler and body read) | `src/services/ai/analysisService.ts` |
| Handler wall clock | `TOTAL_BUDGET_MS` 65 s from handler start | `_server-lib/deadline.ts` |
| AI step | budget minus `POST_RESERVE_MS` 6 s; Gemini is not started with less than 10 s left | `_server-lib/deadline.ts` |
| Quota commit, server save, success log | all bounded by the same deadline; the save needs at least 1 s left and times out at `min(3 s, remaining − 0.5 s)` | `_server-lib/analyze/handler.ts`, `_server-lib/recruiter/serverSave.ts` |
| Vercel function | `maxDuration` 300 s (safety ceiling only) | `vercel.json` |
| Cloudflare proxy | 100 s origin timeout (524) | platform default |
| Candidate lease | 600 s; dispatch refused in its last 120 s | `candidate_analysis_lease_seconds()`, `analysisLease.ts` |
| Quota reservation TTL | 360 s | `reserve_analytics_quota` |

The 75 s and 65 s clocks start at different moments. The browser's clock also covers time spent before the handler starts, which nothing bounds: the request upload, the Cloudflare and Vercel hops, and a cold start.

## 3. When a candidate leaves `analyzing`

I searched every status write in browser code, `_server-lib`, `api/`, migrations, prod `cron.job` and triggers (prod read-only):

| Write | Effect | Can it land before the server save? |
|---|---|---|
| Browser `releaseCandidateAnalysis`: UPDATE `status='error'` WHERE id, attempt and `status='analyzing'` (RLS, owner) | `analyzing → error` | **Yes. This is the race.** |
| `save_candidate_analysis_attempt` (fenced, service_role) | `analyzing → done` | It is the save itself. |
| `claim_candidate_analysis` | `pending/error/stale analyzing → analyzing` under a new attempt | Not while the reservation is live: the claim returns `active` (DB-tested). |
| Legacy `save_candidate_analysis` | sets `done/error` | No caller in code. Prod grants it to service_role only, not authenticated. |
| `pending` insert (upload) | new row | Not applicable. |
| Cron jobs (`storage-cleanup`, `purge-free-history`, `purge-api-rate-limits`) | none touch candidates | No. |
| User deletes the candidate while it runs | row removed | Yes, by intent: the save gets `not_owner` after the charge. |

Nothing ever sets a row back to `pending`. The only premature exit from `analyzing` is the browser release, and it always sets `error`.

## 4. Root cause

`RecruiterContext.analyzeCampaign` called `release()` for every error in the per-candidate try, including errors after the request was sent where the server's outcome is unknown:

- `TimeoutError`: the 75 s abort;
- `TypeError: Failed to fetch`: network drop, proxy reset or connection change;
- a body-read or JSON failure after a 200.

In those cases the handler may still be running. Once the release commits, the server's fenced save finds `status='error'` and returns `not_owner`. The charge is already committed, so the paid result is lost. The next run returns `needs_confirm / paid_result_lost`, so the user can pay a second time, after a dialog.

The dangerous window runs from the ownership gate (before the reservation) to the server save (after the commit):

- A release before the gate costs nothing: the request gets 409 with no reservation.
- A release after the save is a no-op: it returns false and the browser reloads (Phase 1B).
- A release from a browser that is actually offline throws, and the row is left `analyzing`. It is only harmful when the request failed but the release write succeeded.

## 5. Deterministic reproduction

The test is `src/__tests__/db/m2q2aTimeoutRace.db.test.ts`. It runs against a real local Supabase stack (PG 17.6, all 90 migrations, PostgREST, GoTrue) using the real `handleAnalyze`, quota and claim RPCs, and the exact browser release UPDATE. Only Gemini is mocked: it is held until the test opens it, so each interleaving is deterministic. The test is env-gated, the same way as the 1B DB test.

| Case | Result |
|---|---|
| **REPRO:** release after the gate, before the save | 200 `serverSave: not_owner`. The row ends as `error` with no result. Ledger shows `committed`, charged. `usage_count` = 1. The next claim returns `needs_confirm paid_result_lost`. One Gemini call. |
| **REPRO:** re-click while the server still runs | The claim returns `active` (the live reservation blocks it). The save is still `not_owner` and the row stays `error`. |
| **FIX:** no release after dispatch | `saved`, the row is `done`, one charge. A second-tab claim during the run returns `active`; afterwards it returns `done`. |
| Window start: release before the gate | 409 `not_owner`, no ledger row, no Gemini call. |
| Window end: release after the save | The release returns false and the row stays `done`. |
| Cost of the fix: the request never reached the server | The row stays `analyzing` (claim returns `active`) until the lease ends. Then it is re-claimed freely: no ledger row, no confirmation needed. |
| Recovery: the server ran but its outcome is unknown (reservation expired unsettled) | The claim returns `needs_confirm outcome_unknown`, as today. |

All 7 cases pass.

## 6. Can it happen in production? Measured vs assumed

**Measured** (prod, read-only aggregates, 2026-11-18):

- **Quota ledger:** 7 rows in total since the ledger shipped on 2026-11-16. All are from the smoke account and all are committed. Reserve-to-settle took 9.0 s at p50 and 12.3 s at most; none took over 45 s.
- **Gemini latency** (`analysis_log.latency_ms`, analyze successes, 90 days, n = 52): p50 11.7 s, p95 18.0 s, max 18.4 s. None over 45 s.
- **Analyze errors** in 90 days: 0 `gemini_timeout`, 0 `request_budget_exhausted`.
- **Candidates:** 0 paid-but-not-done (committed or uncertain ledger row, candidate not `done`). There have been only 2 recruiter attempts with ownership tracking, both from smoke tests.

**Assumptions** (not measured):

- **The timeout path** needs more than about 10 s spent outside the handler, such as a slow upload, a cold start or queueing. Normal timing is far from this.
- **The network path** does not depend on timing. It needs a connection failure while the request is in flight, plus the release write succeeding (a reconnect, or a flaky but not dead link). Mobile handover and Wi-Fi changes fit this.
- **Vercel keeps running** the function after the browser aborts through Cloudflare. Not verified. The timeout trigger depends on it: if the platform stopped the function on disconnect, the reservation would expire as uncertain instead of the save being lost. The network-drop trigger does not depend on it, so the fix is needed either way.

**Severity:** Medium impact, low likelihood. Each occurrence costs one paid analysis and leaves a confusing error, and the user can pay again after a confirmation dialog. There is no double charge on one key and no cross-account effect. Real traffic is near zero, so "0 observed" is weak evidence. It is not proof of absence.

## 7. Remediation options

| Option | Billing safety | UX | Complexity | Migration |
|---|---|---|---|---|
| **A. No release when the outcome is unknown** (implemented) | Closes the race for every trigger. The server path, fence and ledger are untouched. | A request that never reached the server shows `analyzing` until the 600 s lease ends instead of an immediate retry. Re-running is then free (no ledger row). | ~10 lines in the browser | None |
| B. Raise the browser timeout to about 90 s (below Cloudflare's 100 s) | Fewer timeouts. Does nothing for network drops. | No change | 1 line | None. Optional on top of A, not done. |
| C. Deferred release: release after dispatch + about 90 s, reload when it returns false | Mostly safe. The time before the handler starts is still unbounded. | Faster retry than A | Timer handling that must survive campaign switches and unmounts | None |
| D. Server-controlled lifecycle: the server owns `analyzing → error/done`; the browser never writes status | Strongest | The same as A | RPC and grant changes, revoke the browser UPDATE | **Yes** |
| E. Lease renewal or heartbeat, with a fence accepting `error` + same attempt | Changes fence semantics (`error` becomes saveable) | Faster recovery | New RPC | **Yes** |

A is the smallest safe change and needs no approval gate. D and E stay design-only because they require migrations.

## 8. The fix (A)

In `src/context/recruiter/RecruiterContext.tsx`:

- A `dispatched` flag is set immediately before `analyzeCV(...)`.
- In the catch, if `dispatched && !(err instanceof AiRequestError)`:
  - skip the release;
  - keep the local row `analyzing` (with `analysisStartedAt`, so the lease clock still holds and no retry button appears);
  - reload the rows after the batch;
  - continue with the next candidate.
- **Still released:**
  - every error before dispatch: download, file processing, session lookup, `LeaseExpiredError`;
  - every `AiRequestError`, meaning an HTTP answer. A handler answer means no save will follow. A platform 5xx is assumed to mean the function is gone (not verified). Cloudflare's 524 (100 s) is unreachable because the browser gives up at 75 s.
- No timer and no polling, so a delayed reload can never overwrite a campaign the user has switched to.
- Invariants:
  - no change to the quota or server code;
  - personal analysis is untouched;
  - the account and candidate isolation and the fence are unchanged.

## 9. Tests

| Check | Result |
|---|---|
| `npm run lint`, `npm run lint:api`, `npm run build` | PASS |
| `npm test` | 1523 passed; 16 skipped (the 2 env-gated DB files) |
| New browser tests (`m2d3Recruiter.test.tsx`, M2-Q 2A block) | 6 PASS: timeout, network drop and unreadable 200 body (no release, row reloaded, batch continues, no browser save); row kept `analyzing` with its lease clock; release before dispatch still happens; an HTTP answer still releases |
| Updated tests | Five `analyzeCV` failures in `m2d2Recruiter`/`m2d3Recruiter` that meant "the server answered with an error" now throw the real `AiRequestError` |
| Real DB (`m2q2aTimeoutRace.db.test.ts` 7/7, `m2q1bServerSave.db.test.ts` 9/9) | PASS |
| Regression suites on the same stack | All 9 SQL suites PASS; `test:db:quota` 12/12 + 7/7; `test:db:claim` 13/13; `test:db:m2q` 5/5; 0 deadlocks. Stack stopped afterwards. |

**Mutation testing** (browser suites m2d3 + m2d2): 6 of 6 mutants killed.

| Mutant | Result |
|---|---|
| M1 `dispatched` check removed | KILLED (3) |
| M2 `AiRequestError` check removed | KILLED (4) |
| M3 guard removed | KILLED (4) |
| M4 local status `error` | KILLED (1) |
| M5 no reload | KILLED (3) |
| M6 `dispatched` true from the start | KILLED (3) |

The DB tests prove the race mechanics. The browser tests are the regression guard, because the fix lives in the browser.

## 10. Regression plan for release

- Before merge:
  - CI green on a draft PR. CI runs `lint`, `lint:api`, `npm test` and `build`; the DB files skip there.
  - Re-run the two DB files locally on a fresh stack.
- **Production smoke (owner-approved):** one recruiter analysis on the smoke account. Expect `serverSave: saved`, one charge, and no release write. Don't inject a fault in production. The timeout and drop paths are covered offline.
- **Watch afterwards:** candidates left `analyzing` past the lease, and `needs_confirm` rates.

## 11. Remaining debt

- **Cost of the fix:** after a real network drop before the request reached the server, the row shows `analyzing` for up to 10 minutes instead of offering an immediate retry. Option C would shorten that.
- **Stale `analyzing` after a server save.** In a one-candidate batch whose connection drops a few seconds after dispatch, the end-of-batch reload can run before the server saves. The page then shows `analyzing` with no retry button until the user refreshes. This is billing-safe: the row is `done` in the DB.
- **Temp files are deleted early.** The `finally` block still deletes the temp analysis files. If the drop comes before the server has read `pdfStoragePath`/`dataStoragePath`, the server fails with a storage error and the reservation is refunded. The row stays `analyzing` until the lease ends, then re-claims free. This was already true before the fix (the row would have gone to `error`).
- Option B (timeout 75 → 90 s) was not applied.
- D and E (server-owned lifecycle, lease renewal) need a migration and approval.
- Carried over from earlier phases:
  - commit failure (P1-4 / S6);
  - the ownership gate not checking the lease;
  - P2-2;
  - Q-4 (DB tests not in CI);
  - Q-6 (`service_role` can still delete ledger rows).
- **Correction:** the Phase 1B report §7 said fixing the client-timeout race "would change M2-D3 release semantics and need a migration". It does not: not releasing when the outcome is unknown needs neither.

## 12. GO / NO-GO

**GO for review and a draft PR** once the owner approves the push. The audit found a safe, migration-free fix, and all invariants hold.

**NO-GO** for merge or deploy without separate owner approval. D and E are not started.
