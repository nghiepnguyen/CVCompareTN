# M3-B OD-M2: shadow metrics retention and privacy

- **Date:** 2026-11-23
- **Branch:** `feat/m3b-odm2-fit-shadow-retention` (worktree `../cv-compare-tn-m3b-odm2`), cut from `origin/main` `90f050b` (PR #102, A3.3).
- **Status:** committed locally only. Nothing was pushed and no PR was opened.
- **Mode:** offline plus read-only production SQL that returns only counts, booleans and schema metadata.
  - 0 Gemini calls.
  - **No migration applied to production.**
  - No flag changed and no policy text published.
  - A3.4 not started.
- **Verdict: PASS WITH KNOWN DEBT** (§9).

## 1. Read-only preflight

| Check | Result |
|---|---|
| Latest main | `90f050b` (PR #102). CI, DB tests and Benchmark freeze all succeeded on `90f050b` |
| Production deployment | GitHub `Production` deployment for `90f050b` → `success` |
| FIT_SCORE flags | `vercel env ls`: **0** `FIT_*` variables in Production or Preview, so the code defaults (off) apply |
| `analysis_log` columns | `id, user_id, status, error_message, created_at, kind, input_tokens, output_tokens, total_tokens` (generated), `model, latency_ms, guard_metrics jsonb` |
| RLS | enabled. One policy, `admins_can_read_analysis_log` (SELECT, `is_admin()`). No INSERT/UPDATE/DELETE policy |
| Table grants | `anon` and `authenticated` hold **SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER** (Supabase default grants that the original `REVOKE … FROM PUBLIC` did not remove). See §6 F3 |
| Indexes | `(kind, created_at DESC, status)`, `(kind)`, `(created_at DESC)`, `(user_id)`, pkey |
| Triggers | **0** user triggers on `analysis_log` |
| pg_cron jobs | `purge-free-history` `0 20 * * *`, `purge-api-rate-limits` `10 20 * * *`, `storage-cleanup` `*/15 * * * *` (all active). Existing purge functions are `SECURITY DEFINER`, `search_path=""` |
| Latest migration | `20261120000000` |
| Column comment | the production comment ("Guard telemetry v1. Aggregate operational metrics only; …") differs from the repo's `20261029000000` text. It was set outside migrations; this migration makes the repo authoritative again |
| `fitShadow` rows | **0** |
| Dependencies on `analysis_log` | The hourly AI cap (`_server-lib/accountLock.ts:81-86`) counts rows by `user_id`, `kind` and `created_at` over 1 hour, plus the `coverLetter`, `applicationReview` and `followUp` keys. Admin report RPCs read aggregates only. Tokens and cost are separate columns. Quota and billing live in `analytics_quota_reservations` and the payment tables, not here |

### 1.1 Traffic estimate (counts only)

| Metric | Value |
|---|---|
| Successful analyses, last 7 / 30 / 90 days | 16 / 66 / 70 |
| … of which by admins (last 30 days) | 21 |
| … by non-admins (last 30 days) | **45** (6 distinct users) ≈ **1.5 a day** |
| Active days in the last 30 | 16. Busiest day: 14 |
| Table size | 338 rows, 256 KB |

**Implication for A3.4 (OD-O1):**
- The A3.2 §7 evidence bar is at least 200 eligible rows over at least 14 days. At about 1.5 real analyses a day, reaching 200 rows takes about **130 days**. Fourteen days yields only about 21 rows.
- A rolling 30-day purge means the table never holds more than about 45–66 shadow rows at once. The bar is unreachable with or without retention, but retention also means the raw rows can't be pooled later.
- **Recommendation:** use the counts-only snapshot procedure in §7.3 and amend OD-O1 before A3.4. For example, accept N ≈ 60–100 across several snapshots, or extend the window.

## 2. Migration

There are two files, following the repo convention that schedules live in a separate `*_pg_cron.sql` migration. The stub DB harness skips those files.

**`supabase/migrations/20261123000000_purge_expired_fit_shadow.sql`** (excerpt, comments trimmed):

```sql
CREATE OR REPLACE FUNCTION public.purge_expired_fit_shadow()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE n integer;
BEGIN
  UPDATE public.analysis_log
     SET guard_metrics = guard_metrics - 'fitShadow'
   WHERE guard_metrics ? 'fitShadow'
     AND created_at < now() - interval '30 days';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.purge_expired_fit_shadow() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_fit_shadow() TO service_role;
COMMENT ON FUNCTION … ;  -- purpose
COMMENT ON COLUMN public.analysis_log.guard_metrics IS
  'Guard telemetry v1. Aggregate operational metrics only; no CV, JD, rewrite content or PII. '
  'kind=analyze: {v:1, suggestionGuard, requirementVerification?, fitShadow?}; '
  'kind=rewrite: {v:1, fullCv | coverLetter | applicationReview | followUp}. '
  'fitShadow (fit-score-v1 shadow: numbers/enums only) is removed after 30 days by purge_expired_fit_shadow(). '
  'NULL means telemetry unavailable or not applicable. See docs/11_guard_metrics.md.';
```

**`supabase/migrations/20261123000001_purge_expired_fit_shadow_pg_cron.sql`:**

```sql
SELECT cron.schedule('purge-fit-shadow', '20 20 * * *', 'SELECT public.purge_expired_fit_shadow()');
```

**Design decisions:**
- **Expiry rule:** strictly older than 30 days. A row exactly 30 days old is kept until the next daily run.
- **Kind filter:** none. `fitShadow` is only written on analyze rows; if it ever appears elsewhere it expires the same way.
- **Rows are never deleted** and other keys are untouched. A row whose only key was `fitShadow` becomes `{}`, never `NULL`.
- **Daily at 03:20 ICT,** after the two existing purges. `cron.schedule` upserts by name, so a replay keeps one job.
- **No table, column, index or RLS change.** The existing `(created_at DESC)` index covers the scan.
- **One unbatched UPDATE.** It is fine at this volume; a code comment marks it as a shortcut to revisit.

**Other files:**
- `supabase/tests/purge_fit_shadow.test.sql`: CI suite, picked up automatically by `scripts/ci/db-tests.sh`.
- `supabase/tests/purge_fit_shadow.prod_verify.sql`: read-only post-apply check.
- `docs/11_guard_metrics.md`: the retention paragraph.

## 3. Offline verification (synthetic data only)

### 3.1 `purge_fit_shadow.test.sql`

| Case | Assertion |
|---|---|
| Ages 29 / exactly 30 / 31 / 400 days | 29 and 30 keep `fitShadow`; 31 and 400 lose it. `n = 2` |
| Other keys preserved | the 31-day row equals `{v, suggestionGuard, requirementVerification}` exactly |
| Row with only `fitShadow` | becomes `{}` |
| Rows without `fitShadow` (old analyze success; old error row with `[quota_settlement_unknown]`) | unchanged |
| Other kinds (rewrite `coverLetter`, rewrite `fullCv`, parse_cv `NULL`) | unchanged, so the document-cap markers survive |
| Billing, quota and security metadata | a fingerprint of every non-`fitShadow` field (id, user, status, kind, created_at, the three token columns, model, latency, error, other keys) is identical before and after. Row count is unchanged (9) |
| Permissions | `anon` and `authenticated` have no EXECUTE; `service_role` does. `prosecdef` holds and `proconfig = {search_path=""}` |
| RLS (as a signed-in non-admin, role set at top level like PostgREST) | SELECT sees 0 rows; UPDATE and DELETE affect 0 rows; the data is verified intact afterwards |
| Idempotency | a second run returns 0 |
| Cron | exactly one `purge-fit-shadow` job with the expected schedule and command; the three existing jobs are present; re-running `cron.schedule` keeps one job |

### 3.2 Mutation check

Each mutant was applied to the live local function, then the suite was run, then the real migration was restored. All 6 were killed:

| Mutant | Failing assertion |
|---|---|
| 29-day window | `expected 2 rows stripped (31d, 400d), got 3` |
| `<=` boundary | `expected 2 …, got 3` |
| EXECUTE granted to authenticated | `authenticated can purge` |
| DELETE rows instead | `31-day fitShadow kept` (the row is gone) |
| Wipe all of `guard_metrics` | `31-day fitShadow kept` |
| Restricted to the wrong kind | `expected 2 …, got 0` |

### 3.3 Full DB suite (the CI script, locally)

- Command: `scripts/ci/db-stack.sh` then `scripts/ci/db-tests.sh`, on a fresh Supabase stack (Postgres 17, ports moved to 5532x) with all migrations including the two new ones.
- Result: **33 suites, 0 failed, deadlocks 0**. This includes `sql:purge_fit_shadow`, `sql:purge_free_history`, `sql:account_lock`, `sql:admin_report_stats`, `sql:ledger_grants`, the quota/claim/m2q concurrency scripts, the stub harness and `schemaDrift`.
- The first run failed in the stub harness with `schema "cron" does not exist`. That led to splitting out the `_pg_cron` migration, which is the repo convention.

`prod_verify.sql`:
- On the local stack after apply, every check is `t` and `fit_shadow_rows = 0`.
- On production now (before apply): `fn_exists = false`, `job_count = 0`, `existing_jobs_intact = true`, `fit_shadow_rows = 0`.

**Harness note:** calling a function inside a PL/pgSQL `EXCEPTION` sub-block, after `SET LOCAL ROLE` was issued from inside the same `DO` block, segfaulted the local Postgres 17 backend (signal 11). The test now switches roles at top level. Reaching this needs a superuser `DO` block, so it is not reachable through PostgREST. It is not a production risk.

### 3.4 Rollback considerations

There is no down migration; the repo is forward-only. A rollback is a new forward migration:

```sql
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'purge-fit-shadow';  -- no-op if already gone
DROP FUNCTION IF EXISTS public.purge_expired_fit_shadow();
-- optionally restore the previous column comment
```

- `fitShadow` keys that have already been stripped **cannot be recovered**. That is intended, and pre-migration backups hold no `fitShadow` data anyway.
- Rolling back while `FIT_SCORE_SHADOW` is on would leave shadow rows unbounded. Turn the flag off first.

## 4. Privacy review

The current policy is `src/translations/legal.ts`, "Last updated: September 22, 2026".

| Topic | Current wording | Covered? |
|---|---|---|
| Aggregate scoring diagnostics | S2 Item 3 "Improving service quality and user experience"; S8 Item 4 "Technical logs and anonymous performance metrics" | **Partly.** It names no account-linked analysis telemetry, and the logs are *not* anonymous (`user_id` is kept) |
| Administrative access | nothing says admins can read analysis logs. S6 "no human reads it" refers only to Google account data | **No** |
| 30-day retention | S8 Item 4: "at most 90 days" | **Compatible** (30 ≤ 90), but see F1 |
| No raw CV/JD text in `fitShadow` | not stated for logs (stated only for GA4) | **No** |
| No effect on displayed scores | not stated | **No** (not strictly required, but it explains the purpose) |

### Findings

- **F1. Policy vs practice (pre-existing, broader than this work).** S8 promises "Technical logs … at most 90 days". Production holds **117 user-linked `analysis_log` rows older than 90 days**; the oldest is 2026-07-02. No retention exists for this table. Options for the owner, none implemented here:
  - **(a) Null `user_id` after 90 days.** This keeps admin aggregates and the 1-hour cap, and makes old rows pseudonymous. It is the closest fit to "avoid deleting rows".
  - **(b) Delete rows older than 90 days.**
  - **(c) Change the policy text** to match practice.
  - Recommendation: **(a)**, as its own migration and test, mirroring this one.
- **F2. "Anonymous" is inaccurate for analysis logs**, because they are linked to the account until the account is deleted (`ON DELETE SET NULL`).
- **F3. Table grants (defence in depth).** `anon` and `authenticated` hold INSERT, UPDATE, DELETE and TRUNCATE on `analysis_log`.
  - RLS blocks INSERT, UPDATE and DELETE today (no policies; verified in §3.1). TRUNCATE is not governed by RLS, though PostgREST does not expose it.
  - The hourly AI cap counts these rows. A future permissive policy could therefore let a user delete their own rows and evade the cap.
  - Recommendation: a separate hardening migration that revokes everything except SELECT from `anon` and `authenticated`, following the M2-Q H1 ledger-grants precedent (PR #93). It is not bundled here because it is outside OD-M2 and needs its own approval.

### Proposed wording (not applied, owner to approve)

Add one item to section 8. Optionally replace "anonymous" in the existing item.

- **EN (new S8 item):** "Analysis quality metrics: for each analysis we may record aggregate numbers only (for example a comparison score, counts of matched or missing requirements, and processing diagnostics). They never contain your CV or JD text, and they never change the score shown to you. Only our administrators can access them, and they are deleted after 30 days."
- **VI:** "Số liệu chất lượng phân tích: với mỗi lần phân tích, chúng tôi có thể ghi lại các con số tổng hợp (ví dụ điểm so sánh, số yêu cầu đạt hoặc còn thiếu, và thông số xử lý). Các số liệu này không chứa nội dung CV hay JD của bạn và không làm thay đổi điểm bạn nhìn thấy. Chỉ quản trị viên của chúng tôi truy cập được, và dữ liệu được xóa sau 30 ngày."
- **S8 Item 4 (if F1 is fixed by option a):**
  - EN: "Technical logs and performance metrics: linked to your account for at most 90 days, then kept only without your account identifier."
  - VI: "Nhật ký kỹ thuật và số liệu hiệu năng: gắn với tài khoản của bạn tối đa 90 ngày, sau đó chỉ được lưu mà không kèm định danh tài khoản."

**Is this a "material change" under S11?**
- In my assessment it is **not material**: it adds detail within existing purposes and a retention that is shorter than the promised one.
- It still needs `privacyLastUpdated` bumped, and the static pages regenerated by `npm run build`, since `generate-static-pages.ts` reads these translations.
- The owner decides. Nothing was edited.

## 5. Operational risks

| Risk | Level | Mitigation |
|---|---|---|
| The migration is applied to production when a Preview build or anything else first writes shadow rows | — | Preview shares the production DB. The migration must land **before** the flag is set anywhere |
| The cron job silently fails | low | `cron.job_run_details` records failures. `prod_verify` plus a periodic check of `count(*) WHERE guard_metrics ? 'fitShadow' AND created_at < now() - interval '31 days'` (should be 0) |
| Lock or bloat from the UPDATE | negligible | ≤ ~2 rows a day. Batch it only at much higher volume (code comment) |
| Free plan has no PITR | medium for any migration | Take a logical backup before apply (the M2-Q 2C procedure) |
| The OD-O1 evidence bar is unreachable | high for A3.4 | The §7.3 snapshot procedure and an OD-O1 amendment |
| The column comment changes in production | none | metadata only; it reverses existing drift |

## 6. Deployment procedure (owner, when approved)

1. Approve, push this branch and open a PR. Pushing triggers a Vercel Preview. Preview runs no migration and the flags stay off.
2. CI must be green: Database tests includes `purge_fit_shadow`.
3. From an **isolated, detached worktree at the PR head**:
   1. Take a logical backup of the production DB. Store it at mode 0700 with SHA256SUMS; it contains PII.
   2. Run `supabase db push --linked --dry-run`. It must list **exactly** `20261123000000` and `20261123000001`.
   3. Run `supabase db push --linked`. Never paste the SQL into the SQL Editor.
4. Run `supabase/tests/purge_fit_shadow.prod_verify.sql`. Every column must be `true` and `fit_shadow_rows` must be `0`.
5. Merge the PR. The app is unchanged (docs/SQL only), so the deployment is a no-op for runtime.
6. Only then may A3.4 set `FIT_SCORE_SHADOW=true`, under its own approval.

This change is DB-only, independent of any app deploy, and is a no-op today (0 `fitShadow` rows).

## 7. Rollback procedure and observation support

### 7.1 Rollback

See §3.4: a forward migration that unschedules and drops the function. Turn the flag off first.

### 7.2 Emergency stop without a migration

`SELECT cron.alter_job(jobid, active := false) FROM cron.job WHERE jobname = 'purge-fit-shadow';` pauses the purge only. While it is paused, shadow rows keep growing.

### 7.3 Counts-only snapshot (to live with 30-day retention)

An admin runs this weekly, or before rows age out, and pastes the result into the observation audit doc. It contains no `user_id` and no row-level data:

```sql
SELECT date_trunc('week', created_at)::date AS week,
       count(*) AS shadow_rows,
       count(*) FILTER (WHERE (guard_metrics->'fitShadow'->>'eligible')::boolean) AS eligible,
       count(*) FILTER (WHERE guard_metrics->'fitShadow'->>'bandCanonical' = guard_metrics->'fitShadow'->>'bandShadow') AS band_agree,
       percentile_disc(ARRAY[0.5,0.9]) WITHIN GROUP (ORDER BY (guard_metrics->'fitShadow'->>'absDiff')::int) AS absdiff_p50_p90,
       jsonb_object_agg_strict(coalesce(guard_metrics->'fitShadow'->>'reason','ok'), 1) AS reasons_seen
  FROM public.analysis_log
 WHERE kind = 'analyze' AND guard_metrics ? 'fitShadow'
 GROUP BY 1 ORDER BY 1;
```

Before A3.4, extend it to a band-agreement matrix (canonical × shadow band). It must stay aggregate-only.

## 8. A3.4 readiness

**Not ready.** Retention is now implemented and tested offline, but A3.4 still needs:
1. this migration applied to production and verified (§6);
2. a policy wording decision (§4), including whether to bump the date and notify users;
3. **an OD-O1 amendment**, because 200 rows is not reachable at about 1.5 real analyses a day (§1.1), plus adoption of the §7.3 snapshot procedure;
4. A3.4's own approval (environment, duration).

The owner should also decide F1 (the 90-day promise) and F3 (grants hardening), separately.

## 9. Verdict

**PASS WITH KNOWN DEBT.** The retention mechanism:
- removes only `fitShadow` after 30 days and never deletes a row;
- leaves every other key and column unchanged;
- runs as DEFINER with a fixed `search_path`, executable by `service_role` only;
- is idempotent and creates a single cron job;
- passes 6/6 mutants and the full DB suite (33/33).

Known debt: the OD-O1 conflict (§1.1), the pre-existing 90-day policy gap (F1), the inaccurate "anonymous" wording (F2), the table-grants hardening (F3), and the policy wording awaiting the owner.

---

## Tóm tắt (tiếng Việt)

- **Đã làm:**
  - Viết migration xóa riêng trường `fitShadow` sau 30 ngày. Không xóa dòng nào và không đổi các số liệu khác.
  - Hàm SECURITY DEFINER với search_path cố định, chỉ service_role được chạy, cron chạy hằng ngày lúc 03:20 giờ VN.
  - **Chưa áp dụng lên production.**
- **Kiểm tra (dữ liệu giả lập):**
  - Các mốc 29/30/31 ngày đều đúng. Chạy lại nhiều lần vẫn an toàn và không tạo cron trùng.
  - RLS chặn người dùng thường; dữ liệu quota, billing và cột token không đổi.
  - 6/6 bản đột biến bị phát hiện; toàn bộ 33 bộ test DB đạt.
- **Lưu lượng thực tế:** khoảng 1,5 lượt phân tích mỗi ngày từ người dùng thật. Ngưỡng 200 dòng của A3.4 cần khoảng 4 tháng, nên **cần sửa OD-O1** và chụp số liệu tổng hợp hằng tuần.
- **Phát hiện quyền riêng tư:**
  - Chính sách hứa lưu log kỹ thuật tối đa 90 ngày, nhưng có 117 dòng cũ hơn vẫn gắn tài khoản.
  - Chữ "ẩn danh" chưa chính xác.
  - Bảng `analysis_log` còn quyền ghi mặc định cho anon/authenticated (đã bị RLS chặn, nên thu hồi riêng).
  - Đề xuất câu chữ bổ sung cho mục 8, chưa sửa chính sách.
- **Kết luận: PASS WITH KNOWN DEBT.** A3.4 chưa sẵn sàng.
