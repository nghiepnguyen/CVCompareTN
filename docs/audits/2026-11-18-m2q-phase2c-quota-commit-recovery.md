# M2-Q Phase 2C — Quota Commit Recovery Audit & Design

- Date: 2026-11-18
- Baseline: `origin/main` @ `0b2410c` (after #90, M2-Q 2B "Database tests" CI)
- Scope: AUDIT AND DESIGN ONLY. No runtime, migration, quota-policy, branch-protection or production change. No live Gemini call. No production data read or written.
- Debt item: P1-4 / S6. Gemini returns a result, but the quota settlement fails, times out or has an unknown outcome.
- Evidence: real local Supabase stack. Postgres 17.6.1.106, PostgREST v14.10, GoTrue v2.188.1. It was started with `scripts/ci/db-stack.sh`, the same path CI uses. The real `handleAnalyze` and the real quota, claim and fenced-save RPCs were used. Only Gemini was mocked. Faults were injected deterministically into the server's admin client and into Postgres (a lock holder and a temporary trigger). The harness was not committed. Its path is listed in §4.

---

## 1. Executive summary

**Verdict: PASS WITH KNOWN DEBT.** The current fail-closed behaviour keeps invariant 1. Every reproduced scenario keeps it: no result is exposed or saved without a confirmed commit. The cost is a gap: a result can be **charged and still discarded**. This was reproduced deterministically in two ways.

1. **The commit lands after the handler has given up (scenario D).** The commit RPC blocks on the user's `profiles` row lock. All three client-side attempts time out after 9.6 s, and the handler returns 503 `quota_settlement_unavailable`. Postgres keeps executing the abandoned, client-aborted commit statements. When the lock frees, the last queued commit lands: `committed/charged`, `usage_count` = 1. The result is gone.
2. **Every response is lost after the commit (scenarios C2/F).** The first commit lands but its answer is lost, and the link then stays down for both retries. Same outcome: charged, no result. The recruiter UI then reports `paid_result_lost`. Re-running needs owner confirmation and charges a second time.

Root cause: the billing write and the result's persistence are separate transactions, and the only copy of the result is process memory. `settle()` gives the same `false` answer for "definitively not committed" and "unknown". No read can tell the two apart while an abandoned commit is still queued. Scenario D shows that a service-role read during the window returns `reserved`, and the same row is `committed` seconds later.

Recommendation: **Option D, a transactional commit-and-save for the recruiter path.** It is one SECURITY DEFINER RPC that commits the reservation and does the fenced candidate save in the same transaction. It comes with a **small Option B companion**:
- the server reports a distinct "settlement outcome unknown" code;
- on that code the browser keeps the row `analyzing` and does not release it.

With D, a late-landing commit also lands the result, so it cannot be charged-and-lost. Options A and C are **NO-GO** as specified. For the personal path, the only full fix is Option C, which is blocked by owner decision Q-D4 (personal server-side result store deferred pending privacy review). The personal path stays fail-closed, and its residual risk is documented. **A migration is required** (one new RPC, additive). Implementation needs separate owner approval.

---

## 2. Current implementation and source references

| # | Step | Source | Transaction boundary |
|---|------|--------|----------------------|
| 1 | Client key. Recruiter: `attemptId = crypto.randomUUID()` per claim, sent as `idempotencyKey` plus `candidateId`. Personal: no key passed, so `analyzeCV` defaults to a fresh `crypto.randomUUID()` on every call. | `src/context/recruiter/RecruiterContext.tsx:340`, `:412-425`; `src/services/ai/analysisService.ts:231`; `src/context/analysis/AnalysisRunContext.tsx:514`, `:602` | none |
| 2 | Candidate claim. `claim_candidate_analysis` locks the candidate row `FOR UPDATE OF cc`, reads the ledger by `(auth.uid(), analysis_attempt_id)` without a lock, and returns `claimed / active / needs_confirm{paid_result_lost / outcome_unknown} / done / not_found`. | `supabase/migrations/20261117000000_candidate_analysis_ownership.sql:36-121` | 1 tx (browser JWT) |
| 2b | Server ownership gate, before quota (fails closed): `status='analyzing' AND analysis_attempt_id = key AND campaign.user_id = jwt user`. | `_server-lib/recruiter/serverSave.ts:29-60`; `_server-lib/analyze/handler.ts:150-161` | read only |
| 3 | Reservation. `reserve_analytics_quota` locks `profiles` FIRST, runs this user's expiry, and returns `duplicate` if `(user_id, request_key)` already exists. Otherwise it checks `usage + active + 1 <= limit` and inserts `reserved` with TTL 360 s. | migration `20261116000000_analytics_quota_reservations.sql:181-237`; `_server-lib/quota/monthlyQuota.ts:49-70`; `handler.ts:181-198` | 1 tx (service_role) |
| 3b | Hourly slot (`reserveAiCall`), after the reservation. It fails closed. | `handler.ts:202-211` | separate tx |
| 4 | Gemini. `analyzeCV(..., aiDeadline.remainingMs())` runs against an AI deadline that ends `POST_RESERVE_MS` = 6 s before the 65 s request deadline. | `handler.ts:250-255`; `_server-lib/deadline.ts:5-11` | none (process memory) |
| 5 | Commit. `commit_analytics_quota(user, reservation)` locks profile, then the reservation row. It is idempotent: a committed row returns `replay`. A charged uncertain row becomes `late_commit:already_charged`. Over the limit at commit time it is `over_limit_waived`, which delivers the result uncharged. | migration `:239-304` | 1 tx |
| 6 | Commit failure handling. `settle()` makes up to 3 attempts. Each has a 3 s `withTimeout` plus an abort signal, with 150/400 ms backoff, bounded by the request deadline. **Any throw (timeout, network, PG error) is retried. A non-`committed` status answer (`not_found`, `conflict`) is returned as `false` without retry.** When the result is `false`, the handler sends Sentry `quota_commit_failed` and returns **503 `quota_settlement_unavailable`, retryable**. The result is discarded and no release is called. | `monthlyQuota.ts:72-95`; `handler.ts:257-267` | — |
| 7 | Ledger evidence. One row per `(user_id, request_key)`. `reserved` → `committed / refunded / uncertain`. Expired `reserved` rows are settled by the **user's own next** reserve/commit/release (no global sweep, owner decision Q-D2) through `analytics_quota_mark_uncertain`: first 2 per cycle `forgiven`, then `charged` (or `over_limit_waived`). The ledger is never deleted (Q-D1, Q-D3). | migration `:89-175` | inside the caller's tx |
| 8 | Recruiter server save. After the commit, `save_candidate_analysis_attempt` runs: it locks the candidate row, enforces the fence (same attempt and `analyzing`) and calls `sync_campaign_counters`. It returns `saved / superseded / not_owner / failed`. On `failed` the browser saves under the same attempt through `/api/recruiter/save-analysis`. | `serverSave.ts:62-99`; migration `20261117000000:132-187`; `RecruiterContext.tsx:446-449` | separate tx |
| 9 | Client retry. Recruiter, M2-Q 2A: an `AiRequestError` (any HTTP answer, **including 503 `quota_settlement_unavailable`**) releases the row to `error`. No answer after dispatch keeps it `analyzing`. The next run's claim decides what happens. Personal: no automatic retry. A manual retry is a new key, a new reservation and a new Gemini call. | `RecruiterContext.tsx:426-442`; `AnalysisRunContext.tsx:538-551` | — |
| 10 | Lease / stale recovery. Lease is `analysis_started_at + 600 s`. While the reservation is `reserved` and unexpired, a claim is `active`. After that the ledger decides: none or `refunded` means free re-claim; `committed` means `paid_result_lost`; otherwise `outcome_unknown`. The last two need `p_confirm_charge`. | migration `20261117000000:71-104` | — |

Platform timeouts observed on the local stack (production values not verified, see §11):
- `authenticator`: `statement_timeout=8s`, `lock_timeout=8s`;
- `authenticated`: 8 s;
- `anon`: 3 s;
- `service_role`: none (it inherits the authenticator's session settings).

---

## 3. State transition diagram

```
                  claim (browser JWT, candidate row lock)
 candidate: pending/error ──────────────► analyzing(attempt=K, started_at)
                                               │
 server:  ownership gate (read) ──► reserve(K)  [profiles lock]
                                               │ ledger K: reserved (TTL 360 s)
                                               ▼
                                         Gemini (memory only)
                                               │
              ┌────────────────────────────────┼─────────────────────────────────┐
              ▼                                ▼                                 ▼
  commit answered 'committed'        all 3 attempts threw /             process killed (L)
  [profiles lock, separate tx]       timed out (C2, D, E, F)            no settle call at all
              │                                │                                 │
              ▼                                ▼                                 ▼
  fenced save (separate tx)          503 quota_settlement_unavailable    ledger K stays reserved
   saved → candidate done             result DISCARDED                   until TTL; claim = active
   failed → browser fallback save     ledger K is one of:                then outcome_unknown
   not_owner/superseded → lost        • reserved (never landed: B, E)
                                      • committed+charged (landed: C2/F, or LATE: D)
                                      browser: AiRequestError → release → candidate error
                                               │
                                               ▼
                         next claim: reserved&live → active (≤360 s)
                                     committed      → needs_confirm paid_result_lost
                                     expired/uncert → needs_confirm outcome_unknown
                                     confirm → new attempt K', new reserve, 2nd Gemini, 2nd charge

 TTL expiry of reserved K (settled lazily by the user's next quota RPC):
   reserved → uncertain{forgiven (1st,2nd per cycle) | charged | over_limit_waived | prior_cycle | unlimited}
 late commit of K: uncertain/!charged → committed/charged/late_commit ;
                   uncertain/charged  → committed/charged/late_commit:already_charged (no 2nd charge)
```

---

## 4. Reproduction matrix

Harness: committed as evidence only, at [`docs/audits/evidence/2026-11-18-m2q2c-harness.ts.txt`](evidence/2026-11-18-m2q2c-harness.ts.txt). The `.txt` extension keeps it out of every test glob. To run it, copy it to `src/__tests__/db/m2q2cHarness.local.db.test.ts` on a local stack, and never commit it there: CI runs every file in that directory, and this harness has no REQUIRE_DB_TESTS guard. Final run: **16/16 passed** (≈17 s).

How faults were injected:
- `.rpc()` of the server admin client was wrapped per call, with three modes:
  - `throw_before`: rejects without sending.
  - `lose_response`: sends, the RPC commits, then the answer is replaced by a `TypeError`.
  - `hang`: never answers.
- A Postgres session held the user's `profiles` row with `FOR UPDATE` plus `pg_sleep`.
- A temporary `BEFORE UPDATE` trigger raised on commit for one user. It was dropped in `finally`. The local stack only: suite `m2q_quota_safety` S1 asserts that the ledger has no triggers.

Classification: **CC** = confirmed committed (a commit answer was received, or the ledger shows `committed` once no attempt can still be in flight). **CN** = confirmed not committed (no request reached Postgres, or every attempt got a rollback answer). **UNK** = unknown at the moment the handler decides.

| ID | Scenario | Injection | Handler answer | Class. at handler | Final ledger / usage | Candidate / result | Gemini calls |
|----|----------|-----------|----------------|-------------------|----------------------|--------------------|--------------|
| A | Normal | none | 200, `serverSave: saved` | CC | committed/charged, 1 | done under K | 1 |
| B | Commit definitively fails in PG | trigger raises on every commit | 503 settlement_unavailable after **3** attempts (PG errors are thrown, so they are retried) | CN (all 3 rolled back) | reserved/free, 0 | analyzing; browser releases it to error; re-claim `active` (live reservation) | 1 |
| C | Commit lands, 1st response lost | `lose_response`, then pass | 200 `saved` (2nd attempt = `replay`) | CC | committed/charged, **1** (no double charge) | done | 1 |
| C2/F | Commit lands, all responses lost (link drops after commit) | `lose_response`, `throw_before` ×2 | 503 settlement_unavailable | **UNK** (actually committed) | **committed/charged, 1** | analyzing → released → claim `needs_confirm: paid_result_lost` → confirm → **2nd Gemini, usage 2** | 2 |
| F2 | Commit ok, DB drops before the fenced save | save `throw_before` | 200 `serverSave: failed` | CC | committed/charged | browser fallback `save_candidate_analysis_attempt` = `saved` | 1 |
| D | Commit blocked on profile lock past the client timeout | holder `FOR UPDATE` + `pg_sleep(12)` after Gemini started | 503 after **9 585 ms** (3 attempts) | **UNK** | read **during** window: `reserved/free`; **after** lock frees: **committed/charged, 1**. PG log: 2 statements cancelled by the 8 s timeout, the 3rd landed after the 503 | analyzing; result discarded | 1 |
| E | DB unreachable before commit | `throw_before` ×3 | 503 in <1 s | **UNK** (the handler only sees `fetch failed`, which can also happen after send). Ground truth: CN (nothing sent) | reserved → (forced TTL, next reserve) `uncertain/free/ttl_expired:forgiven` | analyzing | 1 |
| G | Same key twice | 2nd request while the 1st is in Gemini; replay after settle | in-flight 409 `duplicate_request state=reserved`; recruiter replay 409 `not_owner` (gate, row done); personal-style replay 409 `duplicate state=committed`, **result not returned** | CC (1st) | committed/charged, 1 | done | 1 |
| H | Two tabs claim concurrently | `Promise.all` of 2 claims | — | — | — | exactly one `claimed`, one `active` | 0 |
| I | Ownership changes during the request | forced `analysis_attempt_id` change mid-Gemini (no product path does this within 65 s) | 200 `serverSave: not_owner` | CC | committed/charged | newer attempt untouched; **result lost** | 1 |
| J | Lease expires before recovery | forced `analysis_started_at` −20 min mid-Gemini | 200 `saved` | CC | committed/charged | 2nd claim during the run = `active` (live reservation wins over the lease) | 1 |
| K | Reservation TTL expires during Gemini | forced `expires_at` in the past, then another reserve sweeps it | 200 `saved` | CC | `uncertain/forgiven` → **`committed/charged/late_commit`**, usage 1 | done | 1 |
| K2 | Same, forgiveness exhausted | 2 prior forgiven rows | 200 | CC | `uncertain/charged` → `committed/late_commit:already_charged`, usage **1** | done | 1 |
| L | Process dies after Gemini, before settle | reserve, no settle call | n/a | UNK | reserved until TTL | claim `active`, then (forced lease + TTL) `needs_confirm: outcome_unknown` | (1) |
| P | Personal, commit outcome unknown | `lose_response`, `throw_before` ×2 | 503 | UNK (committed) | committed/charged; manual retry = new key, **usage 2** | no result first time | 2 |
| BUDGET | Commit after Gemini used its whole AI budget | Date advanced to the AI deadline, commit `hang` ×3 | 503 | UNK | — | — | 1 |

On BUDGET: the attempts started at 0, 3 020 and 6 280 ms. The third attempt got only about 0.2 s. So after a late Gemini answer there are **2 usable commit attempts**.

Reachability:
- **J and K** only happen when forced. TTL (360 s) and lease (600 s) are both longer than the 65 s request budget and the 300 s Vercel `maxDuration`.
- **I** only happens when forced. Since M2-Q 2A the browser never releases the row after dispatch without an HTTP answer.
- **D, C2/F, E and L** are reachable in production. D needs only a slow or contended profile row, or a Postgres/PostgREST stall of more than ~3 s per attempt. C2/F needs a network blip after the commit. L is a crash or a platform kill.

---

## 5. Confirmed root causes

- **RC1. Result persistence is not atomic with billing.** The commit and the fenced save are two transactions, and between them the result lives only in process memory. Any failure between "commit landed" and "save landed" loses a paid result: C2/F, D, I.
- **RC2. Abandoned commits keep running.** `withTimeout` and the abort signal stop the client from waiting. They do not cancel the statement. PostgREST v14 does not cancel the backend when the HTTP client aborts. The statement runs until it finishes or hits the role's 8 s timeout (observed in D). A commit can therefore land **after** the handler has returned 503.
- **RC3. Unknown and definitive failure are conflated.** `settle()` returns `false` for both a definitive rollback (B, E) and an unknown outcome (C2/F, D). The handler sends one code (`quota_settlement_unavailable`) and one Sentry tag for both. The browser treats that 503 as an HTTP answer and releases the row. That is correct for B, where every attempt got a Postgres error back. For D and C2/F it races the late commit. E looks identical to C2/F from the handler, so under a correct classification it is unknown too.
- **RC4. No path recovers a lost paid result.** For recruiters, the only path is "confirm, then re-run": a second Gemini call and a second charge. For personal analyses the user just retries: second charge, no warning. A same-key replay returns 409 `duplicate`, never the result.
- **RC5. The post-Gemini budget is thin.** About 6 s with a 3 s RPC timeout gives ≤ 2 usable attempts. Contention or a stall of more than ~3 s per attempt is enough to exhaust it.

Things that are **not** a root cause. All were verified:
- Double charge for one key: idempotent commit, C/K2/D showed usage 1.
- Save before commit: the save is only called after `commit === true`.
- Cross-account access: JWT-derived `p_user_id`, ownership gate, fence checks campaign owner (2A/1B suites).
- Stale overwrite: the fence returns `superseded/not_owner` without writing (I, H).
- Silent automatic Gemini re-run: there is none. Every re-run is user-initiated, and recruiter re-runs need confirmation.

---

## 6. Comparison of recovery options

Invariants (from the brief): I1 no result without confirmed settlement · I2 one charge per key · I3 never forgive a committed charge · I4 never overwrite a newer attempt · I5 monthly/hourly quota enforced · I6 no client billing/ownership claims · I7 ledger never deleted/rewritten · I8 no cross-account recovery · I9 no stale overwrite · I10 no silent Gemini re-run on unknown.

### Option A — Read-only settlement reconciliation — **NO-GO (as specified)**
After an uncertain commit, read the ledger: `committed` means save, `reserved` means "not committed", fail closed.
- **The rule breaks on scenario D.** A service-role read during the window returned `reserved`, and the queued commit landed afterwards. Classifying "`reserved` while an attempt may be in flight" as *confirmed not committed* is exactly the timeout-as-failure error the brief forbids. It cannot guarantee I1/I3 classification, so it is NO-GO.
- The part that is safe (`committed` means proceed) gives no information beyond a commit retry. `commit_analytics_quota` is idempotent and returns `committed, replay: true` (scenario C). A read costs the same round trip, carries the same risk of being unreachable, and tells less.
- Double-charge risk: none. Lost-result risk: unchanged for D. No migration. Latency: +1 RPC.

### Option B — Bounded server-side reconciliation — **GO only as a companion; does not close the gap on its own**
Retry the idempotent commit (not a read) within a strict budget. Never repeat Gemini.
- The existing `settle()` already does this: 3 attempts, idempotent by reservation id, keeps I2 (C, D: usage 1).
- Levers:
  - (i) A longer post-Gemini budget. `POST_RESERVE_MS` 6 → ~12 s still fits the 65 s server and 75 s client limits.
  - (ii) An RPC timeout above the DB `statement_timeout`/`lock_timeout` (8 s locally). A client timeout would then imply a lost link, not a still-running statement.
  - (iii) Distinct outcomes: `settlement_failed` when every attempt got a definitive rollback answer, and `settlement_unknown` when any attempt timed out or lost its link.
- (i) and (ii) **narrow** the window but cannot close it. A stall longer than the budget, a lost link after commit (C2/F) or a crash (L) still produces charged-and-lost.
- (iii) is cheap and needed by every other option, because the browser must not release the row on `unknown` (RC3).
- Hourly and monthly checks unchanged (I5). No migration. Latency: worst case +6 s on the failure path only. Production billing impact: none (same RPC).

### Option C — Durable pending-result recovery — **NO-GO for personal (blocked by Q-D4); unnecessary for recruiter**
Persist the result server-side, keyed `(user_id, request_key)`, **before** the commit. Deliver it only once the ledger is confirmed `committed`.
- Closes the gap for both paths if the write precedes the commit. L still loses a result when the crash happens between Gemini and the pending write.
- Needs:
  - a new table (service-role only, RLS on, no client grants);
  - a recovery RPC that joins the ledger;
  - a recovery endpoint;
  - retention/cleanup. Deleting pending results is not ledger evidence, so I7 holds. A cleanup job would still conflict with the spirit of Q-D2 and needs an owner decision.
  - encryption at rest beyond Supabase defaults. CVs carry PII; the analysis echoes it.
- Storage: one analysis JSON (tens of KB) per request until delivered.
- **Personal path:** this *is* the "personal server-side result store" that owner decision Q-D4 deferred pending privacy review. It cannot be designed into this phase.
- **Recruiter path:** the candidate row is already a durable, owned and fenced store. A second store duplicates it and adds a cross-store consistency problem. Option D gets the same guarantee with no new data at rest.
- Migration: yes (table, RPC, cron or manual cleanup). Complexity: high.

### Option D — Transactional settlement + result persistence (recruiter) — **RECOMMENDED**
One SECURITY DEFINER RPC, service_role only. Proposed name: `commit_analytics_quota_and_save_candidate(p_user_id, p_reservation_id, p_candidate_id, p_attempt_id, p_analysis_result, p_match_score)`. In one transaction it:
1. locks `profiles`, then the reservation row (same as `commit_analytics_quota`), and applies the existing commit decision table unchanged (charged / replay / late_commit / already_charged / over_limit_waived / prior_cycle). No quota-policy change;
2. if committed, locks the candidate row and applies the **existing** fence of `save_candidate_analysis_attempt` (same campaign owner, same attempt, `analyzing` → `done`; replay; `superseded / not_owner` without writing), then `sync_campaign_counters`;
3. returns `{commit: {...}, save: 'saved'|'superseded'|'not_owner'}`. It never saves without committing in the same transaction (I1). The commit is not conditional on ownership, because Gemini ran (same as Phase 1B).

What changes:
- A late-landing commit (D) or a lost response (C2/F) now lands **the result too**. The candidate becomes `done` under K, and the user sees it on reload. The claim returns `done`. The charge and the result are atomic: **charged-and-lost is eliminated for the commit-landed cases** (D, C2/F). Replays are idempotent: the commit replays and the save returns `saved, replay: true`.
- Companion B(iii): the handler returns `settlement_unknown` (new code) when any attempt timed out or lost its link. `RecruiterContext` treats it like the 2A "no answer" case: keep `analyzing`, reload, no release. Otherwise a browser release would make the late atomic save `not_owner` again. Keeping `settlement_failed` (definitive) on the current release path is optional and fine.
- What is left: nothing landed (B, E) or a crash (L). The reservation expires and the existing uncertain policy applies (first 2 per cycle forgiven, then charged). The claim reports `outcome_unknown`. That is pre-existing, owner-approved policy (D1, K = 2), not a new loss mode.

**Fence errors must not roll back the commit.** `save_candidate_analysis_attempt` *raises* `candidate_not_found` (P0002), `not_allowed` (42501), `invalid_match_score` and `invalid_arguments` (22023). It does not return them. A non-integer `matchScore` fails even earlier, at PostgREST's argument cast: verified locally, `72.5` gives `22P02 invalid input syntax for type integer`. Inlined naively into one transaction, any of these would roll back the commit. `settle()` would then retry the same payload three times and return 503. The reservation would go to TTL and be forgiven or charged, and the commit would become conditional on the save, which is a silent billing change. The new RPC must therefore:
- take `p_match_score` as `numeric` (or validate and round on the server before the call), so the cast can never fail before the body runs;
- run the save part inside a `BEGIN … EXCEPTION WHEN OTHERS` sub-block (a savepoint), so a save error keeps the commit and returns `save: 'failed'`. The browser fallback save then runs as today;
- validate the commit arguments before taking any lock, exactly as `commit_analytics_quota` does.

Lock order: profile → reservation → candidate → campaign.
- `reserve`, `commit` and `release` take profile first.
- `claim_candidate_analysis` takes the candidate row and only reads the ledger with a plain SELECT (no row lock, no profile lock).
- `save_candidate_analysis_attempt` and the browser release take only the candidate row.
- `sync_campaign_counters` updates only `recruitment_campaigns`.
- Triggers were checked on the live local schema. On `candidate_cvs`: `account_unlocked` (`enforce_account_unlocked`, INSERT/UPDATE/DELETE), `enforce_plan_caps` (INSERT), and storage triggers. On `recruitment_campaigns`: `account_unlocked`, `enforce_plan_caps`. The ones that touch `profiles` do a plain `SELECT`, with no `FOR UPDATE/SHARE` and no UPDATE, so they take no row lock on profiles.
- No path takes the candidate row and then the profile, so no deadlock cycle is introduced. CI already reports `deadlocks=` per run; keep that.

Cost:
- The profile lock is held a few ms longer (one jsonb row write plus a counters update). That is acceptable for per-user serialization.
- One round trip instead of two after Gemini, which gives back budget (RC5).
- Payload size: the result JSON moves into the commit call (already sent to the save today).

Security:
- Same grants pattern: REVOKE from PUBLIC, anon, authenticated, service_role, then GRANT EXECUTE to service_role.
- `p_user_id` from the verified JWT only (I6).
- The fence checks the campaign owner (I8).
- No ledger DELETE or rewrite beyond the existing state machine (I7).

Personal path: unchanged and fail-closed. D does not apply (no candidate row).

Migration: **yes**, one additive function. The existing RPCs stay for app rollback, following the M2-D3 deploy-order pattern: migration first, then the app.

### Summary

| | A read-only | B bounded retry (+codes) | C pending store | D atomic commit+save |
|---|---|---|---|---|
| Double-charge risk | none | none (idempotent) | none | none (idempotent) |
| Lost-result risk (D, C2/F) | unchanged | narrowed | closed (both paths) | **closed (recruiter)** |
| Lost-result risk (E, L) | unchanged | unchanged | narrowed | unchanged (existing forgiveness policy) |
| Ownership safety | unchanged | unchanged | new store needs its own fence | existing fence, same tx |
| Invariants | **fails "timeout ≠ failure"** | all hold | all hold if built; Q-D4 conflict | all hold |
| Latency / Vercel budget | +1 RPC | ≤ +6 s on failure path | +1 write before commit | −1 RPC after Gemini |
| Complexity | low | low | high | medium |
| Migration | no | no | yes (table + RPC + cleanup) | yes (1 RPC) |
| Production billing impact | none | none | none | none (same decision table) |
| Personal analysis | n/a | partial (codes, budget) | **blocked (Q-D4)** | n/a (unchanged) |
| Observability | — | distinct Sentry tags | recovery events | `save` outcome in commit reply |
| Decision | **NO-GO** | GO (companion) | **NO-GO now** | **GO (recommended)** |

---

## 7. Security and billing threat model

| Threat | Today | With D + B(iii) |
|---|---|---|
| Client forges user/billing (I6) | Blocked: user from bearer token; ledger RPCs service_role only | Same. New RPC service_role only, `p_user_id` from the JWT |
| Cross-account recovery/save (I8) | Gate and fence check `campaign.user_id` | Same fence inside the same transaction |
| Replay a key to get a second free result | 409 `duplicate`, no result, no Gemini | Same. Replay of the atomic RPC returns `saved:replay`, never a second write |
| Replay a key to be charged twice (I2) | Idempotent commit (verified C, D, K2) | Same decision table |
| Release a row to race the server (2A) | After dispatch, only an HTTP answer releases; 503 settlement **does** release | `settlement_unknown` no longer releases |
| Stale attempt overwrites newer (I4, I9) | Fence returns `superseded/not_owner` without writing | Same fence; commit still charged (Gemini ran), result discarded only when the row is genuinely newer |
| Forgive a committed charge (I3) | Expiry only touches `reserved`; `committed` is terminal | Unchanged |
| Bypass monthly/hourly (I5) | Reserve-time check, hourly slot before Gemini; commit never denies (pre-existing `over_limit_waived`) | Unchanged |
| Ledger tampering (I7) | No DELETE by app, cron or function (S1 suite). service_role still holds the table DELETE grant (open item Q-6) | Unchanged; Q-6 still open |
| Silent re-run (I10) | None automatic; recruiter needs confirmation | Fewer confirmations needed, because D lands the result |
| Billing impact of D | — | Charged exactly when today's commit charges; no new charge path |

---

## 8. Recommended architecture

1. **Migration (additive):** `commit_analytics_quota_and_save_candidate(...)` as specified in §6-D.
   - Implemented by calling the existing internal pieces in one transaction: lock state, commit decision, fence, counters.
   - Not by changing `commit_analytics_quota` or `save_candidate_analysis_attempt`. Both stay for rollback and for the personal path.
2. **Server (`handleAnalyze`):**
   - When `candidateId` is set, call the atomic RPC (through the same `settle()` loop, which is idempotent) instead of commit followed by `saveCandidateResult`.
   - Classify the settle outcome as `committed | failed | unknown`.
  - **failed** only when *every* attempt returned a **Postgres SQLSTATE** in the PostgREST error body: a function raise, or `57014`/`55P03` actually received. That means the statement ran and rolled back.
  - **unknown** for anything else: `withTimeout` firing, an aborted or `fetch failed` call, an HTTP 502/503/504 from the gateway or PostgREST (pool or connection errors, where the statement may still be running), or a malformed body. One unknown attempt makes the whole outcome unknown, because that attempt may still be queued in Postgres.
  - `settle()` today retries PG errors too (B: 3 attempts). That is safe because the commit is idempotent; keep it.
   - On `unknown`, return 503 `{ code: 'quota_settlement_unknown', retryable: false }` and Sentry `quota_commit_unknown`.
   - On `failed`, keep today's `quota_settlement_unavailable`.
   - Personal path: only the classification and Sentry tag change.
3. **Browser (`RecruiterContext`):** on `quota_settlement_unknown`, follow the 2A no-answer branch (keep `analyzing`, `reloadAfterRun`). Do not call `release`.
4. **Optional B levers.** Each needs its own measurement on production timeouts first:
   - raise `POST_RESERVE_MS`;
   - set the RPC timeout above the DB `statement_timeout`.
5. **Personal path:** stays fail-closed. Copy-only change to consider: the 503 message says "may have been charged; check usage before retrying". Any server-side result store waits for the Q-D4 privacy review (Option C).

---

## 9. Migration requirements

- **Required: YES.** One new SECURITY DEFINER function, `SET search_path = ''`, with explicit REVOKE/GRANT (service_role only). No table or column change. No change to existing functions, grants or the ledger. No backfill.
- Deploy order (M2-D3 pattern): migration, then app. Rollback means redeploying the previous app; the new function stays unused and harmless.
- Pre-deploy verification:
  - `supabase/tests/*.prod_verify.sql`-style read-only checks: function exists, definer, grants, search_path;
  - fresh full replay (migration replay guard, see A1 / #76).
- Not proposed: Option C table, any expiry sweep, any ledger purge (Q-D1..Q-D3 unchanged).

---

## 10. CI regression plan

Already covered in the required "Database tests" check (ruleset "Protect main", verified read-only: required contexts `Database tests` and `Lint, Test & Build`):

| Concern | Existing coverage |
|---|---|
| Duplicate settlement / replay never re-charges | `m2q_quota_safety` S4; `analytics_quota_reservations.test.sql`; `m2q1bServerSave.db` "two parallel requests with one key" |
| Ledger classification (forgiven / charged / late_commit / already_charged / over_limit) | `analytics_quota_reservations.test.sql`; `m2q_quota_safety` S2–S3 |
| Save before commit | `m2c2MonthlyQuota` A4 (mocked); `m2q1bServerSave.db` "commit not settled … no save" |
| Cross-account | `m2q1bServerSave.db` "another user cannot run or save" |
| Stale overwrite | `m2q1bServerSave.db` "stale attempt refused"; `save_candidate_analysis_ownership.test.sql`; `candidate_analysis_ownership.test.sql` |
| Two tabs / claim concurrency | `npm run test:db:claim`; `m2q2aTimeoutRace.db` |
| Expired reservation evidence kept | `m2q_quota_safety` S3 |

**Detection verified by mutation.** All mutants were run on the local stack against the suites above (4 SQL suites, `test:db:m2q`, and vitest `m2c2MonthlyQuota` + `m2q1bServerSave` + `m2qQuotaSafety` + `src/__tests__/db`). Baseline: all green, 55 vitest tests. Every mutant was reverted, and function definitions were confirmed identical to the originals afterwards.

| Mutant | Category | Killed by |
|---|---|---|
| M1 save before commit (handler) | save before commit | `m2q1bServerSave.db` "commit not settled … no save"; unit `m2q1bServerSave` ×2 |
| M2 commit replay charges again (SQL) | duplicate settlement | `analytics_quota_reservations`, `m2q_quota_safety`, `test:db:m2q` |
| M3 forgiven branch marks charged (SQL) | ledger classification | `analytics_quota_reservations` |
| M4 fence attempt check removed (SQL) | stale overwrite | `candidate_analysis_ownership`; `m2q1bServerSave.db` takeover ×2 |
| M5 campaign-owner check removed (SQL) | cross-account | `candidate_analysis_ownership` only (vitest's cross-user case is stopped earlier by the gate) |
| M6 `settle()` returns true on throw | unknown treated as success | unit `m2c2MonthlyQuota` ×3, `m2q1bServerSave` ×1 (**mocked only**; no real-DB test) |

All 6 were killed. Weak spots: M5 has a single killer, and M6 is caught only with a mocked admin client.

**Gaps (Phase 2C scenarios not in CI):** C (lost response, then replay), C2/F (commit landed, all answers lost), D (late-landing abandoned commit), E (link down before send), K/K2 through the real handler, P (personal retry after unknown), BUDGET, and "unknown treated as success".

Proposed deterministic tests for the implementation PR. They go in the existing `src/__tests__/db/` (vitest, REQUIRE_DB_TESTS guard) and `supabase/tests/`. All are local stack only with Gemini mocked.

1. `m2q2cCommitRecovery.db.test.ts`: the §4 harness hardened for CI, with the REQUIRE_DB_TESTS guard and fault injection via `vi.mock` of `supabaseAdmin.js`. The temporary trigger is replaced by the fault wrapper, so suite S1's no-trigger assertion keeps holding.
   - **Unknown ≠ success:** with `lose_response` and `throw_before` ×2, the body is never 200 and has no `matchScore`; the code is `quota_settlement_unknown`.
   - **Late commit lands the result (D):** a lock holder longer than the client budget and shorter than the statement timeout. After it frees: ledger `committed/charged` **and** candidate `done` under K with the same `match_score`. Claim returns `done`. Usage 1.
   - **Lost responses (C2/F):** the same assertions as D; no second Gemini call on the next run.
   - **Definitive failure (B, via fault):** ledger `reserved`, candidate not `done`, usage 0.
   - **Save never before commit:** a fault that fails the atomic RPC with a rollback leaves `analysis_result IS NULL`.
   - **Fence error keeps the commit:** candidate deleted, or `matchScore` 72.5. Expected: ledger `committed/charged`, `save: failed`, one attempt (no retry storm), no 503.
   - **Definitive vs unknown:** a raised SQLSTATE on every attempt gives `quota_settlement_unavailable`; a gateway 503 body with no SQLSTATE gives `quota_settlement_unknown`.
   - **Stale (I):** forced newer attempt, then `save: not_owner`; the newer row is unchanged; commit charged once.
   - **Cross-account:** user B's token with user A's candidate and key gives 409 at the gate. A direct RPC call with B's `p_user_id` gives `not_owner` / `not_allowed`, and A's ledger is unchanged.
   - **Browser contract:** a unit test that `quota_settlement_unknown` takes the no-release branch in `RecruiterContext`.
2. `supabase/tests/commit_and_save_candidate.test.sql`: decision table of the new RPC:
   - every commit state × every fence state;
   - replay idempotency;
   - grants (anon and authenticated denied, service_role allowed);
   - `prosecdef`, `proconfig search_path`;
   - no DELETE on the ledger. Add it to the S1 scan list automatically: S1 already scans all functions.
3. Mutants to prove the tests kill them, following the 1A/1B practice:
   - save before commit;
   - commit conditional on ownership;
   - `unknown` mapped to 200;
   - fence skipped;
   - charge twice on replay;
   - `p_user_id` taken from the body.

---

## 11. Remaining risks

- **Production timeouts are unverified.** Local values: `authenticator` statement/lock timeout 8 s, PostgREST v14.10. If production differs (for example no statement timeout, or a pooler that does or does not cancel on disconnect), D's late-landing window is longer or shorter. Option D is correct either way. Option B's tuning lever depends on these values, so measure before tuning.
- **E and L still lose results.** Nothing landed, or the process crashed. The existing forgiveness policy (2 per cycle, then charged) applies. Charging for an uncertain outcome after forgiveness is exhausted is owner-approved policy (D1). This audit makes no change.
- **Personal path is unchanged.** Charged-and-lost (P) remains possible on unknown outcomes. A manual retry is a second charge with no warning. A full fix needs Option C, which is blocked by Q-D4.
- **Pre-existing `over_limit_waived`.** A commit never denies, and delivers free when the user is over the limit at commit time. This is not a bypass of the reservation check, and is noted only for completeness.
- **service_role DELETE grant on the ledger (Q-6)** is still open. It needs a separate migration approval.
- **`matchScore` type.** Today a non-integer score would make both the server save and the browser fallback fail after the charge, so the result is lost (cast error 22P02). It is not observed in production; the canonical scorer is expected to emit integers. Option D's `numeric` and savepoint handling closes this.
- **The harness is not in CI** until the implementation PR lands the hardened tests in §10.

---

## 12. GO / NO-GO decision

- **Phase 2C audit: PASS WITH KNOWN DEBT.** Invariant 1 holds everywhere today. Charged-and-lost is confirmed reproducible (D, C2/F, P). No double charge for a key and no cross-account or stale overwrite was found.
- Option A (read-only reconciliation): **NO-GO.** A `reserved` read during an in-flight commit is not a confirmation (D).
- Option B (bounded idempotent retry + distinct unknown code): **GO, as a companion only.**
- Option C (pending-result store): **NO-GO now.** Personal is blocked by Q-D4; recruiter is redundant with D.
- **Option D (atomic commit + fenced save, recruiter): GO, pending owner approval.** It needs one additive migration, a server change and a browser change (no release on `quota_settlement_unknown`), with the CI tests in §10.

Next approval requested: owner approval to implement Option D + B(iii) on a new branch from `main`.
- Includes: the additive migration `commit_analytics_quota_and_save_candidate`, the `handleAnalyze` settle classification, the `RecruiterContext` no-release branch, and the CI tests in §10.
- Excludes: any quota-policy change, Option C, the personal store, and any production action.
- Production migration apply and deploy each need their own approval.
