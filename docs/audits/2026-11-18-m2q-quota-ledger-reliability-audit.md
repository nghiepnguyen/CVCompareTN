# M2-Q — Quota ledger reliability audit and cleanup design

- Date: 2026-11-18
- Baseline: `origin/main` `e545711` (M2-D3 released, production smoke PASS WITH KNOWN DEBT)
- Status: owner decisions Q-D1 to Q-D4 approved 2026-11-18 (§13): keep the ledger forever, no sweep, no purge, personal result store deferred.
- Mode: **audit and design only**. No production reads or writes, no migration, no Gemini call, no deploy, no merge, no change to quota limits or pricing.
- Sources read:
  - `supabase/migrations/20261116000000_analytics_quota_reservations.sql` (M2-C2 ledger)
  - `supabase/migrations/20261117000000_candidate_analysis_ownership.sql` (M2-D3 claim and fenced save)
  - `_server-lib/quota/monthlyQuota.ts`, `_server-lib/analyze/handler.ts`
  - `src/services/ai/analysisService.ts`, `src/context/analysis/AnalysisRunContext.tsx`
  - `src/context/recruiter/RecruiterContext.tsx`, `src/services/recruiterService.ts`, `_server-lib/recruiter/saveAnalysis.ts`
  - M2-C1, M2-D2 and M2-D3 audit reports
- New artifact: `supabase/tests/analytics_quota_reservations.retention_preflight.sql`. It is SELECT-only and returns counts, sizes and ages, no PII. It has **not** been run against production.

## 1. Summary

- **No P0 finding.** No purge exists today, so the M2-D3 invariant holds by construction: every ledger row lives until its profile is deleted.
- **Storage is not a reason to purge now.** One row is about 350 bytes including indexes. At 10,000 analyses a month the ledger grows about 3.5 MB a month, about 42 MB a year. The Supabase Free Tier database limit is 500 MB.
- **The real risks are lost paid results, not cleanup.** A completed Gemini result can be charged and never reach storage in both flows. Recruiter has a recovery dialog; the personal flow has none (P1-2).
- **Decision:** GO for the design and the no-migration phase (Q-1a). **NO-GO for any ledger deletion** until the owner approves the retention window (§8, decision Q-D1). A global sweep of expired reservations is not recommended (Q-D2).

## 2. Current-state architecture

```
client                         /api/analyze (service_role)                 Postgres
------                         ---------------------------                 --------
recruiter: claim_candidate_analysis(candidate, attemptId) ─────────────────> lock candidate_cvs row,
           (authenticated RPC)                                               read ledger by (uid, attemptId)
analyzeCV(..., idempotencyKey = attemptId | fresh UUID)
        ──> auth ─> reserve_analytics_quota(user, key, ttl 360 s) ─────────> lock profiles row,
                    unavailable → 503 (fail closed)                          expire this user's stale rows,
                    duplicate   → 409, no Gemini                             dedupe by (user, key), count, insert
                    denied      → 429
            ─> hourly slot (fails closed → release pre_gemini)
            ─> storage / input checks (fail → release pre_gemini)
            ─> Gemini
                 ok   → commit_analytics_quota (3 tries)
                          ok   → 200 + result
                          fail → 503 quota_settlement_unavailable, result WITHHELD (A4)
                 fail → release(pre_gemini | provider_error | uncertain)
recruiter: POST /api/recruiter/save-analysis ─> save_candidate_analysis_attempt (fenced by attemptId)
personal:  history upsert (client, M2-D2 save-only retry, in memory)
```

Key couplings:

- The recruiter `analysis_attempt_id` **is** the ledger `request_key`. `claim_candidate_analysis` reads the ledger as evidence of whether Gemini ran:

  | Ledger row for the attempt | Claim reads it as |
  |---|---|
  | missing | never ran |
  | `refunded` | never ran |
  | `committed` | `paid_result_lost` |
  | `reserved`, not expired | `active` |
  | `reserved` but expired, or `uncertain` | `outcome_unknown` |

- The personal flow passes no key. `analyzeCV` mints a fresh UUID on every call (`analysisService.ts:228`), so the ledger dedupes nothing across personal retries.
- `profiles.usage_count` stays the committed counter. The ledger adds in-flight and uncertain state only.

## 3. Ledger state machine

Stored states: `reserved`, `committed`, `refunded`, `uncertain`. **"Expired" is not a stored state.** It is derived: `state = 'reserved' AND expires_at <= now()`.

```
                    reserve (dedupe on user+key; capacity = usage + live reserved + 1 <= limit)
                         │
                         ▼
                   ┌──────────┐  commit ok ──────────────────────────────► committed (charged | over_limit_waived | prior_cycle)
                   │ reserved │  release pre_gemini / provider_error ────► refunded  (never charged)
                   └──────────┘  release uncertain ──┐
                         │                           ├──────────────────► uncertain (forgiven | charged | over_limit_waived | prior_cycle | unlimited)
       expires_at passes │ (derived "expired")       │
                         ▼                           │
          expired-reserved ── next reserve by SAME user (analytics_quota_expire) ──┘  outcome 'ttl_expired:*'

   uncertain ── late commit ──► committed  (charges now if not yet charged; never charges twice)
   committed / refunded: terminal. Release on non-reserved rows is a no-op replay.
```

Facts the cleanup design depends on:

1. **Expiry is lazy and per user.** `analytics_quota_expire` runs only inside `reserve_analytics_quota` for that user. A user who never comes back leaves `reserved` rows forever. When the sweep does run, the result depends on timing:
   - in the same cycle, forgiven (first 2 per cycle) or charged;
   - in a later cycle, `prior_cycle` with no charge.
2. **Forgiveness is counted from the ledger.** `count(state='uncertain' AND forgiven)` in the user's current cycle. Deleting current-cycle uncertain rows hands forgiveness slots back, which is a billing change.
3. **Cycles are per user** (`quota_reset_day` 1–28, key = cycle start date), so no single global "current cycle" date exists. Any cycle is at most 31 days. A row created more than 62 days ago is in no user's current or previous cycle.
4. **Dedupe is row existence.** Once a row is deleted, the same `(user_id, request_key)` can reserve again and run Gemini again. **The retention window is also the idempotency window.**
5. **A deleted `reserved` row breaks settlement.** Commit and release return `not_found`. A commit after a delivered Gemini result then fails, and the result is withheld (503).
6. `ON DELETE CASCADE` from `profiles`: admin hard delete removes the ledger together with the user's campaigns and candidates, so no orphan reference is left.

## 4. Orphaned reservations versus recovery evidence

| Row | Who still reads it | Purgeable? |
|---|---|---|
| `reserved`, live | commit/release of the running request; claim returns `active` | Never |
| `reserved`, expired, user's current cycle | next reserve settles it (may charge or forgive); claim reads it as `outcome_unknown` | Never: billing not settled |
| `reserved`, expired, older than 62 days | its eventual settlement is `prior_cycle`, no charge; claim reads it as `outcome_unknown` | Only with option R-b and the invariant |
| `uncertain` or `committed` or `refunded`, current cycle | forgiveness count; dedupe | Never |
| any row whose `request_key` = `analysis_attempt_id` of a candidate with `status <> 'done'` | claim (`paid_result_lost` / `outcome_unknown` versus "never ran") | **Never: mandatory invariant** |
| settled, older than the window, not referenced by an open candidate | nothing in code; support or billing evidence only | Yes, once the owner approves the window |

An **orphaned reservation** is an expired `reserved` row whose user has not reserved since. It is harmless to quota: capacity counts only live current-cycle rows after this user's own sweep. It is *not* safe to delete just because it is expired. If it backs an open candidate it is the only evidence that Gemini *may* have run.

**Can a candidate go from `done` back to not done?** No application path does this. I checked every write: the insert is `pending` (`recruiterService.ts:207`); the claim returns early on `done`; release requires `analyzing` and the same attempt; both saves set `done`. Only a raw owner write through the `candidates_update_own` RLS policy can do it, and that is self-harm (P2-3). So a purge that deletes rows referenced only by `done` candidates cannot later be read as "never ran" through the app.

## 5. Scenario review

| # | Scenario | Ledger | Candidate / UI | Duplicate Gemini or charge? |
|---|---|---|---|---|
| S1 | Double click / two tabs, recruiter | one claim wins (row lock), other gets `active` | correct | No |
| S2 | Same key resent (double submit) | `duplicate` → 409, no Gemini | — | No |
| S3 | Client 75 s timeout, server finishes | `committed` | recruiter: release → `error`; next claim → `paid_result_lost` dialog | Second charge only after explicit confirmation (D1) |
| S4 | Gemini ok, commit RPC fails 3× | stays `reserved` → expires → `uncertain` (forgiven, or charged once forgiveness is used up) | 503, result withheld; recruiter: `active` for up to 360 s, then `outcome_unknown` | Possible after confirmation. Personal: user retries with a new key |
| S5 | Commit lands, response lost, retry says `committed` (replay) | `committed` once | 200 | No |
| S6 | Commit lands, all 3 responses lost | `committed` (charged) | 503 withheld | Charged with no result. Personal retry charges again (P1-2) |
| S7 | Vercel crash after Gemini | `reserved` → expires → `uncertain` | recruiter: `outcome_unknown` after lease | After confirmation only |
| S8 | Reload while a recruiter result is unsaved | `committed` | in-memory result lost; `paid_result_lost` | Second Gemini call and second credit if confirmed (D2 deferred) |
| S9 | Personal history save fails, then reload | `committed` | M2-D2 save-only retry is in memory only | Result lost, charge stands, rerun charges again (P1-2) |
| S10 | Release `pre_gemini` fails | `reserved` → expires → `uncertain` | — | Uses a forgiveness slot or charges with no Gemini call (known M2-C2 debt) |
| S11 | Cycle rollover during a request | commit → `prior_cycle`, no charge | — | No (user favoured) |
| S12 | Future purge deletes a row behind an open candidate | missing → "never ran" | claim re-runs with **no dialog** | **Yes, silently. Blocked by the invariant (§6)** |

## 6. Findings

### P0

None. The invariant is not violated today because nothing deletes ledger rows.

### P1

- **P1-1 — Ledger retention is load-bearing but nothing enforces it.**
  - The claim's "no row = never ran" rule (`20261117000000_candidate_analysis_ownership.sql:90-93`) depends on rows never disappearing.
  - Nothing enforces this: no trigger, no test, no comment on the table.
  - Any future purge, manual dashboard delete or "cleanup" script can make the claim re-run a charged attempt without confirmation (S12).
  - `candidate_cvs.analysis_attempt_id` has no index, so a correct guard would scan the table.
  - Fix: Q-1a test plus a table comment now; the index lands with the purge migration (Q-1b).
- **P1-2 — Personal flow: a charged result can be lost, and a retry charges again.**
  - `AnalysisRunContext.tsx:514,602` call `analyzeCV` without a key, so every retry gets a fresh UUID.
  - The result is lost in three cases: S6 (commit landed, response lost), S9 (reload after a history save failure) and S3 for personal runs.
  - In each case the user is charged and gets no result. The ledger keeps the evidence but nothing reads it.
  - M2-D3 covers only the recruiter flow. This is the main uncovered double-charge path.
- **P1-3 — Recruiter: a paid result lost on reload costs a second Gemini call and a second credit.**
  - This is by design (D1 dialog, D2 deferred). It is listed because Q-L options (§7) can remove it.
- **P1-4 — A withheld result (A4) is charged or forgiven later, without a result.**
  - In S4 the server holds a delivered result, refuses to return it, and lets the row expire into `uncertain`.
  - This is correct accounting, but it is the most expensive outcome: Gemini is paid and nothing is shown.
  - Frequency is unknown. Sentry `quota_commit_failed` counts it, and has not been checked in this audit.

### P2

- **P2-1 — Lazy per-user expiry.**
  - Settlement time decides the billing outcome: same cycle means forgiven or charged, a later cycle means free.
  - `reserved` rows can stay forever, which makes "open reservations" monitoring ambiguous.
  - Any change (global sweep) is a billing decision (Q-D2).
- **P2-2 — Claim says `active` for up to 360 s after a 503 `quota_settlement_unavailable`.**
  - The candidate row says `error`, but the claim returns `active` while the reservation is live. The UI shows "analyzing" for up to 6 minutes. Cosmetic.
- **P2-3 — Owner RLS UPDATE covers every column of `candidate_cvs`.**
  - A user can write `status` and `analysis_attempt_id` directly. That can skip the confirmation dialog or point a candidate at an arbitrary key.
  - Only their own quota is affected. This is pre-existing (M2-D3 §7.5).
- **P2-4 — No link between the ledger row and `analysis_log`.**
  - `logAnalysisAttempt` stores no `request_key`, so support cannot tie a charge to a log line. Low cost to add.
- **P2-5 — DB tests are not in CI.** `test:db:quota` and `test:db:claim` run only locally (known Q-4).
- **P2-6 — Privacy and growth.**
  - The ledger holds user id, a random key, state and timestamps, with no CV content. RLS is service-role only, and rows cascade on account delete. Risk is low.
  - The only new privacy risk in this stage is a result store (Q-L2).

## 7. Lost-result recovery options

| Option | What | Fixes | Privacy | Storage | Complexity | Owner decision |
|---|---|---|---|---|---|---|
| **Q-L0** status quo | in-memory save-only retry + D1 dialog | nothing new | none | 0 | 0 | — |
| **Q-L1** server-side fenced save | client sends `candidateId`; after a successful commit `/api/analyze` calls `save_candidate_analysis_attempt(userId, candidateId, requestKey, …)`; save failure still returns the result and the client save remains the fallback | S3, S8 and most S6 for **recruiter** | none: same table that already holds the result | 0 | low–medium: handler, one body field, unit tests, one RPC (~100–300 ms) inside the 6 s post-AI reserve | no new data; confirm the UX copy only |
| **Q-L2** server result store | new table keyed `(user_id, request_key)` holding result JSON for a short TTL (e.g. 24 h); a `duplicate` reserve replays the stored result; the personal flow reuses its key on retry | S3, S6, S8, S9 for **both** flows | **new copy of CV-derived PII**: policy text, retention, cascade, RLS review | ~20–60 KB per row × in-flight window | high: migration, purge cron, replay path, client key reuse | **yes**: D2, privacy |
| **Q-L3** client IndexedDB stash | browser keeps unsaved results until saved | S8, S9 on the same device | PII on shared devices | per browser | medium | **yes**: D2 |

Q-L1 constraints:

- The server save runs only if budget remains after the commit. In the worst case the commit alone (3 × 3 s plus backoff) uses the whole 6 s post-AI reserve. The save never delays or blocks returning the result.
- `candidateId` is UUID-validated and accepted only together with a valid `idempotencyKey`. The RPC already enforces campaign ownership and the attempt fence.

Recommendation: **Q-L1 first** (recruiter, no new data). Then decide **Q-L2 versus accepting P1-2** for the personal flow; that decision is the owner's.

A cheap partial fix for P1-2 is to reuse one key per input across retries in the same run. A retry after S6 then gets `409 duplicate` instead of a second charge. That only turns a double charge into a clear error, so it needs Q-L2 for the result itself. Listed, not recommended alone.

## 8. Q-1 retention and cleanup design

### Rules

**Mandatory invariant.** A purge never deletes a ledger row whose `request_key` equals `analysis_attempt_id` of **any** candidate with `status <> 'done'`. The match is global, not scoped by user. That is stricter and costs nothing.

**Purge predicate** (option R-a, settled only):

```sql
-- Every filter sits inside the batch selection. A batch taken by age alone
-- would stall: protected rows are old by nature and would fill every batch.
WITH victims AS (
  SELECT r.id FROM public.analytics_quota_reservations AS r
   WHERE r.created_at < now() - p_window          -- p_window >= 62 days, enforced
     AND (
           (r.state IN ('committed', 'refunded', 'uncertain')
            AND r.settled_at < now() - p_window)
        -- R-b only (owner decision Q-D3): long-expired, never-settled rows.
        OR (p_include_expired_reserved
            AND r.state = 'reserved' AND r.expires_at < now() - p_window)
         )
     AND NOT EXISTS (
           SELECT 1 FROM public.candidate_cvs AS cc
            WHERE cc.analysis_attempt_id = r.request_key
              AND cc.status <> 'done')
   ORDER BY r.created_at
   LIMIT p_batch
     FOR UPDATE OF r SKIP LOCKED
)
DELETE FROM public.analytics_quota_reservations
 WHERE id IN (SELECT id FROM victims);
```

**Option R-b** (`p_include_expired_reserved = true`) also deletes `reserved` rows whose `expires_at` is older than the window, under the same invariant. Those rows have `settled_at` NULL, so they need their own branch of the predicate. Their eventual settlement would be `prior_cycle` (no charge), so deleting them leaves the billing outcome the same. The cost is losing the "may have run" trace for personal requests. This is for the owner to pick (Q-D3).

### Why no profile lock is needed

- `reserved` rows (R-a) and rows newer than the window are excluded. No commit, release or expiry can target a purged row: a request lives at most 300 s.
- A floor of at least 62 days puts every purged row outside every user's current cycle. The forgiveness count cannot change.
- Under R-b, a row locked by a concurrent `analytics_quota_expire` is skipped (`SKIP LOCKED`). Expiry settles it to `prior_cycle`, and a later run deletes it as a settled row. The purge never waits on a quota lock.
- The candidate side needs no lock either. No app path moves a candidate from `done` back to not done (§4), and claims mint fresh UUIDs, so no new reference to an old key can appear.

### Shape

- Function `purge_analytics_quota_ledger(p_window interval, p_batch int, p_include_expired_reserved boolean DEFAULT false)`:
  - `SECURITY DEFINER`, `search_path = ''`;
  - raises if `p_window < interval '62 days'`;
  - returns the deleted count;
  - EXECUTE revoked from PUBLIC, anon, authenticated and service_role; called from pg_cron only.
- Daily pg_cron job, scheduled after the existing purges (03:00 history, 03:10 rate limits), for example `20 20 * * *`.
- Partial index `candidate_cvs (analysis_attempt_id) WHERE status <> 'done'`. It is small and makes the NOT EXISTS an index probe.

### Retention window

The window is an **owner decision (Q-D1)**:

- **(a) Keep forever** (recommended today). Growth is negligible. Revisit when the preflight shows more than 50 MB or 200k rows.
- **(b) 13 months.** One year of billing evidence plus one cycle.
- **(c) 90 days.** The minimum useful window: 62 days plus a margin.

### Not part of Q-1

A global sweep that settles expired `reserved` rows. Its cadence decides whether a row is forgiven, charged or free, so it changes billing (Q-D2). Recommendation: do not add one. The claim and capacity logic already handle unswept rows correctly.

## 9. Data migration requirements

- **Q-1a: none.** It only adds the preflight SQL, a test, and docs. Optionally it adds `COMMENT ON TABLE` text naming the invariant; that is a migration, so bundle it with Q-1b.
- **Q-1b** (only after Q-D1 ≠ keep forever), one additive migration:
  - partial index on `candidate_cvs.analysis_attempt_id`;
  - the purge function;
  - the cron job;
  - the table comment.
  - No data backfill, no column change, no change to quota RPCs or limits.
- **Q-L1: no migration.** It uses the existing `save_candidate_analysis_attempt`.
- **Q-L2:** new table, RLS, purge cron. Requires the owner's D2 approval and its own design.

## 10. Test plan (real PostgreSQL and PostgREST, local `supabase start` only)

SQL (`supabase/tests/analytics_quota_ledger_retention.test.sql`, same style as `candidate_analysis_ownership.test.sql`: `BEGIN … ROLLBACK`, JWT claims via `set_config`, no `SET ROLE postgres`):

| # | Case | Expect |
|---|---|---|
| T1 | Old `committed`/`uncertain` row referenced by a candidate in `pending`, `analyzing` or `error` | never deleted |
| T2 | Old row referenced only by a `done` candidate, or unreferenced | deleted |
| T3 | `reserved` rows, live and expired (R-a) | never deleted; R-b deletes only rows with `expires_at` older than the window |
| T4 | Rows newer than the window; `p_window = '61 days'` | kept; call raises `22023` |
| T5 | Snapshot `claim_candidate_analysis` result for every candidate before and after the purge (confirm = false, fresh attempt ids, rolled back per probe) | identical |
| T6 | Forgiven count per user in the current cycle, and `md5(usage_count)` over `profiles` | unchanged |
| T7 | Grants: purge not executable by anon, authenticated or service_role; definer; empty search_path | as stated |
| T8 | `p_batch` limit; second run deletes the rest; third run deletes 0 | idempotent |
| T8b | Oldest `p_batch` rows are all protected; younger eligible rows exist | younger rows still deleted (no stall) |
| T9 | Cascade: delete a profile, its ledger rows and candidates go together | no orphan reference |

Concurrency (`scripts/db-quota-ledger-purge-concurrency.ts`, real PostgREST, like `db-candidate-claim-concurrency.ts`): run the purge in a loop while 20 parallel claim, reserve, commit, release and expiry calls run. Expect:

- no deadlock or serialization error;
- every protected row is still present;
- claim results match the single-session oracle.

Also add `test:db:quota` and `test:db:claim` to CI (Q-4) before Q-1b, so the invariant test guards every later migration.

Q-L1 (vitest, mocked Supabase):

- save is called only after a successful commit, with `requestKey` as the attempt id;
- a save failure still returns 200 with the result;
- `not_owner` or `superseded` is logged and the result still returned;
- no save is attempted when no `candidateId` is sent (personal flow).

## 11. Rollback

- **Q-1a:** docs and tests only; revert the commit.
- **Q-1b:**
  - Undo first with `SELECT cron.unschedule('purge-analytics-quota-ledger')`.
  - Then drop the function and the index.
  - **Deleted rows cannot be restored.** That is why the window floor and the invariant are enforced inside the function, and T1–T6 must pass on a production-shaped replay before apply.
  - Run the preflight before and after the first scheduled run.
- **Q-L1:** app-only; revert the deploy. The client save path stays the fallback, so a rollback leaves the client saving results as before.

## 12. Implementation phases

| Phase | Content | Needs |
|---|---|---|
| **Q-1a** | preflight SQL (done in this branch); invariant test T1–T9 against a *draft* purge in the test file; DB tests in CI | nothing, GO |
| **Q-L1** | server-side fenced save in `/api/analyze` for recruiter | owner OK on scope; no data decision |
| **Q-D** | owner decisions Q-D1 to Q-D4 (§13) | owner |
| **Q-1b** | purge migration + cron, only if Q-D1 ≠ keep forever | Q-D1, Q-D3; isolated-checkout apply like M2-C2/M2-D3 |
| **Q-L2** | result store / personal-flow replay | Q-D4 (D2), privacy review |

Other M2-Q backlog items (Q-2 reserved in pre-check, Q-3 settlement policy, Q-5 fallback drift, Q-6 grants, Q-7 hourly window) are unchanged and not covered by this audit.

## 13. Owner decisions

**Approved by the owner on 2026-11-18:**

| Decision | Outcome |
|---|---|
| Q-D1 retention | **KEEP FOREVER.** No ledger deletion. Phase Q-1b (purge migration and cron) is cancelled. |
| Q-D2 global sweep | **NO** global sweep of expired reservations. Expiry stays lazy and per user. |
| Q-D3 R-b | **NO** purge of long-expired `reserved` rows. |
| Q-D4 personal lost results | **DEFERRED** pending a privacy review. Q-L2 is not started. P1-2 stays known debt. |
| Retention review trigger | Review retention when the ledger exceeds **100 MB**, or reaches **20 % of the actual database storage capacity**, whichever comes first. Measure with `ledger_total_bytes` and `database_bytes` from the retention preflight. |

§8 therefore stays a reference design only. If the trigger fires, a new design and approval are needed.

The options as originally presented:

- **Q-D1 — Retention window for settled ledger rows:** keep forever (recommended now) / 13 months / 90 days.
- **Q-D2 — Global sweep of expired reservations:** recommended **no**. It changes when users are charged or forgiven.
- **Q-D3 — Purge long-expired `reserved` rows (R-b):** yes or no. It has no billing effect, but it loses the "may have run" trace for personal requests.
- **Q-D4 — Personal-flow lost results (P1-2):** accept as known debt, or approve a Q-L2 design (stores CV-derived results server-side for a short TTL).

## 14. GO / NO-GO

- **GO:** this design; Q-1a (regression tests and CI work, no migration), in a separate branch and PR; Q-L1 design and implementation as its own PR later.
- **NO-GO (approved decisions, 2026-11-18):**
  - any ledger deletion (Q-D1 keep forever), until the review trigger fires and a new design is approved;
  - any global expiry sweep (Q-D2);
  - any purge of long-expired `reserved` rows (Q-D3);
  - Q-L2 until the privacy review (Q-D4).
- **Not verified here:**
  - production volume and state counts: the preflight has not been run;
  - Sentry `quota_commit_failed` frequency;
  - SQL in §8 and the preflight checked only by reading, not executed against a local database.
