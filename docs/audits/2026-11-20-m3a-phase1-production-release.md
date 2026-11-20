# M3-A Phase 1 — Production release report

- Date: 2026-11-20
- Verdict: **PASS WITH KNOWN DEBT**
- Owner authorization:
  - GO for squash merge and production deploy, plus one controlled smoke on test account `044c3afb`;
  - at most 4 Gemini calls; no migration, no extra live tests.
  - Phase 2: DEFERRED (not started).

## 1. Release

| Step | Evidence | Result |
|---|---|---|
| Revalidate PR #94 | head `8cdcb32` (tested), base `4aa4301` = `origin/main`, `mergeStateStatus: CLEAN`, 8/8 checks SUCCESS. The ruleset's required checks "Database tests" and "Lint, Test & Build" are both SUCCESS | PASS |
| Ready for review | title de-drafted, `gh pr ready 94` | done |
| Squash merge | `gh pr merge 94 --squash --match-head-commit 8cdcb32…` → **`67867d3`** at 2026-11-20T09:00:48Z; tree of `67867d3` == tree of `8cdcb32` | PASS |
| Production deployment | **`dpl_HP6WMBQNZ8Mo2XSYBgVbQgAQ5SNQ`**, commit `67867d3`, `READY` 09:02:55Z | PASS |
| Aliases | `cvfit.pro`, `cv.thanhnghiep.top`, `cv-compare-tn.vercel.app`, `cv-compare-tn-nghiepnguyens.vercel.app`, `cv-compare-tn-git-main-nghiepnguyens.vercel.app` → `dpl_HP6W…` | PASS |
| Live bundle | `https://cvfit.pro/en/` → `assets/index-BWMOe8Px.js` contains the new M3-A string ("Mất kết nối trước khi nhận kết quả") and `quota_settlement_unknown` (GET only) | PASS |
| **Rollback target** | `dpl_HGDSj4u2nvcfJsh81bHR3rxExvzF` (`4aa4301`, previous production) via Vercel Instant Rollback. It is not needed and was not used. | recorded |

No migration, no database change and no environment change were made.

## 2. Production smoke (one run)

**Setup:**

- Built-in browser, signed in as test account `044c3afb` (prefix verified from the session token).
- `/en` UI with the report language set to EN, so `/api/analyze` makes no localize call.
- Pasted **synthetic** English JD and CV text, with no real person's data.

| # | Check | Pre (09:01:14Z) | Post (09:05:46Z) | Result |
|---|---|---|---|---|
| 8a | `/api/analyze` HTTP | — | **200** | PASS |
| 8b | `serverSave` | — | **`saved`** | PASS |
| 8c | Response `id` | — | `02035bce-c380-4ecb-be76-fffd420f1874` (= request key) | — |
| 8d | Quota `usage_count` | 5 | **6** (+1) | PASS |
| 8e | Ledger rows for the key | — | **1**, `committed`, `charged=true`; ledger total 11 → 12 | PASS |
| 8f | History rows with `analysis_id` = key | — | **1** (the browser upsert replayed onto the same row); history total 8 → 9 | PASS |
| 8g | Open reservations | 0 | **0** | PASS |
| 8h | Background fields on that row | — | `parsed_cv` set, `full_rewritten_cv` set | PASS |
| 9 | Reload → History | — | result listed **once** (score 82). **No** new `/api/*` request; DB re-read at 09:06:39Z unchanged (usage 6, ledger 12, history 9, log 69) | PASS |

### Gemini calls (from `analysis_log`, metrics only)

| kind | status | model | tokens in/out | Gemini calls |
|---|---|---|---|---|
| `parse_cv` | success | gemini-3.5-flash-lite | 414 / 253 | 1 |
| `analyze` | success | gemini-3-flash-preview | 3829 / 1775 | 1 |
| `rewrite` | success | gemini-3-flash-preview | 873 / 219 | 1 (`retryOutcome: not_needed`) |

**Total: 3 Gemini calls, within the authorized maximum of 4.**

- 0 `[quota_settlement_*]` error rows.
- No retry, rollback or additional live test was run.

All production database reads were SELECT-only aggregates through `supabase db query --linked`. The queries returned no emails or CV content.

## 3. What this proves, and what it doesn't

**Proven in production:**

- server save after a confirmed commit, with `analysis_id = request key`;
- one charge, one ledger row and one history row; the browser replay upsert is idempotent;
- background updates land on the server-created row;
- reload shows the result from history with no new AI call.

**Not exercised in production (offline-verified only):**

- lost-response and timeout recovery by key;
- the `quota_settlement_unknown` copy;
- cross-user isolation. This was proven on a real local Postgres in CI, by the DB test `m3aPersonalHistorySave.db.test.ts`.
- These were deliberately not simulated under the 4-call budget.

## 4. Known debt carried forward

| # | Item | Status |
|---|---|---|
| R1 | Commit lands after the handler gave up (`quota_settlement_unknown`) → charged, no row | open; Phase 2 (atomic commit + history save, migration) **DEFERRED** by owner |
| R11 | Stale pre-#88 recruiter tab → candidate analysis copied into the recruiter's own history | accepted; pre-merge impact **0**; **read-only recheck scheduled** (task `m3a-r11-recheck`, one-time, 2026-11-22 09:05Z: Q2 + Q4 of the readiness report) |
| R12 | "Analyzing…" stays visible during the recovery lookup (≤ 75 s after dispatch) | accepted UX debt |
| U1 | Classic `(req, res)` handler keeps running after a client disconnect (cancellation is opt-in and not enabled); documented by implication only | unverified |
| U2 | Fluid compute (`VERCEL_FLUID`) does not change U1 | unverified |
| U3 | No production evidence of a request completing after its browser aborted | unverified |
| R5–R8, R10 | Mid-request lock window, own-key overwrite, free-plan trim on browser save only, recovered result shape, "may still be saving" copy | accepted (see the implementation report) |
| — | M2-Q P1-4 withheld result after a definitive commit failure | unchanged (A4) |

## 5. Follow-ups (not started)

- 2026-11-22 09:05Z: R11 recheck runs automatically. Read-only; it recommends but does not implement the fallback guard.
- Release documentation (design audit, implementation report, readiness review, this report) is local in the `../cv-compare-tn-m3a` worktree. Publishing it needs a docs PR, which needs owner approval. A docs-only merge triggers a production redeploy of unchanged runtime code.
- M3-A Phase 2: DEFERRED. Revisit only with Sentry `quota_commit_unknown` frequency data.

## 6. Verdict

**PASS WITH KNOWN DEBT.**

- Every release step and every smoke check passed.
- The Gemini budget held: 3 calls of 4.
- No unexpected result, no retry and no rollback.
- Open items are the documented known debt (R1, R11 recheck, R12, U1–U3). None of them blocks.
