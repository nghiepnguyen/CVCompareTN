# M3-B OD-M2 follow-up: permissions (P0), privacy (P1), OD-O1 addendum

- **Date:** 2026-11-23
- **Branch:** `docs/m3b-odm2-followups` (worktree `../cv-compare-tn-m3b-odm2-fu`), from `origin/main` `90f050b`. Docs only, committed locally.
- **Related PR:** #103 (`feat/m3b-odm2-fit-shadow-retention`, `487963b`, draft). That PR is unchanged.
- **Mode:** read-only.
  - Production queries returned only privileges, ACLs, policy names and counts. No row content and no personal identifiers.
  - **No grant, data, migration, flag or policy change.** 0 Gemini calls. A3.4 not started.
- **Status:** these are proposals. Each one needs its own owner approval.
- **Update (later the same day):** §1 was released as PR #104 (`58e14ca`). §2 and §3 are superseded by `2026-11-23-post-p0h-ci-triage-p1-privacy-preflight.md`, which revises the option A recommendation: NULLing `user_id` is pseudonymization, not anonymization.

---

## 1. P0: `analysis_log` privileges

### 1.1 Effective privileges (production, `has_table_privilege`)

| Role | super | bypass RLS | SELECT | INSERT | UPDATE | DELETE | TRUNCATE | TRIGGER | REFERENCES |
|---|---|---|---|---|---|---|---|---|---|
| `anon` | no | no | yes | yes | yes | yes | **yes** | yes | yes |
| `authenticated` | no | no | yes | yes | yes | yes | **yes** | yes | yes |
| `service_role` | no | **yes** | yes | yes | yes | yes | yes | yes | yes |
| `postgres` (owner) | no | yes | yes | yes | yes | yes | yes | yes | yes |

- The ACL is `{postgres=arwdDxtm, anon=arwdDxtm, authenticated=arwdDxtm, service_role=arwdDxtm}`.
- `authenticator` holds nothing directly; it switches into `anon`, `authenticated` or `service_role`.
- The source is Supabase's **default privileges** in `public`. Every table created by `postgres` or `supabase_admin` gets `arwdDxtm` for `anon`, `authenticated` and `service_role`.
- The original migration's `REVOKE ALL … FROM PUBLIC` did not remove these grants, because they are role-specific.

### 1.2 What actually protects the table today

- RLS is enabled and not forced. There is one policy, `admins_can_read_analysis_log` (SELECT, `is_admin()`), and **no INSERT, UPDATE or DELETE policy**.
- For `anon` and `authenticated`, DML is denied row by row. Verified on a local stack in `purge_fit_shadow.test.sql`: as a non-admin, SELECT returns 0 rows and UPDATE and DELETE affect 0 rows.
- **TRUNCATE is not subject to RLS.** It is not reachable through PostgREST or pg_graphql, which expose no TRUNCATE. It is reachable only through raw SQL as that role, or through a future SECURITY INVOKER function that runs dynamic SQL.
- **Assessed severity:** not exploitable through the current API surface. The only control is RLS, and it is one policy change away from failing open. The hourly AI cap counts these rows (`_server-lib/accountLock.ts:59-93`), so any permissive DELETE policy added later would let a user erase their own rows and evade the cap. **Treat it as high-priority hardening (owner label: P0), not as an active incident.**

### 1.3 Same pattern elsewhere (informational)

10 of 20 `public` tables grant `anon` TRUNCATE plus full DML:
- `admin_audit_log`
- `analysis_log`
- `app_settings`
- `candidate_cvs`
- `history`
- `payments`
- `profiles`
- `recruitment_campaigns`
- `saved_cvs`
- `saved_jds`

All have RLS enabled. Their policies grant `authenticated` only. `admin_audit_log`, `analysis_log`, `app_settings` and `payments` have SELECT-only policies.

The other 10 tables do not grant `anon` TRUNCATE. Their exact privileges were not reviewed here. A follow-up should apply the same review to the 9 tables besides `analysis_log`; `admin_audit_log` and `payments` come first, as security and billing evidence.

### 1.4 Minimum grants required by legitimate workflows

| Workflow | Role | Needs |
|---|---|---|
| Write one row per AI call (`_server-lib/analysisLog.ts:38`, `getSupabaseAdmin().insert`) | `service_role` | INSERT |
| Hourly AI cap and document cap (`_server-lib/accountLock.ts:80-86`, head count) | `service_role` | SELECT |
| Admin Report tab (`admin_report_stats`, `admin_report_ops` are **SECURITY INVOKER**, called from `src/services/adminReportService.ts:140`) | `authenticated` + RLS `is_admin()` | SELECT |
| fitShadow retention (`purge_expired_fit_shadow`, DEFINER, owner `postgres`) | `postgres` | UPDATE (as owner) |
| Account deletion (`auth.users` delete → FK `ON DELETE SET NULL`) | FK action, runs as the referencing table's owner | none for app roles |
| Anything | `anon` | **nothing** |

Other facts relevant to the plan:
- No server code updates, deletes or truncates `analysis_log`, and no migration writes to it other than the PR #103 purge.
- No triggers are defined on the table.
- The browser never queries the table directly; the only browser path is the admin RPCs.

### 1.5 Remediation plan (P0-H): proposed, NOT applied

This is a separate migration modeled on M2-Q H1 (`20261120000000_ledger_revoke_destructive_grants.sql`), with a matching rollback file under `supabase/rollback/`.

```sql
-- Proposed only. analysis_log keeps exactly what the app needs.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES
  ON public.analysis_log FROM anon, authenticated;
REVOKE SELECT ON public.analysis_log FROM anon;            -- no anon reader exists
REVOKE UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES
  ON public.analysis_log FROM service_role;                -- keeps SELECT, INSERT
-- authenticated keeps SELECT (admin INVOKER RPCs, still gated by RLS is_admin()).
```

**Steps:**
1. Write the migration, the rollback (`GRANT … TO …` restoring `arwdDxtm`) and a test, `supabase/tests/analysis_log_grants.test.sql`. The test asserts the privilege matrix after apply and checks that:
   - `logAnalysisAttempt` as `service_role` still inserts;
   - the hourly-cap head count as `service_role` still works;
   - `admin_report_stats` as an admin still returns rows;
   - the PR #103 purge still works as owner;
   - anon has no privileges at all.
2. Add a `analysis_log_grants.prod_verify.sql` (read-only matrix) on the pattern of `ledger_grants.prod_verify.sql`.
3. Run the full DB suite. Some local fixtures may insert into `analysis_log` as `service_role` with UPDATE; adjust them if they fail, as H1 did.
4. **Default privileges:** decide whether to also change `ALTER DEFAULT PRIVILEGES … IN SCHEMA public` so new tables stop getting TRUNCATE and DML for `anon`. This is a platform-wide change with a wider blast radius, so treat it as a separate decision and keep it out of P0-H.
5. **Ordering:** independent of PR #103. It can land before or after; the purge runs as owner either way.

**Risk:**
- Low, if the test matrix passes.
- Rollback is the rollback file.
- No data changes.

---

## 2. P1: privacy (90-day promise vs practice)

### 2.1 Facts (production, counts only)

- **The promise:** `legal.ts` privacy S8 Item 4 says "Technical logs and anonymous performance metrics: at most 90 days." The Vietnamese text says the same. Last updated: Sep 22, 2026.
- **Practice:** `analysis_log` has no retention job (cron jobs: purge-free-history, purge-api-rate-limits, storage-cleanup).
  - It holds **117 rows older than 90 days, all with a non-null `user_id`**. The oldest is from 2026-07-02.
  - The table has 338 rows in total.
- **"Anonymous" is inaccurate.** Rows keep `user_id` until the account is deleted (`ON DELETE SET NULL`). Columns: tokens, model, latency, status, kind, and an error *code* (categorical since M2/SEC-2), plus aggregate `guard_metrics`. No CV or JD text.

### 2.2 Does anything require keeping these rows longer?

| Obligation | Where it actually lives | Needs `analysis_log` beyond 90 days? |
|---|---|---|
| Billing and payments | `payments` table, PayOS | No |
| Quota ledger | `analytics_quota_reservations` (and `profiles` counters) | No. Quota is decoupled from logs |
| Hourly AI cap | `analysis_log`, **1-hour window** | No |
| Admin security evidence | `admin_audit_log` | No |
| Admin Report tab | `analysis_log` aggregates. Presets today/7d/30d, custom range optional | Only for custom ranges older than 90 days, and only **per-user attribution** ("top users"). Totals, daily volume and tokens survive unlinking |
| Legal or regulatory log retention | **Not determined here.** Vietnamese rules (for example Decree 13/2023 on personal data, Decree 53/2022 under the Cybersecurity Law) may impose storage duties on some providers | **Needs owner or legal review.** Do not treat this report as legal advice |

### 2.3 Options

| Option | Effect | Admin reports | Hourly cap | Reversible | Policy text |
|---|---|---|---|---|---|
| **A. Unlink** (`UPDATE … SET user_id = NULL WHERE created_at < now() - 90 days`, daily cron, DEFINER, `service_role` only, the PR #103 pattern) | rows kept, no longer account-linked | totals intact; "top users" for older than 90 days shows none | none (1 h) | no (the link is gone) | keep "at most 90 days" (linked); replace "anonymous" |
| B. Delete rows older than 90 days | rows gone | history older than 90 days lost (tokens, cost trend) | none | no (backup only) | as is |
| C. Change the policy to match practice (for example "linked for as long as the account exists") | nothing in the DB | unchanged | unchanged | yes | material change, so notify per S11 |

**Recommendation: A.**
- It keeps operational aggregates, matches the "avoid row deletion" constraint used for OD-M2, and keeps the existing promise.
- It needs a migration plus a test (29/30/31-day-style boundaries at 90 days, rows already NULL, other columns untouched, idempotent, one cron job), a prod_verify script and a pre-apply backup.
- The first run unlinks the 117 historical rows. That is irreversible, so it needs explicit owner approval to modify historical data.
- If there is any doubt about legal retention (§2.2), approve wording C or a legal review before A.

**Wording (with A):** replace S8 Item 4 with "Technical logs and performance metrics: linked to your account for at most 90 days, then kept only without your account identifier." In Vietnamese: "Nhật ký kỹ thuật và số liệu hiệu năng: gắn với tài khoản của bạn tối đa 90 ngày, sau đó chỉ được lưu mà không kèm định danh tài khoản." Add the `fitShadow` item from the OD-M2 report. Bump `privacyLastUpdated` and rebuild the static pages (`generate-static-pages.ts` reads `legal.ts`).

---

## 3. OD-O1 addendum (replaces the A3.2 §7(a) evidence bar for the A3.4 observation)

**Why:** real non-admin traffic is about 1.5 successful analyses a day (45 in 30 days, 6 users; admins 21). The A3.2 bar of 200 rows in 14 days would take about 130 days, and 30-day retention never holds more than about 45–66 rows.

| # | Rule |
|---|---|
| O1 | **Minimum duration: 30 days** of shadow observation after the flag is enabled |
| O2 | **Minimum sample: 30 eligible** (`fitShadow.eligible = true`) analyses from **non-admin, non-synthetic** accounts |
| O3 | **Exclusions:** rows from `profiles.role = 'admin'` and from owner-designated test or synthetic accounts are excluded. The list of test accounts is recorded in the observation doc, by id only, never by email in the doc |
| O4 | **Weekly counts-only snapshots,** taken by an admin before rows age out of the 30-day `fitShadow` retention, and recorded in the observation audit doc. Each snapshot holds: eligible and ineligible counts by `reason`; a canonical×shadow band matrix; absDiff p50/p90/max; counts by `inputMode`; and a list of the diagnostic counters the shadow records. **No `user_id`, no row-level data** |
| O5 | **Extension:** if O2 is not met by day 30, extend in 14-day steps. If it is still unmet at day 90, the owner decides whether to accept the evidence, revise the contract or stop |
| O6 | **No automatic authority switch.** `FIT_SCORE_AUTHORITY` stays non-operational in code. Switching needs A3.5 work and approval |
| O7 | **Owner review before A3.5:** the snapshot series, the experience-row subset (the A3.2 §6 over-score risk), eligibility rate (target ≥ 95% of successful analyses), and the OD-17 fixture check |
| O8 | **Preconditions for starting observation:** PR #103 migration applied and verified; policy wording decided (§2.3 and the OD-M2 report §4); P0-H recommended first, not strictly required |

**Snapshot SQL (to extend for O3 and O4, read-only):** start from the OD-M2 report §7.3 query and add the exclusion join:

```sql
-- … FROM public.analysis_log l LEFT JOIN public.profiles p ON p.id = l.user_id
-- WHERE l.kind = 'analyze' AND l.guard_metrics ? 'fitShadow'
--   AND p.role IS DISTINCT FROM 'admin'
--   AND l.user_id <> ALL (:test_account_ids)   -- owner-supplied list
```

Statistical caveat: 30 rows can detect gross disagreement, such as systematic band shifts. They cannot calibrate the score. A3.2 §7 already noted that shadow data measures agreement, not run-to-run stability.

---

## 4. Summary of approvals needed

1. **PR #103:** review, mark it ready, apply the migration (procedure in the OD-M2 report §6), then merge.
2. **P0-H:** authorize writing the grants-hardening migration for `analysis_log`, separately from #103. Optionally schedule a follow-up review of the other 9 tables and the default privileges.
3. **P1:** choose A, B or C for the 90-day promise, and answer the legal-retention question. Option A also needs explicit approval to unlink the 117 historical rows.
4. **Policy wording:** approve the text, the date bump and whether users are notified.
5. **OD-O1 addendum:** approve O1–O8 or amend them.
6. **A3.4:** approved separately, once 1, 4 and 5 are done.
