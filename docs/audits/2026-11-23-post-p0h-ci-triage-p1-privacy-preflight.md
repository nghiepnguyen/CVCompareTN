# Post-P0-H CI triage and P1 privacy preflight

- **Date:** 2026-11-23
- **Branch:** `chore/post-p0h-triage-p1-preflight` (worktree `../cv-compare-tn-p0h`), from `origin/main` `58e14ca`.
- **Status:** committed locally only, not pushed.
- **Mode:**
  - Production: read-only, aggregate counts only. No row text and no identifiers were selected.
  - No writes, no migrations, no data deletion, no Gemini calls, no flag change, no policy published.
- **Supersedes** §2 and §3 of `2026-11-23-m3b-odm2-followup-permissions-privacy.md`. That doc's §1 (P0-H) was released in PR #104.

**Correction to the P0-H release report:** I reported "main CI green" after the merge without checking the post-merge DB-tests run. The run `DB tests` on `58e14ca` (run 45124474491) had **failed**. §1 covers it.

---

## 1. CI failure: root cause and diagnostics

**Symptom:** `src/__tests__/db/m3bR0ScoreIntegrity.db.test.ts` › "recruiter invalid after the row was completed elsewhere" failed with `expected 503 to be 502`. The test took **226 ms**.

### Classification

| Hypothesis | Verdict | Evidence |
|---|---|---|
| P0-H permissions | **No** | The PR #104 run of the identical tree, with the P0-H migration applied, passed. On this request path `analysis_log` is touched only by the hourly cap, which fails open (`_server-lib/accountLock.ts:93`), and `logAnalysisAttempt`, which swallows errors (`_server-lib/analysisLog.ts`). Neither can produce a 503 |
| Assertion vs contract | **No** | `invalidAiOutput` always returns 502 (`_server-lib/analyze/handler.ts:351-364`), so the expected value is correct |
| App regression | **No** | First failure in 35 DB-test runs. No app code changed. Production has **0** `[quota_unavailable]`, `[rate_limit_unavailable]` or settlement-unavailable log rows, ever |
| **Timing / transport flake** | **Yes** | below |

**Mechanism, reproduced locally.** In this investigation 6 full `scripts/ci/db-tests.sh` runs were made on freshly reset stacks. 2 failed, each time on a *different* first-hit RPC and each as a fast 503 (or an upstream error):
- `m2q2cAtomicSettlement` "1. normal": 503 `quota_unavailable`;
- `m3aPersonalHistorySave` "commit then save": 503 "Rate limit verification unavailable";
- `m2q1bServerSave` "two parallel requests": `claim: An invalid response was received from the upstream server`.

For the last one the container logs were captured. Kong logged `upstream prematurely closed connection while reading response header from upstream` for that exact `POST /rest/v1/rpc/claim_candidate_analysis` at 06:53:51, answered **502**, and no matching request appears in the PostgREST log.

Neither PostgREST schema-cache reload (06:53:08 after the reset, 06:54:10 from the drift suite) coincided with it, and Postgres logged no backend crash.

The likely mechanism is an HTTP keep-alive race in the local Supabase stack: Kong reuses an upstream connection that PostgREST has just closed. The server helpers (`reserveMonthlyQuota`, `reserveAiCall`, `checkCandidateAttempt`) correctly **fail closed** on that error, so `handleAnalyze` answers a fast 503. That matches the CI symptom.

**Limit:** CI kept no container logs, so the CI instance itself is attributed by mechanism. It was not observed directly.

### What changed (`39ab94b`, no app code)

- **`m3bR0ScoreIntegrity.db.test.ts`:** the three invalid-output assertions now require `{ status: 502, body: { code: 'invalid_ai_output' } }`. This is stricter. On failure the diff prints the body, and its error string names the 503 branch.
- **`.github/workflows/db-tests.yml`:** on failure, the job saves `docker logs --tail 2000` for the db, rest and kong containers into the uploaded artifact. It also prints the backend-crash count and the Kong upstream-drop count.
  - The repo is **public**, so these artifacts are too.
  - The containers belong to the disposable CI stack: synthetic data and the CLI's default dev keys.

No assertion was weakened and no retry was added. A real fix would be an app-level single retry of idempotent RPCs on a gateway 502. That changes fail-closed quota and rate-limit behaviour, so it is an owner decision. Production shows no occurrences.

**Verification:**
- `npm run lint` passes.
- The workflow YAML parses.
- Each local full-suite run either passed (34/34) or failed only on these transport errors.

---

## 2. P1 privacy audit (read-only, counts)

### 2.1 Current policy wording (`src/translations/legal.ts`, "Last updated: September 22, 2026")

| Key | EN | VI |
|---|---|---|
| S1 Item 5 | "Anonymous performance data via Vercel Analytics (not used for advertising)." | "Dữ liệu hiệu năng ẩn danh qua Vercel Analytics …" |
| S2 Item 3 | "Improving service quality and user experience." | "Cải thiện chất lượng dịch vụ và trải nghiệm người dùng." |
| S8 Item 4 | "Technical logs and anonymous performance metrics: at most 90 days." | same meaning |
| S6 note | "no human reads it unless …" (Google account data only) | — |

Nothing mentions account-linked logs, administrator access to them, or scoring diagnostics.

### 2.2 Data facts (production `analysis_log`)

| Metric | Value |
|---|---|
| Rows total / linked (`user_id`) / unlinked | 344 / 316 / 28 |
| Linked rows by age | ≤90 days: 199 · 90–120: 12 · 120–180: **105** · >180: 0 |
| **Linked rows older than 90 days** | **117** (12 distinct users). Oldest 2026-07-02. By kind: analyze 39, parse_cv 41, rewrite 37 |
| Old rows: `error_message` | all NULL (no free text) |
| Old rows: `guard_metrics` / `model` | none / none |
| Columns | `id, user_id, status, error_message, created_at, kind, input_tokens, output_tokens, total_tokens, model, latency_ms, guard_metrics` |

**Identifiers:**
- *Direct:* `user_id`, which maps to an account email through `profiles` and `auth.users`.
- *Indirect:* `created_at` to the second, plus kind and token counts. These form a usage-activity record.
- No CV/JD text, no IP address, no device data.

**NULL `user_id` is not anonymization** (counts only, ±5 s window, no user filter):
- **12 of the 117 old rows are already uniquely re-linkable** to one account through `history` timestamps.
- The quota ledger (`analytics_quota_reservations`) starts on 2026-11-16, so it links none of the old rows. **Every future analyze row will have a same-second ledger row with `user_id`.** Unlinked rows would then be roughly 100% re-linkable for as long as the ledger is kept.
- With 12 users and low traffic, timing patterns alone narrow down candidates.
- Unlinking is therefore **pseudonymization**, and the rows remain personal data.

### 2.3 Dependencies: does anything need the log rows beyond 90 days?

| Need | Where it actually lives | Needs `analysis_log` > 90 days? |
|---|---|---|
| Billing / payments | `payments`, PayOS | no |
| Quota | `analytics_quota_reservations`, `profiles` counters (decoupled from logs) | no |
| Hourly / document AI caps (abuse control) | `analysis_log`, **1-hour window** | no |
| Fraud and abuse investigation | caps only; no investigation workflow exists | no current need |
| Admin security evidence | `admin_audit_log` | no |
| Admin Report tab | presets today/7d/30d; custom range optional | only custom ranges > 90 days |
| fitShadow telemetry | 30-day purge (#103) | no |
| Legal / regulatory | see §2.4 | **unresolved** |

Database relationships: `user_id` references `auth.users` with `ON DELETE SET NULL`. No inbound foreign keys, no views, no triggers. One owner-run purge function and cron job.

### 2.4 Vietnamese legal retention: verified vs unresolved

**Verified from a primary source:**
- Law on Personal Data Protection No. **91/2025/QH15**, promulgated 26-06-2025, **effective 01-01-2026**.
- Source: Government portal metadata, [chinhphu.vn](https://chinhphu.vn/?pageid=27160&docid=214590&classid=1&typegroupid=3).
- The article text could not be read: the signed PDF is an image-only scan, [thuvienphapluat.vn](https://thuvienphapluat.vn/van-ban/Bo-may-hanh-chinh/Luat-Bao-ve-du-lieu-ca-nhan-2025-so-91-2025-QH15-625628.aspx) returned 403, and vbpl.vn returned an empty page.

**Reported by secondary sources only (search summaries, not verified, not legal advice):**
1. Decree **356/2025/NĐ-CP** guides Law 91/2025, and **Decree 13/2023/NĐ-CP ceased to be effective on 01-01-2026**. One source only.
2. Small and startup enterprises may choose not to perform some obligations for 5 years after the Law takes effect (for example the impact assessment and designating a data-protection officer). One source only.
3. Decree **53/2022/NĐ-CP** (Cybersecurity Law), Art. 26–27, as described by [baotintuc.vn](https://baotintuc.vn/chinh-sach-moi/nhung-du-lieu-phai-luu-tru-tai-viet-nam-tu-1102022-20220819233151692.htm), [antoanthongtin.vn](https://antoanthongtin.vn/tin/nghi-dinh-53-2022-huong-dan-chi-tiet-ve-noi-dia-hoa-du-lieu-tai-viet-nam) and [vnetwork.vn](https://www.vnetwork.vn/en-US/news/nghi-dinh-53-2022-nd-cp/):
   - certain enterprises must store users' personal information and user-generated data (including usage time) **in Vietnam**;
   - the storage period runs from the request until it ends, **minimum 24 months**;
   - **system logs** used for cybersecurity investigations must be kept **at least 12 months**;
   - for foreign enterprises the obligation is triggered by a decision of the Minister of Public Security;
   - sources also suggest some provisions were later amended.

**Unresolved, for counsel:**
- (a) Does Decree 53's 12-month system-log rule or the 24-month storage rule apply to this service (a domestic or foreign enterprise, triggered or automatic)? If so, deleting or unlinking logs at 90 days could conflict with it.
- (b) The service's data is stored on Supabase, Vercel and Google outside Vietnam. Are there data-localization or cross-border-transfer duties under Decree 53 and Law 91/2025? This is a larger question than this audit.
- (c) What storage-limitation and deletion articles does Law 91/2025 and its decree contain, and do they mandate a maximum period?
- (d) Does the small or startup enterprise relief apply?
- (e) Is a policy change of this kind a notifiable change?

### 2.5 Options

| | A. Unlink `user_id` after 90 days | B. Delete log rows after 90 days | C. Separate justified retention for named security records |
|---|---|---|---|
| Meets the current "at most 90 days" promise | **No, by itself**: the rows stay linkable personal data (§2.2). It needs the policy reworded | **Yes**, literally | Only with new wording naming the record type and period |
| Operational impact | none (caps use 1 h, admin uses aggregates) | lose per-row history > 90 days: tokens and latency trends, custom admin ranges. An optional counts-only daily rollup keeps trends | depends on which records |
| Reversibility | irreversible (link gone) | irreversible (backup only, until it is rotated) | n/a |
| Implementation risk | low: one DEFINER UPDATE plus cron, the #103 pattern | low: one DEFINER DELETE plus cron, idempotent | needs a named record and a written justification; **none identified today** |
| Legal fit | unknown (§2.4 a, c) | **conflicts** if a 12-month log rule applies (§2.4 a) | the natural vehicle if counsel says a log rule applies |

**Recommendation:**
- **B is the default**, optionally with a counts-only daily rollup if trends are wanted. **It is gated on counsel's answer to §2.4 (a).**
- If counsel confirms a 12-month system-log duty, use **C**. Keep the minimal technical log fields (no CV/JD text) for 12 months, state that in the policy, and delete after that.
- A alone is not recommended: it doesn't meet the promise and gives weaker privacy than it appears to.
- Until the decision: no change to historical data, as instructed. The 117 rows stay as they are. Each day more rows pass 90 days, so the gap grows.

---

## 3. Privacy-policy proposal (EN/VI, not applied)

Each item below assumes option B. Variant C swaps the bracketed period.

**S1 Item 5 (replace):**
- EN: "Performance data via Vercel Analytics (aggregated page-performance metrics, not used for advertising)."
- VI: "Dữ liệu hiệu năng qua Vercel Analytics (số liệu hiệu năng trang tổng hợp, không dùng cho quảng cáo)."

**New S1 item:**
- EN: "Technical logs of each AI request (time, request type, success or error code, token counts, processing time), linked to your account. They do not contain your CV or JD text."
- VI: "Nhật ký kỹ thuật của mỗi yêu cầu AI (thời điểm, loại yêu cầu, kết quả hoặc mã lỗi, số token, thời gian xử lý), gắn với tài khoản của bạn. Nhật ký không chứa nội dung CV hay JD của bạn."

**New S2 item:**
- EN: "Operating the service: enforcing usage limits, preventing abuse, and diagnosing errors."
- VI: "Vận hành dịch vụ: áp dụng giới hạn sử dụng, ngăn chặn lạm dụng và chẩn đoán lỗi."

**New S2 item (fitShadow, conditional):**
- EN: "When enabled, we test an alternative scoring method in the background. It records only aggregate numbers (for example the two scores, counts of matched or missing requirements, and processing diagnostics). It never contains your CV or JD text and never changes the score shown to you."
- VI: "Khi được bật, chúng tôi thử nghiệm ngầm một phương pháp chấm điểm khác. Phương pháp này chỉ ghi lại các con số tổng hợp (ví dụ hai điểm số, số yêu cầu đạt hoặc còn thiếu, và thông số xử lý). Các số liệu này không chứa nội dung CV hay JD của bạn và không làm thay đổi điểm bạn nhìn thấy."

**New S3 or S7 item (administrative access):**
- EN: "Technical logs and scoring diagnostics can be read only by our administrators, for operating and improving the service."
- VI: "Chỉ quản trị viên của chúng tôi được xem nhật ký kỹ thuật và số liệu chẩn đoán chấm điểm, nhằm vận hành và cải thiện dịch vụ."

**S8 Item 4 (replace):**
- EN: "Technical logs: deleted after [90 days / 12 months]. Scoring diagnostics: removed after 30 days. Aggregated performance metrics: at most 90 days."
- VI: "Nhật ký kỹ thuật: xóa sau [90 ngày / 12 tháng]. Số liệu chẩn đoán chấm điểm: xóa sau 30 ngày. Số liệu hiệu năng tổng hợp: tối đa 90 ngày."

**Owner decisions:**
1. Whether this is a "material change" under S11. My view: S8 and the new disclosures are material, so notify users.
2. Bump `privacyLastUpdated`, then rebuild so `generate-static-pages.ts` regenerates the crawler HTML. Per AGENTS.md, edit translations only.
3. Publish the policy only **after** the retention job is deployed, so the text is true on the day it is published.

---

## 4. OD-O1 addendum (A3.4 observation criteria, proposed)

**Status of this evidence:** this is *preliminary operational evidence*, not statistical proof of score reliability. Thirty rows can show gross disagreement, such as systematic band shifts. They cannot calibrate the score, and one run per analysis says nothing about run-to-run stability.

| # | Rule |
|---|---|
| O1 | Observe for at least **30 calendar days** after `FIT_SCORE_SHADOW` is enabled |
| O2 | At least **30 eligible** analyses (`fitShadow.eligible = true`) from **non-admin, non-test** accounts, counted **cumulatively across snapshots**: the 30-day `fitShadow` purge means the table can't be the tally |
| O3 | Exclude `profiles.role = 'admin'` and an owner-maintained list of test or synthetic account ids, recorded by id in the observation doc, never by email |
| O4 | **Weekly counts-only snapshots,** taken by an admin before rows age out. Each records eligible and ineligible counts by `reason`, the canonical × shadow band matrix, absDiff p50/p90/max, counts by `inputMode`, and the snapshot's cumulative eligible total. No `user_id`, no row-level data |
| O5 | If O2 is unmet at day 30, extend in 14-day steps. At day 90 the owner decides whether to accept, revise the contract or stop |
| O6 | **No automatic authority switch.** `FIT_SCORE_AUTHORITY` stays non-operational in code |
| O7 | A3.5 needs **separate owner approval** after reviewing the snapshot series, the experience-row subset (the A3.2 §6 over-score risk), the eligibility rate and the OD-17 fixtures |
| O8 | Preconditions to start observing: the #103 retention is live (done); the policy wording in §3 is published (or explicitly waived); P1 retention decided |

Traffic context: about 1.5 eligible non-admin analyses a day (45 in 30 days), so O2 should be met within about 3–4 weeks.

---

## 5. Remaining risks and decisions

1. **Main DB-tests is red at `58e14ca`.** Rerunning the failed job, or pushing this branch, should turn it green. Owner: authorize the rerun or the push.
2. **Transport flake.** About 1 in 35 CI runs; observed locally in 2 of 6 full runs. Options:
   - accept it, with the new diagnostics;
   - add an app-level single retry of idempotent RPCs on gateway 502. This changes fail-closed quota and rate-limit behaviour, so it needs owner approval.
3. **P1 retention:** B (default) vs C. Both are blocked on **counsel for §2.4 (a)–(c)**. The 90-day gap grows daily.
4. **Data localization and cross-border transfer (§2.4 b):** a separate legal question, possibly larger than P1.
5. **Policy wording (§3):** approval, material-change notice, date bump and static rebuild; publish after retention is deployed.
6. **OD-O1 addendum (§4):** approve or amend. A3.4 needs its own approval.
7. **Known, unchanged:**
   - default-ACL hardening for the other 9 tables;
   - F-CRASH, the local PG 17 backend crash, to be investigated off production.
