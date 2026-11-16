# M2-D3 production preflight (read-only)

| | |
|---|---|
| Date | 2026-11-16 |
| Production project | `pgchcnmpuknbgyljdlyp` (cvFit.pro) |
| Baseline | `e05622a` |
| Implementation | `a63bba4`, branch `fix/m2d3-stale-analysis-recovery` |
| Owner decisions | D1 approved (re-analysis only after explicit confirmation of the extra quota charge); D2 deferred; D3 approved; D4 approved |

**Method**
- **Where it ran:** the Supabase Dashboard SQL Editor (signed-in session, built-in browser). No `supabase --linked` was used.
- **What ran:** one statement only: `supabase/tests/candidate_analysis_ownership.preflight.sql`, sha256 `481a28736f3447057eb1f418e53455c67404966576d6722052f4b388ebbd3201`, 6710 chars. The editor contents were checked byte-identical to the file before Run.
- **Read-only audit:**
  - The file is a single `SELECT … UNION ALL …` over catalogs, `information_schema` and aggregate counts.
  - It contains no DML, DDL, GRANT, `SET`, `DO`, or sequence/volatile side-effect functions.
  - The only "UPDATE" in the file is a string literal inside `has_table_privilege(...)`.
- **No personal data:** output is counts, object names and md5 values only. No candidate rows were read.
- **Baseline for comparison:** the same file run on an isolated local replay of `origin/main` migrations (89, Postgres 17.6).
- **Side effect:** the Dashboard autosaved the editor tab as a private "Untitled query" snippet. That is Dashboard metadata, not database state. It was left in place; deleting it is up to the owner.

## Results

| # | Check | Expected (§9 of the report / local replay) | Production | Result |
|---|---|---|---|---|
| 1 | latest_migrations | `20261116000000,20261105000000,20261104000000` | same | PASS |
| 2 | migration_count | 89 | 89 | PASS |
| 3 | m2c2_ledger_recorded | true | true | PASS |
| 4 | m2d3_not_recorded | true | true | PASS |
| 5 | new_columns_absent | true | true | PASS |
| 6 | new_functions_absent | true | true | PASS |
| 7 | save_overloads | 5-arg only (4-arg optional), md5 `9f1d2bfc…bc08` | 5-arg only, `9f1d2bfca123566a83f11465a289bc08` | PASS (the 4-arg v1 is already gone) |
| 8 | dep_md5_sync_campaign_counters | `cfb9ead49ab85fd1eb0eb73fb3a44868` | same | PASS |
| 9 | dep_md5_storage_protect_metadata | `5c096882ca8e876c21dd6bcc2d6deb75` | same | PASS |
| 10 | dep_md5_enforce_account_unlocked | `d11dba1acf7bcfb6a57f004f0d7d1a69` | same | PASS |
| 11 | dep_md5_reserve_analytics_quota | `f5603d1c7335ab638086b0d54fb06ad4` | same | PASS |
| 12 | candidate_triggers | `account_unlocked, enforce_plan_caps, storage_candidate_delete_pending, storage_candidate_deleted, storage_candidate_protect` | same | PASS |
| 13 | candidate_rls_policies | `account_unlocked_read:r, candidates_delete_own:d, candidates_insert_own:a, candidates_select_own:r, candidates_update_own:w` | same | PASS |
| 14 | authenticated_update_candidate_cvs | true (the fenced release goes through RLS) | true | PASS |
| 15 | candidate_status_counts | recorded | `done=11` | PASS (info) |
| 16 | analyzing_rows_age_buckets | recorded (the D4 legacy cohort) | NULL, meaning 0 rows | PASS (D4 cohort is empty) |
| 17 | ledger_rows | recorded | 5 | PASS (info) |
| 18 | ledger_key_unique | true | true | PASS |
| 19 | default_acl_functions | anon, authenticated and service_role get EXECUTE by default; the migration revokes explicitly | same as local | PASS |
| 20 | error_rows_age_buckets | recorded (the D3 legacy cohort) | NULL, meaning 0 rows | PASS (D3 cohort is empty) |
| 21 | candidate_storage_status_counts | recorded | `ready=11` | PASS (info) |
| 22 | candidate_columns_used | the 12 columns the functions touch, with these types and nullability | identical to local | PASS |
| 23 | candidate_columns_md5 (whole table, including defaults) | `d361d248d142c7631326515ebfc2d7fd` | same | PASS (no drift) |
| 24 | candidate_constraints | FK campaign → cascade; status CHECK of `pending/analyzing/done/error`; storage CHECKs | identical | PASS |
| 25 | candidate_indexes | `candidate_cvs_pkey, candidates_campaign_hr_status_idx, candidates_campaign_score_idx, candidates_campaign_status_idx` | same | PASS |
| 26 | campaign_owner_column | `user_id:uuid:NO` | same | PASS |
| 27 | orphan_candidates | 0 | 0 | PASS |
| 28 | ledger_columns_used | `charged:boolean:NO, expires_at:timestamptz:NO, request_key:uuid:NO, state:text:NO, user_id:uuid:NO` | same | PASS |
| 29 | ledger_constraints | `forgiven_shape`, `outcome_check`, pkey, `settled_shape`, `state_check` (reserved/committed/refunded/uncertain), `user_id` FK, `user_key_unique` | identical | PASS |
| 30 | ledger_indexes | pkey, `user_cycle_state_idx`, `user_key_unique` | same | PASS |
| 31 | ledger_state_counts | recorded | `committed=5` | PASS (info) |
| 32 | ledger_rls_on | true | true | PASS |
| 33 | dep_signatures | `auth.role(), auth.uid(), enforce_account_unlocked(), reserve_analytics_quota(uuid,uuid,integer), storage_protect_metadata(), sync_campaign_counters(uuid)` | same | PASS |
| 34 | pg_version | 17.6 | 17.6 | PASS |

The query itself ran without errors or permission problems.

## Schema drift

**None found.** Against the local replay of the same 89 migrations, the following all match byte for byte (md5):
- the `candidate_cvs` column set, types, nullability and defaults;
- its constraints, indexes, triggers and RLS policies;
- the ledger columns, constraints and indexes;
- the 4 dependency function bodies;
- the 5-arg save.

The only differences are row counts, which are data, not schema.

## Migration compatibility verdict

**COMPATIBLE.**
- **Version set:** production = branch minus `20261117000000`, so the push would carry only that file.
- **No name collisions:** none of the new column or function names exist.
- **No overload ambiguity:** there is exactly one `save_candidate_analysis` (the 5-arg), so adding `save_candidate_analysis_attempt` under a new name cannot create a PostgREST overload conflict.
- **Dependencies match:** every column, constraint, trigger, policy and function the new functions rely on exists with the tested definition.
- **Lock impact:** `ADD COLUMN` of two nullable columns with no default is metadata-only, taking a brief ACCESS EXCLUSIVE lock on an 11-row table.
- **Default ACL:** it is as assumed, so the migration's explicit REVOKEs are needed and sufficient.

## Billing safety implications

- **No legacy cohort.**
  - There are **0** `analyzing` rows and **0** `error` rows in production.
  - The legacy cases D3 (`error` rows without an attempt id, auto-retry) and D4 (`analyzing` rows without an attempt id, confirmation required) have no rows today.
  - So report §7.4 (a legacy `error` row from a lost response being charged again once) currently has **no exposure**.
- **The ledger has 5 rows, all `committed`.**
  - None of them can be referenced by a candidate attempt yet: the column does not exist.
  - The "no ledger row = never dispatched" rule starts from a clean state.
  - The M2-Q Q-1 retention constraint (report §7.6) still applies once M2-D3 is live.
- **The 11 `done` rows are unaffected.** Claim returns `done` for them, and the fenced save never overwrites a `done` row under another attempt.
- **Residual risks unchanged:**
  - §7.1: a confirmed re-analysis is charged. This is D1, approved.
  - §7.2: a same-tab unsaved result racing a confirmed re-run.
  - §7.3: a request still in transit after the client errored.
  - §7.5: mixed app versions during rollout.
  - §7.8: unbounded waits.
  The preflight does not change any of these.

## Verdict

- **Preflight: PASS.** 34 of 34 checks pass, no drift, no errors.
- **Pushing M2-D3 to a draft PR: GO.** This needs only a push of `fix/m2d3-stale-analysis-recovery` and a draft PR, so CI runs. Pushing the branch also creates an automatic Vercel *preview* deploy. It does not touch production or the database.
- **Migration apply and production release: NOT approved by this step.** They need separate approval and must follow report §11:
  1. dry-run from a clean checkout at the approved commit;
  2. `db push`;
  3. re-verify;
  4. wait 15 minutes;
  5. merge;
  6. smoke test.
