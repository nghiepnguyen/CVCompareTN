# P1 Privacy — implementation readiness (technical-log retention)

> **Partly superseded on 2026-11-24** by `2026-11-24-p1-legal-verification-release-gate.md`. Its §2 (legal memo), the recommended period in §4, §9 (runbook) and §10 (GO/NO-GO) are replaced. In particular, the 12-month system-log minimum is now confirmed in official text (Decree 333/2026 Art. 16.6(c) and 20.3), not "secondary sources only". The audit, the dependency proof, §7 and the SQL plus tests still stand.

- **Date:** 2026-11-23 (snapshots at 09:45 UTC)
- **Branch:** `docs/p1-privacy-prep` (worktree `../cv-compare-tn-p0h`), rebased locally onto `origin/main` `2e5881d` (#106). **Local only, not pushed.**
- **Baseline:** P0-H production PASS; PR #106 merged as `2e5881d`; OD-M2 `fitShadow` 30-day retention live; A3.4 and A3.5 **not** enabled.
- **Extends** `2026-11-23-p1-retention-design.md`. Where the two differ, this document wins: the legal memo (§2 here supersedes design §1), the configurable purge (§4 here supersedes the hardcoded 90 days in design §2), the tests (§5), the policy draft (§6) and the runbook (§9).
- **Nothing was applied, deleted, published, pushed or deployed.** No Gemini calls. No paid VM. Production was touched only by two `BEGIN READ ONLY … ROLLBACK` count queries.
- **Verdict: NO-GO for production today.** Engineering is ready. The blockers are legal and owner decisions (§10).

---

## 1. Post-merge CI for PR #106 (`2e5881d`)

| Workflow | Run | Result |
|---|---|---|
| CI (lint, lint:api, test, build) | `45149346852` | success |
| CodeQL (push on main) | `45149347079` | success |
| DB tests | `45149346874` | `in_progress` at 09:43 UTC, then **success** (job "Database tests"). Not rerun. |

---

## 2. Legal decision memo (for counsel)

> **This is not legal advice.** "VERIFIED" means read in an official government source during this session. Everything else is unverified and is a question for qualified Vietnamese counsel.

### 2.1 Verified facts

| # | Fact | Source |
|---|---|---|
| V1 | **Law on Cybersecurity No. 116/2025/QH15.** National Assembly. Promulgated **10-12-2025**, **effective 01-07-2026**, published in Công báo No. 35 (21-01-2026). **It is in force today.** | [congbao.chinhphu.vn](https://congbao.chinhphu.vn/van-ban/luat-so-116-2025-qh15-468678.htm), metadata page only |
| V2 | **Law on Personal Data Protection No. 91/2025/QH15.** Promulgated 26-06-2025, effective **01-01-2026**. | [chinhphu.vn](https://chinhphu.vn/?pageid=27160&docid=214590&classid=1&typegroupid=3), metadata only (earlier session) |
| V3 | The article text of **neither** law could be read. | — |

Why the text could not be read:
- The Công báo DOCX/PDF host failed TLS verification ("unable to verify the first certificate"). The check was **not** bypassed.
- luatminhkhue.vn and thuvienphapluat.vn returned 403.
- The earlier PDF of Law 91 is an image-only scan.

Downloading the official DOCX needs your OK, because it is a file download. Counsel normally has these texts anyway.

### 2.2 Secondary sources only (NOT confirmed obligations)

| # | Claim | Sources |
|---|---|---|
| S1 | **Decree 356/2025/NĐ-CP** (31-12-2025) guides Law 91, took effect 01-01-2026, and replaced Decree 13/2023 | EY Vietnam alert (Mar 2026), luatthanhdo.com.vn, luatnguyen.vn, baovedlcn.vn |
| S2 | Decree 356 requires a controller to have a **policy for storing, deleting and destroying** personal data. It sets no fixed period in the summaries read | same |
| S3 | **Storing data on overseas servers or cloud services counts as a cross-border transfer.** That needs a transfer impact-assessment dossier (reportedly Form 09) and a written agreement with the overseas recipient | EY alert, cdlaf.vn |
| S4 | Law 116/2025: some firms say data must be stored in Vietnam from 01-07-2026, and one blog says logs must be kept **≥ 12 months**. **No source quoted an article** | tnd.vn, bhitech.vn (a vendor blog, low reliability) |
| S5 | Decree 53/2022/NĐ-CP Art. 26–27 (under the **2018** Cybersecurity Law): localization of user data for certain enterprises, at least 24 months for user data, **at least 12 months for system logs**; for foreign enterprises, triggered by a Ministry of Public Security decision. **Whether it survives Law 116/2025 is unknown** | baotintuc.vn, antoanthongtin.vn, vnetwork.vn (earlier session) |
| S6 | Law 116 has a **12-month transition** for information systems to meet the new security-level standards. This is a compliance deadline, **not** a log-retention period | congan.khanhhoa.gov.vn, vplsdms.vn |
| S7 | SME / startup relief from some PDP obligations for 5 years | one summary (earlier session) |

### 2.3 Questions for counsel, in priority order

1. **Which instrument now sets log retention?**
   - Since 01-07-2026: does Law 116/2025/QH15, or a decree guiding it, require cvfit.pro to keep **system or technical logs** for a minimum period (for example 12 months)?
   - Is Decree 53/2022 still in force, wholly or partly?
   - Does the duty apply to a small domestic operator automatically, or only on a Ministry of Public Security request?
   - Do `analysis_log` rows (§3.1) count as "system logs" (nhật ký hệ thống)?
   - **This blocks the purge.** If a minimum applies, set the period to it (option C). That is a one-row settings change; the code is the same (§4).
2. **Data localization and cross-border transfer.**
   - All data sits with Supabase, Vercel, Google, Sentry, Resend and Cloudflare, outside Vietnam.
   - Does Law 116 or its decree require a copy to be stored in Vietnam?
   - Under Law 91 / Decree 356: is a transfer impact dossier and a recipient agreement required, and has the deadline passed?
   - **This is probably the larger exposure.** It does not block the purge: deleting less data abroad reduces this risk and does not add to it.
3. **Storage limitation.** Is a defined 90-day period for operational logs adequate under Law 91 / Decree 356? Is a written retention-and-deletion policy (S2) required as a separate document?
4. **SME relief (S7).** Does it apply, and to which obligations?
5. **Notice.**
   - Is advance notice required for (a) shortening retention to match the policy already published, and (b) adding the newly disclosed items in §6?
   - What lead time, and what channel?
6. **Billing records.** Confirm that accounting retention applies to `payments` and PayOS records, not to `analysis_log`.
7. **Backups.** Is "backups kept at most 30 days" an acceptable statement when deleted logs can live on in backups for that long?

**Decision rule:**

| Q1 answer | Period | Action |
|---|---|---|
| No minimum | 90 days (option B) | as designed |
| Minimum *N* months | *N* months (option C) | set `analysis_log_retention_days` to *N*×31 or more, and change the policy text |
| Unclear / pending | — | **NO-GO** |

---

## 3. Privacy impact and dependency audit

### 3.1 What `analysis_log` holds

- **Columns:** `id`, `user_id` (FK `auth.users` **ON DELETE SET NULL**), `status`, `kind` (`analyze` / `parse_cv` / `rewrite`), `error_message` (categorical code, no provider text since SEC-2), `created_at`, `input_tokens`, `output_tokens`, `model`, `latency_ms`, `guard_metrics` (aggregate counters; `fitShadow` only while `FIT_SCORE_SHADOW` is on).
- **Not held:** CV/JD text, IP address, user agent, email.
- **Who can read it:**
  - admins, via RLS `is_admin()`;
  - `service_role`, which has SELECT and INSERT only (P0-H).
- **Writer:** one writer, `logAnalysisAttempt` (`_server-lib/analysisLog.ts:16`).

### 3.2 Every dependency (code grep + production catalog)

| Dependent | Reads | Window | Effect of a 90-day purge |
|---|---|---|---|
| `checkHourlyAiLimit` (`_server-lib/accountLock.ts:71`): hourly AI cap and shared document cap | count by user / kind | **1 hour** (`RATE_WINDOW_MS`, `accountLock.ts:27`) | none |
| `admin_report_stats` / `admin_report_ops` RPCs (`supabase/migrations/20261101170000…`, `…230000…`), via `src/services/adminReportService.ts:140` | aggregates over [start, end) | presets today / 7d / 30d; **custom range is unbounded** | **Real effect:** custom ranges reaching back more than 90 days show zero for the purged days, silently. Presets are unaffected. **The owner must accept this**, or adopt the rollup variant (`03`), which keeps per-day counts and tokens with no identifiers |
| `purge_expired_fit_shadow` (cron `purge-fit-shadow`, 20:20 UTC) | rows older than 30 days | 30 days | none. Order-independent (tested, §5) |
| Quota and billing: `check_analytics_quota`, `increment_usage_count`, `analytics_quota_reservations`, `payments`, `profiles.usage_count` | **do not read `analysis_log`** | — | none. Evidence: the production catalog query (09:45Z) found exactly 3 SQL functions that mention `analysis_log` (`purge_expired_fit_shadow`, `admin_report_stats`, `admin_report_ops`); no cron command, trigger, publication, inbound FK or view references it. The test asserts this list (§5) |
| Account deletion (`_server-lib/admin/deleteUser.ts:111`, `auth.admin.deleteUser`) | — | — | deletion sets `user_id = NULL` and keeps the row. The purge then removes it at 90 days, **strengthening** deletion. Tested in both orders (§5) |
| Admin audit trail (`admin_audit_log`) | — | — | none (separate table) |
| Unit tests (`src/__tests__/services/*`) | mocked client | — | none (no DB) |

### 3.3 The exact expired set (production, read-only, 2026-11-23 09:45:17 UTC)

| | Value |
|---|---|
| cutoff (`now() − 90 days`) | 2026-08-25 09:45:17 UTC |
| rows total / expired | 344 / **117** |
| linked / unlinked | 117 / 0 |
| distinct users | **12** |
| by kind | analyze 39, parse_cv 41, rewrite 37 |
| `created_at` range | 2026-07-02 22:54Z → 2026-08-22 00:36Z |
| with `fitShadow` / with an error code | 0 / 0 |
| **id fingerprint** `md5(string_agg(id, ',' ORDER BY id))` | `981621c881ee994b669b33b6f60cddc6` |
| rows expiring in the next 7 days | 0 (no rows between 2026-08-22 and 2026-09-01) |

- Only counts and the fingerprint are recorded here: no ids, no user ids.
- The set is stable until about **2026-12-01**. After that it grows daily.
- At apply time, `preflight.prod.sql` must reproduce it. A different fingerprint is fine, but it must be explained: new rows aged in, or a 365-day setting.
- **The first purge's returned count must equal `rows_to_delete_first_run`.**

### 3.4 Privacy impact

- **Benefit:**
  - brings practice in line with the policy **already live**, which says technical logs are kept "at most 90 days" (`privacyS8Item4`). Today that is false: rows date back to 2026-07-02;
  - removes the per-request technical trail (kind, tokens, latency, outcome) older than 90 days. It is **not** the only per-user timestamped record: `analytics_quota_reservations` keeps one row per analysis (`user_id`, time, state) indefinitely for usage accounting, and `history` and `admin_audit_log` carry timestamps too. These are out of P1 scope but must be disclosed (§6);
  - deletion beats unlinking, because unlinked rows can be re-linked through `history` timestamps and the quota ledger.
- **Cost:**
  - loses per-request forensics older than 90 days;
  - the admin-report effect above.
- **Not affected:** CV/JD, history (the free-plan 7-day purge is separate), quota, billing, audit, `fitShadow` semantics, scoring.

---

## 4. Option B design (changed: configurable, fail-closed)

The files live in `supabase/proposed/p1-log-retention/`, outside `supabase/migrations`, so neither `db push` nor CI can apply them.

| File | Change in this pass |
|---|---|
| `01_purge_expired_analysis_log.sql` | Seeds `app_settings.analysis_log_retention_days = 90` (`ON CONFLICT DO NOTHING`). New private helper `analysis_log_retention_cutoff()`. The purge uses that cutoff |
| `02_…_pg_cron.sql` | unchanged: `purge-analysis-log`, `30 20 * * *` |
| `03_optional_daily_rollup.sql` | uses the same helper; must be applied after `01` |
| `preflight.prod.sql` | read-only. Takes `-v days=N` (default 90). Adds the fingerprint, usage sum and the dependency list |
| `verify.prod.sql` | reads the live setting through the same helper |
| `purge_expired_analysis_log.test.sql` | rewritten (§5) |

**How the period is configured:**
- **Source:** the period is read from `app_settings`, never from a function argument. An argument would let any `service_role` caller choose a short window.
- **Fails closed:** a missing, NULL, non-integer (`"90"`, `90.5`, `{}`), out-of-range (< 90 or > 3650) value makes the purge `RAISE 22023` and **delete nothing**. The cron run then shows `failed` in `cron.job_run_details`. There is no fallback to a default.
- **Who can change it:**
  - only `service_role` or the SQL owner;
  - `anon` and `authenticated` have no write grant (`20261101250000`);
  - the only admin API path, `admin_update_app_setting`, whitelists `default_monthly_analytics_limit` only. The test proves it rejects this key, even for an admin.
- **Raising the period** (option C, for example 365) is a one-row update.
- **Going below 90** needs a migration that changes the floor.
- **Helper access:** `analysis_log_retention_cutoff()` has no EXECUTE for `anon`, `authenticated` or `service_role`.

Recommended way to change the period: a reviewed migration (`UPDATE public.app_settings SET value = '365' WHERE key = 'analysis_log_retention_days';`), not an ad-hoc SQL Editor edit, so the change is in git history.

---

## 5. Tests (disposable local stack only)

**Stack:** `scripts/ci/db-stack.sh` with project `cvfit_p1`, ports remapped to 5532x. Repo migrations at `2e5881d`, then `01` + `02` applied (and `03` for the rollup run). Synthetic rows only; every block rolls back.

| Block | Checks | Result |
|---|---|---|
| 1. Core | seeded value 90; 89 d and exactly 90 d kept; 91 / 120 / 200 d (incl. an unlinked row) deleted, `n = 3`; recent rows (cap windows) unchanged; 31-day `fitShadow` row untouched; ledger, history (incl. a 400-day row), profiles, audit, payments, app_settings unchanged; DEFINER, `search_path=''`; EXECUTE `service_role` only; helper private; admin API rejects the key; API roles cannot write `app_settings`; second run 0; one cron job plus the 4 existing; P0-H ACL unchanged; **dependency guard**: SQL readers = {admin_report_ops, admin_report_stats, purge_expired_analysis_log, purge_expired_fit_shadow}, no inbound FK or view; `service_role` run works | pass |
| 2. Config | `89, 0, -5, 3651, 90.5, "90", null, {}` and a missing key each raise `22023` and delete nothing; 365 deletes 0; 150 deletes only the 200-day row | pass |
| 3a / 3b. `fitShadow` | fitShadow purge then log purge, and the reverse: same end state (31-day row kept with fitShadow stripped, 3 rows deleted) | pass |
| 4a / 4b. Account deletion | deleting the user unlinks all rows, then the purge deletes the 3 expired ones and keeps 4 unlinked recent ones; purge then delete: the deletion succeeds and the profile is removed | pass |
| Rollup variant | all of the above plus: additive merge into an existing cell; no identifier columns; least-privilege ACL | pass |
| Replay | `01` → `03` → `02` → `03` re-applied | pass |
| `preflight.prod.sql` / `verify.prod.sql` | run locally, including `-v days=365` | parse; expected values |

**Mutation checks (15/15 killed):**

| Mutant | Killed by |
|---|---|
| fallback to 90 on an invalid value | `accepted retention -5` |
| floor 30 | `accepted retention 89` |
| no upper bound | `accepted retention 3651` |
| hardcoded 90 days (setting ignored) | `retention 365 deleted 3` |
| 89-day window | `got 4` |
| `<=` boundary | `got 4` |
| delete everything | `got 7` |
| EXECUTE granted to `authenticated` | `authenticated can purge` |
| helper granted to `service_role` | `cutoff helper exposed` |
| SECURITY INVOKER | `not DEFINER` |
| string value accepted | `accepted retention "90"` |
| rollup double count | `counted 4` |
| rollup overwrite | `counted -2` |
| rollup ACL includes `anon` | `not least-privilege` |
| rollup hardcoded 90 | `accepted retention 89` |

The baseline passes again after every restore.

**Not covered:**
- The real pg_cron firing at 20:30 UTC (the local test checks the job definition only).
- PostgREST callers.
- Production data volume (≈ 10 rows/day; one unbatched DELETE is fine).

---

## 6. Privacy-policy draft (EN/VI). DRAFT, NOT PUBLISHED

- Target: `src/translations/legal.ts`; the static crawler HTML is generated from it. **This branch does not change it.**
- Keys are as at `2e5881d`.
- `[N]` = the period counsel confirms (90 days or 12 months).
- `{verify}` = a value the owner must read in that vendor's dashboard or plan before publishing.

**`privacyS1Item5` (replace). The current text calls the data "anonymous".**
- EN: "Performance data via Vercel Analytics (aggregated page-performance metrics, not used for advertising)."
- VI: "Dữ liệu hiệu năng qua Vercel Analytics (số liệu hiệu năng trang tổng hợp, không dùng cho quảng cáo)."

**New `privacyS1Item6`: technical logs**
- EN: "Technical logs of each AI request (time, request type, success or error code, number of tokens processed, processing time), linked to your account. They do not contain the text of your CV or JD."
- VI: "Nhật ký kỹ thuật của mỗi yêu cầu AI (thời điểm, loại yêu cầu, kết quả hoặc mã lỗi, số token đã xử lý, thời gian xử lý), gắn với tài khoản của bạn. Nhật ký không chứa nội dung CV hay JD của bạn."

**New `privacyS1Item7`: error reports**
- EN: "Error reports sent to Sentry when something fails (error type, technical context and the page or function involved). Before sending, we remove personal details we can detect, such as email addresses and phone numbers."
- VI: "Báo cáo lỗi gửi tới Sentry khi có sự cố (loại lỗi, ngữ cảnh kỹ thuật, trang hoặc chức năng liên quan). Trước khi gửi, chúng tôi loại bỏ các thông tin cá nhân phát hiện được, như email và số điện thoại."
- This scrubbing is best-effort, by regex, since SEC-2 (#99, 2026-11-22). Events from **before** SEC-2 may still contain personal data; the owner action "purge stored PII" is still open (gate G7).

**New `privacyS2Item5`: purpose**
- EN: "Operating the service: enforcing usage limits, preventing abuse, and diagnosing errors."
- VI: "Vận hành dịch vụ: áp dụng giới hạn sử dụng, ngăn chặn lạm dụng và chẩn đoán lỗi."

**New `privacyS2Item6`: background scoring diagnostics (only while enabled; a precondition for A3.4)**
- EN: "When enabled, we test an alternative scoring method in the background. It records only aggregate numbers, such as the two scores, the number of requirements matched or missing, and processing diagnostics. It never contains the text of your CV or JD and never changes the score shown to you."
- VI: "Khi được bật, chúng tôi thử nghiệm ngầm một phương pháp chấm điểm khác. Phương pháp này chỉ ghi lại các con số tổng hợp, như hai điểm số, số yêu cầu đạt hoặc còn thiếu, và thông số xử lý. Các số liệu này không chứa nội dung CV hay JD của bạn và không làm thay đổi điểm bạn nhìn thấy."

**`privacyS3Body` (append): administrative access**
- EN: "Technical logs and scoring diagnostics can be read only by our administrators, to operate and improve the service."
- VI: "Chỉ quản trị viên của chúng tôi được xem nhật ký kỹ thuật và số liệu chẩn đoán chấm điểm, nhằm vận hành và cải thiện dịch vụ."

**New `privacyS7Item6`: processor missing today**
- EN: "Sentry (Functional Software, Inc.) — error monitoring."
- VI: "Sentry (Functional Software, Inc.) — giám sát lỗi."
- Cloudflare R2 is named in S5 but not in S7. Add "Cloudflare (R2) — CV file storage." / "Cloudflare (R2) — lưu trữ tệp CV." if R2 is live for any purpose.

**`privacyS8Item4` (replace): retention, scoped to what we control**
- EN: "Technical logs in our database: deleted after [N]. Scoring diagnostics: deleted after 30 days. Error reports and hosting logs kept by our providers (Sentry, Vercel, Supabase): deleted under each provider's retention period, at most {verify}. Backups that may contain these data: kept for at most 30 days."
- VI: "Nhật ký kỹ thuật trong cơ sở dữ liệu của chúng tôi: xóa sau [N]. Số liệu chẩn đoán chấm điểm: xóa sau 30 ngày. Báo cáo lỗi và nhật ký máy chủ do nhà cung cấp lưu (Sentry, Vercel, Supabase): xóa theo thời hạn lưu của từng nhà cung cấp, tối đa {verify}. Bản sao lưu có thể chứa các dữ liệu này: lưu tối đa 30 ngày."

**New `privacyS8Item5`: usage records (disclosure of what exists today; no change proposed)**
- EN: "Usage records (one entry per analysis: your account, time and status), used to count your monthly limit: kept while your account is active. Short-lived abuse-prevention counters (your account, or a one-way hash of your IP address; never the raw IP): deleted after 2 days."
- VI: "Bản ghi sử dụng (mỗi lần phân tích một dòng: tài khoản, thời điểm, trạng thái), dùng để tính hạn mức hằng tháng: lưu trong thời gian tài khoản còn hoạt động. Bộ đếm chống lạm dụng ngắn hạn (tài khoản, hoặc mã băm một chiều của địa chỉ IP; không bao giờ lưu IP gốc): xóa sau 2 ngày."
- Sources: `analytics_quota_reservations` (no purge); `api_rate_limits` (subject `u:<uuid>` or `ip:<hmac>`, purge-api-rate-limits after 2 days, migration `20261101100000`).

**`privacyS10Body` (replace the provider list; counsel may add transfer-mechanism wording under §2.3 Q2)**
- EN: "Your data may be processed on servers outside Vietnam (Supabase, Vercel, Google Cloud, Sentry, Resend, Cloudflare). We only work with providers that apply internationally recognised data-protection safeguards."
- VI: "Dữ liệu của bạn có thể được xử lý trên máy chủ đặt ngoài Việt Nam (Supabase, Vercel, Google Cloud, Sentry, Resend, Cloudflare). Chúng tôi chỉ chọn những nhà cung cấp áp dụng biện pháp bảo vệ dữ liệu theo tiêu chuẩn quốc tế."

**`privacyLastUpdated`:** the publication date.

**Discrepancy found (separate from P1):** `privacyS8Item2` says history is "retained until you delete them". The free plan's `purge-free-history` deletes history after 7 days. Fix in the same policy release: "…; on the free plan, analysis history is deleted automatically after 7 days." / "…; với gói miễn phí, lịch sử phân tích tự động xóa sau 7 ngày."

**Owner must verify before publishing:**
- the Sentry plan's event retention;
- Vercel runtime-log retention on the current plan;
- Supabase platform/Auth log retention;
- whether Supabase managed backups or PITR are enabled. As of 2026-11-18 there were none (Free plan). Re-check in the dashboard.

### 6.1 User-notification plan (proposed)

1. **Apply retention first** (§9). The deletion only makes the live "at most 90 days" text true, so it does not have to wait for the notice, subject to counsel's §2.3 Q5.
2. **Prepare the policy PR** with the §6 text and `privacyLastUpdated`. `npm run build` regenerates the static pages.
3. **Notify** under the live S11, which promises notice in the app or by email before material changes take effect:
   - an in-app banner for signed-in users (VI default, EN);
   - an email to all accounts through Resend, sent only after separate approval of the recipient list and the text.
4. **Wording:**
   - VI: "Chúng tôi cập nhật Chính sách quyền riêng tư: làm rõ nhật ký kỹ thuật, báo cáo lỗi và thời hạn lưu trữ. Hiệu lực từ [ngày]."
   - EN: "We've updated our Privacy Policy to clarify technical logs, error reports and retention periods. Effective [date]."
5. **Effective date:** 14 days after the notice, or what counsel advises.
6. **Publish** on the effective date. Verify on the live edge with `curl`, not `dist/`, and wrap emails in `<!--email_off-->` (AGENTS.md §5).

---

## 7. Billing, quota, admin reports, account deletion and `fitShadow`

| Area | Can the purge affect it? | Evidence |
|---|---|---|
| Billing (`payments`, PayOS) | No | no reference; count unchanged (test 1) |
| Quota (`profiles.usage_count`, `check_analytics_quota`, ledger) | No | catalog: no quota function reads `analysis_log`; ledger and profiles unchanged (test 1). The hourly and document caps read only the last hour (`accountLock.ts:27`, `:81`) |
| Admin reports | **Yes, for custom ranges older than [N] only** | §3.2. Needs owner acceptance or the rollup |
| Account deletion | No regression; strengthened | tests 4a / 4b |
| `fitShadow` retention | No | tests 3a / 3b; the jobs run 10 min apart, and the order is irrelevant |

---

## 8. Backups and rollback limits

- **Irreversible.** After the first purge, the 117 rows exist only in backups. There is no in-database undo.
- **Supabase platform backups:** none on the Free plan as of 2026-11-18 (M2-Q 2C preflight). **Re-verify.** If PITR or daily backups are enabled later, deleted rows persist for that window, and the policy's backup sentence must cover it.
- **Local release dumps** (`~/cvfit-backups/`, mode 0700, full data including `analysis_log` and other personal data):

  | Dump | Delete on or after (release + 30 days) |
  |---|---|
  | `2026-11-18-m2q2c-pre-migration` | 2026-12-18 |
  | `2026-11-20-m2q-h1-pre-migration` | 2026-12-20 |
  | `2026-11-23-odm2-pre-migration` | 2026-12-23 |
  | `2026-11-23-p0h-pre-migration` | 2026-12-23 |
  | P1 pre-apply dump (still to be taken) | apply date + 30 days |

  - All of them contain the 117 rows. Until they are deleted, the "at most 30 days in backups" statement is the only true one, so they must be deleted on schedule.
  - Deleting a dump is a separate, irreversible owner action. It is not part of this task.
- **Rollback of the mechanism:** a forward migration that runs `SELECT cron.unschedule('purge-analysis-log')`, then `DROP FUNCTION public.purge_expired_analysis_log(), public.analysis_log_retention_cutoff()`, then `DELETE FROM app_settings WHERE key = 'analysis_log_retention_days'` (and drops `analysis_log_daily` if `03` was used). That restores the pre-P1 state, except for the deleted rows.
- **Emergency pause without a migration:** set the setting to an invalid value. The purge then raises and deletes nothing. `cron.alter_job(…, active := false)` also works. Either must be recorded.
- **Restoring rows** from the P1 pre-apply dump would be selective `INSERT`s of `analysis_log` rows only. It would re-introduce data the policy says is deleted, so do it only for an incident, with owner sign-off.

---

## 9. Production runbook (only after every GO condition in §10)

1. **Adopt the migration in a PR.**
   - Copy `01` and `02` (plus `03` if chosen) into `supabase/migrations/` with fresh timestamps.
   - Move the test to `supabase/tests/purge_expired_analysis_log.test.sql`.
   - If counsel sets *N* ≠ 90 days, change the seeded value in `01` (≥ 90) **and** the test: block 1's `setting not seeded to 90` assertion and boundary rows (89/90/91 days → *N*−1/*N*/*N*+1), and block 2's 365/150 expectations.
   - Open the PR. **CI, lint:api, test and DB tests must be green.** A push creates a Vercel preview on the production DB; the app code is unchanged, so this is harmless.
2. **Merge.** That deploys production, but the app is unchanged.
3. **Take the pre-apply logical backup** to `~/cvfit-backups/<date>-p1-pre-apply/` (0700, SHA256SUMS). Record its delete-by date (+30 days).
4. **Preflight.** Run `preflight.prod.sql` in `BEGIN READ ONLY; … ROLLBACK;` (`-v days=N` if not 90). Record every value. Expect:
   - `setting_absent_ok`, `fn_absent_ok` and `job_absent_ok` true;
   - `sql_functions_reading_log` = `{admin_report_ops, admin_report_stats, purge_expired_fit_shadow}`;
   - `inbound_fks` = 0;
   - fingerprint `981621c8…` if run before about 2026-12-01 with 90 days. Otherwise explain the difference.
5. **Dry run.** `supabase db push --linked --dry-run` from a **detached worktree at the merge commit**. It must list exactly the new migration(s).
6. **Apply.** `supabase db push --linked` from the same worktree. Never paste into the SQL Editor.
7. **Verify.** Run `verify.prod.sql`:
   - every `*_ok` true;
   - `retention_days` = *N*;
   - ledger, history, payment, audit and usage values equal the preflight values (± legitimate new activity).
8. **First purge: owner-run, before the first cron run (20:30 UTC), in one transaction.** Inside one transaction `now()` is fixed, so the count and the deletion use the same cutoff:
   ```sql
   BEGIN;
   SELECT count(*) AS expected FROM public.analysis_log WHERE created_at < public.analysis_log_retention_cutoff();
   SELECT md5(string_agg(id::text, ',' ORDER BY id)) AS fingerprint FROM public.analysis_log WHERE created_at < public.analysis_log_retention_cutoff();
   SELECT public.purge_expired_analysis_log() AS deleted;
   -- COMMIT only if deleted = expected, and fingerprint = the preflight one (or the difference is explained by rows aged in since).
   -- Otherwise ROLLBACK.
   COMMIT;
   ```
   - The preflight values (step 4) are the plan-time record. Days may pass between steps 4 and 8, and after about 2026-12-01 new rows age in daily, so a larger count is not by itself a failure. A count that is not explained by rows aged in **is** one.
   - If the apply happens after 20:30 UTC on the same day, pause the job first (`cron.alter_job`, §8), do this step, then re-enable it.
9. **Next morning:**
   - rerun `verify.prod.sql`: `expired_rows_remaining = 0` and `last_cron_run` starts with `succeeded`;
   - spot-check the admin Report 30d preset: its numbers match pre-apply (± new activity).
10. **Then the policy track** (§6.1), as separate approvals.

**Stop conditions:**
- any `*_ok` false;
- the dry run lists anything else;
- in step 8, `deleted` ≠ `expected`, or a fingerprint difference that rows aged in cannot explain (ROLLBACK);
- the cron run is `failed`. That means the setting is invalid; it fails closed, so fix the setting and do not bypass it.

---

## 10. GO / NO-GO

| # | Condition | Blocks | Status |
|---|---|---|---|
| G1 | Counsel answers §2.3 Q1: whether Law 116/2025 (or a surviving Decree 53) sets a minimum log-retention period, and the value of *N* | **the purge** | **OPEN, so NO-GO** |
| G2 | Owner approves the irreversible first deletion (117+ rows, 12 users; fingerprint §3.3) | the purge | OPEN |
| G3 | Owner accepts the admin-report effect (custom ranges older than *N* show zeros), or chooses the rollup `03` | the purge | OPEN |
| G4 | Migration PR green (CI, DB tests incl. the moved test) and merged | the apply | not started |
| G5 | P1 pre-apply dump taken, and the 30-day dump-deletion rule adopted (§8) | the apply | OPEN |
| G6 | Supabase backup/PITR status re-verified in the dashboard | policy text | OPEN |
| G7 | Sentry, Vercel and Supabase log retention verified (`{verify}` in §6). Pre-SEC-2 Sentry events that hold PII purged, or confirmed aged out | **policy publish** | OPEN |
| G8 | Counsel answers Q5 (notice), and the policy text is approved, including the usage-record and rate-limit lines (§6 `privacyS8Item5`). The email recipient list and text are approved separately | policy publish | OPEN |
| G9 | Localization / cross-border transfer (Q2) assessed: transfer dossier and recipient agreements | **not** the purge; tracked as the larger exposure | OPEN |
| G10 | A3.4: the §6 diagnostics text published (or explicitly waived) plus its own approval | A3.4 only | OPEN; flags stay off |

**Engineering status:** ready. SQL, tests, preflight, verify and the runbook are prepared. The local DB test passes, and 15/15 mutants are killed.

**Production verdict: NO-GO** until G1, G2, G3 and G5 are closed for the purge, and G6, G7 and G8 for the policy.
