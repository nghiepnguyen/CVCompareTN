# M3-A Phase 1 — Personal result recovery: implementation report

- Date: 2026-11-20
- **Status (post-release, 2026-11-20):** RELEASED as `67867d3` (PR #94), production `dpl_HP6WMBQNZ8Mo2XSYBgVbQgAQ5SNQ`, smoke PASS WITH KNOWN DEBT. R3 (prod grant check) was closed: PASS. See `2026-11-20-m3a-phase1-release-readiness.md` and `2026-11-20-m3a-phase1-production-release.md`. The rest of this report is the pre-release record.
- Branch: `fix/m3a-personal-result-recovery` (local only, **uncommitted** at the time of writing), worktree `../cv-compare-tn-m3a`, base `origin/main` @ `4aa4301`
- Design: `docs/audits/2026-11-20-m3a-personal-result-recovery-audit.md`
- Mode: offline. No production access, no migration, no Gemini call, no push, PR, Preview or deploy. Every DB test ran on a disposable local Supabase stack with its own demo keys (`127.0.0.1:54321`). The shell had no `SUPABASE*` variables, and the worktree has no `.env`.

## 1. Preflight

### 1.1 Q-D4: exact scope

The owner row (M2-Q audit §13, `2026-11-18-m2q-quota-ledger-reliability-audit.md:325`):

> | Q-D4 personal lost results | **DEFERRED** pending a privacy review. Q-L2 is not started. P1-2 stays known debt. |

The option the owner decided on (`:335`):

> **Q-D4 — Personal-flow lost results (P1-2):** accept as known debt, or approve a Q-L2 design (stores CV-derived results server-side for a short TTL).

Q-L2 (`:174`) is a *new table* keyed `(user_id, request_key)`, with a TTL, a purge cron, and a "new copy of CV-derived PII".

Strongest contrary text, from the 2C commit-recovery audit:

> `:181` "**Personal path:** this *is* the "personal server-side result store" that owner decision Q-D4 deferred pending privacy review."
> `:279` "Any server-side result store waits for the Q-D4 privacy review (Option C)."

The Option C that this text describes (`:171-185`) means: persist **before** commit; a new service-role-only table; a recovery RPC and endpoint; retention and cleanup; extra encryption.

**Conclusion — compatible.**

- Q-D4 defers Q-L2, and Option C is the same "result store" idea under another name. Both add a new table holding a second copy of CV-derived data. Option C also writes before commit.
- Phase 1 adds no table, no second copy, no new retention and no new read path. The server writes the **same row and columns** (one shared mapper) that the browser already upserts into `public.history` for every signed-in run. It writes only **after** a confirmed commit.
- So nothing Q-D4 deferred is built here. The owner issued this GO after reading that argument in the audit (§8 there).
- **What does change:** a row can now exist when the browser never received the result, for example after a tab close. That is the purpose of the fix, and it is the same data the user's own run would have saved. The owner should sign off on this as informed, not on a narrow reading of the row.

### 1.2 `history` table (repository evidence)

| Property | Evidence | Status |
|---|---|---|
| PK `id uuid DEFAULT gen_random_uuid()`, `analysis_id text NOT NULL`, `user_id → auth.users ON DELETE CASCADE` | `20260516120000_cv_matcher_core_schema.sql:26-29` | verified |
| Unique `(user_id, analysis_id)` = `history_user_analysis_unique` | same file `:64-68` | verified (also on prod per M2-D2 memory, 2026-11-16) |
| RLS own-row policies (select/insert/update/delete `TO authenticated`) | same file `:170-191`; restrictive `account_unlocked_read` `20261101090000:47` | verified |
| `enforce_account_unlocked` trigger fires only for `anon`/`authenticated` | `20261101090000:9-16` | verified; executed: service-role upsert passes (DB test) |
| `service_role` INSERT/UPDATE on `history` | no REVOKE on `history` in any migration; **executed** on local stack (DB test "service_role holds INSERT/UPDATE") | local PASS · **prod PENDING** (read-only `has_table_privilege` check) |
| Free-plan day retention | `purge_expired_free_history` (`20261101080000`) applies to every row | unchanged |

### 1.3 Request-key collision and cross-user safety

- The key is client-minted (`crypto.randomUUID()`, one per CV per run), validated as a UUID by `isValidIdempotencyKey` (`handler.ts:91-94`). Old clients get a server-minted key.
- `user_id` comes **only** from the verified bearer token (`toHistoryRow(userId, result)`). It never comes from the result or the body. The PK `id` is never in the payload, so conflicts resolve only on `(user_id, analysis_id)`.
- The ledger dedupes `(user_id, request_key)` forever (Q-D1), so a key reaches Gemini, and the server save, at most once per user. A resend returns 409 `duplicate_request` before Gemini.
- **Cross-user, executed:** A and B use the same key, get separate rows, and each sees only its own. B's upsert targeting A's `user_id` is rejected by RLS, and A's row is unchanged.
- **Residual (own data only):** a client can choose a key equal to one of its own older `analysis_id`s, and that row is then overwritten by a fresh, charged result. RLS already lets the user write that row directly, so this is not an escalation.

### 1.4 Vercel behaviour on client disconnect

- Vercel docs, Functions API reference, "Cancel requests": "Cancellation is opt-in." When it is enabled, "When the client disconnects, the signal fires and the function is terminated."
- `vercel.json` has no `supportsCancellation`, so `/api/analyze` is not opted in.
- **Documented by implication, not empirically verified:** the docs show the opt-in for Web-handler style and do not state the default for classic `(req, res)` handlers. Empirical behaviour is PENDING.
- If the platform does cancel on disconnect, the abort case falls back to today's behaviour: the reservation expires as `uncertain` and nothing is lost compared with now. A network drop *after* the response was written is covered either way.

### 1.5 Privacy policy

- `src/translations/legal.ts`, §2: "Lưu trữ lịch sử phân tích để bạn có thể xem lại sau này."
- §8: "Lịch sử phân tích … lưu cho đến khi bạn tự xóa chúng hoặc xóa tài khoản."
- Same data, purpose and retention. No copy change is needed.

### 1.6 Can anything create a result without confirmed settlement?

**No.**

- The server save runs only inside the `settlement.outcome === 'committed'` branch (`handler.ts:264-284`).
- On `failed`, `unknown`, a Gemini failure, a duplicate, a denial or any pre-Gemini failure, nothing is written. Unit tests cover each case, and mutant M1 (save before commit) is killed.
- The browser lookup only **reads** rows. A row exists only after a server save, which follows a commit, or after a browser save of a delivered 200.
- The lookup never runs for an HTTP answer, so `quota_settlement_unknown` gets none (mutant M4 killed).

## 2. Implementation

| File | Change |
|---|---|
| `src/lib/historyRow.ts` (new, 39 lines) | `toHistoryRow(userId, result)`: the one column list, moved verbatim from `saveToHistory`. `user_id` comes from the argument; no `id` column. |
| `_server-lib/analyze/historySave.ts` (new, 41 lines) | `saveHistoryRow`: service-role upsert `onConflict: 'user_id,analysis_id'`, capped at `min(3 s, deadline)` with an abort signal. Never throws; returns `'saved' \| 'failed'`. |
| `_server-lib/analyze/handler.ts` (+8/−1) | Personal path only, after a confirmed commit: `result.id = requestKey`, then `serverSave = await saveHistoryRow(...)`. Recruiter path untouched. |
| `src/services/historyService.ts` | `saveToHistory` uses the mapper (no behaviour change). Adds `findHistoryByAnalysisId` (RLS select) and `waitForSavedAnalysis`, which polls every 10 s until dispatch + 75 s, makes at least one lookup, and never throws. |
| `src/context/analysis/AnalysisRunContext.tsx` | `analyzeOrRecover`: one key per CV. It never re-sends; `serverSave` is stripped from results. `personalAiError` handles the personal-only `quota_settlement_unknown` copy. On a browser save failure, `serverSave === 'saved'` rows still count as saved. |
| `src/translations/{system,types}.ts` | 2 strings (VI/EN): "may still be saving, check History" and "may have been counted, not delivered, will not appear in History" |

How the browser recovers:

- **No HTTP answer** (timeout, network drop, unreadable body): it looks the row up by key. If found, the row goes through the **normal success path**: results, the JD reference, parse attach, Full CV, and temp cleanup after the background jobs. If nothing is found, it shows the "may still be saving" copy and does no automatic retry.
- **Any HTTP answer is final** and gets no lookup:
  - `quota_settlement_unknown` gets the new truthful copy.
  - Other codes keep their existing copy.
  - The next run mints a new key.
- The recruiter copy and the shared `localizeAiError` are unchanged.

## 3. Test results

| Suite | Result |
|---|---|
| `npm run lint` | **PASS** |
| `npm run lint:api` (node16) | **PASS** |
| `npx vitest run` (full) | **PASS**: 111 files, 1575 tests passed, 38 skipped (the DB suites, which skip without a stack) |
| `npm run build` | **PASS** |
| `scripts/ci/db-stack.sh` + `db-tests.sh` on a fresh local stack | 25 SQL suites + 2 stub + 3 scripts **PASS**, deadlocks=0. vitest DB: 1 expected failure (see below), then **38/38 PASS** after the fix |
| Mutation check (8 mutants) | **8/8 KILLED** |

The DB failure was the old M2-Q 1B assertion that personal responses carry no `serverSave` (`m2q1bServerSave.db.test.ts:208`). It encoded the pre-M3-A contract. It now asserts `serverSave: 'saved'` with `id = key`, and still asserts that the candidate row is untouched. The matching unit test was updated the same way.

New tests, by the required topic:

| Topic | Tests |
|---|---|
| Successful commit/save | unit: saved once, after commit, token user, key, no PK, onConflict · DB: one row, one committed ledger row, usage +1 |
| Lost response | DB: owner finds the row by key under RLS · client: found → normal path, exactly one `/api/analyze` |
| Timeout | client: 75 s `TimeoutError` → lookup · service: window already over → one immediate lookup |
| Early network drop | service: polls inside the window, finds a late row · client: `TypeError` → recovered |
| Unreadable body | client: `SyntaxError` → lookup |
| Reload | covered by `getUserHistory`. The server row exists without the browser save (DB test reads it without one). |
| Duplicate keys | unit + DB: resend → 409 before Gemini, row and charge unchanged · client: distinct key per CV, new key per run, double click → one request |
| Cross-user isolation | DB: same key for 2 users → 2 rows, no cross read, B cannot write A's row · unit: body `userId` ignored |
| Failed persistence | unit: upsert error / throw → 200 with result, `serverSave: 'failed'` · client: failed + browser failure → existing banner |
| Settlement unknown | unit: no write, 503 unknown · client: no lookup, truthful copy (single CV and batch item) |
| Existing quota behaviour | unit: definitive failure, `not_found`, Gemini failure, denied, duplicate → no write · DB: all M2-C2/M2-Q suites PASS · recruiter path unchanged (unit) |
| Recovered-result plumbing | client: temp files kept until parse settles, parse attaches; batch with one dropped CV |

Mutants killed: save before commit; drop `onConflict`; id not set to key; lookup on HTTP answers; client ignores `serverSave`; mapper trusts `result.userId`; no polling window; personal settlement copy dropped.

## 4. Risk and known-debt register

| # | Item | Level | Status |
|---|---|---|---|
| R1 | Commit lands after the handler gave up (`quota_settlement_unknown`): charged, no row | low, frequency unknown | **open debt**; Phase 2 atomic RPC, gated on Sentry `quota_commit_unknown` counts |
| R2 | Vercel default on client abort for `(req,res)` handlers is not explicitly documented | medium | **PENDING** empirical check; falls back to today's behaviour |
| R3 | Prod `service_role` grants on `public.history` | blocking for release | **PENDING** read-only check |
| R4 | Preview deployments and production credentials | closed | Verified read-only (`vercel env ls`, 2026-11-20): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `VITE_SUPABASE_*` and R2 credentials are **Production-only**. Preview gets only R2 bucket names, `BLOG_PROXY_SECRET` and the Sentry DSNs. A Preview cannot call Gemini or reach the production database; its API fails closed. Consequence: a Preview cannot be smoke-tested, so the release smoke is post-merge on production, as in earlier phases. |
| R5 | Service role bypasses `enforce_account_unlocked`; a lock set mid-request (≤ 65 s) can still land one row | low | accepted, same as the recruiter save |
| R6 | Client may reuse one of its own older `analysis_id`s as a key and overwrite that row | low (own data) | accepted, RLS already allows it |
| R7 | Free-plan 50-row trim runs only on the browser save | low | if only the server save lands, the next browser save trims; day retention unchanged |
| R8 | Recovered results have the history-row shape (no `formatAssessment`) | low | same as any reload today |
| R9 | One extra write per personal analysis (server + browser replay) | low | inside the existing post-AI budget (`min(3 s, remaining)`) |
| R10 | Not-found copy can be wrong when the platform cancelled the run (nothing was charged) | low | copy says "may", not "was" |
| R11 | A stale recruiter tab still on the pre-#88 bundle sends no `candidateId`, so its candidate's analysis (third-party CV data) lands in the recruiter's **personal** history | low (needs a recruiter tab opened before #88 and never reloaded; a lazy-chunk load after any deploy fails and reloads via `ChunkLoadErrorBoundary`) | **accepted known debt; owner sign-off before merge**. Pre-merge check, read-only: count recruiter-plan users with `/api/analyze` traffic since 2026-11-18 07:15Z that has no candidate save. Mitigation if any: a forced reload notice. No code mitigation is possible server-side, because a candidate-less request looks exactly like a personal one; modelled by `m2q1bServerSave.db.test.ts` "a personal request (no candidateId)". Writer set verified: only the two `AnalysisRunContext` call sites, plus `RecruiterContext`, which always sends `candidate.id`. Scripts call the server-side `analyzeCV` directly, not the handler. |
| R12 | While polling (up to 75 s) the UI still shows "Analyzing…" | low (UX) | known debt; one status line can be added later |
| — | P1-4 withheld result after a definitive commit failure | — | unchanged, by A4 design |

## 5. GO / NO-GO for the next phase

- **GO** to commit this branch locally and open a **draft PR**, after explicit approval, to get CI (Lint/Test/Build + Database tests). The new DB test runs in CI automatically: `db-tests.sh` runs `src/__tests__/db`.
- **Before merge (= prod deploy):**
  1. R3 read-only prod check: `select has_table_privilege('service_role','public.history','INSERT,UPDATE')`;
  2. the owner acknowledges the Q-D4 conclusion (§1.1) and R11;
  3. a release plan for a post-merge production smoke on test account `044c3afb` (one personal run costs about 3 Gemini calls: analyze, parse-cv, rewrite-cv). It needs separate approval. Preview cannot run it (R4).
- **NO-GO:** Phase 2 atomic RPC (migration) until R1 frequency is measured; Phase 1C key reuse.
- No migration, so there is no release-order hazard: the server change and the client change are each safe alone. An old client ignores `serverSave` and a duplicate upsert is idempotent. A new client against an old server still works, with no `serverSave` and the browser save as before.
