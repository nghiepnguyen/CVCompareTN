# P1-D — Ops guardrails: preview fail-closed guard, cron health check, run-history prune

- Date: 2026-11-24 (P1-D2 release hardening the same day)
- Branch: `feat/p1d-ops-guardrails` (base `main` `2e5881d`), Draft PR #109
- **Scope:**
  1. a fail-closed guard against production Supabase/Gemini on non-production Vercel deployments;
  2. a cron health check (workflow OFF by default);
  3. proposed SQL only: the health function and a prune of `cron.job_run_details`.
- **Not done:**
  - no production write or deployment;
  - no migration applied;
  - no cron activated;
  - no credential or environment-variable change;
  - no Gemini call;
  - no VM;
  - no Vercel preview opened;
  - nothing merged.

**Verdict: PASS (engineering), release-ready for a separately approved merge.**
- Merging changes production runtime code: the Vercel entries, the Supabase factory, `/api/config`, `/api/admin` and the browser bootstrap.
- Merge conditions and the smoke checklist are in §7.
- The proposed SQL needs its own approval.

## 0. P1-D2 changes (vs `5353b2f`)

| Item | Finding | Resolution |
|---|---|---|
| Benchmark freeze failed on `5353b2f` | Caused solely by the guard line added to `_server-lib/ai/geminiClient.ts`, a frozen M3-B benchmark input (file hash). Restoring main's version → `npm run test:benchmark` 272/272 | `geminiClient.ts` restored **byte-identical** to `main`; every freeze-trigger path is identical to `main`. **No re-freeze** and no hash change. The Gemini guard moved to the Vercel entry layer (§1) |
| Guard fail-open when `VERCEL`/`VERCEL_ENV` are unavailable | The guard keyed off the system var `VERCEL=1`, which disappears if "Automatically expose System Environment Variables" is turned off | Every Vercel entry (`api/**`) calls `enterVercelFunction()`, so it is a Vercel deployment **by construction**. Only `VERCEL_ENV === 'production'` counts as production; missing = non-production. The browser no longer depends on build-time system vars (§1) |
| Gemini on Preview via opt-in flag | `PREVIEW_GEMINI_ALLOWED=true` alone would have let a mis-scoped production key through | **Flag removed.** Gemini is always off on non-production Vercel deployments. A staging key path is not built; it would need a separately named variable plus a fingerprint pin, never `GEMINI_API_KEY` |

## 1. Preview fail-closed guard

Today Supabase and Gemini credentials are scoped to Production only in Vercel. The guard is **defense in depth**: it holds even if a variable is later mis-scoped, and even if Vercel stops exposing system env vars.

- **Server entry policy** (`_server-lib/previewGuard.ts`, `enterVercelFunction()`, called at module load in all 9 `api/**` entries). It does two things:
  - marks the process as a Vercel function (a `globalThis` symbol);
  - **removes `GEMINI_API_KEY` from `process.env` unless `VERCEL_ENV` is exactly `production`.**

  The frozen `getGeminiClient()` reads the key lazily at call time, so every Gemini call on a non-production deployment fails closed with "not configured". No other module reads the key.
- **Supabase rule** (`src/lib/previewGuard.ts`, pure). On a Vercel deployment (entry marker or `VERCEL=1`) that is not `VERCEL_ENV=production`, it refuses:
  - the production host (`PRODUCTION_SUPABASE_HOST`, already public in `index.html`), even if the allowlist names it;
  - any host not exactly `PREVIEW_SUPABASE_HOST` (unset today);
  - an unparseable URL.
- **Where the rule is enforced:**
  - `getSupabaseAdmin()` (both `SUPABASE_URL` and the `VITE_SUPABASE_URL` fallback);
  - `/api/config` (Vercel and Express), which returns an empty URL and anon key.
- **Browser** (`src/lib/supabase.ts`):
  - an **inlined** production URL is used only by a build whose `VITE_VERCEL_ENV` is `production`;
  - any other build (preview, a build without system env, a local build) asks `/api/config`, and the server's policy answers;
  - non-production hosts (local stack) are used as before;
  - the `VITE_VERCEL` define from `5353b2f` is removed.
- **Unchanged:**
  - Express (`server.ts`) and library/script use never call the entry policy. They keep their current behaviour (local dev, the owner's opt-in production Express workflow, CI, tests).
  - Production with `VERCEL_ENV=production`: identical behaviour (tests in §5).
- **Fail-open neighbours:** the hourly AI cap and the rate limiter deliberately continue on lookup errors. That is acceptable because every Supabase write and Gemini call afterwards is still gated by the factory or the missing key.

## 2. Cron health check (default OFF)

- **Endpoint:** `GET /api/admin/cron-health?jobs=a,b`, inside `api/admin.ts`. No new serverless function (9 of 12). The route is added to the `vercel.json` rewrite list.
  - Auth reuses the storage-cleanup bearer mechanism (`_server-lib/http/bearerSecret.ts`: constant-time compare, ≥32 chars, unset = refuse) with its own secret, `CRON_HEALTH_SECRET`. No fallback to the cleanup secret or an admin JWT.
  - While the secret is unset the endpoint answers 401.
  - `Cache-Control: no-store`; GET only.
  - Job names are validated (`^[a-z0-9][a-z0-9-]{0,62}$`, 1–20, de-duplicated). Invalid lists get 400 with no echo of the input.
- **Data function:** `public.cron_job_health(text[])`, proposed (§4). DEFINER, `search_path=''`, STABLE, service_role-only.
  - Per job: `state` ∈ {`ok`, `missing`, `inactive`, `stale`, `failing`}, `hours_since_success`, `consecutive_failures`, `runs_7d`. Never run text.
  - `stale` means no success in retained history, or the last success ended more than 26 h ago.
  - `failing` means 2 or more `failed` runs since the last success.
  - If the function is missing, the endpoint answers 503 `health_function_missing`.
- **Workflow** `.github/workflows/cron-health.yml`: daily at 22:00 UTC, only when `vars.CRON_HEALTH_ENABLED == 'true'`.
  - Expected jobs are declared in `vars.CRON_HEALTH_EXPECTED_JOBS`.
  - A red run is the alert, so at most one per day.

## 3. `cron.job_run_details` prune (proposed)

- **Command:** `DELETE FROM cron.job_run_details WHERE end_time < now() - interval '30 days'`, daily at 20:50 UTC.
- **30 days is a proposal; no retention has been approved.** It must stay above the health lookback (7 days / 26 h).
- In-progress runs are kept.

## 4. Proposed SQL (`supabase/proposed/p1d-ops-guardrails/`, never applied by `db push` or CI)

| File | Content |
|---|---|
| `01_cron_job_health.sql` | Health function + grants |
| `02_purge_cron_job_run_details_pg_cron.sql` | Prune job |
| `cron_job_health.test.sql` | Shape/permissions; 12-job state matrix incl. the 26 h edge, the 7-day window and hour rounding; invalid input; prune semantics |
| `cron_health_integration.sh` | Real pg_cron runs, the HTTP boundary, the handler end to end, the missing-function 503, a real prune run |
| `mutants.sh` | Baseline-guarded SQL mutation suite |

The SQL is unchanged by P1-D2.

## 5. Tests and results

| Check | Result |
|---|---|
| `npm run test:benchmark` (M3-B freeze + offline harness) | **272 passed** (1 skipped); freeze-trigger paths identical to `main` |
| `npm run lint`, `npm run lint:api` | PASS |
| `npx vitest run` | 137 files, **2107 passed**, 76 skipped (DB-gated) |
| `npm run build` | PASS |
| Guard regression (`_server-lib/__tests__/previewGuard.test.ts`) | Every one of the 9 entries, with **no Vercel system vars**: Gemini key removed and production Supabase refused. `VERCEL_ENV` ∈ {preview, development, custom "staging", "Production", ""} refused. Production keeps both (also with `VERCEL` missing). Allowlist works but never for the production host. No Gemini opt-in. Express/library path unchanged. `/api/config` hidden on non-production and unchanged in production |
| Browser (`src/__tests__/lib/supabasePreviewGuard.test.ts`) | Production build uses the inline URL without a network call. Preview, development and empty builds ignore an inline production URL and defer to `/api/config`. A promoted preview boots from the production config. Local stack inline and Express config paths unchanged |
| Existing API tests (`api/__tests__/*`) | Pass **unmodified** |
| TypeScript mutants | **25/25 killed**. Includes: entry call removed (analyze, recruiter), scrub removed, scrub only on preview, marker not set, factory ignores marker, opt-in flag reintroduced, browser inline rule broken |
| SQL mutants / real-cron integration / SQL test | 27/27 / 5/5 / PASS (`5353b2f`, SQL unchanged) |
| Full DB suite | 34/34, deadlocks 0 (`5353b2f`; P1-D2 changes no SQL or DB test), plus the CI Database tests check |

## 6. Risk review

| # | Risk | Mitigation / status |
|---|---|---|
| R1 | A production outage if production stopped seeing `VERCEL_ENV=production` | `VERCEL_ENV` is documented as available at build and runtime; `autoExposeSystemEnvs=true`. Covered by the smoke checklist (§7) |
| R2 | **System env exposure turned off** | Now **fails closed by design**: every API route treats the deployment as non-production. Gemini is removed and Supabase refused, and the browser can't boot. **Runbook: never turn it off; re-run the smoke after any project-setting change** |
| R3 | Gemini on Preview | Always off; no opt-in flag. A staging path is not built (§0) |
| R4 | The health endpoint deployed before the SQL is adopted | 503 `health_function_missing`; workflow OFF |
| R5 | The health secret is reused or leaked | Own secret, ≥32 chars, constant-time; read-only enums |
| R6 | Watcher silence (GitHub may auto-disable scheduled workflows in inactive public repos) | Owner checks the last run monthly |
| R7 | The prune deletes evidence | Only finished runs older than 30 days (proposal); longer than the lookback |
| R8 | A preview promoted to production without a rebuild | Now **works**: its bundle has no inline production URL, so it reads the production runtime's `/api/config`. Still prefer shipping from `main` |
| R9 | A new `api/**` entry added without `enterVercelFunction()` | The coverage test enumerates every default-export entry and fails CI |
| R10 | The `globalThis` marker leaks between modules in one process | Set only by `api/**` entries; Express never loads them. Tests reset it |

## 7. Release runbook (owner; none done here)

**Before merge:**
1. Separate owner approval for #109.
2. Confirm CI is all green on the final SHA, incl. Benchmark freeze (see the PR).
3. Note the current production deployment id as the **Instant Rollback target**.

**Merge** (the `main` merge deploys to production automatically).

**Production smoke** (within 15 minutes of the deployment turning Ready). Any failure means Instant Rollback to the noted deployment, then investigate:
1. Load `https://cvfit.pro/vi`: no Supabase configuration error, and login state restores for a signed-in user.
2. `GET /api/config` returns a **non-empty** `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. A signed-in **non-admin** account calls an admin POST action (e.g. `POST /api/admin/set-user-role` with an empty body) and expects **403**. This proves `getSupabaseAdmin()` works in production. Its only write is one `api_rate_limits` counter row (purged daily); no profile or audit row changes.
4. `GET /api/admin/cron-health?jobs=storage-cleanup` with no auth expects **401**: the route is live and the check stays off.
5. **One** owner-approved recruiter-path analyze (1 Gemini call, cost about $0.01) expects 200. This proves production kept `GEMINI_API_KEY`, which the entry policy would remove on non-production.
6. Check the Sentry/Vercel logs for `PreviewCredentialError` or "GEMINI_API_KEY is not configured" in production: expect **none**.

**Later, each separately approved:**
- adopt `01_cron_job_health.sql` (and `02` with a chosen retention) as migrations;
- add the Vercel Production env var `CRON_HEALTH_SECRET` and redeploy;
- add the GitHub secret `CRON_HEALTH_SECRET` plus the vars `CRON_HEALTH_URL`, `CRON_HEALTH_EXPECTED_JOBS` and `CRON_HEALTH_ENABLED=true`;
- run the workflow once by hand.

**Disable:** set `CRON_HEALTH_ENABLED` to anything else, or unset the Vercel secret.

## 8. Remaining debt

- Express parity for `cron-health` (Vercel only).
- No staging backend: `PREVIEW_SUPABASE_HOST` is unused, and a preview Gemini path is not built.
- The guard covers Supabase and Gemini (the task scope); extend it if a staging tier is added.
- The 30-day run-history retention awaits owner approval.
- Existing and P1-B cron jobs have no alerting until the health check is enabled.
