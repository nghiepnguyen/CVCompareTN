# P1: technical-log retention decision package, design, policy draft, OD-O1

- **Date:** 2026-11-23
- **Branch:** `docs/p1-privacy-prep` (worktree `../cv-compare-tn-p0h`), from `origin/main` `58e14ca`. Local only.
- **Status: BLOCKED** on (1) counsel's answer to §1 Q1–Q2 and (2) a separate owner approval to apply. Nothing was applied, deleted or published.
- **Owner decisions in force:**
  - prefer option B (delete technical logs after 90 days), subject to legal confirmation;
  - no app-level RPC retries;
  - policy direction approved, not to be published yet;
  - OD-O1 addendum approved.
- **Partly superseded by `2026-11-23-p1-privacy-implementation-readiness.md`:** its legal memo replaces §1 here (Law 116/2025/QH15 is in force from 01-07-2026). Its configurable, fail-closed purge replaces the hardcoded 90 days in §2. Its tests, policy draft and runbook replace §2.2, §2.4 and §3.
- **Supersedes** §2–§4 of `2026-11-23-post-p0h-ci-triage-p1-privacy-preflight.md` where they differ.

---

## 1. Legal decision memo (for counsel)

> This memo is **not legal advice**. Only the items marked VERIFIED were read in an official source. Everything else is a question.

### 1.1 What the data is

| Category | Where | Contents | Who can read it | Current retention |
|---|---|---|---|---|
| **Operational / technical logs** | `analysis_log` | per AI request: account id, time, type, success or error code, token counts, latency, aggregate guard counters. **No CV/JD text** | admins (RLS) and the server | none, so rows are kept indefinitely (oldest 2026-07-02) |
| Scoring diagnostics | `analysis_log.guard_metrics.fitShadow` | numbers and enums only; written only if `FIT_SCORE_SHADOW` is on (it is off) | admins | 30 days (PR #103, live) |
| **Security / audit records** | `admin_audit_log` | admin actions | admins | not in scope here |
| **Billing records** | `payments`, PayOS | payment transactions | owner / admins | not in scope; accounting rules may apply |
| Quota ledger | `analytics_quota_reservations` | per-analysis reservation (account id, time, state) | server | not in scope. NB: it re-links unlinked logs (§2.3) |
| **User content** | `history`, `saved_cvs`, `saved_jds`, storage | CV/JD text and analysis results | the user; admins via tools | user-managed; free plan 7 days (`purge-free-history`) |

The proposal concerns **only operational/technical logs**. There is no separate "security log" today: nothing records IP addresses, logins or access events in `analysis_log`, and Supabase Auth keeps its own audit trail on the platform side.

### 1.2 Verified

- **Law on Personal Data Protection No. 91/2025/QH15:** promulgated 26-06-2025, **effective 01-01-2026**. Source: Government portal metadata ([chinhphu.vn](https://chinhphu.vn/?pageid=27160&docid=214590&classid=1&typegroupid=3)).
- The article text could **not** be read:
  - the signed PDF is an image-only scan;
  - thuvienphapluat.vn refuses automated access (403);
  - vbpl.vn returned an empty page.
- Nothing about the Law's content is verified here.

### 1.3 Reported by secondary sources only (NOT confirmed obligations)

| # | Claim | Sources |
|---|---|---|
| S1 | Decree 356/2025/NĐ-CP guides Law 91/2025, and Decree 13/2023/NĐ-CP ceased to be effective on 01-01-2026 | one search summary |
| S2 | Small and startup enterprises may opt out of some obligations (impact assessment, records, data-protection officer) for 5 years | one search summary |
| S3 | Decree 53/2022/NĐ-CP, Art. 26: certain enterprises must store users' personal information and user-generated data (incl. usage time) **in Vietnam** | [baotintuc.vn](https://baotintuc.vn/chinh-sach-moi/nhung-du-lieu-phai-luu-tru-tai-viet-nam-tu-1102022-20220819233151692.htm), [antoanthongtin.vn](https://antoanthongtin.vn/tin/nghi-dinh-53-2022-huong-dan-chi-tiet-ve-noi-dia-hoa-du-lieu-tai-viet-nam), [vnetwork.vn](https://www.vnetwork.vn/en-US/news/nghi-dinh-53-2022-nd-cp/) |
| S4 | Decree 53/2022, Art. 27: storage runs from the request until it ends, **minimum 24 months**; **system logs** for cybersecurity investigations **at least 12 months**; for foreign enterprises the duty is triggered by a decision of the Minister of Public Security | same; one source suggests later amendments |

### 1.4 Questions for counsel (answers unblock P1)

1. **12-month system logs:** does Decree 53/2022 Art. 26–27, or any successor, require cvfit.pro to keep system or technical logs for at least 12 months?
   - Does it apply automatically to a domestic operator, or only after a Ministry of Public Security request?
   - Do these `analysis_log` rows count as "system logs" (nhật ký hệ thống) at all?
   - If yes, use option **C** (§2.6): keep these minimal fields for 12 months.
2. **Data localization:** the service is a Vietnamese consumer service whose data sits on Supabase, Vercel and Google outside Vietnam. Does S3 apply, and what does Law 91/2025 require for cross-border transfer (for example a transfer impact dossier)? This is broader than P1 and possibly the larger risk.
3. **Storage limitation:** what do Law 91/2025 and its decree require on keeping personal data only as long as needed, and on deletion deadlines? Is a defined 90-day period adequate?
4. **SME relief:** does S2 apply to cvfit.pro, and to which obligations?
5. **Notice:** is notice to users required before the policy change takes effect, and with what lead time?
6. **Billing records:** confirm that accounting retention applies to `payments` and PayOS records only, not to `analysis_log`.

**Recommended path:** if Q1 = no, use **B** (90 days, §2). If Q1 = yes, use **C** (12 months, the same migration with a different interval). Q2 is tracked separately.

---

## 2. Retention design (option B) — prepared, NOT applied

**Files** (`supabase/proposed/p1-log-retention/`, outside `supabase/migrations`, so neither `db push` nor CI can apply them):

| File | Purpose |
|---|---|
| `01_purge_expired_analysis_log.sql` | `public.purge_expired_analysis_log()`: SECURITY DEFINER (owner `postgres`), `search_path=''`, EXECUTE for `service_role` only. `DELETE FROM public.analysis_log WHERE created_at < now() - interval '90 days'`; returns the count |
| `02_purge_expired_analysis_log_pg_cron.sql` | one job, `purge-analysis-log`, `30 20 * * *` (03:30 ICT, after `purge-fit-shadow` at 20:20). `cron.schedule` upserts by name |
| `03_optional_daily_rollup.sql` | optional. Adds `analysis_log_daily(day, kind, status, rows, input_tokens, output_tokens)` with no identifiers, admin-only RLS and least-privilege ACL from day one. Redefines the purge so each expiring row is counted in the **same statement** that deletes it (`DELETE … RETURNING` → `INSERT … ON CONFLICT` additive) |
| `purge_expired_analysis_log.test.sql` | DB test (§2.2) |
| `preflight.prod.sql`, `verify.prod.sql` | read-only production checks (§2.4) |

### 2.1 Why DEFINER

P0-H left `service_role` with only SELECT and INSERT on `analysis_log`. Only the owner can delete, so the purge runs as the owner. That is the same pattern as `purge_expired_fit_shadow`.

### 2.2 Tests (disposable local stack, synthetic rows)

| Check | Result |
|---|---|
| Rows aged 89 days and exactly 90 kept; 91, 120 and 200 (incl. an unlinked row) deleted; `n = 3` | pass |
| Recent row (document-cap marker) unchanged | pass |
| `analytics_quota_reservations`, `history` (incl. a 400-day-old row), `profiles`, `admin_audit_log`, `payments` counts unchanged | pass |
| DEFINER, fixed `search_path`, no EXECUTE for anon or authenticated, EXECUTE for `service_role` (and a run as `service_role` works) | pass |
| Second run deletes 0 | pass |
| Exactly one `purge-analysis-log` job, run as `postgres`; the 4 existing jobs present | pass |
| P0-H `analysis_log` ACL unchanged | pass |
| Rollup variant: counts and tokens of the deleted rows land in the rollup; merging into an existing cell is additive; no identifier columns; ACL `{postgres=arwdDxtm/postgres,authenticated=r/postgres}` | pass |
| Replaying 01+02, and replaying 03 | pass |
| `preflight.prod.sql` / `verify.prod.sql` run locally (before and after) | parse and return the expected values |

**Mutation checks: 8/8 killed:**
- 89-day window: `got 4`;
- `<=` boundary: `got 4`;
- delete everything: `got 6`;
- EXECUTE granted to authenticated: `authenticated can purge`;
- rollup double-counts: `counted 4`;
- rollup overwrites instead of adding: `counted -2`;
- rollup ACL includes anon: `not least-privilege`.

The first run of the test let the double-count mutant survive because no fixture hit the merge path. The test now seeds an existing cell.

### 2.3 Impact

- **First run:** deletes every row older than 90 days on that day. As of 2026-11-23 that is **117 account-linked rows from 12 users** (analyze 39, parse_cv 41, rewrite 37), all from 2026-07-02 to 2026-08-25. The number grows daily until applied; `preflight.prod.sql` records the exact count.
- **The deletion is irreversible.** These rows hold no CV/JD text, no error text, no `guard_metrics` and no model.
- **Lost:** per-row history older than 90 days, which only matters for custom admin-report ranges beyond 90 days. The rollup variant keeps daily totals.
- **Not affected:**
  - hourly and document AI caps (1-hour window);
  - quota and billing;
  - user history and CV/JD;
  - `fitShadow` (30 days);
  - the `admin_audit_log`;
  - Gemini or score behaviour.
- **Privacy note:** deleting is stronger than unlinking. Unlinking leaves rows re-linkable: 12 of the 117 already are, through `history` timestamps, and future analyze rows would be through the quota ledger.

### 2.4 Production procedure (after counsel and owner approval)

1. Copy 01 and 02 (plus 03 if wanted) into `supabase/migrations/` with fresh timestamps, and move the test to `supabase/tests/`. Open a PR; DB tests must pass.
2. Merge (the app is unchanged).
3. Take a pre-apply logical backup (see §2.5 for how long to keep it).
4. Run `preflight.prod.sql` and record the numbers.
5. Dry-run `supabase db push --linked`. It must list exactly the new migration(s).
6. Run `supabase db push --linked` from a detached worktree at the merge commit.
7. Run `verify.prod.sql`. Every `*_ok` must be true, and the ledger, history, payment and audit counts must equal the preflight values.
8. **First purge:** either wait for the 20:30 UTC cron run, or have the owner run `SELECT public.purge_expired_analysis_log();` once and record the count. It must equal `rows_to_delete_first_run`.
9. The next morning, run `verify.prod.sql` again: `expired_rows_remaining = 0` and `last_cron_status = succeeded`.

**Rollback:** a forward migration that unschedules the job and drops the function. Deleted rows come back only from the backup.

### 2.5 Backups

- **Platform backups:** as recorded in the M2-Q 2C preflight (2026-11-18), the Supabase plan in use has no managed backups or PITR. **Re-verify in the dashboard before relying on this.** If backups are later enabled, the policy should say deleted logs can persist in backups for that platform's retention window.
- **Local release dumps:** `~/cvfit-backups/` holds four full dumps from 2026-11-18 to 2026-11-23, mode 0700. They include `analysis_log` and other personal data, and keep the deleted rows indefinitely, which defeats the 90-day promise.
  - **Recommendation:** delete each release dump 30 days after its release is verified, unless an incident is open.
  - Write this into the release checklist and the policy ("backups are kept for at most 30 days").
  - The pre-apply dump for P1 is the one that will still contain the 117 rows. Delete it on schedule.

---

## 3. Privacy-policy draft (EN/VI) — approved direction, NOT published

Edit `src/translations/legal.ts` only; `generate-static-pages.ts` builds the crawler HTML from it (AGENTS.md). The retention value in brackets depends on §1 Q1.

**S1 Item 5 (replace; the logs are not anonymous):**
- EN: "Performance data via Vercel Analytics (aggregated page-performance metrics, not used for advertising)."
- VI: "Dữ liệu hiệu năng qua Vercel Analytics (số liệu hiệu năng trang tổng hợp, không dùng cho quảng cáo)."

**New S1 item: technical logs**
- EN: "Technical logs of each AI request (time, request type, success or error code, number of tokens processed, processing time), linked to your account. They do not contain the text of your CV or JD."
- VI: "Nhật ký kỹ thuật của mỗi yêu cầu AI (thời điểm, loại yêu cầu, kết quả hoặc mã lỗi, số token đã xử lý, thời gian xử lý), gắn với tài khoản của bạn. Nhật ký không chứa nội dung CV hay JD của bạn."

**New S2 item: purpose**
- EN: "Operating the service: enforcing usage limits, preventing abuse, and diagnosing errors."
- VI: "Vận hành dịch vụ: áp dụng giới hạn sử dụng, ngăn chặn lạm dụng và chẩn đoán lỗi."

**New S2 item: background scoring diagnostics (only while enabled)**
- EN: "When enabled, we test an alternative scoring method in the background. It records only aggregate numbers, such as the two scores, the number of requirements matched or missing, and processing diagnostics. It never contains the text of your CV or JD and never changes the score shown to you."
- VI: "Khi được bật, chúng tôi thử nghiệm ngầm một phương pháp chấm điểm khác. Phương pháp này chỉ ghi lại các con số tổng hợp, như hai điểm số, số yêu cầu đạt hoặc còn thiếu, và thông số xử lý. Các số liệu này không chứa nội dung CV hay JD của bạn và không làm thay đổi điểm bạn nhìn thấy."

**New S3 item: administrative access**
- EN: "Technical logs and scoring diagnostics can be read only by our administrators, to operate and improve the service."
- VI: "Chỉ quản trị viên của chúng tôi được xem nhật ký kỹ thuật và số liệu chẩn đoán chấm điểm, nhằm vận hành và cải thiện dịch vụ."

**S8 Item 4 (replace): retention**
- EN: "Technical logs: deleted after [90 days | 12 months]. Scoring diagnostics: deleted after 30 days. Backups that may contain them: kept for at most 30 days."
- VI: "Nhật ký kỹ thuật: xóa sau [90 ngày | 12 tháng]. Số liệu chẩn đoán chấm điểm: xóa sau 30 ngày. Bản sao lưu có thể chứa các dữ liệu này: lưu tối đa 30 ngày."

### Notification and effective-date plan (proposed)

1. **Deploy retention first** (§2.4). The text must be true on the day it takes effect.
2. **Publish the updated policy** with `privacyLastUpdated` set to the publication date, and rebuild the static pages.
3. **Notify users** under S11, which promises notice in the app or by email before material changes take effect:
   - show an in-app banner to signed-in users;
   - email all accounts through Resend;
   - state the effective date **14 days after notice** (or whatever counsel advises under §1 Q5).
4. **Until the effective date,** the current text stays live. Retention can run earlier, because it only shortens how long data is kept.
5. **Verify on the live edge** with `curl`, not `dist/`, per AGENTS.md §5. Wrap any email address in `<!--email_off-->`.

---

## 4. OD-O1 addendum: FINAL (owner-approved 2026-11-23)

Shadow-observation criteria for A3.4, replacing A3.2 §7(a). This is **preliminary operational evidence, not statistical proof of score reliability.**

| # | Rule |
|---|---|
| O1 | Observe for at least **30 calendar days** after `FIT_SCORE_SHADOW` is enabled |
| O2 | At least **30 eligible** analyses (`fitShadow.eligible = true`) from **non-admin, non-test** accounts, counted **cumulatively across weekly snapshots** (the 30-day `fitShadow` purge means the table can't be the tally) |
| O3 | Exclude `profiles.role = 'admin'` and an owner-maintained list of test or synthetic account ids (recorded by id, never by email) |
| O4 | **Weekly counts-only snapshots,** taken by an admin before rows age out. Each records eligible and ineligible counts by `reason`, the canonical × shadow band matrix, absDiff p50/p90/max, counts by `inputMode`, and the cumulative eligible total. No `user_id`, no row data |
| O5 | If O2 is unmet at day 30, **extend in 14-day increments** |
| O6 | **Owner decision at day 90** if O2 is still unmet: accept, revise the contract, or stop |
| O7 | **No automatic authority switch.** `FIT_SCORE_AUTHORITY` stays non-operational in code |
| O8 | A3.5 needs **separate owner approval** after reviewing the snapshot series, the experience-row subset, the eligibility rate and the OD-17 fixtures |

**Start preconditions for A3.4:**
- the `fitShadow` 30-day retention is live (done, #103);
- the policy text in §3 covering background scoring diagnostics is published or explicitly waived by the owner;
- A3.4 has its own approval.

---

## 5. Blockers

1. **Counsel:** §1 Q1 (12-month logs) decides B vs C; Q2 (data localization and transfer) is a separate, possibly larger risk.
2. **Owner approval** to adopt the migration (§2.4), including the irreversible first deletion of the 117+ rows.
3. **Policy:** final wording with the retention value, the notice plan, and the publish date after retention is live.
4. **Backup retention rule** for local dumps (§2.5). The owner should act on the existing four dumps.
5. **A3.4:** waits on item 3 (or an explicit waiver) and its own approval.
