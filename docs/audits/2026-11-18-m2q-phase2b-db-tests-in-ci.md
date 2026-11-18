# M2-Q Phase 2B — Database safety tests in CI (closes Q-4)

- Date: 2026-11-18. Baseline `main` `6a2d539`.
- Branch `ci/m2q-db-tests`. **Local only:** not pushed, because a push builds a Vercel preview wired to the production database.
- Constraints: no production access, no secrets, no migration, no Gemini call, no quota change.
- **Outcome:** a new GitHub Actions workflow runs every database suite on a disposable Supabase stack on the runner. It runs 29 suites in 32 s locally, and every failure mode turns it red. No external resources, billing, secrets or migrations are needed.

## 1. Gap analysis (before)

| Area | State on `main` |
|---|---|
| `.github/workflows/ci.yml` | lint, lint:api, `npm test`, build. No database. |
| `src/__tests__/db/*.db.test.ts` (1B, 2A; 16 tests) | `describe.skipIf(!enabled)`: **silently skipped in CI** (16 skipped every run) |
| `npm run test:db:quota`, `test:db:claim`, `test:db:m2q` | never run in CI (manual, local stack) |
| `supabase/tests/*.test.sql` (30 suites) + 1 fixture test | never run in CI (manual) |
| Other workflows | `storage-cleanup.yml`, `supabase-keepalive.yml`: production cron jobs, unrelated |
| Branch protection on `main` | **none** (no protection, no rulesets; checked read-only). A red check does not block a merge today. |

**Evidence of the gap:**
- `supabase/tests/r2_storage.test.sql` was **broken on `main`** and nobody noticed. It called `storage_publish_upload` as `postgres`, but the R2 metadata trigger allows only `service_role`. The function is granted to `service_role` only, and `_server-lib/storage/handler.ts` calls it through the service-role client. The fixture now sets the `service_role` role first, which is a test-only change. Its later `set_config(…'authenticated'…)` still checks that a client is rejected, so no coverage is lost.
- The three admin aggregate suites pass only on an empty database. Before this change nothing enforced that.

## 2. Architecture

```
GitHub runner (ephemeral VM, public repo = free)
 └─ scripts/ci/db-stack.sh  $RUNNER_TEMP/db
     supabase init (scratch project outside the repo) → disable realtime/studio/
     inbucket/analytics/edge/pooler/seed → copy supabase/migrations → supabase start
     → db.env (127.0.0.1:54321 + CLI demo keys; refuses a non-local API_URL)
 └─ scripts/ci/db-tests.sh  $RUNNER_TEMP/db
     0. refuse a non-local URL; refuse a used stack (auth.users + analysis_log must be empty)
     1. 23 SQL suites on the real stack (PG 17, roles, RLS, storage)
     2. 7 SQL suites + 1 fixture test on supabase/tests/local/run.sh
        (postgres:16 + stubs, --network none), judged by its output
     3. test:db:quota, test:db:claim, test:db:m2q (PostgREST + GoTrue, parallel clients)
     4. vitest src/__tests__/db with REQUIRE_DB_TESTS=1 + JSON report:
        fail on any skip, any failure, or < 16 passed
     → exit 1 on any failure; logs uploaded as an artifact on failure
```

**Why two harnesses.** The real stack is the production engine (Postgres 17 with PostgREST, GoTrue and Storage), and the TypeScript suites need it. Seven SQL suites were written for the stub harness and use superuser features the real stack's `postgres` role lacks:

- `pg_read_file`;
- dblink without a password;
- `SET ROLE supabase_auth_admin`;
- the harness's `/repo/migrations` mount.

`STUB_ONLY` is an explicit list in `db-tests.sh`, with the reason for each suite. Every other `*.test.sql` runs on the real stack, so a new suite lands there by default. A listed file that is missing, or a split that doesn't add up, fails the run.

**Cost:**
- Public repository, so GitHub-hosted runners cost nothing.
- Images come from public registries. No cloud database, no paid service, no secret.
- Measured locally with cached images: stack 38 s and suites 32 s. On a cold CI runner the image pulls add time. That is **not measured yet**; the first PR run will show it.

## 3. Files

| File | Change |
|---|---|
| `.github/workflows/db-tests.yml` (new) | Job "Database tests":<ul><li>on PR, push to main and manual run;</li><li>`permissions: contents: read`, no `secrets.*`;</li><li>Supabase CLI 2.98.2 via `supabase/setup-cli`, pinned to commit `689adcf…` (v3.2.0);</li><li>uploads logs on failure and always stops the stack;</li><li>concurrency cancels superseded PR runs only, so every push to main completes.</li></ul> |
| `scripts/ci/db-stack.sh` (new) | Starts the disposable stack and writes `db.env`. |
| `scripts/ci/db-tests.sh` (new) | Runs every suite and fails closed (the steps in §2). |
| `src/__tests__/db/m2q1bServerSave.db.test.ts`, `m2q2aTimeoutRace.db.test.ts` | `REQUIRE_DB_TESTS=1` with no local stack throws instead of skipping. Plain `npm test` still skips them, as before. |
| `supabase/tests/r2_storage.test.sql` | The fixture acts as `service_role` (§1). |

No change to app code, migrations, `ci.yml` or quota.

## 4. Test matrix

| Suite | Harness | Covers |
|---|---|---|
| `m2q_quota_safety` | real | ledger keep-forever, no sweep or purge, no DELETE grants (Q-D1..Q-D3) |
| `analytics_quota_reservations` | real | reserve / commit / release states, TTL, forgiveness, dedupe on (user, key) |
| `candidate_analysis_ownership` | real | M2-D3 claim, lease, ledger evidence, fenced save |
| `save_candidate_analysis_ownership` | real | cross-user save refused |
| `account_lock`, `profiles_authority`, `plan_caps`, `campaign_caps`, `api_rate_limit`, `storage_upload_quota`, `purge_free_history` | real | account lock, privilege columns, plan caps, hourly slots, upload quota, retention |
| `admin_*` (8), `public_plan_limits`, `applications`, `r2_storage`, `storage_buckets_private` | real | admin RPCs and audit, plan limits, P2A snapshots, R2 registry, private buckets |
| `application_tracker`, `application_follow_up`, `applications_concurrency`, `application_tracker_concurrency`, `application_follow_up_concurrency`, `deleted_accounts`, `cv_files_text_plain` | stub | P2B/P2C transitions and parallel replays, deleted accounts, MIME |
| `applications_backfill` (fixture) | stub | P2B backfill on pre-P2B data |
| `test:db:quota` | real | 20 parallel reserves, plan-change races (12 + 7 checks) |
| `test:db:claim` | real | parallel claims, takeover, replays (13) |
| `test:db:m2q` | real | two tabs × 8 candidates, one charge each, evidence under sweeps (5) |
| `src/__tests__/db` (16) | real | 1B server save after commit, idempotent replay, ownership gate; 2A release race repro and fix |

**Results.** On a fresh local stack, run end to end the same way CI runs it, all 29 suites pass:
- the 23 real-stack SQL suites;
- the two stub-harness runs (7 suites + the fixture test);
- the 3 scripts;
- vitest: 16 passed, 0 skipped.

0 deadlocks.

## 5. Fail-closed proof (negative runs, all restored afterwards)

| Injected fault | `db-tests.sh` exit | Failing suite |
|---|---|---|
| N1 `ASSERT false` appended to `m2q_quota_safety.test.sql` (real stack) | 1 | `sql:m2q_quota_safety` |
| N2 `ASSERT false` appended to `application_tracker.test.sql` (stub) | 1 | `stub:suites` |
| N5 Phase 1B H1 mutant in `_server-lib/analyze/handler.ts`: server save before the commit | 1 | `vitest:src/__tests__/db` ("commit not settled … no save") |
| N3 + N4 `M2Q_LOCAL_DB` unset and anon key empty | 1 | `script:test:db:quota/claim/m2q` ("Refusing to run") and `vitest` ("REQUIRE_DB_TESTS=1 but no local Supabase stack") |
| Non-local `SUPABASE_URL` (`https://example.supabase.co`) | 2 | refused before anything runs |
| N6 `it.skip` added to a DB test file (skip, not failure) | 1 | `vitest:src/__tests__/db` (`passed=16 failed=0 skipped=1`) |
| Rerun on a used stack | 1 | refused: "Stack is not fresh (65 rows) … supabase db reset" |

N1, N2 and N5 were injected in one run and each produced its own FAIL line. The same was true for N3 and N4. N6 and the used-stack rerun were measured on their own, with no pipe on the exit code. All injected faults were reverted and the stack was stopped.

## 6. Security and isolation

- **No production path:**
  - The workflow references no `secrets.*` and no `vars.*`.
  - The keys are the local CLI's built-in demo keys.
  - Production refs: a search of `_server-lib`, `api`, `scripts`, `server` and `src/__tests__/db` for the production project ref or `supabase.co` finds none, apart from a unit test's `example.supabase.co` stub.
  - `getSupabaseAdmin` reads `SUPABASE_URL` first, and the runner exports it as the local URL.
- **Guards:**
  - `db-stack.sh` refuses a non-local `API_URL`.
  - `db-tests.sh` refuses a non-local `SUPABASE_URL`.
  - Each TypeScript suite independently refuses anything but 127.0.0.1 or localhost.
- **No Gemini:** the DB vitest files mock the Gemini client, and no `GEMINI_API_KEY` exists in CI.
- **Isolation between runs:**
  - each job runs on its own throwaway VM with its own Docker daemon;
  - the stack is created from scratch and never shared;
  - fork PRs run with a read-only token and no secrets (`pull_request`, not `pull_request_target`).
- **Supply chain:**
  - the third-party action `supabase/setup-cli` is pinned by commit SHA;
  - the CLI is pinned to 2.98.2;
  - `actions/*` follow the existing `ci.yml` convention (major tags).
  - The stub harness uses the unpinned `postgres:16` tag, with no network and no secrets.

## 7. Remaining items

- **Owner action, to make it blocking:** add the required status check "Database tests" (plus "Lint, Test & Build") to branch protection or a ruleset on `main`. This is a repository settings change for the owner; I didn't make it.
- **Watch on the first PR run** (local runs can't show these):
  - the cold-runner duration;
  - whether the stub harness's `--user 999:999` container can read the runner's checkout through the bind mount;
  - whether anonymous Docker Hub pulls of `postgres:16` hit a rate limit.
- The `supabase/setup-cli` input `version` was checked in `action.yml` at the pinned SHA.
- The stub harness runs PG 16, while production runs PG 17. That covers 7 suites plus the fixture test. Porting them to the real stack (no `pg_read_file`, dblink with a password) is optional follow-up work.
- Still open from M2-Q:
  - Q-6 (`service_role` DELETE on the ledger), which needs a migration;
  - P1-4 / S6 (a failed or unconfirmed commit still loses a paid result).

## 8. GO / NO-GO

**GO for review and a draft PR** once the owner approves the push. No external resources, billing, secrets or migrations were needed. The first PR run of "Database tests" is the real end-to-end check of the workflow on GitHub.

**NO-GO** for merge without separate owner approval. Making the check blocking is the owner's settings change.
