# M2-A — Analyze Stabilization Audit (read-only)

Date: 2026-11-15 · Audited tree: origin/main `254cae1` (code-identical to baseline `4367f56`; diff = 4 docs files only)
Worktree: `../cv-compare-tn-m2a` (detached, clean). No code changes, commits, pushes, DB writes, live API calls.
Evidence: 9 offline repro tests (mocked Gemini + Supabase), all reproduce; preserved in `docs/audits/m2a-repro/`. Existing safeguard suites: 68/68 pass.

## Pipeline map

Client (personal): `AnalysisRunContext.handleAnalyze` (src/context/analysis/AnalysisRunContext.tsx:231)
1. Batch cap (MAX_BATCH_BY_PLAN free 1 / pro 5 / recruiter 50) → `checkAnalyticsQuota(plannedRuns)` (:251) → `setIsAnalyzing(true)` (:306)
2. `getSession()` (:327, unbounded)
3. 5 workers (:334, :443). Per CV: `processFile` (unpdf / mammoth / base64 / Storage upload) → `startParsedCVJob` (/api/parse-cv, limiter 5, :35) ‖ `analyzeCV` (/api/analyze, 75s client timeout)
4. After all: `saveToHistory` → attach parse results → **auto Full CV** `generateFullCV` for every result (/api/rewrite-cv, :562) → temp-file cleanup after rewrite+parse settle.
Client (recruiter campaign): `RecruiterContext.handleAnalyzeCampaign` (src/context/recruiter/RecruiterContext.tsx:181) — sequential, analyze only, pending/error candidates only.

Server `/api/analyze` (api/analyze.ts → _server-lib/analyze/handler.ts), one 65s deadline (_server-lib/deadline.ts:5):
jd/cv presence → auth (4s) → profile + lock + batchTotal (fail-closed) → hourly cap from analysis_log count (fail-open) → storage refs (≤15s) → monthly quota check (fail-open) → `analyzeCV` (Gemini 1 call + localize 1 call for vi, abortSignal at AI deadline) → `increment_usage_count` (fail-open) → log row → JSON.
`/api/parse-cv` and `/api/rewrite-cv` (1–2 Gemini calls, fidelity retry) share the deadline model. Express routes call the same handlers (parity OK).

Gemini calls per CV in the personal flow: analyze 1 + localize 1 (vi) + parse 1 + rewrite 1–2 = **up to 5**.

## Confirmed findings

### P1-1 Concurrent requests bypass hourly cap and monthly quota
- Where: _server-lib/analyze/handler.ts:123-133 (hourly), :159-185 (quota check), :197-212 (increment, fail-open); _server-lib/accountLock.ts:79-93 (counts analysis_log rows that are only written at request end, :213).
- Repro R-S1: free user, 1 analysis left, 15 concurrent requests → 15×200, 15 Gemini calls, usage_count 4→5, 14 increment errors swallowed. Hourly limit 10 also not enforced (in-flight rows invisible). Sequential control R-S2: capped correctly at 10.
- User impact: none for honest users; quota/plan entitlement bypass for direct-API or multi-tab callers.
- AI cost: unbounded per burst (bounded only by platform concurrency); repeatable once per quota cycle per account, free signups make it sybil-able.
- Minimal fix (burst): atomic pre-Gemini slot via existing `consume_api_rate_limit` RPC (bucket is free text, atomic upsert — no migration) with new buckets analyze/parse_cv/rewrite.
- Residual after burst fix: limiter caps at the hourly limit, so a free user with 1 unit left can still get ~10 results from one burst. Closing the monthly bypass needs one owner decision:
  - Option A (no migration): call existing `increment_usage_count` BEFORE Gemini (it already locks FOR UPDATE and raises over limit) → raise = 429. Cost: failed analyses consume quota (no refund RPC).
  - Option B (migration): new reserve/refund RPC pair; failures refunded.
- Evidence: runtime-reproduced (R-S1, control R-S2).
- Regression test: N concurrent handleAnalyze with in-memory counter → at most `limit` reach Gemini.

### P1-2 Double submit starts two full runs
- Where: AnalysisRunContext.tsx:231-306 (`isAnalyzing` set only after `await checkAnalyticsQuota`; button `disabled={isAnalyzing}` AnalysisInputView.tsx:428). Same pattern RecruiterContext.tsx:197-229.
- Repro R-C1: two clicks before quota RPC resolves → analyzeCV ×2, parseCV ×2 (and rewrites ×2) for 1 CV.
- User impact: duplicate history rows, 2 quota units burned, results from the second run overwrite the first.
- AI cost: 2× full chain (up to 10 Gemini calls for 1 CV; ×batch size).
- Minimal fix: synchronous `useRef` in-flight guard at the top of both handlers.
- Regression test: R-C1 inverted (expect 1 call).

### P1-3 Auto Full CV rewrite fan-out is unbounded
- Where: AnalysisRunContext.tsx:562-571 (loop starts `generateFullCV` for every result at once; analyze and parse are limited to 5, rewrite is not). Failures only `console.error` (:186-187).
- Repro R-C2: recruiter batch of 50 → peak 50 concurrent /api/rewrite-cv.
- User impact: provider 429 / function concurrency burst → Full CV tabs silently empty; no retry affordance.
- AI cost: 50–100 simultaneous Gemini calls (1–2 per rewrite); each consumes the rewrite hourly bucket (recruiter 100/h) so a second 50-batch exhausts it.
- Minimal fix: wrap the rewrite call in `createConcurrencyLimiter(5)` (same as PARSE_CONCURRENCY).
- Regression test: R-C2 expecting peak ≤ 5.

### P2-1 Provider 429/5xx reported as non-retryable generic 500
- Where: _server-lib/analyze/handler.ts:216-233; _server-lib/deadline.ts:61-64 (anything not timeout = `gemini_error`). Same in parseCv/handler.ts:99-106.
- Repro R-S3: ApiError 429 and 503 → `500 {retryable:false}`, log `[gemini_error]` (indistinguishable from bad JSON / bug).
- User impact: "Không thể phân tích CV" with no "busy, retry shortly"; ops cannot see provider throttling in Admin Report.
- AI cost: none directly; blind manual retries during throttling.
- Layer note: _server-lib/ai/analysisService.ts:305-306 rewraps every non-timeout error into a plain `Error`, dropping `ApiError.status` before the handler sees it. parseCvService.ts:221 and rewriteService.ts:318 rethrow the raw error, so status survives there.
- Minimal fix: in the analyze service catch, throw `ControlledError('gemini_rate_limited' | 'gemini_unavailable')` from ApiError.status (ControlledError already passes through, analysisService.ts:286, handler.ts:218); for parse/rewrite, classify in `aiFailureCategory`. Respond 503 retryable. No server retry (budget).
- Regression test: through the real `analyzeCV` (mock only generateContent) → 503 + category; same for parse/rewrite handlers.
- Evidence: runtime-reproduced (R-S3).

### P2-2 Failed and rejected rows count toward the hourly cap
- Where: accountLock.ts:80-85 (no status/model filter); handler logs every preflight rejection as an analyze row (:131, :175).
- Repro R-S4: 10 provider failures → user receives 429 for the next hour with zero results.
- User impact: provider outage converts into a 1-hour lockout; repeated 429s keep re-inserting rows.
- AI cost: none (reduces cost) — policy question.
- Minimal fix (owner decision): count only rows where `model IS NOT NULL` (Gemini actually ran) or status='success'.
- Regression test: R-S4 expecting 200 after preflight-only failures.

### P2-3 Re-running a partially failed batch re-analyzes the successes
- Where: AnalysisRunContext.tsx:332-449, 574-581 (files kept; message "Các CV còn lại đã được lưu").
- Repro R-C3: 3 CVs, 1 fails → retry runs all 3 again (6 analyze, 6 parse, quota asked for 3).
- User impact: quota burned for already-done CVs; "Tất cả"/score variance means the re-run can change scores of CVs already saved.
- AI cost: (successes) × up to 5 Gemini calls per retry.
- Minimal fix: after a run, drop succeeded files from `files` (keep failed). UX change → owner decision.
- Regression test: R-C3 expecting 3+1 calls.

### P2-4 No JD/CV size cap on analyze/parse/rewrite
- Where: _server-lib/analyze/handler.ts:57-74 (only presence); body cap 16MB (_server-lib/http/guard.ts:18); Vercel platform cap ~4.5MB. Other features do cap (MAX_COVER_LETTER_CV_CHARS 30k).
- Repro R-S5: 3.0M-char JD → 200, prompt 3.0M chars sent to Gemini.
- User impact: huge pasted JD → slow / timeout; Gemini >1M tokens → generic 500.
- AI cost: ~hundreds× normal input tokens per call (and again in rewrite, which also carries the JD).
- Minimal fix: reject (not truncate — keeps canonical prompt unchanged) JD/CV above a fixed char cap with 413 + localized message; mirror in client. Cap sizing: no JD text is stored server-side (history keeps a 100-char title), so owner should size from the `analysis_log.input_tokens` distribution for kind='analyze' (read-only, owner side). Size the CV cap generously (multi-page CVs reach tens of thousands of chars).
- Regression test: oversize JD → 413, Gemini not called.
- Evidence: runtime-reproduced (R-S5).

### P2-5 Client discards status/retryable; raw English server strings reach users
- Where: src/services/ai/analysisService.ts:202-205 (analyze), :162-165 (parse), :23-26 (rewrite).
- Evidence: code + R-S5 (`400 "Missing cvData"`), handler strings "Too many requests. Please try again later.", "Monthly analysis limit exceeded", "Account verification unavailable".
- User impact: VI users see English errors; UI cannot offer retry for retryable 504/503.
- AI cost: none directly; no retry guidance → blind manual re-runs (see P2-3).
- Minimal fix: throw an error carrying `status` + `retryable`; map 429/503/504/413 to `t.*` strings.
- Regression test: fetch mock per status → localized message, retryable flag preserved.
- Evidence: code-confirmed (deterministic) + server strings from R-S5.

### P2-6 Empty DOCX/text extraction is sent to the server
- Where: src/hooks/useFileProcessor.ts:95-99 (DOCX), :116-118 (text) — no empty check (PDF path has one, :74).
- Evidence: runtime-reproduced server side (R-S5 `cvData:''` → 400 "Missing cvData"); client path code-confirmed.
- User impact: cryptic English error for an image-only DOCX.
- AI cost: none.
- Minimal fix: throw localized "cannot read content" when cleaned text is empty.
- Regression test: processFile with a DOCX whose mammoth text is empty → localized error, no fetch.

### P2-7 Recruiter campaign: stuck "analyzing" and error written into parsed_text
- Where: RecruiterContext.tsx:190-191 (only pending/error retried), :236 (status set outside inner try — a failed update aborts the whole loop), :305 passes `errorMsg` as 3rd arg; recruiterService.ts:213-217 3rd param is `parsedText`.
- Evidence: `parsed_text` overwrite is code-confirmed (deterministic from the signature). "Stuck analyzing" is code-confirmed but conditional on the tab closing / crashing mid-run (grep: no path resets 'analyzing'); not runtime-reproduced.
- User impact: closing the tab mid-campaign leaves candidates "analyzing" with no re-run path; error text replaces the candidate's parsed text in DB.
- AI cost: none (stuck candidates are never re-sent); a failed status update aborting the loop skips remaining candidates.
- Minimal fix: include stale 'analyzing' in the retry filter; move status update inside try; pass the error to the right column.
- Regression test: candidate in 'analyzing' is re-run; error path writes no parsed_text.

### P2-8 Partial-failure banner always says "saved"
- Where: AnalysisRunContext.tsx:511-518 (save failure → `false`, logged) vs :574-581 (message unconditional).
- Evidence: code-confirmed; not runtime-reproduced.
- User impact: user told results were saved when the history upsert failed. Low.
- AI cost: none; user may re-run believing nothing was saved.
- Minimal fix: await `historySave` before composing the banner; use a "not saved" variant when false.
- Regression test: saveToHistory rejects + one failure → banner does not claim saved.

## Known debt / plausible (not confirmed)
- K0 Failed analyze still pays for its parse call — AnalysisRunContext.tsx:378-413; runtime-reproduced (R-C4: analyze rejects → parseCV ×1, 0 results). Cost 1 Gemini call per failed CV. Accepted Stage 3.10B latency trade-off; gating parse is an owner call.
- K1 Quota check and increment fail-open by design (memory: analytics-quota-rpc) — contributes to P1-1.
- K2 `supabase.auth.getSession()` unbounded at AnalysisRunContext.tsx:327 and RecruiterContext.tsx:258; iOS Safari hang precedent (fixed only in AuthContext). Plausible indefinite spinner; no repro.
- K3 No user cancel / unmount abort; requests continue after navigation (by design so far).
- K4 Client treats any non-empty PDF text as text (useFileProcessor.ts:74) vs server 100-char threshold (_server-lib/ai/analysisService.ts:123): a scan with a tiny text layer goes as text/plain + attached PDF, so the suggestion guard runs on near-empty text. Needs a real sample.
- K5 Whether Google bills tokens for requests aborted at the deadline — unverified.
- K6 Up to 5 Gemini calls per CV (localize + automatic Full CV) — product design, cost baseline.
- K7 `batchTotal` is client-declared (documented in handler).
- K8 JD extract fetch (src/lib/extractJdText.ts:42) has no client timeout; platform 60s bounds it.

## Existing safeguards verified
- Single 65s request deadline, 6s post-AI reserve, 10s min Gemini budget, client 75s > server 65s, Vercel 300s ceiling — consistent (requestDeadline suite 42/42).
- Gemini HTTP request is aborted at the AI deadline (abortSignal) — no orphaned waits server-side.
- No duplicate AI calls from retry loops: SDK retries are off (`@google/genai` 1.48 only retries when `httpOptions.retryOptions` is set; geminiClient.ts:29 sets none), and the client never auto-retries.
- Analyze workers and parse limiter bound to 5 concurrent per tab.
- Sequential hourly cap enforced (R-S2). Monthly counter never exceeds limit (FOR UPDATE + raise in increment_usage_count).
- Auth required; account lock fail-closed; batch size re-checked server-side.
- Parse failure never breaks analysis; temp files deleted only after parse+rewrite settle.
- Partial batch failure keeps successes; recruiter campaign re-runs only pending/error.
- Express routes reuse Vercel handlers (parity).

## Risk-ranked remediation backlog
1. P1-2 double-submit guard (trivial, client only)
2. P1-3 rewrite fan-out limiter (trivial, client only)
3. P1-1a atomic burst limiter via existing consume_api_rate_limit (server, no migration)
4. P2-4 JD/CV size cap (server + client, reject-only)
5. P2-1 provider 429/5xx classification (server)
6. P2-5 + P2-6 client error mapping / empty-extraction check
7. P2-7 recruiter stuck status + wrong column
8. Owner decisions: P1-1 monthly reserve Option A/B, P2-2 count policy, P2-3 retry-failed-only, K0 parse gating; P2-8 banner fix (small, can join M2-B if approved)
9. Known debt K2 getSession timeout, K4 threshold alignment (needs sample)

## Minimal M2-B proposal
Scope: items 1–6 only. No change to prompts, models, schema, scoring, probability, thresholds; no migration.
- Client: in-flight ref guard (AnalysisRunContext + RecruiterContext); `createConcurrencyLimiter(5)` around Full CV; typed request error (status, retryable) + localized messages; empty DOCX/text check.
- Server: `enforceRateLimit` buckets analyze/parse_cv/rewrite before Gemini (fail-open kept for counter outage, consistent with existing policy); JD/CV char cap → 413; ApiError status → `gemini_rate_limited` / `gemini_unavailable` → 503 retryable + log category.
- Tests: the 9 repro tests inverted into regressions + 413 + client status mapping. Gate: lint, lint:api, test, build; preview deploy smoke without live scoring changes.
- Benchmark need: none (canonical request unchanged for in-cap inputs). Confirm cap value against real JD length distribution first.

## Recommendation
GO for M2-B with the scope above (items 1–6). Residual after M2-B: monthly quota still bypassable up to the hourly cap per burst until owner picks Option A/B (P1-1). NO-GO on quota reserve, count-policy and retry-UX changes until owner decides. P3A/CP6 untouched.

## M2-B status (2026-11-15, branch `fix/m2b-analyze-stabilization`, local only)
Approved items 1–6 implemented; see docs/5_api.md "M2-B stabilization".
- P1-1: atomic fail-closed `ai_*` slot before Gemini. Burst of 15 (free): Gemini calls 15 → 10. **Monthly quota NOT fixed** — residual bypass up to `hourlyAiLimit` per burst; Option B (reserve/refund RPC, migration) is a separate stage.
- P1-2: synchronous in-flight guards (personal + recruiter). Double click: 2 runs → 1.
- P1-3: Full CV limiter 5. Recruiter batch 50: peak 50 → 5.
- P2-1: provider 429/5xx → 503 retryable, `[gemini_rate_limited]` / `[gemini_unavailable]`.
- P2-4: 413 for JD > 50k / text CV > 100k chars (safety ceilings, not production percentiles).
- P2-5 / P2-6: `AiRequestError` + `localizeAiError`; empty DOCX/text rejected client-side.
Not in M2-B: P2-2, P2-3, P2-7, P2-8, K0–K8.
