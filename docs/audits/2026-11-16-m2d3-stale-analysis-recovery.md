# M2-D3: Recruiter Stale-Analyzing Recovery

Date: 2026-11-16. Branch: `fix/m2d3-stale-analysis-recovery`, cut from `origin/main` `e05622a`. Status: implemented and tested offline, committed locally only.

Not done:
- the migration has not been applied;
- nothing has been pushed;
- there is no PR or deploy;
- no live Gemini call was made;
- the production preflight has not run (see §9).

Migration: `supabase/migrations/20261117000000_candidate_analysis_ownership.sql`, sha256 `710123760aeebde3c3b3a60bbc47c61fdda5b170df05eecd069661b628951b9a`.

## 1. Architecture and failure windows

The recruiter run lives in `RecruiterContext.runCampaignAnalysis`. It goes through each candidate one at a time, in the browser:

1. Before M2-D3, the client wrote `analyzing` with a direct RLS update.
2. It downloads the CV (60 s timeout) and runs `processFile`. The temp upload inside `processFile` has **no** timeout.
3. It reads the session (6 s timeout).
4. It calls `POST /api/analyze`:
   - client timeout is 75 s, server budget is 65 s;
   - the server reserves quota, calls Gemini, then commits or releases the reservation.
5. It saves through `POST /api/recruiter/save-analysis`, which calls `save_candidate_analysis` with service_role. The fetch has no timeout. There are 3 attempts.
6. If saving still fails, M2-D2 keeps the result in `unsavedAnalysesRef` (tab memory).

The recruiter flow writes nothing to `history`: one candidate row holds one result.

**The quota ledger is the durable evidence.**
- `analytics_quota_reservations (user_id, request_key)` is written **before** Gemini.
- Reservation fails closed (`/api/analyze` returns 503 and never calls Gemini).
- After that, the row ends up as one of: `committed` (result delivered), `refunded` (no result possible), or `uncertain`. While the request is in flight it stays `reserved`, until its TTL of 360 s.
- Until now `request_key` was a random UUID per call. M2-D3 makes it the candidate's **attempt id**, so the candidate row points at its own billing evidence.

| # | Window | Durable evidence (attempt id → ledger) | Before M2-D3 | M2-D3 |
|---|---|---|---|---|
| W1 | Claimed, dies before `/api/analyze` (download, processing, tab closed) | no ledger row | stuck in `analyzing` forever | auto-reclaim after the 10 min lease |
| W2 | Reservation done, Gemini running | `reserved`, not expired | stuck | `active`: not claimable, even with confirmation |
| W3 | Server died mid-Gemini | `reserved` and expired, or `uncertain` | stuck | `needs_confirm(outcome_unknown)` |
| W4 | Gemini OK and committed, response lost or client timed out | `committed` | the row went to `error`, and the next click **re-analyzed and charged again** | `needs_confirm(paid_result_lost)` |
| W5 | Gemini OK, all saves failed, same tab | `committed`, result in memory | save-only retry | save-only retry with the **same attempt id** (fenced) |
| W6 | Same as W5, then reload or close | `committed`, result lost | stuck | `needs_confirm(paid_result_lost)` after the lease |
| W7 | Two tabs claim one candidate | n/a | both analyze, double charge | row lock: one `claimed`, the others `active` |
| W8 | Old worker passes its lease (suspended tab, slow upload) | any | n/a | (a) no dispatch in the last 2 min of the lease; (b) save fenced; (c) release fenced |
| W9 | Gemini failed (provider or pre-Gemini) | `refunded` | `error`, retry on click | auto-claim (nothing charged) |
| W10 | Claim RPC response lost | no ledger row (never dispatched) | n/a | candidate skipped. After the lease it recovers as in W1. |

A timestamp is never treated as proof that Gemini did not run. The only automatic recoveries are when the ledger has **no row** (and, for `analyzing` rows, the lease is over) or the row is `refunded`.

## 2. State transitions

`candidate_cvs.status` combined with the attempt evidence:

| From | Event | Guard (inside `claim_candidate_analysis`, row locked) | To | Charge risk |
|---|---|---|---|---|
| `pending` | claim | none | `analyzing`(A), `started_at=now()` | the new attempt only |
| `analyzing`(A) | claim | `started_at` within the lease | unchanged, returns `active` | none |
| `analyzing`(A) | claim | lease over and ledger(A) has no row or is `refunded` | `analyzing`(B) | the new attempt only |
| `analyzing`(A) | claim | lease over and ledger(A) is `reserved`, not expired | unchanged, `active` | none |
| `analyzing`(A) / `error`(A) | claim, no confirmation | ledger(A) `committed` | unchanged, `needs_confirm(paid_result_lost)` | none |
| `analyzing`(A) / `error`(A) | claim, no confirmation | ledger(A) `uncertain`, or `reserved` and expired | unchanged, `needs_confirm(outcome_unknown)` | none |
| any of the above | claim with `p_confirm_charge=true` | user confirmed in the dialog | `analyzing`(B) | **a second charge if B succeeds** (owner decision D1) |
| `analyzing`(no attempt, legacy) | claim | none | `needs_confirm(outcome_unknown)` | none until confirmed |
| `error`(no attempt, legacy) | claim | none | `analyzing`(B) | unchanged from M2-D2 (D3) |
| `error`(A) | claim | ledger(A) has no row or is `refunded` | `analyzing`(B) | the new attempt only |
| `analyzing`(A) | release (client error) | `attempt_id = A AND status = 'analyzing'` | `error`(A), message in `error_message` | none |
| not `done` | save(A) | none | `done`(A) | none (paid result kept) |
| `done`(A) | save(A) | replay | unchanged, `saved` with replay | none |
| `done`(B) | save(A) | none | unchanged, `superseded` (HTTP 409) | the paid A result is discarded (rare) |
| `done` | claim | none | `done` | none |

## 3. Migration

Additive. It adds two nullable columns and three functions.

| Object | Purpose |
|---|---|
| `analysis_started_at timestamptz NULL` | Lease start, server clock. The lease is this plus `candidate_analysis_lease_seconds()` (600). |
| `analysis_attempt_id uuid NULL` | Owner token. Equals the `/api/analyze` idempotency key, which is the ledger `request_key`. |
| `candidate_analysis_lease_seconds()` | The single place to change the 10 min. Revoked from everyone; only the definer calls it. |
| `claim_candidate_analysis(candidate, attempt, confirm)` | Callable by authenticated users. SECURITY DEFINER, `search_path=''`. Ownership is checked with `auth.uid()` against the campaign owner. |
| `save_candidate_analysis_attempt(user, candidate, attempt, result, score)` | service_role only. Fenced save, same ownership errors as the 5-arg version. |

Deliberately not added:
- **`lease_expires_at`**: it can be derived from the start time.
- **`analysis_state` or an outcome column**: the ledger is the outcome record.
- **A third `save_candidate_analysis` overload**: a default argument would make PostgREST's resolution ambiguous for the deployed 5-arg caller. The new function has its own name instead.

The claim only reads the ledger. It never locks `profiles` and never calls `analytics_quota_expire`, so there is no lock-order interaction with the quota RPCs, and quota RPCs, plan quotas and idempotency rules are unchanged.

Existing triggers still run inside the definer calls: `account_unlocked` (locked accounts cannot claim) and `storage_candidate_protect`. Explicit REVOKEs counter the Supabase default ACL, which grants EXECUTE to anon, authenticated and service_role.

## 4. Ownership and concurrency

- **Acquire:** the claim locks one `candidate_cvs` row with `SELECT … FOR UPDATE OF cc`, so concurrent claims of a candidate are serialized. The first claim sets a fresh `started_at`, and every later one sees `active`.
- **Release:** the client's error write is now `UPDATE … WHERE id AND analysis_attempt_id = mine AND status = 'analyzing'` (through RLS). A stale worker cannot flip another tab's claim or a saved `done` row.
- **Save:** `save_candidate_analysis_attempt` locks the row. It writes unless the row is already `done` under another attempt (rule 8). A paid result is therefore kept whenever no newer result exists.
- **Dispatch guard:**
  - the client refuses to call Gemini when more than 8 of the 10 lease minutes have passed since it claimed;
  - this covers the unbounded temp upload and tabs that resume after being suspended;
  - the analyze call itself takes at most 75 s.
- **Server dedupe:** a resend with the same attempt id gets 409 `duplicate_request` from the M2-C2 ledger and makes no second Gemini call.

## 5. Recovery UX

The Analyze button count (`pendingCount`) now includes stale `analyzing` rows, using a client-side age check that is only a hint. The claim RPC makes the real decision.

The bulk run never charges a candidate that `needs_confirm`. Such candidates:
- show `error` with an explanation (vi/en: `recruiterRecoveryPaidLost` / `recruiterRecoveryUnknown`);
- are collected and returned to the view.

When the run ends with any of them, a `ConfirmDialog` (danger style) opens:
- Title: "Phân tích lại ứng viên?" / "Re-analyze candidates?"
- Body: names the candidates and says this uses N more monthly credits if it succeeds.
- Buttons: "Phân tích lại (tốn lượt)" / "Re-analyze (uses credits)", and "Để sau" / "Not now".

Confirming re-runs **only** those candidate ids, with `p_confirm_charge=true`.

Other new messages:
- `recruiterLeaseExpired`: the session expired before dispatch, no credit used.

Diagnostics:
- console warn/info per outcome;
- GA4 `recruiter_analysis_recovery` with `outcome = needs_confirm:<reason> | confirmed:<reason>`.

The M2-D2 save-only path is unchanged, except that it now saves under the original attempt id.

## 6. Tests and verification

| Check | Result |
|---|---|
| `npm run lint` / `npm run lint:api` | PASS |
| `npm test` | PASS, 106 files and 1480 tests |
| `npm run build` | PASS. No new `api/` handler; the Vercel function count is unchanged. |
| Migration replay (isolated local Supabase, PG 17.6, project `m2d3db` in scratch; `supabase db reset`) | PASS, 90 migrations |
| `supabase/tests/candidate_analysis_ownership.test.sql` (grants, definer and search_path, one overload, 5-arg save present, decision table cases 1–12, fenced save/release, no quota effect) | PASS |
| `scripts/db-candidate-claim-concurrency.ts`: real PostgREST calls as a signed-in user | 9/9 on 3 runs: 20 parallel claims from 2 tabs → 1 owner; stale row → 1 owner; 20 **confirmed** claims of a paid-lost row → 1 owner; concurrent A/B saves → exactly one lands, both orders seen across runs, `analyzed_count=1`; claims never change `usage_count` or ledger rows; foreign claim returns `not_found`; fenced release through RLS; legacy app path (direct status write plus 5-arg save) still works |
| M2-C2 regression: `scripts/db-quota-concurrency.ts` and `analytics_quota_reservations.test.sql` | 12/12, PASS |
| Other SQL suites: `account_lock`, `campaign_caps`, `plan_caps` | PASS |
| `pg_stat_database.deadlocks` | 0 |
| Rollback (`supabase/rollback/…`) with live data, then re-apply plus SQL tests | PASS. Columns and functions dropped, `done` rows preserved, re-apply clean. |
| Vitest: `m2d3Recruiter.test.tsx` (12), `CampaignDetailView.chargeConfirm.test.tsx` (2: the dialog lists names and count, confirm re-runs only the confirmed ids once, "Not now" makes no second run), updated M2-B and M2-D2 suites, service and API tests | PASS |

Required scenarios and where each is covered:

| Scenario | Covered by |
|---|---|
| Fresh `analyzing` row is not recoverable | SQL 1, vitest |
| Stale, before dispatch | SQL 2, concurrency 2, vitest |
| Stale, after dispatch | SQL 5 and 6 |
| Gemini succeeded but save failed | SQL 3, M2-D2 vitest |
| Lost response or unknown billing | SQL 3, 4 and 5 |
| Two tabs | concurrency 1 |
| Expired ownership while the old worker runs | SQL 10, concurrency 4, vitest lease and superseded tests |
| Reload during analysis | vitest fresh-row test, SQL 1 and 3 |
| Save-only retry without a Gemini call | M2-D2 vitest (attempt id reused) |
| Duplicate history | none possible: the recruiter flow writes no history; save replay is idempotent (SQL 10, concurrency 4) |
| No unexpected quota use | SQL 12, concurrency 5 |
| Claim failure | vitest |

## 7. Remaining double-charge risks

1. **Confirmed re-analysis (by design).** A `paid_result_lost` candidate costs a second credit if the user confirms. Avoiding that needs a server-side result store (see D2).
2. **Same-tab unsaved result versus a confirmed re-run from another tab.** Tab A holds an unsaved paid result; after the lease, tab B confirms a re-run. Whichever saves first wins, and the other paid result is discarded. Both attempts were charged, and B's charge required explicit confirmation.
3. **`error` row with no ledger row, but the request still in transit.** Possible only if a request reaches the server well after the client errored (for example, an analyze request delayed more than about 10 s in the network). An immediate retry with a new key could then be charged twice. This is the same class as the M2-Q lost-confirmation item.
4. **Legacy `error` rows** written before M2-D3 have no attempt id. They keep the M2-D2 behaviour (retry on click, D3), so a legacy W4 row can still be charged again once.
5. **Mixed versions during rollout.** Tabs still running the old bundle use direct status writes and the 5-arg save. They are not fenced. An old tab and a new tab on the same campaign can still both analyze a candidate until the old tab reloads. A follow-up migration could block direct `status` writes by authenticated users once the code is live. It is not included: it would break old tabs between migration and deploy.
6. **Ledger retention is now load-bearing.**
   - The claim treats a *missing* ledger row as proof that Gemini never ran.
   - That holds only while ledger rows are never deleted. True today: no purge exists.
   - M2-Q Q-1 (ledger purge) **must not** delete a row whose `request_key` equals the `analysis_attempt_id` of any candidate that is not `done`. Otherwise a `paid_result_lost` row would be re-analyzed without confirmation.
7. **`paid_result_lost` also covers committed rows that were not charged** (`over_limit_waived`, `prior_cycle`). The copy therefore says the attempt *may* have been charged.
8. **Unbounded waits remain:** the `processFile` temp upload and the `saveCandidateAnalysis` fetch. The pre-dispatch check and fencing keep this safe, but a slow upload can still waste one claim cycle.

## 8. Owner decisions

- **D1: re-analysis of a reload-lost paid result.** Recommended (implemented): allowed only after the explicit charge dialog. Alternative: block it entirely and offer support or a credit refund.
- **D2: durable unsaved results.** Persisting the analysis server-side, or in IndexedDB, would make W6 a save-only recovery with no second charge. Not implemented: it stores candidate PII in a new place and needs its own review.
- **D3: legacy `error` rows with no attempt id.** Recommended (implemented): keep the M2-D2 retry on click.
- **D4: legacy `analyzing` rows.** Recommended (implemented): confirmation required. Preflight should count these first.
- **D5: lease length.** 600 s, changed only by migration. The client mirror (`ANALYSIS_LEASE_MS`) is a UI hint only.

## 9. Production preflight (not yet run)

The read-only production query was **blocked by the session's permission policy** and was not attempted another way. The SELECT-only file is ready: `supabase/tests/candidate_analysis_ownership.preflight.sql`. It returns counts, names and md5 values only, no PII.

Run it from an empty, linked scratch folder. Never run it from the main checkout.

```bash
supabase db query --linked -o csv -f "/Users/nghiepnguyen/My Files/cv-compare-tn/.claude/worktrees/quizzical-sammet-45d7b4/supabase/tests/candidate_analysis_ownership.preflight.sql"
```

The absolute path points at this worktree's file at the M2-D3 commit. Run the command from inside the empty linked folder.

Expected results:
- `m2c2_ledger_recorded=true`, `m2d3_not_recorded=true`, `new_columns_absent=true`, `new_functions_absent=true`, `ledger_key_unique=true`;
- `save_overloads` lists the 5-arg function, and the 4-arg too if `fix/drop-save-candidate-analysis-v1` is not applied. Either is fine;
- the `dep_md5_*` values match the local replay:
  - `sync_campaign_counters` `cfb9ead49ab85fd1eb0eb73fb3a44868`
  - `storage_protect_metadata` `5c096882ca8e876c21dd6bcc2d6deb75`
  - `enforce_account_unlocked` `d11dba1acf7bcfb6a57f004f0d7d1a69`
  - `reserve_analytics_quota` `f5603d1c7335ab638086b0d54fb06ad4`
- candidate triggers are `account_unlocked, enforce_plan_caps, storage_candidate_delete_pending, storage_candidate_deleted, storage_candidate_protect`;
- `analyzing` counts by age are recorded (they become the D4 rows).

## 10. Rollback

`supabase/rollback/20261117000000_candidate_analysis_ownership.sql` drops the 3 functions and the 2 columns. Saved results, the ledger and `usage_count` are untouched.

Order:
1. App first. Without the functions the new client skips every candidate: safe, but analysis stops.
2. Then the rollback SQL.
3. Then `supabase migration repair --status reverted 20261117000000`.

Rows left in `analyzing` return to the pre-M2-D3 behaviour (stuck).

## 11. Release sequence (each step needs separate owner approval)

1. Run the preflight (§9) and review it, including the D4 counts.
2. Apply the migration from a clean checkout at the approved commit:
   - `supabase db push --dry-run --linked` must list only `20261117000000`;
   - then `supabase db push --linked`.
   The old app keeps working: the additive change was verified by concurrency check 8.
3. Re-run the preflight. `new_*_absent` must now be false, and nothing else should change.
4. Watch production for 15 minutes on the old app.
5. Open the PR (CI), merge, and let the production deploy run.
6. Smoke test with the test recruiter account:
   - a fresh campaign analyzes once, `analysis_attempt_id` is set, and the ledger row has the same key;
   - a second tab during the run shows the row as analyzing and does not analyze it;
   - a legacy or stale row shows the confirmation dialog;
   - "Not now" makes no `/api/analyze` call.
   No forced Gemini failures in production.

Rollback triggers:
- claim RPC errors;
- `save-analysis` 409 rate above 0 outside two-tab use;
- any candidate analyzed twice under different attempts without a confirmation event.

## 12. Verdict

- **Code correctness: GO.** Lint, API lint, 1480 tests and the build pass. The M2-D2 invariants are kept and covered by tests: same-tab save-only with no Gemini call, errors never in `parsed_text`, a failed claim skips the candidate.
- **Database concurrency safety: GO (local evidence).** Row-locked claims and fenced save and release were proven on real Postgres 17.6 through PostgREST with parallel callers, repeated 3 times, with no deadlocks. Not yet proven on production: no preflight yet.
- **Billing safety: CONDITIONAL GO.** No automatic paid retry exists. Every recovery whose outcome is charged or uncertain needs an explicit confirmation, and this also closes the old W4 path where `error` → click charged again. The residual risks in §7 remain, and D1 needs the owner's sign-off.
- **Release: NO-GO until** the preflight has run and matches §9, and the owner approves D1 to D4. Then follow §11.
