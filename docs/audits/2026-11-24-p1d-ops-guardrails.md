# P1-D — Ops guardrails: preview fail-closed guard, cron health check, run-history prune

- Date: 2026-11-24
- Branch: `feat/p1d-ops-guardrails` (base `main` `2e5881d`)
- Scope:
  1. a fail-closed guard against production Supabase/Gemini on non-production Vercel deployments;
  2. a cron health check (workflow OFF by default);
  3. proposed SQL only: the health function and a prune of `cron.job_run_details`.
- **Not done:**
  - no production change;
  - no migration applied;
  - no cron activated;
  - no credential or environment-variable change;
  - no Gemini call;
  - no VM;
  - no Vercel preview opened;
  - nothing merged.

**Verdict: PASS (engineering).**
- **Merging this PR does change production runtime code:** the Supabase/Gemini factories, `/api/config` and `/api/admin`. Merge conditions are in §6.
- **The proposed SQL needs its own approval.**

## 1. Preview fail-closed guard

Today Supabase and Gemini credentials are scoped to Production only in Vercel. The guard is **defense in depth** on top of that: it refuses even if a variable is later mis-scoped to Preview.

- **Rule** (`src/lib/previewGuard.ts`, pure, shared by server and browser): on Vercel (`VERCEL=1`), anything other than `VERCEL_ENV=production` counts as non-production. That covers Preview, development, custom environments and a missing value.
  - On a non-production deployment, Supabase is refused when:
    - the host is the production project (`PRODUCTION_SUPABASE_HOST`, already public in `index.html`). This also applies when the allowlist is mis-set to it;
    - or the host is not exactly `PREVIEW_SUPABASE_HOST` (unset today, so every host is refused);
    - or the URL is unparseable.
  - Gemini is refused unless `PREVIEW_GEMINI_ALLOWED` is exactly `true`.
  - Outside Vercel (local dev, CI, the Express server) nothing changes.
- **Call sites**, each checked before anything is cached:
  - `getSupabaseAdmin()`, which covers both `SUPABASE_URL` and the `VITE_SUPABASE_URL` fallback;
  - `getGeminiClient()`;
  - `api/config.ts` and `server/routes/config.ts`, which return an empty URL and anon key;
  - `src/lib/supabase.ts`, on both the inlined path and the `/api/config` path. It returns `false`, so the existing configuration-error UI shows.
- **Browser:** `vite.config.ts` adds the build-time `VITE_VERCEL` define next to `VITE_VERCEL_ENV`.
  - A build with `VERCEL=1 VERCEL_ENV=preview` keeps the guard in the bundle.
  - A production build constant-folds it away: 0 guard strings in the bundle, so the production bundle is functionally unchanged.
- **Runtime dependency:** `VERCEL` and `VERCEL_ENV` are documented as available at build and runtime when "Automatically expose System Environment Variables" is on. The project setting `autoExposeSystemEnvs` is `true`, checked read-only on 2026-11-24.
  - If that setting were turned off, `VERCEL` would disappear too. The guard would then treat the deployment as non-Vercel and allow it (a known limitation, §5), and production would keep working.
- **Variables:**
  - server: `PREVIEW_SUPABASE_HOST`, `PREVIEW_GEMINI_ALLOWED`;
  - browser: `VITE_PREVIEW_SUPABASE_HOST`, which must match `PREVIEW_SUPABASE_HOST` if a staging tier is added.
  - All are unset today; none is needed for production.
- **Fail-open neighbours:** the hourly AI cap and the rate limiter deliberately continue on lookup errors. That is acceptable only because every later Supabase write and Gemini call goes through the guarded factories.

## 2. Cron health check (default OFF)

- **Endpoint:** `GET /api/admin/cron-health?jobs=a,b`, folded into `api/admin.ts`. No new serverless function; still 9 of 12. The action is added to the `vercel.json` rewrite list.
  - **Auth reuses the storage-cleanup bearer mechanism,** factored into `_server-lib/http/bearerSecret.ts`: constant-time compare, minimum 32 characters, unset means always refuse. It uses its own secret, `CRON_HEALTH_SECRET`, and never falls back to the cleanup secret or an admin JWT.
  - **Off by default:** while the secret is unset the endpoint answers 401.
  - `Cache-Control: no-store`; GET only.
  - Job names are validated (`^[a-z0-9][a-z0-9-]{0,62}$`, 1–20, de-duplicated). Invalid lists get 400 with no echo of the input.
- **Data function:** `public.cron_job_health(text[])` (proposed, §4).
  - SECURITY DEFINER, `search_path=''`, STABLE, EXECUTE for service_role only.
  - Per job it returns `state` ∈ {`ok`, `missing`, `inactive`, `stale`, `failing`}, plus `hours_since_success`, `consecutive_failures` and `runs_7d`. **Never `return_message` or `command`.** The handler also re-maps rows to exactly those five keys.
  - **Rules:**
    - `stale` means no success in retained history, or the last success ended more than 26 h ago;
    - `failing` means 2 or more `failed` runs since the last success; `running`/`starting` don't count;
    - a single failure is reported but does not page.
  - **If the function is not applied,** the handler answers 503 `health_function_missing`.
- **Workflow** `.github/workflows/cron-health.yml`: daily at 22:00 UTC, so at most one alert per day.
  - Runs only when `vars.CRON_HEALTH_ENABLED == 'true'`.
  - A red run is the alert (GitHub notifies on failure).
  - The expected jobs are declared in `vars.CRON_HEALTH_EXPECTED_JOBS`, so a job that should exist but is absent shows as `missing` instead of passing silently.

## 3. `cron.job_run_details` prune (proposed)

- **Command:** `DELETE FROM cron.job_run_details WHERE end_time < now() - interval '30 days'`, daily at 20:50 UTC.
- **30 days is a proposal, not an approved retention.** It must stay above the health lookback (7 days / 26 h).
- Runs still in progress (`end_time IS NULL`) are kept.
- The table holds job status and messages only; it is never purged today.
- Production read-only check: `postgres` holds DELETE on the table.

## 4. Proposed SQL (`supabase/proposed/p1d-ops-guardrails/`)

| File | Content |
|---|---|
| `01_cron_job_health.sql` | Health function + grants |
| `02_purge_cron_job_run_details_pg_cron.sql` | Prune job (`cron.schedule` upsert by name) |
| `cron_job_health.test.sql` | Shape/permissions; 12-job state matrix incl. the 26 h edge, the 7-day window and hour rounding; invalid input → 22023; prune semantics + job definition |
| `cron_health_integration.sh` | Real pg_cron runs and the HTTP boundary; handler end to end against the local DB; missing-function 503; real prune run |
| `mutants.sh` | Baseline-guarded SQL mutation suite |

All of this sits outside `supabase/migrations`, so neither `db push` nor CI applies it. **Adoption:** copy into `supabase/migrations` with a fresh timestamp, move the test to `supabase/tests/`, and get the owner's approval.

## 5. Tests and results (disposable local stack, ports 5532x)

| Check | Result |
|---|---|
| `npm run lint`, `npm run lint:api` | PASS |
| `npx vitest run` | 137 files, 2088 passed, 76 skipped (DB-gated) |
| `npm run build` | PASS; preview-style build keeps the guard, production build folds it out |
| New unit/security tests | guard matrix (8), server factories + `/api/config` (7), browser bootstrap (3), cron-health handler/auth (11) |
| `cron_job_health.test.sql` | PASS with 01, and with 01+02 |
| `cron_health_integration.sh` (real pg_cron) | 5/5 |
| SQL mutants | **27/27 killed** (one equivalent mutant replaced: dropping the GRANT is a no-op under Supabase default privileges) |
| TypeScript mutants (guard, factories, config, browser, bearer check, handler) | **19/19 killed** |
| Full DB suite (`scripts/ci/db-tests.sh`, fresh stack) | 34 suites, 0 failed, deadlocks 0 |

**Security notes:**
- The PostgREST `/rpc/cron_job_health` call returns 401/403 for anon, enums only for service_role, and 400 for invalid names.
- Denial is never tested by calling after `SET ROLE` in psql, because that crashes the local image's backend.

## 6. Risk review and merge conditions

| # | Risk | Mitigation / status |
|---|---|---|
| R1 | A production outage if `VERCEL_ENV` were not `production` at runtime | Documented runtime variable; `autoExposeSystemEnvs=true`. **Merge condition:** post-merge smoke with one authenticated API call and a page load, plus a check that `/api/config` returns the URL |
| R2 | If system env exposure is turned off, the guard silently allows (it can't detect Vercel) | Known limitation; keep the setting on |
| R3 | `PREVIEW_GEMINI_ALLOWED=true` set together with a mis-scoped production key would allow Gemini on Preview | Deliberate opt-in; no staging key exists today |
| R4 | The health endpoint deployed before the SQL is adopted | 503 `health_function_missing`; the workflow is OFF |
| R5 | The secret is reused or leaked | Own secret, ≥32 chars, constant-time compare; the endpoint is read-only enums |
| R6 | Watcher silence (GitHub may auto-disable scheduled workflows in inactive public repos) | Owner checks the workflow's last run monthly |
| R7 | A `cron.job_run_details` prune deletes evidence | Only finished runs older than 30 days; longer than the health lookback; proposal only |
| R8 | A preview deployment **promoted to production without a rebuild** (the promote API does not rebuild) keeps its baked-in `VITE_VERCEL_ENV=preview`, so the browser refuses the production Supabase URL and the site shows its config error | Fails closed (no data exposure). **Runbook:** never promote a preview; ship production from `main` (Git deploy or redeploy). Instant Rollback targets are production builds, unaffected |

## 7. Owner steps to enable (none done here)

1. Merge (separately approved) → post-merge smoke (R1).
2. Approve and apply `01_cron_job_health.sql` as a migration. Optionally approve `02` with the chosen retention.
3. Add the Vercel Production env var `CRON_HEALTH_SECRET` (≥32 random chars) and redeploy.
4. Add the GitHub secret `CRON_HEALTH_SECRET` (same value) and the vars:
   - `CRON_HEALTH_URL`;
   - `CRON_HEALTH_EXPECTED_JOBS`, e.g. the four existing jobs; add P1 jobs only after their first success;
   - `CRON_HEALTH_ENABLED=true`.
5. Run the workflow once manually (`workflow_dispatch`) and confirm it is green.

**Disable:** set `CRON_HEALTH_ENABLED` to anything else, or unset the Vercel secret (the endpoint returns 401).

## 8. Remaining debt

- Express parity for `cron-health`: Vercel only.
- No staging backend: `PREVIEW_SUPABASE_HOST` / `PREVIEW_GEMINI_ALLOWED` unused.
- The guard covers Supabase and Gemini only (the task scope); extend it if a staging tier is added.
- The guard depends on system env exposure staying on (R2).
- The 30-day run-history retention needs owner approval.
- The 4 existing cron jobs and the P1-B jobs have no alerting until the health check is enabled.
