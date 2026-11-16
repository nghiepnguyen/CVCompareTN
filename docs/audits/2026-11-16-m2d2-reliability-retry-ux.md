# M2-D2 — Reliability & Retry UX Remediation

Date: 2026-11-16. Branch `fix/m2d2-reliability-retry-ux` (worktree `../cv-compare-tn-m2d2`), based on `origin/main` `af314a9`.

- **Evidence source:** M2-D1 audit (2026-11-16, scratchpad report: findings F1–F7, K0, P2-2).
- **Not done in this stage:**
  - no migration;
  - no change to the quota RPCs or the hourly policy;
  - no prompt, model, score or Stage 3.14A scheduling change;
  - no live Gemini call, no production write, no push, no deployment;
  - P3A and CP6 untouched.

## 1. Findings-to-fixes matrix

| ID | Defect (M2-D1) | Fix | Where | Regression tests |
|---|---|---|---|---|
| Phase 0 | CI on `main` red: `m2bStabilization › JD exactly at the limit` took 5117 ms against a 5000 ms timeout | **Root cause:** the raw-JD hyphenated-compound regex `\p{L}+(?:-\p{L}+)+` backtracked quadratically on a long hyphen-free run. A 50k-char token took 1345 ms locally and about 5 s on CI. A realistic 50k JD takes 3 ms. **Fix:** anchor at a word start, `(?<!\p{L})`. The matches are identical, because a run that fails from its first letter also fails from any inner letter. No timeout was raised. | `_server-lib/ai/suggestionGuard.ts` (`rawJdConcepts`) | `rawJdHyphenLinear.test.ts`: (1) 2,000 seeded random strings (letters, Vietnamese, combining marks, hyphens) give identical old and new matches; (2) a 50k-char token runs in under 250 ms; (3) compounds are still extracted |
| F1 (P1) | Recruiter: analyze succeeds (quota charged), then the save fails. The candidate is marked `error`, the next run re-analyzes and charges again, and the error text lands in `parsed_text` | Analyze and save are separate steps. The save gets 3 attempts with 0.5 s and 1.5 s backoff. If it still fails, the result stays in tab memory and the DB row is left as `analyzing` (never `error`), so a reload cannot re-analyze it. The next campaign run **saves only**, with no `analyzeCV` call and no quota pre-check. A list reload keeps the unsaved result retryable. Localized message: `recruiterSaveFailed` | `src/context/recruiter/RecruiterContext.tsx` | `m2d2Recruiter.test.tsx` F1 ×5: transient failure (analyze ×1, save ×2); persistent failure followed by a save-only run (**analyze ×1 in total, quota pre-check 0**); survives a list reload; a mixed batch pre-checks quota only for candidates that need analysis; double click during save-only gives save ×1 |
| F2 (P2) | A status-write failure ended the batch; error written to `parsed_text`; unbounded fetch and session lookup | Status writes are guarded. An `error` write that fails is logged and the batch continues. **If the `analyzing` write fails, that candidate is skipped with no Gemini call**: analyzing it anyway could leave a paid, unsaved result on a row that is still `pending`. Errors go to `error_message`, and `parsed_text` is never written. Timeouts: 60 s for the file download, 6 s for `getSession` | `RecruiterContext.tsx`, `src/services/recruiterService.ts`, `src/lib/withTimeout.ts` | `m2d2Recruiter.test.tsx` F2 ×5; `m2d2RecruiterService.test.ts` (`{status, error_message}` written, `parsed_text` never; timeout helper) |
| F4 (P2/P3) | "Saved" claimed after the history upsert failed; single-CV failure silent; Full CV written to a row that does not exist | Results enter the sidebar history **only after** the upsert succeeds. The banner is built when the save settles, without holding the run open; a newer run drops a stale banner. A not-saved message plus a **Retry save** button cover partial, single-file and pasted-text runs. Parsed CV and Full CV are written only once the row exists (run save OK, or a later Retry save succeeded); otherwise the next retry upsert carries them. The upsert uses `onConflict: 'user_id,analysis_id'`, so a retry updates the row instead of duplicating it or hitting 23505 | `src/context/analysis/AnalysisRunContext.tsx`, `src/services/historyService.ts` | `m2d2PersonalRun.test.tsx` F4 ×9 (incl. Retry save gives the same analysis id with **no Gemini calls**; Full CV after a Retry save is persisted; stale banner ignored); `m2d2HistoryUpsert.test.ts` |
| K0 (P3) | A JD over 50k chars started one parse per CV, then analyze returned 413 | Client check before any processing: JD over `MAX_JD_CHARS`, or pasted CV over `MAX_CV_TEXT_CHARS`, gives the localized `aiErrorInputTooLarge`. The constants move to `src/lib/inputLimits.ts`; the server imports them and stays authoritative. Parse ‖ analyze scheduling (3.14A) is unchanged for accepted input | `AnalysisRunContext.tsx`, `src/lib/inputLimits.ts`, `_server-lib/inputLimits.ts` | K0 ×3: 50,001 gives 0 processFile, parse, analyze or quota calls; exactly 50,000 runs parse and analyze in parallel; pasted CV over 100,000 is rejected |
| F7 (P2) | Re-running a stored CV (PDF over 2 MB, or an image) reused a temp path that had already been deleted, giving a 400 | `eagerProcessing` is consumed once. Later runs download and process the stored CV again, which gives a fresh temp upload that is cleaned up after that run. No new retention | `AnalysisRunContext.tsx` | F7 ×1: run 2 calls `resolveToFile` + `processFile`, sends `temp/…/second.pdf`, and that path is cleaned up |
| F3 (P2) | Re-running after a partial failure re-analyzed and re-charged the successes and duplicated history | Explicit state per input: `lastFileRun = {jd, resultByInput, hadFailures}`. After a partial failure with the **same JD**, the run analyzes only inputs without a result (failed plus newly added). Earlier results stay on screen, and earlier unsaved results ride along with this upsert. A changed JD, a fully successful last run, or nothing left to retry gives a normal full run, so deliberate re-analysis still works. The banner says to press Analyze to re-run failed CVs | `AnalysisRunContext.tsx` | F3 ×6: 3 CVs with 1 failed gives a retry with analyze ×1, parse ×1, quota pre-check 1, upserts `[[r1,r3],[r4]]`, results 3, no duplicate history ids; full run after a successful retry; changed JD; added CV; double click; earlier unsaved result saved once |

## 2. Before/after evidence (offline, mocked)

The new tests were run against unmodified `af314a9` code (scratchpad export) and against this branch.

| Suite | `af314a9` (before) | This branch (after) |
|---|---|---|
| `m2d2Recruiter.test.tsx` (10) | 7 fail | 10 pass |
| `m2d2PersonalRun.test.tsx` (before: 17; now 19) | 12 of 17 fail | 19 pass |
| `rawJdHyphenLinear.test.ts` (3) | 1 fail (50k token: 1578 ms) | 3 pass |
| `m2bStabilization › JD exactly at the limit` | 1367–1502 ms locally; 5117 ms CI timeout | 22–24 ms, 10 of 10 runs |

- Tests that also pass on the baseline pin behavior that must be preserved:
  - JD at exactly the limit runs in parallel;
  - "saved" message when the save succeeds;
  - a changed JD runs everything;
  - Full CV is written when the row exists;
  - the stale-banner guard holds trivially on the old code;
  - F2 "error is passed as the 3rd argument": on the baseline that argument went to `parsed_text`, so the real proof is `m2d2RecruiterService.test.ts`;
  - download failure isolation;
  - stale `analyzing` is not recovered.
- M2-D1 before numbers, for reference:
  - recruiter: save failure then re-run gave analyze 1→2;
  - personal: re-run gave analyze 3→6, history `[2,3]`;
  - JD of 50,001 chars: parse ×3 calls.

**Gates (local):**
- `npm run lint`: PASS.
- `npm run lint:api`: PASS.
- `npm test`: 104 files, 1456 tests, PASS, two consecutive full runs.
- `npm run build`: PASS.

GitHub CI has not run, because nothing has been pushed.

## 3. Behavior changes users will see

- Recruiter: a candidate whose save failed shows "Đã phân tích xong nhưng chưa lưu được kết quả…" ("Analysis finished but the result could not be saved…"). Pressing Analyze then saves it without using a credit.
- Recruiter: a candidate whose status write failed shows "…chưa phân tích (không tốn lượt)…" ("…not analyzed (no credit used)…").
- Personal: after a partial failure, pressing Analyze again with the same JD runs only the failed CVs, plus any newly added ones.
- Personal: a result appears in the sidebar History only once it is saved. A failed save shows a message with a **Thử lưu lại / Retry save** button.
- Personal: a JD over 50,000 characters, or a pasted CV over 100,000 characters, is rejected before anything runs.

## 4. R3 investigation — does `analysis_log.model IS NOT NULL` mean "Gemini ran"?

The question was answered by reading code only; nothing was changed.

| Path | `model` written | Gemini called? |
|---|---|---|
| analyze preflight: 400/401/403/409/413/429 (monthly and hourly), `quota_unavailable`, `ai_rate_limited`, `rate_limit_unavailable`, storage errors, `request_budget_exhausted` (`_server-lib/analyze/handler.ts`, all `undefined, undefined` calls) | NULL | No |
| analyze success (`handler.ts:247`) and `quota_settlement_unavailable` (`:241`) | set (full usage) | Yes |
| analyze failure inside `analyzeCV` (`:262-263`) | set for every category except `request_budget_exhausted`, **even when `geminiStarted` is false** | Usually yes; sometimes no (e.g. a throw before the request) |
| parse-cv failure (`parseCv/handler.ts:74,123`) and rewrite / cover letter / review / follow-up (`rewriteCv/handler.ts:114,166,198-207,…`) | set only when `withModel` is true, which is every category except `request_budget_exhausted` (storage errors pass `false`) | Same pattern |
| parse/rewrite/document success | set | Yes |

**Conclusion:**
- `model IS NOT NULL` is a **superset** of the requests where Gemini ran. It also includes some failures inside the AI service before the request was sent.
- It never misses a request that called Gemini, so it errs toward counting more, which is the safe direction.
- It is not an exact signal.
- An exact signal would need the analyze handler to pass `model` only when `geminiStarted` is true, which is a small server change. That change belongs with the R3 decision, not M2-D2.

**Owner check — BLOCKED: needs an authorized read-only production query:**

```sql
SELECT kind, status, (model IS NOT NULL) AS has_model, left(coalesce(error_message,''), 40) AS category, count(*)
FROM public.analysis_log WHERE created_at > now() - interval '30 days'
GROUP BY 1,2,3,4 ORDER BY 1,2,3,5 DESC;
```

## 5. Release gates — production is NO-GO until all of these hold

1. **History unique constraint present in production.**
   - Why it matters: if `public.history` has no unique constraint on exactly `(user_id, analysis_id)`, PostgREST returns 42P10 and **every** history save fails, not just retries.
   - The repo creates `history_user_analysis_unique UNIQUE (user_id, analysis_id)` (`20260516120000_cv_matcher_core_schema.sql:60-70`). A duplicate-row failure would abort that migration rather than be swallowed, but the guard checks the constraint by name only.
   - Verify read-only:
     ```sql
     SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'public.history'::regclass AND contype IN ('u','p');
     ```
2. **GitHub CI green on the branch.** This requires a push, and the owner must approve it.
3. **Preview smoke test approved by the owner.**
   - Preview uses the production Supabase and real Gemini, so it writes real rows and consumes quota on the test account.
   - Suggested cases:
     - recruiter campaign with one candidate;
     - personal batch with a forced failure via an oversize or unreadable file;
     - Retry save cannot be forced on Preview, so it is covered offline only.

## 6. Remaining risks and known debt

- **Unsaved recruiter results live in tab memory only.** After a reload, the row stays `analyzing` until M2-D3. There is no double charge, but the paid result is lost.
- **Unsaved personal results are dropped when the user starts a new full run** (different JD, or after a fully successful run). Before that, the banner offers Retry save.
- **Cross-tab:** two tabs running the same campaign, or the same personal batch, can still each analyze the same CV. Not addressed; the M2-C2 key is per call.
- **Lost confirmations are not addressed:**
  - the recruiter save RPC committed but the response was lost: the next save-only retry repeats the save, which is idempotent per candidate;
  - analyze commit confirmation lost (M2-C2 A4): out of scope (M2-Q).
- **A campaign JD over 50k chars has no client check.** Each candidate gets 413 from the server: no charge, no parse. This is not K0 waste.
- **The recruiter flow never cleans up eager temp uploads for stored CVs that are never analyzed.** This predates M2-D2 and relies on the storage cleanup job.
- **The banner arrives a moment after the results**, once the upsert answers. If the upsert hangs, the run still ends and no banner appears; the result is simply not in History.
- **Hourly count policy (R3) unchanged:** rejection rows still count (P2-2).

## 7. Backlogs

**M2-D3 (needs a migration):**
- `candidate_cvs.analysis_started_at`, set when a candidate enters `analyzing`.
- Retry `analyzing` rows older than 10 min. All client waits are now bounded (60 s download, 6 s session, 75 s analyze, plus the save backoff), so a live run cannot exceed that.
- Recover unsaved results lost on reload (re-analysis is then a deliberate, charged action, which needs an owner decision on the UX).

**M2-Q (quota hardening):**
- Q-1: ledger purge and sweep.
- Q-2: `reserved` in `check_analytics_quota`.
- Q-3: settlement budget and lost-confirmation policy.
- Q-4: DB tests in CI.
- Q-5: restore the default-limit fallback.
- Q-6: grant hygiene.
- Q-7: hourly window edge.
- R3: decide the count policy; optionally log `model` only when `geminiStarted` is true.

## 8. Changed files

Production code:
- `_server-lib/ai/suggestionGuard.ts`
- `_server-lib/inputLimits.ts`
- `src/lib/inputLimits.ts` (new)
- `src/lib/withTimeout.ts` (new)
- `src/context/analysis/AnalysisRunContext.tsx`
- `src/context/recruiter/RecruiterContext.tsx`
- `src/services/historyService.ts`
- `src/services/recruiterService.ts`
- `src/translations/recruiter.ts`
- `src/translations/types.ts`

Tests (new):
- `src/__tests__/context/m2d2PersonalRun.test.tsx`
- `src/__tests__/context/m2d2Recruiter.test.tsx`
- `src/__tests__/services/m2d2HistoryUpsert.test.ts`
- `src/__tests__/services/m2d2RecruiterService.test.ts`
- `src/__tests__/services/rawJdHyphenLinear.test.ts`

Docs: this file.

Untouched:
- migrations, quota RPCs, P3A, CP6;
- the main checkout (`feat/p3a-interview-prep`): `git status` and the `git diff` hash are identical before and after;
- `graphify-out/`: a background rebuild dirtied it in this worktree, and that change was reverted.

## 9. Recommendation

- **GO** to push the branch for CI and to run a Preview smoke test, once the owner approves.
- **NO-GO for production** until gates §5.1–5.3 pass.
- **Owner decisions still open:**
  - M2-D3 UX for results lost on reload;
  - R3 count policy.
