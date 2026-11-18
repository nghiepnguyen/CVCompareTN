# M2-Q Phase 2C: Production Release Preflight (read-only)

- Date: 2026-11-18
- Branch: `fix/m2q-phase2c-atomic-settlement`. The implementation is at `be7239d`; this report and the audit cherry-pick sit on top. Nothing is pushed.
- Owner approval: **READ-ONLY PREFLIGHT ONLY.** No migration was executed and no production row, function, grant or configuration was changed. No Gemini call, push, PR or deploy was made.
- Migration under review: `supabase/migrations/20261118000000_commit_and_save_candidate_analysis.sql`, sha256 `2784ae9d7c53b2fd005adf2331a1a1e666c42b7aeb6bcc5154558ac1a8f35493`.
- Verify script: `supabase/tests/commit_and_save_candidate.prod_verify.sql`, sha256 `7061893b684dfbe763a3d680a1191461ea0a4550a66513e10024eea71107d2ce`. It was run exactly as committed.

---

## 1. Deployment environment isolation

Method:
- `vercel env ls` lists variable names and their environments only. Values stay encrypted and were never pulled or printed.
- `vercel api /v9/projects/cv-compare-tn` was used to read the project protection settings.
- IDs below are masked: project `prj_9o…`, team `team_A…`.

| Variable | Environments (one entry) | Consequence |
|---|---|---|
| `SUPABASE_URL` | Production, Preview | **same value**: Preview uses the production database |
| `SUPABASE_SERVICE_ROLE_KEY` | Production, Preview | **Preview uses the production service-role key** |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Preview, Production | Preview browser bundle talks to production |
| `GEMINI_API_KEY` | Production, Preview | **Preview can make live, billable Gemini calls** |
| (none) | Development | no Development-scoped variables |

Because each of these variables is a single entry scoped to both environments, Preview and Production read the same value. That is proven from the variable layout alone, without reading any value.

Project settings:
- `gitProviderOptions.createDeployments = enabled`, production branch `main`. **Pushing any branch creates a Preview deployment automatically**, and a merge to `main` deploys Production.
- `ssoProtection.deploymentType = all_except_custom_domains`. Preview URLs require Vercel team authentication, so only team members can open them.
- No `crons` in `vercel.json`.
- `npm run build` (`vite build` plus `scripts/generate-static-pages.ts`) makes no database or Gemini calls. A Preview build alone therefore calls nothing. Production API calls happen only when an authenticated team member uses the Preview UI.

Other paths that could reach production on a push or merge:
- **GitHub Actions:**
  - `ci.yml` and `db-tests.yml` run on push and PR to `main`/`master` only, and touch nothing outside the runner (the DB tests use a disposable local stack).
  - `storage-cleanup.yml` and `supabase-keepalive.yml` are cron and manual triggers only, unrelated to branches, and existed before this change.
  - No workflow runs `supabase db push`, holds a Supabase access token, or deploys. **Pushing or merging never migrates production.**
- **Domains** (`vercel api /v9/projects/cv-compare-tn/domains`): `cvfit.pro`, `cv.thanhnghiep.top` (redirects to www.cvfit.pro) and `cv-compare-tn.vercel.app`. All have `gitBranch = null`, so no custom domain is bound to a branch. SSO's exemption for custom domains therefore exposes only Production, and Preview stays SSO-protected.

**Verdict: Preview is connected to production** (same database, same service-role key, live Gemini). Access is limited by Vercel SSO.

If the branch is pushed **before** the migration, any recruiter analysis run from the Preview hits `PGRST202` (function missing). That is classified as unknown: Gemini is paid, a 503 `quota_settlement_unknown` is returned, the row is held `analyzing`, and the reservation expires into the TTL policy and is charged after the 2 forgiven per cycle. **Rule: apply the migration before the first push.** Once the migration is live, a Preview running the new code is compatible with production. The old Production app is also compatible, because it never calls the new function.

---

## 2. Production read-only preflight

Ran in the Supabase Dashboard SQL Editor (project `pgchcnmpuknbgyljdlyp`, cvFit.pro, Primary Database, role `postgres`), in the built-in browser.
- Both queries were inspected before running: SELECT only, no DML, DDL, grants, `SET` or volatile side-effect functions.
- The editor content was set programmatically and checked byte-identical to the file (`match=true`).
- Side effect outside the database: the Dashboard keeps an "Untitled query" snippet in the owner's private SQL Editor list. That is dashboard metadata only, not database state.

### 2a. Before snapshot: `commit_and_save_candidate.prod_verify.sql` (exact file)

| check | value |
|---|---|
| latest_migrations | `20261117000000,20261116000000,20261105000000` |
| m2q2c_recorded_times | `0` |
| new_fn | `absent` |
| existing_fn_md5 | `ac0d6545e8fcdde5102c6f9d396c9e07` |
| building_blocks | `commit_analytics_quota=3b9c2a1fbcfaf20571478d5738609c4d`, `release_analytics_quota=36dc8a8303eb9390747af44210f63cf4`, `reserve_analytics_quota=f5603d1c7335ab638086b0d54fb06ad4`, `save_candidate_analysis_attempt=6f45373c2ae16317386b682b0db55082`. Each has `service_role=true authenticated=false` |
| owners | `commit_analytics_quota=postgres,save_candidate_analysis_attempt=postgres` |
| owner_can_call | `absent` (the new function does not exist yet) |
| role_timeouts | `authenticated:statement_timeout=8s` \| `authenticator:session_preload_libraries=supautils, safeupdate;statement_timeout=8s;lock_timeout=8s` \| `service_role:-` |
| ledger_columns | `56207470dea3a58a5dc97fa6730bce62` |
| ledger_grants | `postgres:{DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE}`, `service_role:{same}` |
| ledger_rows | `8` |

### 2b. Integrity counts (separate SELECT-only query, aggregates only)

| check | value |
|---|---|
| server_version | 17.6 |
| ledger_by_state | `committed/charged=8` |
| ledger_reserved_live / expired_unsettled | 0 / 0 |
| ledger_shape_violations / duplicate_keys | 0 / 0 |
| candidates_by_status | `done=14` |
| candidates_analyzing_stale / done_without_result / done_null_score | 0 / 0 / 0 |
| paid_result_lost_rows (committed ledger + candidate not done) | 0 |
| negative_usage_profiles | 0 |
| candidate columns | `analysis_attempt_id:uuid, analysis_result:jsonb, analysis_started_at:timestamptz, match_score:integer, status:text` |
| quota functions | all `owner=postgres`, `search_path=""`; the public RPCs are definer and the internal helpers are not; `sync_campaign_counters` is definer with `search_path=public` (pre-existing) |
| migration_role_can_call_blocks (`postgres` → commit, save) | `true,true` |
| name_collision | 0 |
| triggers on candidate_cvs / campaigns / ledger / profiles | `account_unlocked`, `enforce_plan_caps`, 3 storage triggers, `profiles_guard_privileged_columns`; none on the ledger |
| trigger functions that lock or update `profiles` | none |

### 2c. Per-function drift check

`existing_fn_md5` differs between production (`ac0d6545…`) and a freshly migrated local stack (`1c071304…`).
- To localize it, I took the 64 public functions on the local stack, hashed each as signature + body md5 + definer flag + ACL, and ran a SELECT-only query on production that returns every production function not in that set.
- Result: **63 of 64 match exactly** (body, SECURITY DEFINER and ACL). Production has 64, so there are no extra or missing functions.
- The only drift is `get_default_monthly_analytics_limit()`. Its ACL and definer flag are identical; its **body** differs.

Detail of that body:
- Production's body falls back to **`20`** when the `app_settings` row is missing.
- The migrations, through `20260912000000_free_quota_default_5.sql`, produce a fallback of **`5`**.
- The function sits **inside the commit call graph**: `commit_analytics_quota` → `analytics_quota_lock_state` → `resolve_monthly_analytics_limit` → `get_default_monthly_analytics_limit`.
- **Effective behaviour is identical.** Production has the `app_settings` row `default_monthly_analytics_limit = 5`, and `get_default_monthly_analytics_limit()` returns **5** there, the same as locally. The divergent literal is reached only if that row is deleted.

Impact on this release: **none.**
- The new migration does not touch the function.
- The new RPC reaches it only through the unchanged `commit_analytics_quota`, which production already runs (8 committed rows, 14 done candidates).
- Quota limits resolve to the same values that the 30 local suites exercised.

It is still **schema drift outside migration history** and should be recorded as separate debt (§6). A fresh replay builds a different fallback than production runs. Aligning it in either direction is a quota-policy decision and is out of scope here: no change made.

### 2d. Findings

- **Production matches the tested schema** in every function the new RPC can reach, and in 63/64 public functions overall. The building blocks (`commit_analytics_quota`, `save_candidate_analysis_attempt`, `reserve_`, `release_`) and all their helpers and triggers are byte-identical. The one drifted function (§2c) gives the same effective value. `ledger_columns` and the ledger grants are identical.
- **Timeouts are confirmed and equal to local:** statement and lock timeout 8 s. The browser's 12 s delayed reload is valid, which resolves implementation limitation §7.1.
- **Ownership:** every function is owned by `postgres`, and `postgres` can execute both building blocks. When the migration is applied as `postgres`, the new definer can call them, so `owner_can_call` will be `true,true`.
- **Clean starting state:** no open reservations, no stuck or orphan candidates, no paid_result_lost rows.
- **No deadlock risk from triggers:** none of the trigger functions on the touched tables lock `profiles`.
- Pre-existing, unchanged: service_role DELETE/TRUNCATE on the ledger (Q-6), and `sync_campaign_counters` with `search_path=public`. The new function calls it exactly as `save_candidate_analysis_attempt` already does.

---

## 3. Migration compatibility review

| Requirement | Verdict | Evidence |
|---|---|---|
| Additive | ✅ | one `CREATE FUNCTION` (no `OR REPLACE`; `name_collision=0`), one `COMMENT`, `REVOKE`/`GRANT` on that function only. No table, column, data or existing-function change |
| Quota settlement unchanged | ✅ | calls `commit_analytics_quota` unchanged (production md5 = tested md5); existing commit still used by the personal path |
| SECURITY DEFINER / search_path | ✅ | `SET search_path = ''`, schema-qualified calls, no dynamic SQL; owner will be `postgres`, the same as every ledger RPC |
| Only service_role EXECUTE | ✅ | REVOKE from PUBLIC, anon, authenticated, service_role, then GRANT service_role. Verified locally by SQL and by real anon/authenticated calls (42501). Checked again after the migration by `new_fn` |
| Decimal match scores | ✅ | `p_match_score numeric`, `round()::integer` for the `integer` column (production type confirmed); JSON keeps 72.5 |
| Commit durable if save fails | ✅ | save inside `BEGIN … EXCEPTION WHEN OTHERS`, which returns `save: failed` with the charge kept (SQL 4, DB 6, mutant MB) |
| Replay cannot double-charge | ✅ | the inner commit is idempotent by reservation; a replay does not write (SQL 2, DB 2, mutant MF) |
| No new deadlock cycle | ✅ | order profile → reservation → candidate → campaign; no path takes candidate → profile; production triggers confirmed non-locking; local CI `deadlocks=0` |
| Applies on production schema | ✅ | depends only on `commit_analytics_quota(uuid,uuid)` and `save_candidate_analysis_attempt(uuid,uuid,uuid,jsonb,integer)`, both present with the expected signatures and owner. The full migration replay passes on the local stack and the stub harness |
| Lock impact of applying | ✅ | `CREATE FUNCTION` takes only catalog locks; no table lock and no rewrite |

**No compatibility blocker found.**

---

## 4. Backup and rollback readiness

- **Platform backups: NONE.** The project is on the Supabase **Free plan**. The Backups page states that the Free Plan does not include project backups, and point-in-time recovery is not available.
- **Why this does not block an additive DDL change:** the migration writes no data, so there is nothing to restore. Its compensating action is `DROP FUNCTION public.commit_analytics_quota_and_save_candidate(uuid,uuid,uuid,uuid,jsonb,numeric);`. That removes no rows and touches no ledger evidence.
- **Recommended owner action before applying:** take a local, owner-held logical dump (`supabase db dump --linked`) as general disaster readiness.
  - It contains PII, so keep it outside the repository and every synced folder.
  - It is a convenience, not a rollback mechanism for this change.
  - Upgrading the plan for backups is the owner's decision and out of scope here.

Rollback rules (billing evidence is never reverted):
- **App problem after deploy:** use Vercel instant rollback to the previous Production deployment. The old app uses the unchanged commit and save functions, and the new function stays unused. **Do not drop the function** while any deployed build, Preview included, may call it.
- **Ledger rows and candidate results written by the new function are permanent billing evidence.** Never delete, revert or "clean up" them. A charge settled through the new RPC is a real charge for a delivered result.
- `DROP FUNCTION` is allowed only if the post-migration verify fails **before** any app build that calls it has been deployed (step 3 stop). After that it is unnecessary: an unused function is harmless.

---

## 5. Release runbook

Each numbered step needs explicit owner approval. Stop on any stop condition, and roll back with the procedure given.

**0. Preconditions.**
- The implementation branch is at the reviewed HEAD, and the migration sha256 is `2784ae9d…5493`.
- The owner acknowledges the Free-plan backup gap (§4) and, optionally, has taken a local dump.
- The owner confirms the "idempotent replay after unknown" interpretation (implementation report §2).

**1. Backup and recovery readiness.** Re-run the integrity query (§2b) right before applying.
- *Stop if:* `ledger_reserved_live > 0` or `candidates_by_status` shows `analyzing`, meaning an analysis is in flight. Wait for it to settle. Applying would be safe anyway, but a quiet baseline keeps the before/after diff exact.

**2. Apply the migration.** Use exactly the M2-D3 method (`docs/audits/2026-11-16-m2d3-migration-apply.md`): a detached worktree of the reviewed HEAD in a scratch directory, not the main checkout, with a clean working tree. `supabase db push` records the version in `supabase_migrations.schema_migrations` itself; do not use any manual history edit or `--include-all`.
- **Run by the owner** (or by an agent only with explicit owner approval in the session): an agent's `supabase … --linked` calls have been denied by the auto-mode classifier before.
- **Do not paste the migration into the SQL Editor.** That records no migration history, so step 3's `m2q2c_recorded_times = 1` would fail. It would also make every later `db push` fail on the existing function (`CREATE FUNCTION` without `OR REPLACE`).
- `shasum -a 256 supabase/migrations/20261118000000_commit_and_save_candidate_analysis.sql` must equal `2784ae9d…5493`.
- `supabase db push --linked --dry-run` must list **exactly one** pending migration, `20261118000000`.
- `supabase db push --linked`.
- After the push, unlink the scratch checkout (`supabase/.temp` removed) and remove the worktree.
- *Stop if:* the dry-run lists anything else, the hash differs, or the push errors. A failed `CREATE FUNCTION` leaves nothing behind (the transaction rolls back); re-run the step 3 verify to confirm `new_fn=absent`.

**3. Post-migration verification (merge gate).** Run `commit_and_save_candidate.prod_verify.sql` again, plus the §2b integrity query.
- Expected *after*:
  - `latest_migrations` starts with `20261118000000`;
  - `m2q2c_recorded_times = 1`;
  - `new_fn = commit_analytics_quota_and_save_candidate(uuid,uuid,uuid,uuid,jsonb,numeric) definer=true config=search_path="" md5=e8d0fd11442066aa9adc883537e501b7 anon=false authenticated=false service_role=true`, where the md5 is the body measured on the local stack;
  - `owners` includes `commit_analytics_quota_and_save_candidate=postgres`;
  - **`owner_can_call = true,true`**;
  - `existing_fn_md5 = ac0d6545e8fcdde5102c6f9d396c9e07` (unchanged); `building_blocks`, `role_timeouts`, `ledger_columns` and `ledger_grants` identical to §2a;
  - `ledger_rows` ≥ 8;
  - integrity counts unchanged apart from live traffic.
- *Stop and roll back with `DROP FUNCTION` (no app calls it yet) if:* `owner_can_call` is not `true,true`; any grant differs; `existing_fn_md5` or `building_blocks` changed; or the md5 differs from the reviewed body.

**4. Push the implementation branch.** This auto-creates an SSO-protected Preview against production, which is compatible now that step 3 passed.
- Do not exercise the recruiter flow on the Preview: it is the production database plus live Gemini. Any Preview check is a paid production action and needs its own approval.

**5. GitHub CI.** Open the PR. The required checks "Database tests" and "Lint, Test & Build" must pass, along with the other workflows.
- *Stop if* anything is red. Do not rerun to green without diagnosis. "Database tests" includes the new late-commit test, which is hardened against runner timing.

**6. Merge approval.** The owner reviews and squash-merges. This deploys Production automatically.

**7. Production deployment.**
- Confirm the Vercel deployment is Ready and that the live bundle contains `quota_settlement_unknown`.
- Watch Sentry for `quota_commit_unknown` and `quota_commit_failed`.
- *Stop and use Vercel instant rollback if:* either message appears without a matching known fault. A burst right after the deploy means the function is missing or not callable; re-check step 3.

**8. Controlled smoke test.** Owner-approved: **one** paid Gemini call, test account `044c3afb…` on the recruiter plan, one candidate.
- Expect:
  - `/api/analyze` returns 200 with `serverSave: "saved"`;
  - no browser `/api/recruiter/save-analysis` call;
  - exactly one ledger row for the attempt, `committed/charged`;
  - the candidate is `done` under that attempt;
  - `usage_count` goes up by 1;
  - a reload or a second tab makes no new `/api/analyze` call.
- 30-minute watch: every `/api/analyze` returns 200 or an expected 4xx, with 0 `quota_commit_unknown`.
- The unknown and late-commit paths are **not** exercised in production. They are verified offline only.
- *Stop if* two ledger rows or two charges appear for one attempt, or if the result is missing with a `committed` row. In that case: Vercel rollback, keep every row as evidence, and open an incident. Never delete ledger rows.

---

## 6. GO / NO-GO

**Migration: GO, conditional.** Production configuration and migration safety were both verified read-only, and no compatibility blocker was found. The single function drift is outside this change and has no effective difference (§2c).

**This is GO for the migration only.** It is not production readiness of the release: the merge gate (step 3), CI, the deploy and the controlled smoke test (step 8) are all still ahead. Conditions:
1. the owner acknowledges that there are no platform backups (an optional local dump is recommended);
2. the migration is applied **before** the first push of the branch;
3. the step 3 gate passes, including `owner_can_call = true,true`.

**Owner actions required:**
- Approve step 2 (migration apply) explicitly. This preflight did not authorize it.
- Acknowledge the Free-plan backup gap, or take or arrange a backup first.
- Confirm or reject the "bounded idempotent replay after an unknown attempt" interpretation.
- Track as separate debt (no change here): the `get_default_monthly_analytics_limit()` fallback literal in production (20) differs from migration history (5). It has no effect while the `app_settings` row exists.
- Decide whether Preview should keep sharing production credentials. That is outside this release, but it means every future push yields a production-connected Preview with live Gemini.
