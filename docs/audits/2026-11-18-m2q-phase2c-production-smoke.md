# M2-Q Phase 2C — Production Release and Smoke

- Date: 2026-11-18
- Release: PR #91, squash-merged by the owner as `056787fe9aeb0a07eaec1a0bec05d81dfe937f09` at 09:56:33Z
- Owner authorization: **one** controlled, paid Gemini call. No fault injection, no artificial timeouts, no schema changes and no manual ledger edits were used.
- Related: [implementation](2026-11-18-m2q-phase2c-implementation.md), [preflight](2026-11-18-m2q-phase2c-release-preflight.md), [migration apply](2026-11-18-m2q-phase2c-migration-apply.md)

**Result: PASS WITH KNOWN DEBT.** All ten checks passed. Sentry could not be opened; a proxy was used instead (§5). The known debt is listed in §6.

## 1. Preconditions

| Check | Result |
|---|---|
| Production deployment | `dpl_3ibs5GvMdn8EtVwGKZi3tyPwnie9`, target production, state Ready, `githubCommitSha` = `056787f…`, ref `main` |
| Served release | cvfit.pro (www redirects to apex) serves `/assets/index-Cl3T27zk.js`, which contains `quota_settlement_unknown` |
| Migration `20261118000000` | applied and verified at 09:44Z (migration apply report) |
| Smoke account | `044c3afb…`; the signed-in session user id prefix was checked before any action; plan recruiter, limit 20, cycle `2026-11-17` |
| Production quiet | 0 open reservations in production before the run |

## 2. Baseline (read-only SQL, Dashboard SQL Editor)

- `usage_count` = **2**.
- The ledger has **8** rows, all `committed/charged`. The latest is `909852f6…` from the 2A smoke.
- Campaign "M2-D3 smoke 2026-11-16" (`89528873…`) has counters 3/3, with 3 candidates, all `done`.
- The analysis log has 0 analyze rows in the last hour.

## 3. Execution

1. Opened the smoke campaign at cvfit.pro/vi/recruiter.
2. Uploaded one synthetic CV, `m2q2c-smoke-cv.txt`: plain text, a fictitious profile, contact `smoke-test@example.test`.
   - It went through the normal UI upload, set on the page's file input. The only API request was `POST /api/storage`, with no Gemini call.
   - The candidate appeared as pending ("Chờ PT").
3. Clicked Analyze **once**. Only that one candidate was pending, and the result came back in about 10 s.

## 4. Verification

| # | Requirement | Evidence | Result |
|---|---|---|---|
| 1 | HTTP 200 | `POST /api/analyze → 200` | ✅ |
| 2 | Exactly one Gemini call | one `/api/analyze` in the tab's network log; one `analysis_log` analyze row for the account in the last 15 min (`success`) | ✅ |
| 3 | Exactly one committed/charged reservation | one ledger row for request key = attempt `32ca6652…`: `committed/charged`, settled 9.7 s after reserve; account ledger 8 → 9, all `committed/charged` | ✅ |
| 4 | `serverSave = saved` | response body `"serverSave":"saved"`, `matchScore: 82` | ✅ |
| 5 | Candidate `done` | `9af06f05…` `status=done`, `match_score=82`, `analysis_result.matchScore=82`, `analysis_attempt_id=32ca6652…`, analyzed 10:03:50Z; campaign counters 3/3 → 4/4 | ✅ |
| 6 | Persists after reload | reloaded the page and reopened the campaign: score 82; page resources show no `/api/analyze` and no claim RPC | ✅ |
| 7 | Second tab reads the same result | a fresh tab lists 82; opening the candidate shows the stored analysis (main factor text, score 82); no analyze or claim call | ✅ |
| 8 | No browser fallback save | no `/api/recruiter/save-analysis` request | ✅ |
| 9 | No duplicate charge or stuck candidate | 1 ledger row for the attempt; usage **2 → 3** (+1); all account candidates `done`; 0 open reservations in production | ✅ |
| 10 | No new `quota_commit_unknown` / `quota_commit_failed` | see §5 | ✅ (by proxy) |

## 5. Sentry

Sentry was **not accessible**: the built-in browser was redirected to the Sentry login page, and no credentials were used.

Proxy evidence:
- The handler writes `analysis_log.error_message = '[quota_settlement_unknown]'` or `'[quota_settlement_unavailable]'` in the same branch that sends the Sentry messages `quota_commit_unknown` / `quota_commit_failed`.
- Production-wide, the count of those rows in the last hour is **0**.

Confirming in the Sentry UI is an optional owner check.

## 6. Known debt (unchanged by this release)

- **Personal path:** a charged result can still be lost on an unknown outcome. This needs a personal result store, deferred by decision Q-D4.
- **Nothing committed, or process crash:** the existing forgiveness policy applies (2 per cycle).
- **Preview credentials:** Preview shares the production Supabase and Gemini credentials.
- **Q-6:** service_role still has DELETE/TRUNCATE on the ledger.
- **Function drift:** the fallback literal in `get_default_monthly_analytics_limit()` is 20 in production and 5 in the migrations. The effective value is 5.
- **Backups:** the Supabase Free plan has no platform backups. A pre-migration logical dump is kept by the owner, outside the repository.
- **Unknown paths:** the unknown and late-commit paths are verified offline only (real-DB fault injection in CI). They were not exercised in production by design.
- **Bounded retries:** keeping same-reservation retries after an unknown attempt still awaits explicit owner confirmation.

## 7. Artifacts left in production

- Candidate `m2q2c-smoke-cv` (`9af06f05…`) in the smoke campaign.
- Its ledger row `32ca6652…`, `committed/charged`.

Both are billing evidence and must be kept; there is no cleanup.

No further paid calls were made.
