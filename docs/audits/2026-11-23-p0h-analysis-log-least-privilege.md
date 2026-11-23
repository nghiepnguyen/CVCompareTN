# P0-H: `analysis_log` least-privilege hardening

- **Date:** 2026-11-23
- **Branch:** `fix/p0h-analysis-log-grants` (worktree `../cv-compare-tn-p0h`), from `origin/main` `8e8f120` (PR #103).
- **Status:** committed locally only. Not pushed, not merged, not applied.
- **Production:** read-only metadata queries only (privileges, ACLs, counts). No writes.
- **Not touched:** other tables, RLS, policies, default privileges, the quota and billing tables, flags. No Gemini calls.
- **Verdict: PASS WITH KNOWN DEBT** (§8).

## 1. Preflight (read-only)

| Item | Finding |
|---|---|
| Main / CI | `8e8f120`: CI, Push on main and DB tests all successful |
| Server | PostgreSQL 17.6 |
| `analysis_log` ACL | `{postgres=arwdDxtm, anon=arwdDxtm, authenticated=arwdDxtm, service_role=arwdDxtm}`. On PG 17, `arwdDxtm` is SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER and **MAINTAIN** (VACUUM, ANALYZE, REINDEX, LOCK TABLE) |
| PUBLIC | no privileges. Column-level ACLs: none |
| Role inheritance | `authenticator` and `postgres` are members of `anon`, `authenticated` and `service_role`. `service_role` and `postgres` bypass RLS |
| RLS | enabled. One policy, `admins_can_read_analysis_log` (SELECT, `is_admin()`). `is_admin()` is SECURITY DEFINER, owned by `postgres` |
| Functions referencing the table | DEFINER: `purge_expired_fit_shadow` (owner `postgres`). INVOKER: `admin_report_stats`, `admin_report_ops` |
| Triggers, views, publications, inbound FKs | none |
| Outbound FK | `user_id` → `auth.users` with `ON DELETE SET NULL` |
| Cron | `purge-fit-shadow` runs as `postgres` |
| Default privileges | `postgres` and `supabase_admin` grant `arwdDxtm` on new `public` tables to all three API roles. They can't change an existing table, but a dropped and re-created `analysis_log` would get those grants back |
| FK evidence | `supabase_auth_admin` (the account-deletion role) has **no** privilege on `analysis_log`, yet 28 production rows have `user_id = NULL`. The `SET NULL` action already runs as the table owner, without the deleter's grants |

### 1.1 Access map (every repo path)

| Path | Role | Needs |
|---|---|---|
| `_server-lib/analysisLog.ts:38`: insert one row per AI call (`return=minimal`) | `service_role` | INSERT |
| `_server-lib/accountLock.ts:80-86`: hourly and document AI cap head count | `service_role` | SELECT |
| `src/services/adminReportService.ts:140` → `admin_report_stats` / `admin_report_ops` (INVOKER) | `authenticated` + RLS `is_admin()` | SELECT |
| `purge_expired_fit_shadow()` (DEFINER) and the `purge-fit-shadow` cron | `postgres` (owner) | UPDATE as owner (unchanged) |
| Account deletion FK `SET NULL` | runs as owner | none for API roles |
| `src/__tests__/db/m3bR0ScoreIntegrity.db.test.ts:83` (CI only) | `service_role` | SELECT |
| SQL test fixtures (`admin_report_stats`, `admin_phase2`, `purge_fit_shadow`) | `postgres` | owner (unchanged) |

No code anywhere updates, deletes or truncates `analysis_log` through an API role, and the browser never queries it directly.

**Decision on `service_role` UPDATE, DELETE and the rest:** revoked. Nothing uses them; the FK action and the purge run as the owner. This follows the M2-Q H1 precedent. If you want manual operations with the service key, add back `UPDATE` and `DELETE` only. A future P1 unlink job should be an owner-run DEFINER function in any case.

## 2. Before and after privilege matrix

| Role | SELECT | INSERT | UPDATE | DELETE | TRUNCATE | REFERENCES | TRIGGER | MAINTAIN |
|---|---|---|---|---|---|---|---|---|
| anon, before | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| **anon, after** | – | – | – | – | – | – | – | – |
| authenticated, before | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| **authenticated, after** | ✔ (RLS: admin only) | – | – | – | – | – | – | – |
| service_role, before | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| **service_role, after** | ✔ | ✔ | – | – | – | – | – | – |
| postgres (owner) | unchanged: all |
| PUBLIC | none, before and after |

ACL after the migration: `{postgres=arwdDxtm/postgres,authenticated=r/postgres,service_role=ar/postgres}`. This was verified on the local stack.

## 3. Migration

**`supabase/migrations/20261123100000_analysis_log_least_privilege.sql`** (header comment omitted):

```sql
BEGIN;
REVOKE ALL ON public.analysis_log FROM anon, authenticated, service_role;
GRANT SELECT ON public.analysis_log TO authenticated;
GRANT SELECT, INSERT ON public.analysis_log TO service_role;
COMMIT;
```

**Why it is written this way:**
- **`REVOKE ALL`** rather than a list: it removes TRUNCATE and also MAINTAIN, without naming MAINTAIN. That keyword is missing on PG 16, which the stub CI harness runs. The header names TRUNCATE explicitly.
- **One transaction:** `service_role` never loses INSERT, not even for an instant. `logAnalysisAttempt` swallows insert errors, so a gap would silently drop log rows and let the hourly cap fail open.
- **Idempotent:** replayed twice locally, the ACL is identical.
- **`postgres` is never revoked**, so the owner-run purge and the FK action keep working.

**Rollback:** `supabase/rollback/20261123100000_analysis_log_least_privilege.sql` runs `GRANT ALL … TO anon, authenticated, service_role`, which restores exactly `arwdDxtm`. Apply it as a new forward migration. It reopens the hole, so use it only if a legitimate workflow broke.

## 4. Tests (local disposable stack, synthetic rows)

**`supabase/tests/analysis_log_grants.test.sql`** (picked up by `scripts/ci/db-tests.sh`):

| Block | Asserts |
|---|---|
| Matrix | 3 roles × 8 privileges are exactly as in §2; PUBLIC has none; exact ACL string; RLS on; 1 policy |
| anon | SELECT, INSERT, UPDATE, DELETE, TRUNCATE and `LOCK TABLE` (MAINTAIN) each raise 42501 |
| Non-admin `authenticated` | SELECT returns 0 rows (RLS); INSERT, UPDATE, DELETE, TRUNCATE and LOCK each raise 42501 |
| Admin via `authenticated` + `is_admin()` | direct SELECT sees all 3 fixture rows; `admin_report_stats` (`total_success = 1`) and `admin_report_ops` return data |
| `service_role` | INSERT with exactly the `analysisLog.ts` columns; hourly-cap count = 2; document-cap `coverLetter`/`applicationReview`/`followUp` count = 1; UPDATE, DELETE and TRUNCATE raise 42501; the purge called as `service_role` strips 1 row |
| Owner side | purge result persisted; `purge-fit-shadow` job active as `postgres`; deleting the `auth.users` row unlinks all 3 log rows (FK `SET NULL`) |

**`purge_fit_shadow.test.sql`:** its non-admin UPDATE and DELETE checks now accept either outcome, 0 rows (RLS) or 42501. The new suite pins which one applies.

**Results**

| Run | Result |
|---|---|
| New suite after migration | pass |
| Replay the migration twice, then the suite | pass; ACL identical |
| `analysis_log_grants.prod_verify.sql` locally | all 11 columns `t` |
| Full `scripts/ci/db-tests.sh` (fresh reset) | **34 suites, 0 failed, deadlocks 0**. Includes `admin_report_stats`, `admin_phase2`, `account_lock`, `purge_fit_shadow`, the stub harness (PG 16 applies the migration cleanly), the concurrency scripts and vitest db |

**Mutation checks:** 9/9 killed by the full suite.

| Mutant | Failing assertion |
|---|---|
| No migration (rollback state) | `anon SELECT: expected f, got t` |
| authenticated keeps TRUNCATE | `authenticated TRUNCATE: expected f, got t` |
| anon keeps SELECT | `anon SELECT: …` |
| Explicit list without MAINTAIN | `anon MAINTAIN: expected f, got t` |
| authenticated SELECT revoked | `authenticated SELECT: expected t, got f` |
| service_role INSERT revoked | `service_role INSERT: expected t, got f` |
| service_role SELECT revoked | `service_role SELECT: …` |
| service_role keeps DELETE | `service_role DELETE: expected f, got t` |
| `postgres` included in the REVOKE | `unexpected ACL …` |

I also ran the behavioural blocks alone, with the matrix removed:
- They independently kill the MAINTAIN, admin-SELECT, `service_role` INSERT/SELECT/DELETE and `postgres` mutants.
- The "anon still has privileges" mutants crash the local backend instead of failing cleanly (§7, F-CRASH). That is still a failure, but a noisy one. In CI the matrix block runs first and fails cleanly before any behavioural block.

## 5. Blast radius

| Surface | Effect |
|---|---|
| API (PostgREST/GraphQL) as anon | loses all access to a table it never needed. No anon code path exists |
| Signed-in users | no change: they already saw 0 rows and could not write (RLS) |
| Admin Report tab | unchanged (SELECT kept, RLS unchanged); covered by the test |
| Analyze / rewrite / parse_cv logging, hourly and document caps | unchanged (`service_role` keeps SELECT and INSERT); covered by the test |
| fitShadow purge and cron, account deletion | unchanged (owner); covered by the test |
| Other tables, RLS, policies, quota, billing | untouched |
| App code | none. No deploy needed; the change is DB-only |
| Preview | shares the production DB, so applying the migration covers Preview too |
| Silent failure to watch for | `service_role` losing INSERT would only show up as missing log rows. After apply, check that a new row appears after the next real analysis (read-only) |

## 6. Production verification (after an approved apply)

`supabase/tests/analysis_log_grants.prod_verify.sql` is read-only. Expected values:
- `acl_exact = true`;
- `anon_ok`, `authenticated_ok`, `service_role_ok`, `public_no_truncate`, `no_column_grants_ok`, `rls_still_on_ok`, `policy_unchanged_ok`, `purge_job_ok` and `purge_exec_ok` all `true`.

Before apply, `acl` shows the four `arwdDxtm` entries and the role checks show `false`.

**Apply procedure:** the OD-M2 method, owner-approved.
1. Take a logical backup.
2. From a detached worktree at the merge commit, run `supabase db push --linked --dry-run`. It must list exactly `20261123100000`.
3. Run `supabase db push --linked`.
4. Run `prod_verify`.
5. Run the functional write check, `supabase/tests/analysis_log_grants.prod_write_check.sql` (`supabase db query --linked` or the SQL Editor):
   - What it does: as `service_role`, inside `BEGIN … ROLLBACK`, it inserts one synthetic row with exactly the `analysisLog.ts` columns, then runs the hourly-cap read.
   - Why it's safe:
     - `user_id` is NULL, so there is no FK lookup and the row is never counted by a per-user cap.
     - No SECURITY DEFINER call is made, so it avoids F-CRASH.
     - No Gemini call is made and no quota is used.
     - Nothing is committed.
   - Expected output: `inserted = 1`, `cap_query_ok = t`, `leftover = 0`.
   - Validated locally after the migration (pass), and with INSERT revoked (`permission denied for table analysis_log`). On a failure, apply the rollback migration and stop.
6. Optionally, confirm a real log row appears after the next organic analysis (read-only).

## 7. Known debt and findings

- **Other tables.** The same default-ACL pattern remains on 9 other `public` tables: `admin_audit_log`, `app_settings`, `candidate_cvs`, `history`, `payments`, `profiles`, `recruitment_campaigns`, `saved_cvs` and `saved_jds`. `admin_audit_log` and `payments` come first. Out of scope here.
- **Default privileges.** These still give new `public` tables `arwdDxtm` for the API roles, and re-creating `analysis_log` would undo this hardening. Changing them is a separate, platform-wide decision.
- **F-CRASH (pre-existing, local Supabase PG 17 image, not caused by P0-H).** In a transaction or session where the role is set to `anon`, a statement calls a SECURITY DEFINER function with its own `SET search_path`. If a later statement in the same transaction then raises an error, the backend crashes with signal 11, and the postmaster restarts every connection.
  - Reproduced the same way under pre-P0-H grants.
  - It did **not** reproduce for:
    - one statement containing both the call and the error;
    - the non-admin `admin_report_stats` RPC;
    - `authenticated` or `service_role`;
    - a custom `LANGUAGE sql` DEFINER function without `SET`.
  - Not exercised on production, deliberately.
  - PostgREST sends a request's query as a single statement, so reachability from the API looks low. But a crash takes down every connection.
  - **Recommendation:** reproduce on a disposable Supabase branch or project, never production. Then report it to Supabase, or check whether a pre-request hook or any multi-statement path exists.
  - Tests here are written to avoid that pattern.
- `purge_fit_shadow.test.sql` was edited to accept privilege denial. It is a test-only change.

## 8. Verdict

**PASS WITH KNOWN DEBT.**
- `anon` loses everything.
- `authenticated` keeps only SELECT, still admin-only through RLS.
- `service_role` keeps only SELECT and INSERT.
- TRUNCATE, TRIGGER, REFERENCES and MAINTAIN are removed from all three API roles.
- Every legitimate workflow is tested and passes: logging, both caps, the admin RPCs, the purge and cron, and FK unlinking. 9/9 mutants are killed and the full DB suite passes 34/34.

The debt is the other 9 tables, the default privileges, and the pre-existing F-CRASH to investigate off-production.

Next steps, each needing owner approval: push and open a PR, then apply the migration, then run `prod_verify`.
