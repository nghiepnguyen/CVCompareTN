# P1 Legal Verification & Release Gate — analysis_log retention

- Date: 2026-11-24
- Branch: `docs/p1-privacy-prep` (local only)
- Supersedes: §2 (legal memo), §4 "recommended period", §9 (runbook) and §10 (GO/NO-GO) of `2026-11-23-p1-privacy-implementation-readiness.md`. Everything else there stands: the audit, the dependency proof, the five areas the purge must not affect, and the SQL plus tests.

**Verdict: NO-GO.** No production write, purge, scrub, migration, policy publication, backup deletion or flag change was made. Nothing was pushed. No Gemini calls and no VM were used. Production access was read-only (one `BEGIN READ ONLY` query on counts).

## 0. What changed since 2026-11-23

The official texts were retrieved this time, and they change the legal answer:

1. **The 12-month minimum for system logs is in official text.** It is Decree 333/2026/NĐ-CP, Art. 16.6(c) and Art. 20.3, in force since 19-08-2026. The earlier Decree 53/2022, Art. 27.3, said the same. The 2026-11-23 memo treated this as "secondary sources only"; that is withdrawn.
2. **The question for counsel is now different.** It is no longer "is there a minimum?" but two narrower questions. Does the rule cover cvfit.pro? If so, is `analysis_log` a "system log" in its sense?
3. **The recommended option moves from A (delete at 90 days) to B (scrub at 90 days, delete at 400 days).** B is conditional: if counsel says the rule does not apply, revert to A, which is the code already written and tested.
4. **There is a larger compliance gap that does not involve `analysis_log` at all.** If the rule applies, the log it actually describes (logins, logouts, IP, source port) is not kept anywhere for 12 months (§3.3).

## 1. Sources and provenance

All files were downloaded over HTTPS with normal certificate verification; no TLS check was bypassed. Copies are kept outside git in `~/cvfit-legal-sources/2026-11-24/`, with a `SHA256SUMS` file. These are public documents with no personal data.

| Document | Issued / effective | Source | SHA-256 (prefix) | Confidence |
|---|---|---|---|---|
| Law 116/2025/QH15 (Cybersecurity) | passed 10-12-2025 / effective 01-07-2026 | Công báo page `congbao.chinhphu.vn/van-ban/luat-so-116-2025-qh15-468678.htm`, with its signed PDF and DOCX | docx `b3bb2ad8…`, pdf `8e19e14f…` | High (official gazette) |
| Decree 333/2026/NĐ-CP (guides Law 116) | 19-08-2026 / 19-08-2026 | `hue.gov.vn` provincial portal, signed PDF `333_2026_nd-cp_19082026-signed.signed.pdf` | `59c61cc5…` | Medium-high. It carries the Government Office's digital-signature metadata (signed 21-08-2026), but it was not found on Công báo. It is a scanned PDF, read by OCR. The clauses cited below were checked against the page images (p02 Art. 3, p23 Art. 16.6, p25 Art. 19, p27 Art. 20.3); Art. 20.1 and Art. 30–31 were read from the OCR text only. |
| Decree 53/2022/NĐ-CP (guided the old Law 24/2018) | 15-08-2022 / 01-10-2022 | Công báo gazette PDF | `6e08ec4a…` | High for the text; its current status is uncertain (see Q7) |
| Law 91/2025/QH15 (Personal Data Protection) | 26-06-2025 / 01-01-2026 | Công báo gazette PDF, issues 971–972 | `226dd6da…` | High |
| Decree 356/2025/NĐ-CP (guides Law 91) | 31-12-2025 / 01-01-2026 | Công báo page `…/nghi-dinh-so-356-2025-nd-cp-468371.htm`, DOCX | `c36a6740…` | High |

**Not retrieved:**
- **Decree 330/2026** (administrative sanctions for cybersecurity and personal data): known from secondary sources only (an EY alert).
- **The Telecommunications Law's definitions of "Internet service" and "value-added telecom service":** Decree 333 Art. 3.4–3.5 refers to them, but they were not read. That gap is why Q1 goes to counsel.

Secondary commentary was used only to find documents, never as authority.

## 2. Legal evidence matrix

"Applies to cvfit.pro?" is my reading, not legal advice. Every "Unclear" goes to counsel in §4.

| # | Obligation | Exact provision | Effective | Scope as written | Applies to cvfit.pro? | Confidence | Open question |
|---|---|---|---|---|---|---|---|
| E1 | Keep system logs so data can be retrieved for **at least 12 months** | Decree 333 Art. 16.6(a)–(c); Art. 16.1 | 19-08-2026 | Domestic and foreign enterprises providing "services on telecom networks, the Internet, and value-added services on cyberspace in Vietnam" | **Unclear.** Art. 3.4 defines "service on the Internet" as Internet service plus content services on mobile networks, and Art. 3.5 defines "value-added service" as a value-added telecom service. A literal reading may exclude a web SaaS; Law 116 Art. 41 ("service providers on cyberspace") reads wider. | Text high, scope low | Q1, Q2 |
| E2 | Minimum content of the system log: user account, login and logout times, IP, **source port** at login and logout, and a "log of processing of posted information" | Decree 333 Art. 16.6(b) | 19-08-2026 | Same as E1 | `analysis_log` has none of: IP, port, login, logout. At most it could be a "processing log" if CV uploads count as "posted information" (content placed on a platform). | Text high | Q3 |
| E3 | System logs for investigating cybersecurity violations: **at least 12 months** | Decree 333 Art. 20.3, implementing Law 116 Art. 25.2(b) | 19-08-2026 | Same as E1 | Same as E1 | High | Q1–Q3 |
| E4 | Same 12-month rule under the old regime | Decree 53/2022 Art. 27.3 (implementing Law 24/2018 Art. 26.2(b)) | 01-10-2022; parent law repealed 01-07-2026 | Same class of providers | Only relevant for the 01-07 to 19-08-2026 gap | High for the text | Q7 |
| E5 | Keep account name, usage time, payment information, IP **after the user stops using the service**, for the period "prescribed by law" | Law 116 Art. 25.2(d) | 01-07-2026 | Same class as E1 | Unclear. It conflicts with the admin hard-delete (see `admin-delete-user-hard-delete` memory) and with the `ON DELETE SET NULL` link on `analysis_log`. | Text high; no period found in Decree 333 except Art. 20 | Q4 |
| E6 | **Store in Vietnam:** personal information of users in Vietnam, plus account name, usage time, card data, email, last login/logout IP and phone. Domestic enterprises must do so with no triggering request. | Decree 333 Art. 19.1–19.2; Law 116 Art. 25.3 | 19-08-2026 | Domestic enterprises (Art. 19.2); foreign enterprises in listed sectors, only after a request (Art. 19.3) | **Likely, if the operator is a Vietnamese enterprise in scope.** All data sits with Supabase, Vercel, Google, Sentry, Resend and Cloudflare, outside Vietnam. | Text high, scope medium | Q1, Q5 |
| E7 | Storage period for E6 data: from receiving a storage request until it ends, **at least 24 months** | Decree 333 Art. 20.1 | 19-08-2026 | Wording ties it to a request | Unclear for domestic enterprises, which have no request trigger | Medium (OCR only) | Q6 |
| E8 | **Storage limitation:** keep personal data only for a period suited to the purpose, "unless the law provides otherwise" | Law 91 Art. 3.3 | 01-01-2026 | Every controller and processor | **Yes.** `analysis_log` rows are personal data (linked by `user_id`). This is the basis for deleting at all. | High | — |
| E9 | Delete when the purpose is complete or the legal retention period ends, using safe deletion methods that stop unauthorized recovery | Law 91 Art. 14.1(b)–(c), 14.3 | 01-01-2026 | Controllers | Yes. It governs the purge, the dump disposal (§8) and vendor deletion. | High | — |
| E10 | **Cross-border transfer impact dossier**, filed within 60 days of the first transfer. This includes using platforms outside Vietnam to process data collected in Vietnam. | Law 91 Art. 20.1(c), 20.2; Decree 356 Art. 17–18 | 01-01-2026 | Everyone. The small-enterprise exemptions (Law 91 Art. 38.2–3, Decree 356 Art. 41) cover only Art. 21, 22 and 33.2, **not Art. 20**. | **Yes, likely.** The deadline would have been around 02-03-2026 if transfers continued past 01-01-2026. | High (text) | Q8 |
| E11 | **Automated processing notice:** tell users about automated processing, explain how the algorithm works and its effect, and offer an opt-out | Decree 356 Art. 10.3 | 01-01-2026 | Controllers using AI | **Yes.** Gemini analysis is automated processing of CVs. | High | Q9 |
| E12 | **Cloud contracts** must name Vietnamese law, data flows, roles, security measures and deletion deadlines. Personal data in the cloud must be encrypted at rest and in transit. | Decree 356 Art. 12.2, 12.4 | 01-01-2026 | Organizations contracting cloud providers | Yes. The vendors' standard DPAs are unlikely to name Vietnamese law. | High | Q8 |
| E13 | Impact assessment (DPIA) | Law 91 Art. 21–22; exemption in Art. 38.2–3 and Decree 356 Art. 41 | 01-01-2026 | Small enterprises and start-ups may opt out for 5 years; household and micro businesses are exempt; **neither exemption applies to direct processing of sensitive data** or at 100,000 or more data subjects | **Unclear.** Decree 356 Art. 4.1 lists as sensitive: health (d), ethnic origin (a), religion and political views (b), ID-card images (i), and **(l) data tracking behaviour or activity in using services on cyberspace**. CVs can contain (a), (b), (d) and (i). `analysis_log` itself may be (l). If so, the exemption is lost. | Medium | Q2, Q2a |
| E14 | Sensitive data handling: restricted access, a defined processing procedure, security measures | Decree 356 Art. 4.2 | 01-01-2026 | Anyone processing sensitive personal data | Likely for CV contents, and possibly for `analysis_log` (Art. 4.1(l)). Admin-only RLS partly covers this. | High (text) | Q2a |

## 3. Findings

### 3.1 The 12-month minimum is real, but its scope is unresolved

Decree 333 Art. 16.6(c), checked on page image p23, reads: "Thời gian lưu trữ nhật ký hệ thống phải bảo đảm có thể truy xuất dữ liệu ít nhất trong vòng 12 tháng" (system-log retention must allow retrieval for at least 12 months). Art. 20.3 (page image p27) gives the same 12-month minimum for logs used to investigate violations under Law 116 Art. 25.2(b).

The rule applies to enterprises providing "services on telecom networks, the Internet, and value-added services on cyberspace in Vietnam" (Art. 16.1). Decree 333 then narrows two of those terms. Art. 3.4: "Dịch vụ trên mạng Internet là dịch vụ Internet và dịch vụ nội dung thông tin trên mạng viễn thông di động" (Internet service plus content services on mobile networks). Art. 3.5: "Dịch vụ gia tăng… là dịch vụ viễn thông giá trị gia tăng" (value-added telecom services). Read literally, a CV-analysis web app is none of these.

Two things point the other way. Art. 19.3(a) lists "ứng dụng trực tuyến" (online applications) among the regulated sectors for foreign enterprises. Law 116 Art. 41 applies to "doanh nghiệp cung cấp dịch vụ trên không gian mạng" (service providers on cyberspace). **Do not rely on the narrow reading without counsel.**

### 3.2 `analysis_log` is not the log the rule describes

Columns, from migrations `20260703030000`, `20260704000000`, `20261028000000` and `20261029000000`:
- `id`, `user_id`, `status`, `kind`, `created_at`;
- `error_message`;
- `input_tokens`, `output_tokens`, `total_tokens`;
- `model`, `latency_ms`;
- `guard_metrics`.

It has no IP, source port, login or logout. Two readings follow:

- **Narrow:** it is an AI-call accounting log, not the Art. 16.6(b) log. Keeping it longer does not satisfy the rule and only adds exposure under Law 91 Art. 3.3. On this reading A (90 days) is correct.
- **Broad:** Law 116 Art. 2.11 defines "nhật ký hệ thống" as records reflecting time, user, activity and status of the system, for management, monitoring and security. `analysis_log` matches that definition word for word (`created_at`, `user_id`, `kind`, `status`). On this reading, deleting it at 90 days breaches the 12-month minimum.

### 3.3 The login and IP log does not exist for 12 months anywhere (a separate finding)

Read-only production query, 2026-11-24, counts only:
- `auth.audit_log_entries`: **0 rows.** Supabase writes auth audit events to its platform logs, not to the database, unless that option is turned on.
- `auth.sessions`: 22 rows, live sessions only, deleted at sign-out or expiry.
- Supabase platform auth and API logs: about 1 day on the Free plan (public docs).
- Vercel runtime logs: 1 hour on Hobby (public docs). The plan was confirmed as `hobby` with **no log drains** (read-only `vercel api`).
- `api_rate_limits`: purged after 2 days.

If E1 applies, cvfit.pro has been out of compliance on the core log since 19-08-2026, whatever happens to `analysis_log`. A new 12-month IP log would also be data that E6 requires to be stored in Vietnam. **Building one on Supabase outside Vietnam would deepen the localization problem**, so this is a counsel and architecture decision, not a P1 change.

### 3.4 Localization and cross-border transfer are the largest exposure

E6 and E10 cover all personal data, not only logs. They are not blockers for the purge, but they are the biggest legal exposure on this list (G9). The policy draft (§7.2) keeps the existing disclosure that data is processed outside Vietnam, and must not suggest otherwise.

## 4. Questions for qualified Vietnamese counsel

1. **Scope of E1, E3 and E6.** Is a web application that analyzes CVs with AI and charges a subscription a "dịch vụ trên mạng Internet" or a "dịch vụ gia tăng trên không gian mạng" under Decree 333 Art. 3.4–3.5 (by reference to the Telecommunications Law), or a "service provider on cyberspace" under Law 116 Art. 41? Do Art. 16, Art. 19.2 and Art. 20.3 apply?
2. **Operator's legal form.** The owner needs to state it: individual, household business, micro, small or start-up enterprise. Does that change Q1, the DPIA exemption (E13) or the term "doanh nghiệp" in Art. 16 and Art. 19?
2a. **Sensitive data (E13, E14).** Do CV contents count as sensitive personal data under Decree 356 Art. 4.1(a), (b), (d) or (i)? CVs can include health, ethnicity, religion or ID-card images. Do usage-activity records such as `analysis_log` count under Art. 4.1(l)? If either does, the DPIA exemption in Art. 41 is lost. What does Art. 4.2 require beyond admin-only access?
3. **Is `analysis_log` a "system log"** under Law 116 Art. 2.11 and Decree 333 Art. 16.6? Is a private CV upload "posted information" (thông tin được đăng tải)? If it is, which fields must survive 12 months? We propose `user_id`, `kind`, `status`, `created_at` (Option B).
4. **Retention after an account is closed (E5).** Does Law 116 Art. 25.2(d) require keeping account name, usage time, payment information and IP after a user deletes their account? For how long? Does that override a deletion request under Law 91 Art. 14 (see Art. 14.2 and Art. 19)?
5. **Localization (E6).** For a domestic operator, is storage in Vietnam required now, without a request from the Ministry of Public Security? Is a copy in Vietnam enough, or must the primary store be there? Which data in the Art. 19.1 list does cvfit.pro hold?
6. **Art. 20.1's 24-month period.** When does it start for a domestic enterprise that never received a storage request?
7. **Status of Decree 53/2022.** Decree 333 mentions it only in a transitional clause (Art. 31) and does not appear to repeal it. Did it lapse on 01-07-2026 with Law 24/2018? Both say 12 months, so the outcome is the same either way; this matters only for the 01-07 to 19-08-2026 gap.
8. **Cross-border dossier (E10, E12).** Is a dossier under Law 91 Art. 20.2 due, and is it overdue? What should it contain for Supabase, Vercel, Google (Gemini), Sentry, Resend and Cloudflare? Do the vendors' standard DPAs satisfy Decree 356 Art. 12.2?
9. **AI notice (E11).** Is a privacy-policy section plus the existing consent enough under Decree 356 Art. 10.3? What does "option not to participate" mean for a service whose core function is AI analysis?
10. **Notice period for the policy change.** Is 14 days of in-app and email notice enough under Law 91 for (a) shorter retention of detail and (b) a newly disclosed 12-month minimal record?
11. **Sanctions (Decree 330/2026).** Which provisions apply to E1, E6 and E10, and what is the risk if we deleted logs under the narrow reading and a regulator takes the broad one?

## 5. Retention decision matrix (recommendation only; not implemented)

Data volume: 344 rows in total, about 2.4 per day. The oldest row is 2026-07-02 (read-only, 2026-11-24).

| | **A. Delete everything at 90 days** (current tested design) | **B. Scrub detail at 90 days; keep a minimal record; delete at 400 days** | **C. Keep everything for 400 days** |
|---|---|---|---|
| Legal risk | **High if E1 applies** and `analysis_log` counts as a system log (§3.2, broad reading). Low if counsel says it does not. | Low under both readings. The minimal fields cover the "time, user, activity, status" definition for 12 months or more. | Low under the cybersecurity rules; **higher under Law 91 Art. 3.3** (detail kept with no stated need). |
| Privacy impact | Best: 117 rows deleted at once, then everything older than 90 days | Good. After 90 days `error_message` and `guard_metrics` are cleared. `user_id`, `kind`, `status`, `created_at`, tokens, model and latency remain until day 400. | Worst: all columns linked to a user for 13 months |
| Engineering | Done: SQL plus tests, 15/15 mutants killed | Small. A second setting, `analysis_log_detail_retention_days` (bounds [90, 400]); one `UPDATE … SET error_message = NULL, guard_metrics = NULL` in the same DEFINER function; tests; changed test seeds. Estimated 1 day including mutation testing. | Trivial: seed `400` instead of `90` and move the test boundaries |
| Storage cost | Negligible | Negligible (about 1,000 rows a year) | Negligible |
| Admin report | Custom ranges older than 90 days show **zeros** (owner accepted, with a notice) | Counts, success/error split, top users and cost stay correct for 400 days. Only error-message detail disappears after 90 days. | Fully correct for 400 days |
| Backups | No platform backups (Free plan). Local dumps hold rows that production no longer has, so the 30-day dump rule matters more. | Dumps hold detail that production has scrubbed, so the 30-day rule still applies | Dumps match production |
| Irreversibility now | Deletes 117 rows | Clears 2 columns on 117 rows; **deletes no rows until about 2027-08-06** (oldest row plus 400 days) | Nothing now |

**Why 400 days:** "at least 12 months" is 366 days when the window spans 29-02-2028. A 34-day margin covers a missed cron run, an incident freeze and the first-run review. The existing helper already accepts any value in [90, 3650].

**Recommendation: B**, conditional on counsel:
- if counsel says Decree 333 Art. 16 and Art. 20.3 **do not apply**, or that `analysis_log` is not a system log, **switch to A**; the code is already written and tested;
- if counsel says a longer period applies (for example 24 months via E5 or E7), raise the delete setting to that value; B's structure stays the same.

B is the only option that is safe under both readings while still cutting the most sensitive free-text column at 90 days. Nothing in B deletes rows before mid-2027, so choosing it costs no irreversible action now beyond the column scrub.

B does **not** fix §3.3 (the missing login/IP log) or §3.4 (localization). Those are separate tracks.

## 6. Third-party retention audit

| Provider | What we use | Public documentation | Account-level status | Still to check (owner) |
|---|---|---|---|---|
| **Sentry** | Front-end and server error and performance events. Scrubbing hooks: `src/lib/sentry.ts:59-64`, `_server-lib/sentry.ts:18-21`; sample rates 0.1 and 0.05; no Session Replay configured. | Errors kept **30 days on Developer, 90 days on Team, Business and Enterprise**; retention is fixed at ingest by the plan at that moment ([Sentry: Data Retention Periods](https://docs.sentry.io/security-legal-pii/security/data-retention-periods/)). Older DPA versions said 90 days on every plan. | **Not verified.** There is no connector; I cannot see the plan or the data region. | Plan and data region (US or EU) in Sentry settings. Pre-SEC-2 events (before 2026-11-22) that may hold personal data age out around **2026-12-22 (Developer)** or **2027-02-20 (paid)**; deleting them earlier is a provider deletion and needs separate approval. |
| **Vercel** | Hosting, serverless functions, runtime logs | Runtime logs: **1 hour on Hobby**, 1 day on Pro, 30 days with Observability Plus ([Vercel: Runtime Logs](https://vercel.com/docs/logs/runtime)). Longer retention only through log drains. | **Verified read-only: plan `hobby`, `drains: []`.** Logs therefore last about 1 hour. | Nothing for retention. The MCP connector needs team authorization; the CLI read worked. |
| **Supabase** | Postgres, Auth, Storage, cron | Free: **no automatic backups**, API/database logs **1 day**, auth audit logs 24 hours. Pro: 7-day daily backups, 7-day logs. PITR is a paid add-on on Pro and above ([Supabase: Backups](https://supabase.com/docs/guides/platform/backups), [Supabase: Logs](https://supabase.com/docs/guides/observability/logs), [Supabase: Pricing](https://supabase.com/pricing)). | **Free plan as of 2026-11-18** (M2-Q 2C preflight). The connector did not respond on 2026-11-24, so this was not re-checked. In-database `auth.audit_log_entries` has 0 rows. | Plan, backups and PITR in the dashboard before policy publication and before any apply. If PITR or daily backups get turned on, scrubbed or deleted rows persist for that window, and the policy's backup sentence must say so. |

The policy's provider sentence (§7.2) uses "at most 90 days", which covers Sentry's longest standard tier. That figure must be confirmed against the actual plan before publication (G7).

## 7. UX and policy readiness (drafts only; not published, not implemented)

### 7.1 Admin-report retention notice

**Placement:** one line of helper text directly under the two custom-range date inputs in `src/components/views/AdminReportTab.tsx:287` and `:299`, shown only when the "custom" range is selected. Use a muted style with a border, no modal. The data comes from the `admin_report_stats` and `admin_report_ops` RPCs, called in `src/services/adminReportService.ts:140`. No code change is approved.

- **Variant B** (recommended):
  - VI: "Số liệu tổng hợp được lưu 400 ngày; nội dung chi tiết của lỗi chỉ lưu 90 ngày. Khoảng thời gian cũ hơn sẽ hiển thị 0."
  - EN: "Totals are kept for 400 days; error details only for 90 days. Older ranges show zero."
- **Variant A** (if counsel says the rule does not apply):
  - VI: "Nhật ký chi tiết chỉ được lưu 90 ngày. Khoảng thời gian cũ hơn 90 ngày sẽ hiển thị 0."
  - EN: "Detailed logs are kept for 90 days. Ranges older than 90 days show zero."
- **Optional guard:** grey out dates before the retention window in the date picker (`min` attribute). Not proposed now.

### 7.2 Privacy policy changes (EN/VI, Variant B)

These replace the §6 drafts in the 2026-11-23 report where they differ. The keys are in `src/translations/legal.ts`. The `generate-static-pages.ts` build reads the same keys, so changes propagate with no second copy.

- **`privacyS8Item4`** (technical logs); this replaces the current false "at most 90 days":
  - EN: "Technical logs of AI analyses in our database: error details are deleted after 90 days; a minimal record (account, time, type and result of the request, and usage figures: AI model, amount of text processed and response time) is kept for up to 400 days {pending Q1–Q3: to meet Vietnamese cybersecurity record-keeping requirements}, then deleted."
  - VI: "Nhật ký kỹ thuật của các lượt phân tích AI trong cơ sở dữ liệu: nội dung chi tiết của lỗi được xóa sau 90 ngày; bản ghi tối thiểu (tài khoản, thời điểm, loại và kết quả yêu cầu, cùng số liệu sử dụng: mô hình AI, lượng văn bản đã xử lý và thời gian phản hồi) được lưu tối đa 400 ngày {chờ Q1–Q3: để đáp ứng yêu cầu lưu nhật ký theo pháp luật an ninh mạng Việt Nam}, sau đó bị xóa."
  - Variant A instead: "…deleted after 90 days." / "…được xóa sau 90 ngày."
- **`privacyS8Item5`** (usage records), unchanged from 2026-11-23: the usage ledger is kept while the account is active; abuse-prevention counters are deleted after 2 days.
- **Providers' logs:**
  - EN: "Error reports and hosting logs kept by our providers (Sentry, Vercel, Supabase) are deleted under each provider's retention period, at most 90 days. Backups that may contain these data are kept for at most 30 days."
  - VI: "Báo cáo lỗi và nhật ký máy chủ do nhà cung cấp lưu (Sentry, Vercel, Supabase) được xóa theo thời hạn lưu của từng nhà cung cấp, tối đa 90 ngày. Bản sao lưu có thể chứa các dữ liệu này được lưu tối đa 30 ngày."
- **Automated processing** (new; E11, wording pending Q9):
  - EN: "We use an AI model (Google Gemini) to analyse the CV and job description you submit and generate a match score and suggestions. The result is produced automatically from the text you provide; it does not decide anything about you outside our service, and the score can vary between runs. You can choose not to use AI analysis by not submitting a CV; you can delete your analyses at any time."
  - VI: "Chúng tôi dùng mô hình AI (Google Gemini) để phân tích CV và mô tả công việc bạn gửi, từ đó tạo điểm phù hợp và gợi ý. Kết quả được tạo tự động từ nội dung bạn cung cấp; kết quả không quyết định bất kỳ điều gì về bạn ngoài dịch vụ của chúng tôi, và điểm số có thể khác nhau giữa các lần chạy. Bạn có thể không sử dụng phân tích AI bằng cách không gửi CV; bạn có thể xóa các lượt phân tích bất cứ lúc nào."
- **Processing outside Vietnam:** keep the 2026-11-23 sentence. Do not add any claim of storage in Vietnam.
- **Free-plan history fix** (`privacyS8Item2`), unchanged from 2026-11-23: on the free plan, history is deleted automatically after 7 days.
- **Sentry in the processor list (S7):** unchanged from 2026-11-23.

### 7.3 In-app notice and email (send 14 days before the change takes effect; Q10)

- **In-app banner** (dismissible, shown on next sign-in):
  - VI: "Chúng tôi cập nhật Chính sách quyền riêng tư từ ngày {DATE}: thời hạn lưu nhật ký kỹ thuật, danh sách nhà cung cấp và cách chúng tôi dùng AI. [Xem thay đổi]"
  - EN: "We're updating our Privacy Policy from {DATE}: technical log retention, our provider list and how we use AI. [See what's changing]"
- **Email:**
  - Subject: VI "Cập nhật Chính sách quyền riêng tư của cvFit.pro (hiệu lực {DATE})" / EN "Update to the cvFit.pro Privacy Policy (effective {DATE})"
  - Body (VI): "Xin chào, Từ ngày {DATE}, Chính sách quyền riêng tư của cvFit.pro có một số thay đổi: (1) nội dung chi tiết của nhật ký lỗi được xóa sau 90 ngày; bản ghi tối thiểu (tài khoản, thời điểm, loại, kết quả và số liệu sử dụng) được lưu tối đa 400 ngày {chờ Q1–Q3: theo yêu cầu của pháp luật an ninh mạng}; (2) bổ sung Sentry vào danh sách nhà cung cấp; (3) giải thích cách chúng tôi dùng AI để phân tích CV; (4) làm rõ lịch sử phân tích của gói miễn phí được xóa sau 7 ngày. Bạn không cần làm gì thêm. Xem toàn văn: {LINK}. Nếu có câu hỏi, hãy trả lời email này."
  - Body (EN): the same four points in English.
  - Sending needs Resend and separate approval; none was sent.

## 8. Backup inventory and disposal plan

Inventory, read-only on 2026-11-24 (names, sizes and permissions only; no contents opened):

| Dump folder (`~/cvfit-backups/`) | Created | Size | Files | Proposed disposal (created + 30 days) |
|---|---|---|---|---|
| `2026-11-18-m2q2c-pre-migration` | 2026-11-18 | 1.5 MB | 6 (schema, data, roles, checksums, timestamps) | **2026-12-18** |
| `2026-11-20-m2q-h1-pre-migration` | 2026-11-20 | 1.6 MB | 5 | **2026-12-20** |
| `2026-11-23-odm2-pre-migration` | 2026-11-23 | 1.6 MB | 5 | **2026-12-23** |
| `2026-11-23-p0h-pre-migration` | 2026-11-23 | 1.6 MB | 5 | **2026-12-23** |

**Protection now:**
- the folder is `0700` and the files are `0600`;
- **FileVault is on**;
- the folder is not under an iCloud-synced Desktop or Documents folder;
- **Time Machine includes the folder, but no destination is configured**, so no TM copies exist today. If a destination is ever added, deleted dumps would persist there.

**Other copies (counts only):**
- `data.sql`, `*dump*.sql` and `*backup*.sql` files: 0 in `~/Downloads`, 0 under `~/My Files` (depth 4);
- 9 `supabase/.temp` directories across the worktrees. These hold Supabase CLI cache; they are gitignored and their contents were not inspected. Check them for dump files before the first disposal.

**Disposal checklist** (each run needs **separate owner approval**; nothing was deleted):

1. Confirm the dump is not needed for an open rollback: the related release is past its 30-day watch and has no open incident.
2. Verify `SHA256SUMS` one last time and record the folder name and date in the release log. Never record contents.
3. Delete the folder (`rm -r ~/cvfit-backups/<folder>`), then empty the Trash if it went through Finder. Under Law 91 Art. 14.3, ordinary deletion is adequate because FileVault encrypts the APFS SSD. `rm -P` gives no extra protection on SSDs and should not be relied on.
4. Proposed, not run: `tmutil addexclusion ~/cvfit-backups`, so a future Time Machine destination never captures dumps.
5. Re-run the inventory command and confirm the folder is gone.
6. For each future migration dump, record "dispose by: created + 30 days" in that release's runbook.

## 9. Updated production runbook (for whichever option is approved; nothing run)

**Preconditions:** G1–G8 in §10 are all PASS. The chosen option's SQL is written, mutation-tested on a disposable database, reviewed and merged.

1. **Pre-apply dump** to `~/cvfit-backups/<date>-p1-pre-migration`. Record checksums and the disposal date (+30 days).
2. **Preflight**, read-only (`preflight.prod.sql`, with `-v days=<N>`). Under B also count the detail columns to scrub:
   `SELECT count(*) FROM public.analysis_log WHERE created_at < now() - interval '90 days' AND (error_message IS NOT NULL OR guard_metrics IS NOT NULL);`
   Record `rows_to_delete_first_run` (B with 400: expected **0** until about 2027-08-06) and the fingerprint.
3. **Apply the migration** (`db push`) with the cron job **not yet scheduled**. 02 (pg_cron) goes in a second migration after step 5.
4. **First run, owner-operated, in one transaction:**
   ```sql
   BEGIN;
   SELECT public.purge_expired_analysis_log();  -- returns deleted rows (B: also scrubs detail)
   -- compare with the preflight numbers; COMMIT only if deleted = expected (and scrubbed = expected under B), else ROLLBACK
   COMMIT;
   ```
5. **`verify.prod.sql`**: every `*_ok` must be true and `expired_rows_remaining = 0`. Then apply 02 (cron at 20:30 UTC) and re-run verify the next morning (`last_cron_run`).
6. **Admin report:** open a custom range older than 90 days. Under A, zeros and the notice text show. Under B, totals are still present and the error detail is empty.
7. **Publish the policy** only after the 14-day notice (§7.3) has run and G6–G8 are PASS. The policy and the purge may ship in either order, but the false "at most 90 days" sentence must not outlive the first purge by more than one release.
8. **Dispose of the pre-apply dump** on its +30-day date, under §8 and with separate approval.

**Emergency stop:** set `analysis_log_retention_days` (and, under B, the detail setting) to an invalid value. The helper raises an error, and the purge deletes nothing. This takes a direct SQL write; the admin RPC whitelist does not allow it.

**Rollback limit:** deleted rows and scrubbed columns cannot be restored in production. They exist only in the pre-apply dump, for 30 days. Removing the purge itself is a forward migration (`cron.unschedule` plus `DROP FUNCTION`).

## 10. Final GO/NO-GO checklist

| Gate | Condition | Blocks | Status |
|---|---|---|---|
| G1 | Counsel answers Q1–Q3: does Decree 333 Art. 16/20.3 apply to cvfit.pro, and is `analysis_log` a system log? This picks A or B. | purge (any option) | **OPEN** |
| G2 | Owner approves the irreversible step for the chosen option (A: delete 117 rows; B: scrub 2 columns on 117 rows) | purge | **OPEN** |
| G3 | Admin-report notice text approved (A or B variant), and the UI change implemented and reviewed in its own PR | purge | Accepted in principle for 90 days; **text and implementation OPEN** |
| G4 | Option B SQL (if chosen) written and tested on a disposable database: mutation testing, boundary at 90/400, and the five protected areas re-proven | purge under B | **OPEN** (not approved to implement) |
| G5 | Pre-apply dump taken; 30-day disposal rule approved | purge; policy publish (the policy promises backups are kept at most 30 days) | Rule drafted (§8); **approval OPEN** |
| G6 | Supabase plan, backups and PITR re-checked in the dashboard | policy publish; apply | **OPEN** (connector down 2026-11-24) |
| G7 | Sentry plan and region checked; pre-SEC-2 events confirmed aged out or deletion approved | policy publish | **OPEN** |
| G8 | Policy EN/VI text and the 14-day notice approved by owner and counsel (Q9, Q10) | policy publish | **OPEN** |
| G9 | Localization and cross-border transfer (Q5, Q8): counsel advice and a remediation plan | separate track; **largest legal exposure** | **OPEN** |
| G10 | Login/IP 12-month log gap (§3.3, Q1, Q4): counsel decides whether it applies; architecture must respect G9 | separate track | **OPEN** (new finding) |
| G11 | A3.4/A3.5 scoring flags stay off; this work does not touch them | — | PASS (not enabled) |

**Decision: NO-GO.** G1 and G2 are the critical path. Once counsel answers G1, the switch from B back to A is a single decision, because A is already written and tested.
