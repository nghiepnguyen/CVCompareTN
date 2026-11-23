# CI transport reliability: Kong ↔ PostgREST keep-alive race

- **Date:** 2026-11-23
- **Branch:** `ci/db-stack-transport-fix` (worktree `../cv-compare-tn-transport`), from `origin/main` `b1c16cc` (PR #105 merged).
- **Scope:** test stack only.
  - **No application code, no production database, no migrations, no app retry changes.**
  - Fail-closed behaviour is unchanged and now also pinned by tests.

## 1. Baseline

| Item | State |
|---|---|
| PR #105 (diagnostics) | merged as `b1c16cc` |
| Main DB tests | `58e14ca` failed on attempt 1 and passed on the approved single rerun. `b1c16cc` **failed**, run 45129213525 |
| Run 45129213525 diagnostics (from #105) | printed `kong upstream drops: 1`, `postgres backend crashes: 0`. The #105 counter matched only "upstream prematurely closed"; the log actually holds **2** drops (the second is "Connection reset by peer"). This PR's workflow counts both forms |
| Kong error log at 07:12:51, same second as both failures | `recv() failed (104: Connection reset by peer)` and `upstream prematurely closed connection`, both on `POST /rest/v1/rpc/reserve_analytics_quota`. These two simultaneous drops match the two failing tests (`m2q2c` "2." and `m2q1b` "two parallel requests"), each a fast 503 |
| Test stack | Supabase CLI local stack: Kong 2.8.1 (`public.ecr.aws/supabase/kong:2.8.1`) → PostgREST 14.10 → Postgres 17.6. Kong defaults `upstream_keepalive_pool_size = 60`, `upstream_keepalive_idle_timeout = 60` |
| Frequency without the fix | **Local:** 3 of 9 valid same-day full `db-tests.sh` runs failed (33 %): the OD-M2 run, the P0-H run, 6 triage runs and 1 diagnostics run; one OD-M2 setup run without `node_modules` is excluded. **CI:** 2 failed DB-test runs on main out of about 37 |

## 2. Root cause (reproduced deterministically)

1. **PostgREST closes idle keep-alive connections in batched sweeps.** Warp, its HTTP server, uses a 30 s timeout. Three connections opened 7 s apart all closed at the **same instant**, after 45.2, 38.3 and 31.3 s idle. So an idle connection dies at a sweep somewhere between **30 and 60 s** idle, and every eligible connection dies together.
2. **Kong keeps idle upstream connections for 60 s.** A request Kong sends on a pooled connection at the moment a sweep closes it gets an empty or reset response, and Kong returns **502** "An invalid response was received from the upstream server".
3. **Every observed failure was a POST** (RPCs and inserts). That is consistent with nginx's documented default, `proxy_next_upstream error timeout`, which since nginx 1.9.13 excludes non-idempotent requests. Kong's generated `nginx-kong.conf` does not override that directive (checked). GET retries were not separately tested.
4. **The app fails closed, as designed.** A 502 carries no SQLSTATE, so `reserveMonthlyQuota`, `reserveAiCall` and `checkCandidateAttempt` all return `unavailable`. `handleAnalyze` answers a fast 503 (`quota_unavailable`, "Rate limit verification unavailable" or "Candidate verification unavailable") before any Gemini work.
5. **Why it clusters:** the DB suites run bursts of parallel requests, which fill Kong's pool. When the next burst lands on a sweep, several requests fail at once.

**Deterministic reproduction:** `sweep-aligned-probe.mjs`, in the report appendix.
- A sentinel connection inside the Kong container times one Warp sweep.
- Each round fills the pool with 60 parallel `POST /rpc/current_quota_cycle` (a read-only RPC) 31 s before a sweep, then sends 60 more at sweep + offset.

| Kong config | offsets (ms) | requests | 502s | Kong drops |
|---|---|---|---|---|
| Supabase default (idle 60 s) | −150, −75, **−25**, **0**, 25, 75, 150, 300 | 480 | **35** (16 at −25 ms, 19 at 0 ms) | 35 |
| **Fixed (idle 10 s)** | −50, −25, −10, 0, 10, 25, 50, 100 (denser around the sweep) | 480 | **0** | 0 |

Two non-aligned probes on the default config showed **no** failures: random 0.2–35 s gaps (863 requests) and bursts at 59.8–60.2 s (320 requests). The race needs reuse at a sweep instant. That explains why it is rare per request but common per suite run.

## 3. Fix (test stack only)

**`scripts/ci/db-stack.sh`**
- After `supabase start`, run `KONG_UPSTREAM_KEEPALIVE_IDLE_TIMEOUT=10 kong reload` in the stack's Kong container. 10 s is safely below Warp's 30 s minimum idle close, so Kong always drops an idle upstream connection before PostgREST can.
- Then check that `.kong_env` shows `upstream_keepalive_idle_timeout = 10`, and **fail closed** if it doesn't: CI never silently runs on a racy stack.
- Keep-alive itself stays enabled; only stale connections are dropped earlier.

**`scripts/ci/db-tests.sh`**
- At start, check that the Kong setting is still in place. A Kong restart, for example after some CLI commands, would otherwise bring the race back unnoticed.

**No retry wrapper was added.** The transport fix removes the cause, so per the brief no test-side retry is needed. §4 records why blind retries would have been unsafe anyway.

## 4. Retry safety matrix (all RPCs and table calls used by the DB integration suites)

| Operation | Kind | Idempotency | Safe to replay on a 502 alone? | What the code does today |
|---|---|---|---|---|
| `current_quota_cycle`, `analytics_quota_lock_state` | read-only RPC | n/a | yes | single call (tests only) |
| `GET` table reads (profiles, ledger, history, `candidate_cvs`, `analysis_log` head count) | read-only | n/a | yes (nginx's default may already retry them; not tested) | the candidate gate fails closed with 503; the hourly cap fails open |
| `reserve_analytics_quota` | mutation | request key (`p_request_key`): a replay answers `duplicate` | **no**: a replay after an unknown first attempt returns `duplicate` → 409, changing the outcome | single call → `unavailable` → 503 (pinned by test) |
| `consume_api_rate_limit` | non-idempotent mutation (increments hits) | none | **no**: double-counts the hourly slot | single call → 503 and quota released (pinned) |
| `claim_candidate_analysis` | mutation | attempt id; a second claim can return `needs_confirm` or `done` | **no**: the outcome depends on state | tests call it once |
| `commit_analytics_quota`, `commit_analytics_quota_and_save_candidate` | settlement mutation, **unknown outcome** on transport errors | reservation id; the ledger replays `committed` and never double-charges | only as the existing bounded settle (3 attempts, same args); never re-runs Gemini | M2-Q 2C `settle()`, unchanged. All-fail → 503 `quota_settlement_unknown` (pinned) |
| `release_analytics_quota` | settlement mutation | reservation id (released or refunded is terminal) | same rule as settle | existing behaviour unchanged |
| `save_candidate_analysis_attempt`, `save_candidate_analysis` | fenced mutation | attempt id fence | **no** blind replay | existing behaviour unchanged |
| `activate_pro_plan`, `admin_set_user_plan` (fixtures) | admin mutations | n/a | **no** | tests call them once |
| `POST` inserts in fixtures (campaigns, candidates, history, profiles upsert) | mutations | none in general | **no** | single call |
| GoTrue `admin.createUser` / `signInWithPassword` | auth mutation / token | not idempotent | **no** | single call |

**Conclusion:** a transport-level retry of POSTs is unsafe for most of these operations. The race had to be removed at the gateway, and was.

## 5. Tests

**New `src/__tests__/services/transport502FailClosed.test.ts`** runs in the normal suite with no DB. It uses the real `handleAnalyze` and injects a supabase-js-shaped gateway 502 (`code: ''`, gateway message) into one dependency at a time:

| Case | Asserts |
|---|---|
| reservation 502 | 503 `quota_unavailable`; reserve called **once**; no AI-slot call; no Gemini call |
| AI slot 502 | 503 "Rate limit verification unavailable"; slot called **once**; reservation released once; no Gemini |
| candidate gate 502 | 503 "Candidate verification unavailable"; no reservation; no Gemini |
| settlement 502 on every attempt | 503 `quota_settlement_unknown`, `retryable: false`, no score in the body; **3** commit calls with **identical** args (same reservation id); Gemini called **once**; reserve once |
| control, no 502 | 200; exactly one reservation, slot and commit |

**Mutation checks:**
- Adding a retry to `reserveMonthlyQuota` fails 1 test.
- Changing settle attempts from 3 to 4 fails 1 test.
- App code was restored afterwards; `git diff -- _server-lib` is empty.

**Existing suites kept unchanged:** `quota_unavailable`, rate-limit unavailable, unknown settlement, concurrent reservations, fail-closed behaviour, and no duplicate charges. The injected faults in `m2q2cAtomicSettlement` are client-side mocks, and nothing retries them. No status assertion was weakened.

## 6. Validation (fixed budget: 6 full runs, all kept)

I fixed the budget before running anything: 6 full `db-tests.sh` runs. Each ran on a freshly started stack via the modified `db-stack.sh`. Every result was kept.

### 6.1 Results

| Run | Stack | Suites | Kong drops | Fix applied |
|---|---|---|---|---|
| 1 | ok | **34/34** | 0 | yes |
| 2 | ok | **34/34** | 0 | yes |
| 3 | ok | **34/34** | 0 | yes |
| 4 | ok | **34/34** | 0 | yes |
| 5 | ok | **34/34** | 0 | yes |
| 6 | ok | **34/34** | 0 | yes |

- **The proof is the deterministic probe (§2):** 35 of 480 requests failed with the default config; 0 of 480 failed with the fix, even with bursts placed more densely around the sweep. The 6 runs are supporting evidence only:
  - **Local baseline:** 3 of 9 valid unfixed runs failed (33 %). With an unchanged rate, 6 clean runs would still happen by chance about 9 % of the time ((2/3)⁶).
  - **CI baseline:** about 2 failures in 37 runs. Six runs say almost nothing about a rate that low.
- **Failure frequency after the fix:** 0/6 runs, 0 Kong upstream drops.
- **Unit suite and lint:**
  - `npm test`: 133 files passed, 8 skipped; **2059 passed**, 76 skipped. This includes the 5 new fault-injection tests.
  - `npm run lint` and `npm run lint:api`: pass.
- **No production code or migrations changed:** `git diff --name-only origin/main -- _server-lib src/services api server server.ts supabase` is empty apart from tests.

## 7. Known limitations

- **First run on GitHub's runner:** the fix was validated on Docker Desktop (aarch64). This PR's own Database tests job is the first run on GitHub's x86_64 runner. If the guard fails there, the reload doesn't take on that runner, and that is a result to report, not something to rerun until green.
- **Stricter local harness:** `db-tests.sh` now refuses a stack that wasn't started with `db-stack.sh`, including after a local `supabase db reset` that restarts Kong. Anyone following the older local harness recipe will see that refusal; rerun `db-stack.sh`.
- **Weak production evidence:** 0 production rows is weak evidence at about 2 analyses a day. The safety claim rests on the app failing closed (tested), not on that count.

- **Local stack only.** Production uses Supabase's hosted gateway, which this does not change. Production has logged **0** rows with these fail-closed codes. If hosted infrastructure ever showed the same race, the app would still fail closed: no charge, no Gemini call, 503 retryable.
- **It depends on the CLI's Kong image** honouring `KONG_UPSTREAM_KEEPALIVE_IDLE_TIMEOUT` via `kong reload`; this was verified on Kong 2.8.1. If a future CLI changes Kong, the fail-closed check in `db-stack.sh` and `db-tests.sh` stops CI with a clear message instead of flaking.
- **Warp's 30 s timeout was measured, not read from configuration.** The 10 s margin covers reasonable changes; a PostgREST below 10 s would need the value revisited.
- **Local `supabase db reset`** may restart services. `db-tests.sh` detects a lost setting and refuses to run.

## Appendix: probes (committed as `docs/audits/evidence/2026-11-23-transport-*.txt`; container names use the local project id `cvfit_odm2`, in CI it is `cvfit_ci`)

- `idle.lua` (resty inside the Kong container): sends one keep-alive request to `rest:3000` and times the idle close.
- `kong-burst-probe.mjs` / `kong-race-probe.mjs`: the non-aligned probes.
- `sweep-aligned-probe.mjs`: the deterministic reproduction in §2.
