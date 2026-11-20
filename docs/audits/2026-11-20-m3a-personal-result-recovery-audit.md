# M3-A — Personal result recovery: audit and implementation plan

- Date: 2026-11-20
- Base: `origin/main` @ `4aa4301` (detached worktree `../cv-compare-tn-m3a`)
- Mode: offline, read-only. No production access, no migration, no Gemini call, no deploy, no commit.
- Prior work reused: M2-C2 ledger (`20261116000000`), M2-D2 save-only retry (#82), M2-D3 claim/fence (#83), M2-Q 1B/2A/2C recruiter server save + atomic settlement (#88, #89, #91), M2-Q audit P1-2 / Q-D4 (`2026-11-18-m2q-quota-ledger-reliability-audit.md`).

## 1. Summary

- **Gap is real and personal-only.** A personal analysis is persisted only by the browser (`history` upsert). The server holds the result in memory and nowhere else. If the response or the browser save is lost after the charge is committed, the result is gone and a rerun costs a second Gemini call and a second credit.
- **Cannot be recovered from existing data.** The ledger stores state only; `analysis_log` stores metrics only; `history` is written only by the client. No persisted copy exists to read back.
- **Smallest fix needs no migration and no new data store:** after a confirmed commit, `/api/analyze` upserts the same row the client already writes into the same `history` table (Q-L1 pattern for personal), with `analysis_id = requestKey`. The client then can find its result by the key it sent.
- **Recommendation: GO for Phase 1 (no migration), conditional on the owner confirming this falls outside Q-D4.** NO-GO for the atomic RPC variant until frequency data exists.

## 2. Current flow (personal)

```
browser (AnalysisRunContext)                 /api/analyze (handler.ts)                     Postgres
----------------------------                 -------------------------                     --------
runInFlightRef guard (one run per tab)
checkAnalyticsQuota (advisory, no reserve)
analyzeCV(...)  — no key passed;
  client default = fresh UUID per call ───>  auth (401) → profile/lock (403/503)
  (analysisService.ts:231)                   hourly count (429)
                                             reserve_analytics_quota(user, key) ─────────> dedupe (user,key) → duplicate 409
                                                                                           capacity → denied 429
                                             AI slot  (fail → release pre_gemini)
                                             storage refs (fail → release pre_gemini)
                                             Gemini analyzeCV  → result.id = randomUUID()   (ai/analysisService.ts:261)
                                               fail → release pre_gemini|provider_error|uncertain
                                             commit_analytics_quota (3 tries)  ──────────> committed / failed / unknown
                                               failed  → 503 quota_settlement_unavailable (result withheld, A4)
                                               unknown → 503 quota_settlement_unknown    (commit may still land)
                                               ok      → 200 result     ← NO server-side persistence
<── 200 body (75 s client timeout)
setResults (memory only)
saveToHistory upsert onConflict(user_id,analysis_id) + plan trim      ───────────────────> history (RLS own rows)
  ok   → sidebar history, parsed_cv / full CV updates allowed
  fail → unsavedResultIdsRef + "Thử lưu lại" button (M2-D2, memory only)
```

Recruiter differs only after Gemini: `commitAndSaveCandidate` commits and saves to `candidate_cvs` in one transaction (2C), so a lost response leaves the result on the row.

## 3. Evidence-backed failure matrix

| # | Window | What happens today | Evidence | Status |
|---|---|---|---|---|
| F1 | Failure before Gemini (auth, quota, slot, storage, budget) | release `pre_gemini`, no charge, error shown | `handler.ts:182-249` | **COVERED** (M2-C2) |
| F2 | Gemini fails | release `provider_error` / `uncertain` (A8) | `handler.ts:285-311` | **COVERED** |
| F3 | Gemini OK, commit definitively fails | 503 `quota_settlement_unavailable`, result withheld; reservation expires → `uncertain` (2 forgiven/cycle) | `handler.ts:264-276` | **ACCEPTED DEBT** (M2-Q P1-4, A4 by design). Saving here would deliver an unconfirmed result. No work proposed. |
| F4 | Gemini OK, commit outcome unknown; commit lands later | charged, nothing saved, client shows the generic "quota unavailable" text; rerun = new key = second charge | `handler.ts:271-274`; `analysisService.ts:48`; 2C audit proved late commits land | **GAP (residual after Phase 1)** — see §4 Phase 2 |
| F5 | Commit OK, response lost (client 75 s abort, network drop, unreadable body) | charged, result existed only in function memory → lost; rerun charges again | `handler.ts:281-284` (no write); `AnalysisRunContext.tsx:514-525,602-609` (no key → no dedupe) | **GAP — primary** |
| F6 | Response OK, client `history` upsert fails | in-tab "Thử lưu lại" works (same `analysis_id`, idempotent upsert) | `AnalysisRunContext.tsx:266-281,654-667` | **COVERED in tab** (M2-D2) |
| F6b | F6 then reload / tab close | `unsavedResultIdsRef` is memory → result gone, charge stands | same | **GAP** |
| F7 | Tab closed / reloaded while request in flight | server commits (if the function keeps running) but writes nothing → lost | `handler.ts:281`; 2A audit line 93: "Vercel keeps running … Not verified" | **GAP** (network-drop variant certain; abort variant depends on unverified platform behaviour) |
| F8 | Double click in one tab | second click ignored synchronously | `AnalysisRunContext.tsx:320-329` | **COVERED** (M2-A P1-2) |
| F9 | Two tabs, same input | two keys, two runs, two charges, two history rows | key per call | **COVERED by design** (two intended runs, both delivered) |
| F10 | Same key resent | `duplicate` 409, no Gemini | migration `20261116000000:213-216` | **COVERED** (personal never resends today) |
| F11 | Batch partial failure then re-run, same JD | only inputs without a result re-run | `AnalysisRunContext.tsx:342-355` | **COVERED** (M2-D2 F3) |
| F12 | Stale "analyzing" recovery | personal flow persists no in-flight row; nothing can be stuck | — | **N/A** (M2-D3 is recruiter-only by nature) |
| F13 | Reload after a successful save | `getUserHistory` reloads rows on mount | `historyService.ts:164-185` | **COVERED** |
| F14 | Express vs Vercel parity | both routes call `handleAnalyze` | `server/routes/analyze.ts:2`, `api/analyze.ts` | **COVERED** |

Actual user-impacting gaps: **F5, F6b, F7** (fixed by Phase 1), **F4** (residual).

## 4. Existing protections vs gaps

Reused as-is (no change): reserve/commit/release ledger and A4/A8 policy; `runInFlightRef`; F3 retry-only; M2-D2 save-only retry; `history_user_analysis_unique` + client `onConflict` upsert; `enforce_account_unlocked` trigger; handler deadline and `POST_RESERVE_MS`; the recruiter `serverSave` body field and `ServerSave` type.

Missing:

1. No server-side write of a personal result (root cause of F5/F6b/F7).
2. The client cannot locate a result after a lost response: `result.id` is minted server-side (`ai/analysisService.ts:261`), and `history` has no request-key column.
3. Personal calls pass no idempotency key, so the ledger cannot tie a retry to the earlier attempt.

## 5. Minimal implementation proposal

### Phase 1 — server-side history save (no migration)  ← proposed for M3-A

**Server (`_server-lib/analyze/handler.ts`)**

- Personal path only (`!candidateId`), after `commitMonthlyQuota` returns `committed`:
  - set `result.id = requestKey` (the client key, or the server-minted one for old clients);
  - upsert the history row through `getSupabaseAdmin()` with `onConflict: 'user_id,analysis_id'`, `user_id` = verified token user;
  - only if `deadline.remainingMs()` allows (same rule as Q-L1); never delays or blocks the 200;
  - add `serverSave: 'saved' | 'failed'` to the body (`'failed'` covers errors and skipped-for-budget; the browser save stays the fallback).
- Order is **commit, then save**. Save-before-commit is rejected: it delivers a result whose charge is not recorded (breaks A4).
- No trim on the server. The client's existing `saveToHistory` keeps the plan trim (50 / 500). Free-plan day retention stays with `purge_expired_free_history`.

**Shared mapper**

- Extract the `AnalysisResult → history row` mapping from `saveToHistory` (`historyService.ts:84-114`) into a pure module with no browser imports, e.g. `src/lib/historyRow.ts`. Both client and handler import it, so there is one column list. Precedent: the handler already imports `../../src/lib/planLimits.js`. Use the `.js` suffix (lint:api, node16).

**Client (`AnalysisRunContext.tsx`, `services/ai/analysisService.ts`)**

- Mint one key per input per run and pass it to both `analyzeCV` calls (`:514`, `:602`). The `analyzeCV` signature already accepts it.
- Keep the client `saveToHistory` upsert unchanged. It becomes an idempotent replay of the same row and still runs the trim. Treat the row as existing when `serverSave === 'saved'`, even if the browser upsert fails. That unblocks `parsed_cv` / full-CV updates (`rowExists`, `:134`) and suppresses the false "not saved" banner.
- **No-answer lookup:** a thin wrapper around `analyzeCV` (e.g. `analyzeOrRecover`).
  - Trigger: the request ends with **no HTTP answer**.
  - Lookup: an RLS `select` on `history` where `analysis_id = key`, timed by the cause:
    - **Client 75 s abort, or an unreadable 200 body:** the server has already answered. Do one immediate lookup.
    - **`TypeError` (network drop):** the drop may come seconds after dispatch, while the server still has up to `TOTAL_BUDGET_MS` (65 s) left. Poll every 10–15 s until dispatch + 65 s + a margin. A single fixed 12 s check would miss it and invite a paid rerun.
  - Found: map the row and **return it from the wrapper** with `serverSave: 'saved'`. The caller then takes the normal success path: `setResults`, `analysisJdByIdRef`, parse attach, Full CV with its `dataStoragePath`, and temp cleanup after the background jobs. Do not recover inside the batch `catch`: it schedules temp cleanup, and the text-mode outer `catch` aborts the run. A recovered result has the history row's shape (no `formatAssessment`), the same as any reload today.
  - Not found after the window: show "Kết quả có thể vẫn đang được lưu — kiểm tra Lịch sử trước khi phân tích lại" in place of the generic error.
- **`quota_settlement_unknown` is excluded from the lookup in Phase 1.** The server saves only after a confirmed commit, so no row can appear. It gets truthful copy instead: "Lượt phân tích có thể đã được tính nhưng không gửi được kết quả; kết quả sẽ không có trong Lịch sử." The lookup becomes meaningful for this code only once Phase 2 (atomic save) ships.
- Definitive failures (any HTTP error other than `quota_settlement_unknown`) keep today's behaviour, and the next run mints a fresh key. Reusing a key after `refunded` would hit `duplicate` 409 and block a legitimate retry (migration `:213-216`).

Coverage: F5, F6b, F7 (given the function keeps running; the network-drop case is covered regardless). **Not F4**: the save runs only after a confirmed commit, so a commit that lands after the handler gave up has no save. Phase 1 only replaces the misleading "quota unavailable" text with truthful copy.

### Phase 2 — atomic commit + history save (migration, optional, NOT proposed now)

- New DEFINER RPC `commit_analytics_quota_and_save_history`, mirroring `commit_analytics_quota_and_save_candidate` (save inside a savepoint). A late-landing commit then lands the row too, which closes F4.
- Gate: measure F4 frequency first (Sentry `quota_commit_unknown`, `analysis_log` rows with `[quota_settlement_unknown]`; read-only). Requires migration approval and the 2C release order (migration + verify before app deploy).

### Optional Phase 1C — key reuse on rerun after an unknown outcome

- Only if Phase 1 data shows double charges after unknown outcomes. The next run reuses the key: `duplicate`+`committed` leads to the history lookup, `duplicate`+`reserved` shows "still processing", and `refunded`/`uncertain` falls back to a fresh key. More client branching; skipped for now.

## 6. Files and database objects affected (Phase 1)

| Item | Change |
|---|---|
| `_server-lib/analyze/handler.ts` | personal save after commit, `result.id = requestKey`, `serverSave` field (~25 lines) |
| `src/lib/historyRow.ts` (new) | pure row mapper extracted from `saveToHistory` |
| `src/services/historyService.ts` | `saveToHistory` uses the mapper; add `findHistoryByAnalysisId` (one select) |
| `src/context/analysis/AnalysisRunContext.tsx` | key per input, `serverSave` gating, call the `analyzeOrRecover` wrapper + copy |
| `src/services/ai/analysisService.ts` | `ServerSave` doc comment only (type already exists) |
| translations | 1 VI + 1 EN string for the "may still be saving" message |
| DB: `public.history` | **no schema change**; new writer = `service_role` (bypasses RLS; trigger allows non-`authenticated` roles; no revoke on `history` in migrations — verify grants on prod read-only before release) |
| DB: ledger, RPCs | unchanged |

## 7. Test plan

Server (vitest, pattern of `m2q1bServerSave.test.ts` / `m2c2MonthlyQuota.test.ts`):

1. Personal 200 with client key: upsert called once **after** commit, `analysis_id = key`, `user_id = token user`, body `id = key`, `serverSave = 'saved'`.
2. Commit `failed` / `unknown`: no upsert, 503 codes unchanged.
3. Upsert error or timeout: still 200 with full result, `serverSave = 'failed'`.
4. Budget exhausted after commit: save skipped, 200, `serverSave = 'failed'`.
5. Old client (no key): server key used as `id` and `analysis_id`.
6. Recruiter request (`candidateId`): no history write, 2C path unchanged.
7. Mapper parity: `saveToHistory` and the server produce identical rows for one fixture (guards column drift).

Client (pattern of `m2d2PersonalRun.test.tsx`):

8. Each input gets a distinct key; batch of 3 → 3 keys; text mode → 1 key.
9. `serverSave = 'saved'` + browser upsert rejects: no "not saved" banner, `parsed_cv` / full-CV updates still issued.
10. 75 s abort / unreadable 200 body: one immediate lookup. If found, the result is rendered through the normal success path and there is no second `/api/analyze`.
10b. Early `TypeError` (drop at ~2 s): polls continue until dispatch + 65 s + margin, and a row appearing at ~40 s is found.
10c. Recovered result: temp files are not deleted before parse and Full CV settle; the parse result still attaches; `analysisJdByIdRef` is set.
11. Lookup not found after the window → "may still be saving" copy, no auto-retry.
11b. `quota_settlement_unknown` → no lookup; the truthful "charged, not delivered" copy is shown.
12. Definitive 503/500 → generic error; next run uses a **new** key.
13. Double click still yields one request; two providers (tabs) → two distinct keys.
14. F3 retry-only path still skips kept inputs and reuses their saved rows.

DB (local stack, optional): service-role upsert into `history` passes `enforce_account_unlocked`; a replayed client upsert with the same `analysis_id` updates rather than duplicates (extend `m2d2HistoryUpsert`).

Mutants to kill: save before commit; save on `unknown`; drop `onConflict`; `id` not set to key; client ignores `serverSave`; client reuses key after a definitive failure.

Gates: `npm run lint`, `npm run lint:api`, `npm test`, `npm run build`.

## 8. Risk assessment

| Risk | Level | Mitigation |
|---|---|---|
| Q-D4 scope: owner may read a server write of results as the deferred "result store" | **decision** | Argue: same table, same columns, same retention and RLS as the existing client write; no new copy of CV data (Q-L2 was a new TTL table). Privacy-policy wording not re-checked; it does not block this argument because the data and its storage are unchanged. |
| Vercel stops the function on client abort | medium | Unverified (2A §93). The network-drop case is covered either way; the abort case falls back to today's behaviour. |
| Preview deployments and production credentials | closed | Superseded: since M2-Q H2.1 (2026-11-20) the Supabase, Gemini and R2 credentials are Production-only, so a Preview cannot reach the production database or Gemini. See the Phase 1 report, R4. |
| Post-AI budget consumed by commit retries → save skipped | low | Falls back to the browser save (current behaviour). |
| `result.id` semantics change (client key instead of server UUID) | low | Unique per user via the ledger (a key can never run twice); `analysis_id` is `text`. Callers keyed by id (`analysisJdByIdRef`, `rowExists`, `keptResults` keyed by input) are unaffected. |
| Extra write per analysis (server + client replay) | low | ~100–300 ms server-side, inside the existing budget. |
| Free-plan trim lags if only the server save lands | low | Next client save trims; `purge_expired_free_history` enforces day retention. |
| F4 stays open | low–unknown | Phase 2 gated on measured frequency. |

Security and quota guarantees unchanged: `user_id` comes from the verified token only; no new endpoint; no grant change; ledger semantics untouched; no extra Gemini call path.

## 9. Complexity

Phase 1: **small–medium.** About 60–80 lines of runtime change across 4 files, plus about 250 lines of tests. Roughly 1–1.5 days, including the preview smoke. No migration, so no release-order hazard. Phase 2: medium (migration + DB tests + 2C-style release).

## 10. GO / NO-GO

- **GO — Phase 1**, conditional on:
  1. the owner confirming that a server-side upsert into the existing `history` table is outside the Q-D4 deferral;
  2. a read-only prod check that `service_role` holds INSERT/UPDATE on `public.history`.
- **NO-GO — Phase 2 (atomic RPC)** until F4 frequency is measured and a migration is approved.
- **NO-GO — Phase 1C** until there is evidence of double charges after unknown outcomes.
- **Not verified here:** production grants and volume, Sentry `quota_commit_unknown` / `quota_commit_failed` counts, Vercel behaviour on client abort, privacy-policy wording.
