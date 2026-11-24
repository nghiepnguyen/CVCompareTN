# P1 Option B — 12-month analysis_log retention (scrub at 90 days, delete at 400)

- Date: 2026-11-24
- Branch: `docs/p1-privacy-prep` (local commits only; no push, no PR, no merge, no deploy)
- SQL: `supabase/proposed/p1-log-retention/`. These files are outside `supabase/migrations`, so neither CI nor `db push` applies them.
- Replaces option A in that folder. A is recoverable from commit `e32afcc` if counsel says the 12-month rule does not apply.
- Legal basis and open gates: `2026-11-24-p1-legal-verification-release-gate.md`. The **legal gate stays open**; this document does not close it.

**Verdict: NO-GO for production.** The engineering is ready for review. No production write or deletion was made, no policy was published, there were no Gemini calls and no VM was used. Production was touched by read-only `BEGIN READ ONLY` count queries only.

> **400-day retention of `analysis_log` does not by itself satisfy Vietnamese law.**
> - If Decree 333/2026 Art. 16.6 applies, the log it describes (login and logout time, IP, source port) is not in `analysis_log` at all (§7).
> - Data localization (Decree 333 Art. 19.2) and the cross-border transfer dossier (Law 91 Art. 20) are separate open items (G9).

## 1. Schema and dependency audit

### 1.1 Columns, by migration

| Column | Source migration | Content | Option B |
|---|---|---|---|
| `id` | `20260703030000` | uuid | keep 400 d |
| `user_id` | `20260703030000` | FK `auth.users` `ON DELETE SET NULL` | keep 400 d (becomes NULL when the account is deleted) |
| `status` | `20260703030000` | `success` / `error` | keep 400 d |
| `created_at` | `20260703030000` | timestamptz | keep 400 d |
| `kind` | `20260704000000` | `analyze` / `parse_cv` / `rewrite` | keep 400 d |
| `input_tokens`, `output_tokens`, `total_tokens` (generated) | `20260704000000` | integers | keep 400 d |
| `model`, `latency_ms` | `20261028000000` | model id, integer | keep 400 d |
| `error_message` | `20260703030000` | categorical codes such as `[upstream_timeout]` for current writers, plus a few plain sentences (`Monthly analysis limit exceeded`, `Batch size N exceeds plan limit (M)`). Rows written before the categorical change may hold freer text. | **cleared after 90 d** |
| `guard_metrics` | `20261029000000` | aggregate telemetry jsonb, including the document-type markers `coverLetter` / `applicationReview` / `followUp` and `fitShadow` (stripped after 30 d by OD-M2) | **cleared after 90 d** |

The table holds **no CV, JD or rewrite content**; those live in `history`. History retention does not change, and test block 1 checks that a 500-day-old `history` row survives.

### 1.2 Readers and writers (exhaustive)

- **Writer:** only `logAnalysisAttempt`, at `_server-lib/analysisLog.ts:16`. Its 30 call sites are in the analyze, parse-cv and rewrite handlers.
- **App reader:** `checkHourlyAiLimit`, at `_server-lib/accountLock.ts:71-96`.
  - It counts rows per user and kind in a **1-hour** window.
  - The shared document cap filters on the `guard_metrics` markers, also within 1 hour.
  - A scrub at 90 days cannot affect it. Test block 1 checks that the 5-minute-old document row is unchanged.
- **SQL readers** (the dependency guard in test block 1 asserts this exact set):
  - `admin_report_stats` reads `created_at`, `kind`, `status`, `user_id`, tokens and `model`;
  - `admin_report_ops` reads `latency_ms`, plus `error_message` for the error categories;
  - `purge_expired_fit_shadow` reads `guard_metrics`;
  - the new `scrub_expired_analysis_log_detail` and `purge_expired_analysis_log`.
- **Structure:** no inbound FK, no view and no trigger on the table.
- **Grants:** the ACL stays as P0-H left it, `{postgres=arwdDxtm, authenticated=r, service_role=ar}`. Both stages run as SECURITY DEFINER owned by postgres.
- **Not readers:** quota and billing (`analytics_quota_reservations`, `payments`, `profiles.usage_count`), account deletion (`_server-lib/admin/deleteUser.ts` relies on the FK's `SET NULL`) and the `fitShadow` 30-day job.

### 1.3 Production snapshot (read-only, 2026-11-24 00:31 UTC, counts only)

- **Rows:** 344 in total; the oldest is from 2026-07-02.
- **Older than 90 days:** 117 rows. **0 of them have `error_message` or `guard_metrics` set**, so the first scrub would change 0 rows today. Rows written from August onward start reaching 90 days soon; re-run the preflight right before applying.
- **Older than 400 days:** 0 rows. The first row reaches 400 days around **2027-08-06**.
- **Plain-sentence `error_message` values:** 6 rows (all newer than 90 days).

## 2. Minimum fields for auditability

The audit question is who did what, when, and with what outcome. Law 116 Art. 2.11 defines a system log the same way: time, user, activity, status.

- **Minimal record:** `id`, `user_id`, `created_at`, `kind`, `status`.
- **Kept for operations** (numbers and enums, no content): `input_tokens`, `output_tokens`, `model`, `latency_ms`. The admin cost and latency report depends on them, so the privacy draft discloses them by name (§6).
- **Removed after 90 days:** `error_message` (free text, so least predictable) and `guard_metrics` (telemetry).
- **Lost after 90 days:** the document subtype (cover letter, review or follow-up). The row stays `kind = 'rewrite'`. No reader needs the subtype beyond the 1-hour cap.
- **Not fixed here:** this record has no IP and no login or logout data. Whether it is the Decree 333 Art. 16.6 log at all is counsel question Q3.

## 3. Design (`01_purge_expired_analysis_log.sql`)

| Object | What it does |
|---|---|
| `app_settings` seeds | `analysis_log_detail_retention_days = 90`, `analysis_log_retention_days = 400` (`ON CONFLICT DO NOTHING`) |
| `analysis_log_retention_cutoffs()` | Private helper (INVOKER, `search_path=''`; EXECUTE revoked from PUBLIC, anon, authenticated and service_role). Validates **both** settings together: each must be a JSON integer; rows in **[366, 3650]**; detail in **[90, row days]**. Otherwise it raises `22023`. Returns `(detail_cutoff, row_cutoff)`. |
| `scrub_expired_analysis_log_detail()` | SECURITY DEFINER, service_role only. `UPDATE … SET error_message = NULL, guard_metrics = NULL WHERE created_at < detail_cutoff AND (either is not null)`. Returns rows changed. |
| `purge_expired_analysis_log()` | SECURITY DEFINER, service_role only. `DELETE … WHERE created_at < row_cutoff`. Returns rows deleted. |
| `DROP FUNCTION IF EXISTS analysis_log_retention_cutoff()` | Removes option A's helper if a stack still has it |
| `02_scrub_analysis_log_detail_pg_cron.sql` | Job `scrub-analysis-log-detail`, `30 20 * * *` (03:30 Vietnam time, after `purge-fit-shadow` at 20:20) |
| `04_purge_expired_analysis_log_pg_cron.sql` | Job `purge-analysis-log`, `40 20 * * *`. **A separate file, so row deletion gets its own production approval.** Without it rows are never deleted. |
| `03_optional_daily_rollup.sql` | Optional. Before deleting, counts rows past 400 days into a daily aggregate with no user identifier. Now uses `row_cutoff`. |

**Fail-safe properties:**
- Periods are never taken from a function argument.
- One invalid setting stops **both** stages.
- Row retention cannot go below 366 days (12 months across a leap day) without a migration.
- Detail retention can never exceed row retention.
- The admin RPC `admin_update_app_setting` rejects both keys; tested even with an admin caller.
- **Emergency stop:** set either key to an invalid value with a direct SQL write; both stages then raise and change nothing.

## 4. Tests (`purge_expired_analysis_log.test.sql`, disposable local stack only)

The stack was started fresh from `supabase/migrations` (`scripts/ci/db-stack.sh`, project `cvfit_p1`, ports 5532x). Then 01, 02 and 04 were applied and the test run. It was stopped afterwards.

**Seed:** synthetic rows aged 31 (fitShadow), 89, 90, 91 (fitShadow), 120 (error), 120 (already minimal), 200 (unlinked), 399, 400, 401 days and 5 minutes.

| Block | Proves |
|---|---|
| 1 | Seeds are 90/400; option A's helper is gone; both stages are DEFINER with a fixed `search_path` and service_role only; the helper is private; the admin RPC rejects both keys. **Boundaries:** scrub changes exactly 6 rows; the **89- and 90-day rows keep detail, the 91-day row loses it**; minimal fields are unchanged on every row (md5 fingerprint); the recent document row and the 31-day fitShadow row are untouched; a second run changes 0. **Purge** deletes 1 row: **399 and 400 kept, 401 deleted**; a second run deletes 0. **Billing and quota:** ledger, `usage_count`, payments, history, audit log and settings unchanged. Each P1 cron job is either absent or defined exactly as in its file (02 and 04 are separate approvals), and the 4 existing jobs are intact; P0-H ACL unchanged; the dependency set is exact; no FK, view or trigger. Both stages callable as service_role. |
| 2a | Invalid row retention: `365`, `90`, `0`, `-5`, `3651`, `400.5`, `"400"`, `null`, `{}`. Invalid detail retention: `89`, `0`, `401` (above rows), `90.5`, `"90"`, `null`, `[]`. Either key missing. Every case: **both** stages raise and the full-row fingerprint is unchanged. |
| 2b | Detail 150 scrubs 4 rows and leaves the 120-day row; rows at 366 with detail at 366 scrub 3 and delete 3 (399/400/401); rows at 3650 delete 0. |
| 3a / 3b | fitShadow purge and scrub in both orders give the same end state: the 31-day row ends as `{"v":1}` and the 91-day row as `NULL`. |
| 4a / 4b | Account deletion before the stages: rows are unlinked (`SET NULL`) and counts are the same. Stages before account deletion: the deletion still succeeds and the profile is removed. |
| 5 | **Admin reports**, called as an admin through RLS. The scrub leaves `admin_report_stats` identical and latency p50/p95 identical. Only error categories older than 90 days disappear; the 90-day one remains. The purge removes only the 401-day rewrite row from token totals (−50/−5); analyze totals are unchanged. |

**Results:**
- **Test:** PASS on the base variant and with 03 (rollup).
- **Test passes in all three apply states:** 01 only; 01 and 02; 01, 02 and 04.
- **Mutation testing: 25/25 mutants killed.**
  - Base (21): `<` changed to `<=` in each stage; floors lowered (365, 89); the detail ≤ rows check dropped; each column left uncleared; `model` cleared; each stage given the other's cutoff; each JSON type check dropped; EXECUTE granted to authenticated; helper granted to service_role; the "has detail" filter dropped; changed seeds; each cron schedule or command changed (re-run after the cron assertions were made conditional).
  - Rollup (4): non-additive merge; detail cutoff used; extra grant; tokens dropped.
- **Existing DB suite** (`scripts/ci/db-tests.sh`) with P1-B and rollup applied: **34 suites, 0 failed**.

**Not tested:**
- a real pg_cron firing (the jobs' definitions are asserted, not their execution);
- production data shapes beyond the read-only counts.

## 5. Do the admin reporting functions need changes?

**No SQL change is required.**

- `admin_report_stats` uses only minimal and operational fields, so its output is unchanged for 400 days (test block 5).
- `admin_report_ops` keeps latency. Its `error_categories` will be empty for any part of a range older than 90 days.
- Past 400 days, both report zero, unless the optional 03 rollup is adopted (the report would then need a new read path, not proposed).

**UI:** one notice line under the custom-range date inputs at `src/components/views/AdminReportTab.tsx:287` and `:299`. This is not implemented and needs its own small PR:
- VI: "Số liệu tổng hợp được lưu 400 ngày; nội dung chi tiết của lỗi chỉ lưu 90 ngày. Khoảng thời gian cũ hơn sẽ hiển thị 0."
- EN: "Totals are kept for 400 days; error details only for 90 days. Older ranges show zero."

## 6. Privacy policy updates (EN/VI drafts; not published)

The keys are in `src/translations/legal.ts`. `scripts/generate-static-pages.ts` reads the same keys, so there is no second copy. The `{pending …}` markers must be resolved by counsel before publication.

- **`privacyS8Item4`** (replaces the current, false "at most 90 days"):
  - EN: "Technical logs of AI analyses in our database: error details are deleted after 90 days; a minimal record (account, time, type and result of the request, and usage figures: AI model, amount of text processed and response time) is kept for up to 400 days {pending Q1–Q3: to meet Vietnamese cybersecurity record-keeping requirements}, then deleted. These logs never contain the content of your CV or job description." (Checked read-only on 2026-11-24: every one of the 12 `error_message` values in production is a bracketed code or one of the hardcoded handler sentences listed in §1.1. 0 values were unknown text.)
  - VI: "Nhật ký kỹ thuật của các lượt phân tích AI trong cơ sở dữ liệu: nội dung chi tiết của lỗi được xóa sau 90 ngày; bản ghi tối thiểu (tài khoản, thời điểm, loại và kết quả yêu cầu, cùng số liệu sử dụng: mô hình AI, lượng văn bản đã xử lý và thời gian phản hồi) được lưu tối đa 400 ngày {chờ Q1–Q3: để đáp ứng yêu cầu lưu nhật ký theo pháp luật an ninh mạng Việt Nam}, sau đó bị xóa. Nhật ký này không bao giờ chứa nội dung CV hay mô tả công việc của bạn."
- **Account deletion** (new sentence, pending Q4):
  - EN: "If you delete your account, these minimal records are unlinked from you and deleted on the same schedule."
  - VI: "Nếu bạn xóa tài khoản, các bản ghi tối thiểu này được tách khỏi tài khoản của bạn và bị xóa theo cùng thời hạn."
- **CV and analysis history:** unchanged. On the free plan history is deleted automatically after 7 days (the earlier `privacyS8Item2` fix); otherwise it is kept until you delete it.
- **Usage ledger and abuse-prevention counters, Sentry in the processor list, providers' logs (at most 90 days), backups (at most 30 days), processing outside Vietnam, automated AI processing:** as drafted in `2026-11-24-p1-legal-verification-release-gate.md` §7.2. Nothing changes for B.
- **In-app notice and email:** as drafted in the same document, §7.3, with the 400-day wording above.

## 7. Separate compliance gap: authentication and IP logs (not fixed by P1)

**Facts** (read-only, 2026-11-24):
- `auth.audit_log_entries` has 0 rows. Supabase Auth sends audit events to platform logs, not to the database.
- Supabase platform auth logs are kept about 24 hours on the Free plan (as observed on 2026-11-18; re-check, G6).
- Vercel is on the `hobby` plan with no log drains, so runtime logs last 1 hour.
- `auth.sessions` holds live sessions only (22 rows).
- `api_rate_limits` is purged after 2 days.
- `analysis_log` has no IP, port, login or logout.

**Gap:** if Decree 333 Art. 16.6(b)–(c) and Art. 20.3 apply (counsel Q1–Q3), the required log (account, login and logout time, IP, source port, and processing of posted information) is not kept anywhere for 12 months. That would have been true since 19-08-2026.

**Options** (for counsel and owner; none implemented):
- **(a)** Turn on Supabase Auth's "write audit logs to database". It records logins and IPs in `auth.audit_log_entries`, on Supabase **outside Vietnam**. It needs its own retention job, and it would add to the localization exposure under Decree 333 Art. 19.2.
- **(b)** Build our own `auth_event_log` (user id, event, timestamp, IP, port) written at sign-in, with a 366+ day purge. The same localization problem applies.
- **(c)** Store the log in Vietnam (a VN-hosted log store or drain). This may resolve localization for this data. It costs money and needs architecture and vendor work.
- **(d)** Do nothing, if counsel confirms cvfit.pro is out of scope.

Collecting more IP data creates new personal data. It needs its own notice under Law 91, and must not start before counsel answers Q1, Q4 and Q5. Tracked as **G10**.

## 8. Production runbook (option B; nothing run)

**Preconditions:**
- Release-gate G1 (counsel picks B) and G2 (owner approves the irreversible scrub) are PASS;
- this SQL has been moved into `supabase/migrations/` (01 and 02 only; 03 optional), reviewed and merged;
- the CI DB tests are green;
- the test file has been moved to `supabase/tests/`.

1. **Backup.** Take a pre-apply dump to `~/cvfit-backups/<date>-p1b-pre-migration`. Record checksums and a disposal date 30 days later. Supabase Free has no platform backups (re-check, G6), so this dump is the **only** copy of any detail the scrub removes.
2. **Preflight**, read-only (`preflight.prod.sql`, defaults 90/400). Record:
   - `rows_to_scrub_first_run` (0 on 2026-11-24) and `scrub_id_fingerprint`;
   - `rows_to_delete_first_run` (expected 0 until about 2027-08-06);
   - ledger, history, payments, audit and `usage_count_sum`.
3. **Apply 01 only** (`db push`). **Do not apply 02 or 04 yet.** 02 ships in a second migration after step 5. Otherwise the 20:30 UTC job could scrub before the owner's counted run, and the comparison with the preflight would be lost. Until then `verify.prod.sql` shows `scrub_job_ok = false` by design.
4. **First scrub, owner-run, in one transaction:**
   ```sql
   BEGIN;
   SELECT public.scrub_expired_analysis_log_detail();   -- must equal rows_to_scrub_first_run
   -- COMMIT only if it matches the preflight; otherwise ROLLBACK and investigate
   COMMIT;
   ```
5. **Verify** with `verify.prod.sql`: every `*_ok` true except `scrub_job_ok`; `detail_rows_remaining = 0`; `purge_jobs = 0`; unrelated counts as in the preflight. **Then apply 02** as its own migration and re-run verify (`scrub_job_ok = true`). The morning after the first 20:30 UTC run, check `last_scrub_run = succeeded`.
6. **Admin report check:** a custom range older than 90 days shows totals but no error categories. Ship the UI notice (§5) in the same release or earlier.
7. **Policy:** publish only after the 14-day notice, with G5–G8 PASS, and the `{pending}` markers resolved by counsel.
8. **Row deletion (04): separate production approval, before about 2027-08-06.**
   - Re-run the preflight and record `rows_to_delete_first_run`.
   - Take a dump.
   - Run `purge_expired_analysis_log()` owner-run in a transaction (COMMIT only if the count matches the preflight).
   - Apply 04, then verify `expired_rows_remaining = 0` and `purge_jobs = 1`.
9. **Dispose of each dump** 30 days after it was taken, under release-gate §8, with separate approval.

**Rollback limits:**
- Scrubbed `error_message` / `guard_metrics` values and deleted rows **cannot be restored in production**. They exist only in the pre-apply dump, and only until it is disposed of 30 days later.
- **To roll back the mechanism:** run `cron.unschedule('scrub-analysis-log-detail')` (and `'purge-analysis-log'`), then drop the three functions in a forward migration. The settings rows can stay or be deleted.
- **To pause without a migration:** set either key to an invalid value; both stages then raise. Remember to revert it.
- **Option A is not a rollback of B.** Moving to A deletes rows and needs its own approval.

## 9. Gate status (unchanged from the release-gate document, plus B specifics)

| Gate | Status |
|---|---|
| G1: counsel on scope (Q1–Q3); picks B, or A, or a longer period | **OPEN** |
| G2: owner approves the irreversible scrub (0 rows today; grows daily) | **OPEN** |
| G2b: owner approves row deletion (04) before about 2027-08-06 | **OPEN** (new) |
| G3: admin notice text and UI PR | **OPEN** |
| G4: option B SQL and tests on a disposable database | **PASS** (this document; 25/25 mutants; 34/34 existing suites) |
| G5–G8: dump rule, Supabase and Sentry checks, policy approval | **OPEN** |
| G9: localization and cross-border transfer | **OPEN**, largest exposure |
| G10: auth/IP 12-month log (§7) | **OPEN** |
| G11: A3.4/A3.5 flags off | PASS |

**Decision: NO-GO.** Engineering for B is complete and reviewable; production waits on G1 and G2.
