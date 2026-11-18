# M2-Q Phase 2C: Production Migration Apply

- Date: 2026-11-18
- Production project: `pgchcnmpuknbgyljdlyp` (cvFit.pro)
- Owner approval: **conditional GO for the production migration only.** Nothing was pushed, no PR was opened, nothing was merged or deployed, and no Gemini call was made.
- Approved HEAD: `e5460c1d3ac3b7f8ab919ee0688f57d8d6befdc9` (`fix/m2q-phase2c-atomic-settlement`)
- Migration: `20261118000000_commit_and_save_candidate_analysis.sql`, sha256 `2784ae9d7c53b2fd005adf2331a1a1e666c42b7aeb6bcc5154558ac1a8f35493`
- Method: the same as M2-D3 (`2026-11-16-m2d3-migration-apply.md`): `supabase db push --linked` from an isolated checkout. Not the SQL Editor, and no `--include-all` or `--force`.

## 1. Safety preflight

| Check | Result |
|---|---|
| Isolated checkout | detached worktree at `e5460c1` in the session scratchpad (not the main checkout, not the implementation worktree) |
| Working tree | clean (`git status --porcelain` empty). The graphify hook's auto-regenerated `GRAPH_REPORT.md` was restored before any CLI call |
| Linked project | `pgchcnmpuknbgyljdlyp` (`supabase link`; same ref as the main checkout) |
| Migration checksum | `2784ae9d…5493`, as reviewed |
| Local migrations / production history | 91 / 90, so exactly one is missing |
| prod_verify (exact file, sha256 `7061893b…d2ce`) re-run at about 09:41Z | **identical** to the recorded preflight (`2026-11-18-m2q-phase2c-release-preflight.md` §2a) on every row |
| Integrity baseline | `ledger_by_state committed/charged=8`, 0 live or expired reserved rows, 0 shape violations or duplicates, `candidates done=14`, 0 stale, 0 paid_result_lost, `usage_sum 42`, `ledger_fingerprint 05e71b22b29ac9f74c5fd1f2e88575dc`, `candidates_fingerprint 241e42da74f079b703f3ed3129f04bb5`, `migration_count 90` |

## 2. Backup

The project is on the Supabase Free plan, which has no platform backups, so I took a logical dump with the Supabase CLI (`supabase db dump --linked`).
- **Location:** outside the repository and outside any synced folder, at `~/cvfit-backups/2026-11-18-m2q2c-pre-migration/`.
- **Permissions:** directory `0700`, files `0600` (umask 077).
- **Never committed, uploaded or printed.** It contains personal data.

| File | Bytes | sha256 |
|---|---|---|
| `roles.sql` (`--role-only`) | 297 | `25873cec56a2cc6514e204f420231777f85c03da818caa7090cdcdfa89776ecd` |
| `schema.sql` | 190 289 | `46773462be40708ea4f46fa4bba3d83c74dc90f6a110ba7e1995aa74ae9e2e66` |
| `data.sql` (`--data-only --use-copy`) | 1 393 651 | `7019df7ce318af262b0dd3c0e4651fcd4f7091a10a4a9702fd55af3db3f41537` |

- Taken from **2026-11-18T09:42:48Z to 09:43:28Z**; 2.2 MB total.
- The checksums are also stored in `SHA256SUMS` inside the backup directory.

I inspected the files structurally only, by counting, never printing contents:
- `schema.sql` holds 20 `CREATE TABLE` and 67 function definitions, includes `commit_analytics_quota`, and does not include the new function (taken before the apply).
- `data.sql` holds 55 `COPY` blocks, with row counts **analytics_quota_reservations 8, candidate_cvs 14, profiles 37, recruitment_campaigns 5**. These match production.
- Both files end with the pg_dump completion footer.
- Known limit: the CLI data dump does not include `supabase_migrations.schema_migrations`. The history was recorded separately: 90 rows before the apply and 91 after.

## 3. Dry run

`supabase db push --linked --dry-run`:

```
DRY RUN: migrations will *not* be pushed to the database.
Would push these migrations:
 • 20261118000000_commit_and_save_candidate_analysis.sql
Finished supabase db push.
```

Exactly one pending migration, as required.

## 4. Apply

`supabase db push --linked`, run **09:43:55Z to 09:44:00Z**:

```
Applying migration 20261118000000_commit_and_save_candidate_analysis.sql...
Finished supabase db push.
```

After the apply, the scratch checkout was unlinked (`supabase/.temp` removed) and its worktree removed. The dry-run and apply logs are kept in the session scratchpad.

## 5. Post-migration verification

These checks used the same exact `prod_verify` file and the same integrity query, plus overload, ACL and history checks. All ran SELECT-only in the Dashboard SQL Editor.

| Requirement | Result |
|---|---|
| Migration history includes `20261118000000` exactly once | ✅ `m2q2c_recorded_times = 1`, name `commit_and_save_candidate_analysis`, `latest_migrations = 20261118000000,20261117000000,20261116000000`, `migration_count 90 → 91` |
| New RPC exists exactly once | ✅ `new_fn_overloads = 1`: `commit_analytics_quota_and_save_candidate(uuid,uuid,uuid,uuid,jsonb,numeric)` |
| Body md5 starts `e8d0fd11` | ✅ `e8d0fd11442066aa9adc883537e501b7` |
| SECURITY DEFINER, empty search_path | ✅ `definer=true config=search_path=""` |
| Executable only by service_role | ✅ `anon=false authenticated=false service_role=true`; ACL `postgres=X/postgres service_role=X/postgres` (no PUBLIC entry) |
| Owner and building-block access | ✅ owner `postgres`; **`owner_can_call = true,true`** |
| `existing_fn_md5` unchanged | ✅ `ac0d6545e8fcdde5102c6f9d396c9e07` (before = after) |
| Existing grants and bodies unchanged | ✅ `building_blocks` identical (4 md5s and service_role/authenticated flags); `ledger_grants` identical |
| Ledger shape unchanged | ✅ `ledger_columns 56207470…` identical |
| Role timeouts unchanged | ✅ identical (8 s statement and lock timeout) |

### Ledger and candidate integrity: before vs after

| Check | Before | After |
|---|---|---|
| ledger_by_state | committed/charged=8 | committed/charged=8 |
| ledger_rows | 8 | 8 |
| ledger_fingerprint (id, state, charged, forgiven, outcome) | `05e71b22…75dc` | `05e71b22…75dc` |
| reserved live / expired, shape violations, duplicate keys | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| candidates_by_status | done=14 | done=14 |
| candidates_fingerprint (id, status, score, attempt, result md5) | `241e42da…4bb5` | `241e42da…4bb5` |
| stale analyzing, done without result or score, paid_result_lost | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| usage_sum (profiles) | 42 | 42 |
| negative usage | 0 | 0 |

**No row changed.** The migration added exactly one function and one history row.

## 6. Current production state

- The deployed app (main `0b2410c`) does not call the new function, so it sits idle until the implementation is merged.
- Rollback while it is idle: `DROP FUNCTION public.commit_analytics_quota_and_save_candidate(uuid,uuid,uuid,uuid,jsonb,numeric);`. This is not needed: verification passed and the function is harmless when unused. Never drop it once any deployed build (Preview included) calls it.
- Ledger evidence was not touched and must never be reverted.

## 7. GO / NO-GO for pushing the implementation branch

**GO**, subject to separate owner approval for the push. Every post-migration assertion passed and production data is unchanged.

The production function a pushed Preview would call now exists. Preview and Production share the database and Gemini key, so a Preview is compatible, and any recruiter analysis run on it is a real, paid production action. Do not exercise the Preview without its own approval.

Remaining release steps (runbook §5, each separately approved): push the branch, PR CI (required "Database tests" and "Lint, Test & Build"), merge, which deploys Production, then the controlled smoke test.
