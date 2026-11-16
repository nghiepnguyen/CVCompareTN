# M2-D3 — Production Migration Apply

- **Date:** 2026-11-16
- **Production project:** `pgchcnmpuknbgyljdlyp` (cvFit.pro)
- **Approved SHA:** `d3c9c87e06505b17286f19f92a34ad268cf10f84`
- **Migration:** `20261117000000_candidate_analysis_ownership.sql`
- **sha256:** `45aa51618439a10da83e44cce281ece0d3e5cc42eaf36e0e521c1dd1f54f160b`

This was a migration apply only. No application code was merged or deployed. PR #83 remains a draft with auto-merge disabled.

## 1. Pre-apply gate

| Check | Result |
|---|---|
| Isolated checkout | Detached worktree at `d3c9c87`, created in the session scratchpad. It was not the main checkout and not the old M2-D2 worktree. |
| Working tree | Clean (`git status --porcelain` was empty right before `db push`) |
| Linked project | `pgchcnmpuknbgyljdlyp` (from `supabase/.temp/project-ref`) |
| Migration checksum | `45aa5161…f160b`, as approved |
| Pending set | 90 migration files locally, 89 recorded in production |
| `supabase db push --dry-run --linked` | "Would push these migrations: • 20261117000000_candidate_analysis_ownership.sql", and nothing else |

## 2. Apply

`supabase db push --linked`:
- **Time:** 10:00:53 to 10:01:00 UTC.
- **Output:** "Applying migration 20261117000000_candidate_analysis_ownership.sql... Finished supabase db push."
- **Flags:** no `--include-all`, no manual history edits.

After the apply, the temporary checkout was unlinked (`supabase/.temp` removed) and its worktree was removed.

## 3. Migration history

| | Before (09:59:59Z) | After (10:01:14Z / 10:17:22Z) |
|---|---|---|
| latest 3 | `20261116000000, 20261105000000, 20261104000000` | `20261117000000, 20261116000000, 20261105000000` |
| count | 89 | 90 |
| `20261117000000` recorded | 0 | 1 |
| md5 of the other versions | `45819891553393b5a273a91a2ead58a4` | identical |

## 4. Post-apply verification

The checks used read-only SQL in the Dashboard SQL Editor: `supabase/tests/candidate_analysis_ownership.prod_verify.sql`, plus an owner and lock check.

| Check | Expected | Actual | Result |
|---|---|---|---|
| New columns | `analysis_attempt_id uuid NULL`, `analysis_started_at timestamptz NULL`, no defaults | same | PASS |
| `claim_candidate_analysis(uuid,uuid,boolean)` | definer, `search_path=""`, md5 `bf5e791b…4161`; EXECUTE authenticated only | definer=true, `search_path=""`, md5 `bf5e791b5203fbf3d3a2f73fb7a34161`; anon=false, authenticated=true, service_role=false | PASS |
| `save_candidate_analysis_attempt(uuid,uuid,uuid,jsonb,integer)` | definer, md5 `6f45373c…5082`; service_role only | definer=true, `search_path=""`, md5 `6f45373c2ae16317386b682b0db55082`; anon=false, authenticated=false, service_role=true | PASS |
| `candidate_analysis_lease_seconds()` | invoker, md5 `09e530bc…fe84`; no EXECUTE for anyone | definer=false, md5 `09e530bcc6e98541f46705b12497fe84`; all false | PASS |
| Owners of new functions | same owner as existing functions | `postgres` (same as `save_candidate_analysis`, `reserve_analytics_quota`, `sync_campaign_counters`, `candidate_cvs`) | PASS |
| Existing public functions (61): md5 of body, definer flag and ACL | unchanged | `9e588e8a11340d582a65173b30f8d299`, identical | PASS |
| 5-arg `save_candidate_analysis` | unchanged | md5 `9f1d2bfc…bc08`; service_role=true, authenticated=false | PASS |
| Quota functions (check/increment/reserve/commit/release) | unchanged | identical md5 | PASS |
| `candidate_cvs` columns other than the new two | unchanged | `d361d248d142c7631326515ebfc2d7fd` | PASS |
| Triggers, policies (md5), table ACL, indexes, default ACL | unchanged | identical | PASS |
| Candidates | `done=11`, results md5 unchanged | `done=11`, `bc4734a256b4ae260e2e88ea95f99b0d` | PASS |
| Campaign counters | unchanged | `309d1ff224ae34f526b816d327fe0b95` | PASS |
| Quota ledger | `committed=5`, md5 unchanged | `committed=5`, `aa59612756664ed9e6bd8b763a4dcd85` | PASS |
| Usage | md5 and sum unchanged | `c33cf67ae3c048f4ed032398ad813335`, sum 52 | PASS |
| Stuck `analyzing` / claimed rows / lock waits | 0 / 0 / 0 | 0 / 0 / 0 | PASS |

No unexpected schema drift was found.

## 5. Production observation (10:01 to 10:17 UTC)

- **Final snapshot (10:17:22Z):** byte-identical to the post-apply snapshot for every row except `now`.
- **Postgres logs (last hour):**
  - 31 entries, all LOG-level statements from the migration itself;
  - no ERROR, FATAL or PANIC;
  - no new entries after the apply.
- **Vercel production request logs since 09:30Z** (read with the Vercel CLI; the web logs page required a fresh login, so no sign-in was attempted):
  - 6 requests in total;
  - `/api/storage` returned 200 four times;
  - the other 2 were my own probes, listed below;
  - 0 responses with a 5xx status, 0 error-level log entries.
- **Read-only probes:**
  - `https://cvfit.pro/` returns 308, then `/vi/` returns 200.
  - Unauthenticated `POST /api/recruiter/save-analysis` returns 401. The old route still boots and rejects before any RPC.
  - `POST /api/analyze` with an empty body returns 400 from input validation, so Gemini is never reached.
- No recruiter traffic happened during the window, so no live recruiter flow was exercised. This was by design: no Gemini calls and no test writes.
- Quota counters did not change, and no candidate changed state.

## 6. Existing app compatibility

**Compatible.**
- The deployed app (`e05622a`) does not reference the new objects.
- Its direct status writes and the 5-arg save are unchanged, which the local concurrency check 8 already verified.
- Nothing regressed in production during the window.

## 7. Remaining risks

- Low traffic means the 15-minute window gives weak signal for the recruiter path. The real exercise comes with the code deploy and the smoke test.
- Until PR #83 is deployed, production is protected only as before M2-D3. The stale-analyzing recovery and the strict fence are not live yet.
- Known debt from the design report:
  - §7.1: re-analysis after confirmation is charged (D1);
  - §7.2: the strict fence discards a paid result when another tab claims the row;
  - §7.3: a request still in transit can cause a charge;
  - §7.5: old browser tabs during rollout;
  - §7.6: ledger rows must be retained (constraint for M2-Q Q-1);
  - users can write the attempt columns of their own rows directly; this affects only themselves.
- **Rollback** (needs approval):
  - with only the migration live: run `supabase/rollback/20261117000000_candidate_analysis_ownership.sql`, then `supabase migration repair --status reverted 20261117000000`;
  - after the app deploy: roll back the app first.

## 8. Recommendation for PR #83

**GO to merge, under separate approval.**
- The migration is live and verified. CI passed on `d3c9c87`. The old app is unaffected.
- **Merging auto-deploys production.**
- Smoke test right after, with the test recruiter account:
  1. A fresh candidate is analyzed once, `analysis_attempt_id` is set, and the ledger `request_key` equals it.
  2. A second tab during the run shows the candidate as analyzing and does not analyze it.
  3. "Để sau" / "Not now" in the confirmation dialog makes no `/api/analyze` call.
- Watch save-analysis 409s, claim RPC errors and stuck `analyzing` rows for 30 minutes.

## 9. Release: code deploy and production smoke test

### Code deploy
- **PR #83:** squash-merged by the owner as `095b993` at 10:26:01Z. Its tree is identical to `d3c9c87`.
- **CI on `main`:** passed.
- **Vercel production deploy** `7821429109`: Ready. The live bundle `index-Kph6mayE.js` contains `claim_candidate_analysis`.

### Smoke test
- **Account:** test account `044c3afb` (email login), upgraded by the owner to the Recruiter plan for this test.
- **Data:** campaign "M2-D3 smoke 2026-11-16" with one synthetic, fictional CV taken from `scripts/benchmark-gemini-fixtures.ts`.

| # | Scenario | Result |
|---|---|---|
| 1 | Analyze one candidate | **PASS.** `done`, score 68, run in 21 s. `analysis_attempt_id` is set (started 10:34:06Z, analyzed 10:34:25Z). The ledger row with `request_key` equal to the attempt id is `committed`, charged once. `parsed_text` is NULL and `error_message` is NULL. |
| 2 | A second tab clicks Analyze on the same pending candidate right after the first tab | **PASS.** The second tab shows "Đang PT" (analyzing) and made **no** `/api/analyze` request. Exactly one ledger row was created, so there was one Gemini call and one charge. |
| 3 | Charge-confirm dialog: "Để sau" makes no analyze call | **Not run in production.** Production has no `needs_confirm` candidates, and creating one would need direct data manipulation. Covered by `CampaignDetailView.chargeConfirm.test.tsx` and the local real-database suite. |

### 30-minute watch (10:27 to 11:05Z, read-only)
- **Vercel production:** 9 requests, all 200 (storage, config, analyze, save-analysis, admin update-user). No 5xx, no `save-analysis` 409, no error-level logs.
- **Database:**
  - 0 `analyzing` rows;
  - 1 claimed row, and it has its ledger row;
  - ledger rows created since the deploy: `committed=1`;
  - 0 open `reserved` rows.

### Verdict
**M2-D3 is released.** Production smoke for scenarios 1 and 2 passed. Scenario 3 is verified offline only.

The smoke campaign is still in the test account. Leftover debt is listed in §7.
