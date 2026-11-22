# M3-A Phase 1 — Release readiness review (PR #94)

- Date: 2026-11-20
- PR: nghiepnguyen/CVCompareTN#94 (draft), head `8cdcb32`, base `main` @ `4aa4301`
- Mode: verification only. Production reads were SELECT-only aggregates through `supabase db query --linked`. Vercel and GitHub reads were GET-only. No merge, no deploy, no Gemini call, no production write.
- Owner decisions received: Q-D4 compatibility **ACCEPTED**; R11 **conditionally accepted** pending this impact assessment; Phase 2 migration **DEFERRED**.

## 1. PR integrity

| Check | Evidence | Result |
|---|---|---|
| Head is the tested commit | `gh pr view 94`: `headRefOid` = `8cdcb327c8931389f5352b12d99583e203a753a1` = local commit = `origin/fix/m3a-personal-result-recovery` | PASS |
| Base unchanged | `baseRefOid` = `4aa4301` = current `origin/main` | PASS |
| No unexpected changes | 1 commit, 18 files (same list as the implementation report); `mergeable: MERGEABLE` | PASS |
| Checks on `8cdcb32` | 8/8 SUCCESS: Lint, Test & Build; Database tests; CodeQL (+ 2 Analyze); GitGuardian; Vercel; Vercel Preview Comments | PASS |
| DB job really ran the new suite | DB tests run 44705028009: "31 suites, 0 failed", `deadlocks=0`, `PASS vitest:src/__tests__/db` (that job fails on any skip, so `m3aPersonalHistorySave.db.test.ts` executed) | PASS |
| Unit job | CI run 44705027823: 111 test files passed | PASS |

## 2. Production permission check (read-only)

The query is in §9 (Q1). Production result:

| Item | Value |
|---|---|
| `service_role` INSERT / UPDATE / SELECT on `public.history` | **true / true / true** |
| `service_role` BYPASSRLS | true |
| RLS enabled | true |
| Policies | `account_unlocked_read`, `history_delete_own`, `history_insert_own`, `history_select_own`, `history_update_own` |
| Triggers | `account_unlocked` |
| Constraints | `history_pkey` (p), `history_user_analysis_unique` (u), `history_user_id_fkey` (f) |
| `analysis_id` type | `text` |

**PASS.** Production matches the repository and the local test stack. The release gate "prod grant check pending" is closed. No grants or policies were changed.

## 3. R11 impact (read-only, aggregates only)

**What R11 is:** a recruiter tab still running a bundle from before PR #88 sends no `candidateId`. After M3-A the server treats that request as personal and also writes the candidate's analysis into the recruiter's own `history`.

**Method:** classify every ledger row created since the PR #88 merge (2026-11-18 07:15Z) by accounts that own at least one recruitment campaign (Q2, Q3 in §9):

- **Candidate saved in the settle transaction**, or within 5 s of it: a server save (current bundles).
- **Candidate saved more than 5 s after settlement:** a browser save, which is the signature of a pre-#88 bundle (#83–#88 era, key = attempt id, no `candidateId`).
- **No candidate behind the key, and no personal history row near the settlement:** the signature of a pre-#83 bundle (no key at all).

**Production result:**

| Measure | Count |
|---|---|
| Accounts owning campaigns | 2 |
| …active in the window | 1 |
| Ledger rows in window | 5 (all `committed`; 0 reserved / refunded / uncertain) |
| Keyed to a candidate attempt | 4 |
| — saved in the settle transaction (2C atomic) | 2 |
| — saved by the server within 5 s (1B/2A path) | 2 |
| — saved by the browser later (> 5 s), **pre-#88 signature** | **0** |
| — never saved | 0 |
| No candidate behind the key | 1 |
| — with a personal history row at settlement (a genuine personal run) | 1 |
| — without one, **pre-#83 signature** | **0** |

| Candidates analyzed in window (Q4) | 4 |
| — with `analysis_attempt_id IS NULL`, **pre-#83 candidate-side signature** | **0** |
| — with an attempt id that has no ledger row | **0** |

**R11 impact: 0 stale-bundle requests observed since #88**, measured before M3-A is deployed.

Limitations:

- The window is 2026-11-18 07:15Z → 2026-11-20 (query time), and traffic in it is tiny: 1 active recruiter account, 5 rows.
- The classification is heuristic and uses timestamps:
  - a server-side save that failed and fell back to the browser would look like a pre-#88 request. There are none, so nothing is hidden;
  - the ±180 s / +10 s history match could pair a recruiter run with an unrelated personal run. With 1 row, it does not affect the result.
- Requests rejected before the quota reservation leave no ledger row. They also cannot reach the history save, so they are irrelevant here.
- "Recruiter" means "owns a campaign". An account cannot use the recruiter flow without one.
- No ids, emails or content were selected. Only counts and two dates were returned.

### Can older bundles still affect users?

- **Production now has exactly one deployment** (`dpl_HGDS…`, `4aa4301`). All pre-#88 deployments were deleted (M2-Q H2.1/H2.2).
- A hashed old chunk now returns `404 text/plain` (GET `https://cvfit.pro/assets/RecruiterView-OLDHASH0.js`).
- `RecruiterView` is lazy (`src/app/AppContent.tsx:64`). A stale tab that opens the recruiter view after the deploy therefore fails the chunk load, and `ChunkLoadErrorBoundary` forces a one-time reload onto the current bundle (`src/components/ChunkLoadErrorBoundary.tsx:28-30`).
- **Remaining exposure:** a tab that loaded `RecruiterView` before 2026-11-18 07:15Z and has stayed open without a reload for more than 2 days. Even then:
  - the copy lands in the **same user's** own history. Nobody else can see it, it is deletable, and the free-plan trim and day retention apply;
  - the candidate save still works (the old browser save is fenced by attempt), and billing is unchanged.

**Recommendation:** accept R11 as known debt. **No code mitigation**: a server-side guard would cost one extra query on every personal run, for an observed impact of 0. Post-merge, re-run **Q2 and Q4** once after 48 h:

- **Q2** "> 5 s browser save" catches #83–#88 tabs.
- **Q4** `attempt_null` / `attempt_without_ledger_row` catches pre-#83 tabs.
- **Q3 is not usable after the merge.** M3-A writes a history row for every candidate-less request, so its "without history row" bucket always reads 0.

If any of these counts is above 0, a one-line guard (skip the history save when the key equals an attempt id of the user's own candidates) is the fallback.

## 4. R1 and R12: no new release-blocking regression

- **R1** (commit lands after the handler gave up → charged, no row):
  - **pre-existing**, not introduced. Before M3-A the same case was charged with nothing saved and showed a misleading "quota unavailable" message;
  - M3-A changes only the copy, which is now truthful ("may have been counted … will not appear in History").
  - The server writes nothing on `unknown`, so A4 holds.
  - No regression. Phase 2 stays DEFERRED (owner).
- **R12** (UI keeps "Analyzing…" during the lookup):
  - the lookup window ends 75 s after dispatch, so on the 75 s client timeout there is one immediate lookup and no extra wait. An early network drop waits at most until dispatch + 75 s, which is no longer than a normal slow request;
  - `runInFlightRef` stays set, so no parallel run can start;
  - only no-answer failures are affected. This is bounded UX debt, not a functional, billing or data regression.

## 5. Preview status

| Item | Evidence | Result |
|---|---|---|
| Preview deployment | `dpl_8iYVeMvVfsVN4AEtzpJZcEMVV2uZ`, project `cv-compare-tn`, commit `8cdcb32`, branch `fix/m3a-personal-result-recovery`, `READY` | PASS |
| Isolation, project env | `vercel env ls`: Supabase, Gemini and R2 credentials are Production-only | PASS |
| Isolation, runtime env | `GET /v13/deployments/dpl_8iYV…`: env names include no `SUPABASE_*`, `GEMINI_API_KEY` or `R2_ACCESS/SECRET/ACCOUNT` | PASS |
| Not exercised | No HTTP request was sent to the Preview: SSO-protected, and it cannot work without credentials anyway | by design |

## 6. Vercel client-disconnect behaviour

**Documented:**

- Vercel docs, "Cancel requests": cancellation is opt-in through `supportsCancellation`, Node.js runtime only. When it is enabled, the function is terminated on disconnect.
- **Repo:** `vercel.json` sets `functions["api/analyze.ts"].maxDuration = 300` and **no `supportsCancellation`**.
- **Handler style:** classic `export default async function handler(req: VercelRequest, res: VercelResponse)` (`api/analyze.ts:6`). It awaits `handleAnalyze`, which contains the commit and the history save, before `res.json`.
- The Preview runtime env shows `VERCEL_FLUID` (Fluid compute).

**Unverified assumptions (recorded):**

- **U1.** Without `supportsCancellation`, a classic `(req, res)` handler keeps running after the client disconnects. The docs say this by implication only; they do not state the default for this handler style.
- **U2.** Fluid compute does not change U1.
- **U3.** No production evidence exists of a request that ran to completion after its browser aborted. The M2-Q 2A prod smoke did not exercise the abort path.

**If U1 is false:** the abort case behaves as before M3-A. The reservation expires as `uncertain` and the lookup finds nothing ("may still be saving"). A network drop *after* the response was sent is still covered. Not a release blocker.

## 7. Remaining known debt

| # | Item | Status |
|---|---|---|
| R1 | Late commit after `quota_settlement_unknown` → charged, no row | open; Phase 2 DEFERRED (owner) |
| R2/U1–U3 | Vercel abort behaviour not verified empirically | open; fail-safe |
| R5 | Service role bypasses the account-lock trigger for a lock set mid-request (≤ 65 s) | accepted (same as recruiter) |
| R6 | Client may pick its own old `analysis_id` as a key and overwrite that own row | accepted (RLS already allows it) |
| R7 | Free-plan 50-row trim only on the browser save | accepted |
| R8 | Recovered result has the history shape (no `formatAssessment`) | accepted |
| R10 | "May still be saving" copy also shows when the platform cancelled the run (nothing charged) | accepted (copy says "may") |
| R11 | Stale pre-#88 recruiter tab → candidate analysis copied into own history | **accepted; impact 0**; re-check 48 h after merge |
| R12 | "Analyzing…" during the lookup | accepted UX debt |
| — | M2-Q P1-4 withheld result after a definitive commit failure | unchanged (A4) |
| — | No Instant Rollback target before this merge's deploy. After the merge, `dpl_HGDS…` (`4aa4301`) becomes the rollback target. | note |

## 8. Decision

**GO for merge**, with no unresolved release blocker. The merge itself needs the owner's explicit action. Every gate is closed:

- prod grants verified;
- Q-D4 accepted;
- R11 impact assessed at 0 with a recorded re-check;
- CI 8/8 on the tested SHA;
- Preview isolated;
- Phase 2 deferred.

### Post-merge production smoke plan (needs separate approval)

**Account and budget:**

- **Account:** test account `044c3afb` only.
- **Budget, traced from code:**
  - `/api/analyze`: 1 call, plus 1 more (`localizeAnalysis`, `analysisService.ts:273`) when the report language is not `en`;
  - `/api/parse-cv`: 1 call;
  - `/api/rewrite-cv`: 1 call, or 2 when the fidelity retry runs (`rewriteService.ts:292-309`);
  - `geminiClient.ts` has no retry wrapper.
  - **Pin the run to EN report language:** 3–4 calls per run. **Cap by runs: exactly 1 run.** A second run is allowed only if the first was rejected before Gemini (no `analysis_log` row with a model). Hard ceiling 8 calls.
  - Verify the actual count afterwards from the `analysis_log` rows and token usage of the run. No recruiter run: the recruiter path is unchanged and covered by CI. No lost-response or abort simulation in production; that path is offline-verified only (U3).

**Steps:**

1. Wait until the production deployment of the merge commit is `READY`. Confirm the live bundle contains `analysisResultMaybeSaving`, using a GET of the index asset only.
2. **Pre-snapshot** (SELECT only) for the test account: `usage_count`, the ledger row count by state, the `history` row count, and the open reservations count.
3. Run one personal analysis with pasted text in the built-in browser.
   - Record the `/api/analyze` response status and `serverSave`, plus the response `id`. Don't capture the request body.
   - Expect: `200`, `serverSave: 'saved'`.
4. **Post-snapshot** (SELECT only). Expect:
   - `usage_count` +1;
   - exactly 1 new ledger row, `committed`, whose `request_key` = response `id`;
   - exactly 1 `history` row with `analysis_id` = response `id`, even though the browser upsert also ran;
   - `parsed_cv` filled in on that row once parse finishes, and `full_rewritten_cv` too, unless the rewrite took its fidelity fallback (which writes nothing, as today);
   - 0 open reservations;
   - 0 `[quota_settlement_*]` rows in `analysis_log` for the run.
5. Reload the page: the result appears in History once, and no new `/api/analyze` call is made.
6. Re-run Q2 and Q4 (§9) after 48 h for R11. Q3 is not valid after the merge.

**Stop rules and rollback:**

- **Stop condition:** any non-200, `serverSave` ≠ `saved`, 2 history rows, 2 ledger rows or a charge without a row. Then stop and do not retry. Roll back via Vercel Instant Rollback to `dpl_HGDS…` (`4aa4301`), after approval. No data cleanup is needed: the row is the user's own history.

## 9. Queries (read-only)

**Q1: grants and guards**

```sql
select has_table_privilege('service_role','public.history','INSERT') as sr_insert,
       has_table_privilege('service_role','public.history','UPDATE') as sr_update,
       has_table_privilege('service_role','public.history','SELECT') as sr_select,
       (select relrowsecurity from pg_class where oid='public.history'::regclass) as rls_enabled,
       (select string_agg(polname, ',' order by polname) from pg_policy where polrelid='public.history'::regclass) as policies,
       (select string_agg(tgname, ',' order by tgname) from pg_trigger where tgrelid='public.history'::regclass and not tgisinternal) as triggers,
       (select string_agg(conname||':'||contype::text, ',' order by conname) from pg_constraint where conrelid='public.history'::regclass) as constraints,
       (select data_type from information_schema.columns where table_schema='public' and table_name='history' and column_name='analysis_id') as analysis_id_type,
       (select rolbypassrls from pg_roles where rolname='service_role') as sr_bypassrls;
```

**Q2: R11 classification.** Window from 2026-11-18 07:15Z; accounts owning a campaign; ledger rows left-joined to `candidate_cvs` on `analysis_attempt_id = request_key` within the owner's campaigns. The counts compare `analyzed_at` with `settled_at`: equal, within 5 s, more than 5 s, or null.

**Q4: candidate-side stale-bundle signature.** Candidates with `analyzed_at` in the window, counting `analysis_attempt_id IS NULL` and attempt ids that have no ledger row of the owner.

**Q3: candidate-less committed rows** (pre-merge only). The same window and accounts; committed rows with no candidate attempt behind them, split by whether a `history` row of the same user has a `timestamp` between `settled_at − 180 s` and `settled_at + 10 s`.

Both select `count(*)` aggregates and two dates only. The full text is kept with the local evidence (scratchpad `m3a-q2-r11.sql`, `m3a-q3-r11-nokey.sql`, `m3a-q4-r11-precandidate.sql`).
