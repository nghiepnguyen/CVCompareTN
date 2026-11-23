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

## 8. Follow-up: residual CI failure on PR #106 (run 45138888035), UNRESOLVED

**Symptom:** on GitHub's x86_64 runner, with the fix active, one `POST /rest/v1/rpc/reserve_analytics_quota` at 08:30:36 got `recv() failed (104: Connection reset by peer) while reading response header from upstream`. That produced a 502, then a fail-closed 503 `quota_unavailable` in `m3bR0ScoreIntegrity`. The diagnostics reported `kong upstream drops: 1` and `postgres backend crashes: 0`.

**What was checked:**

| Question | Evidence | Result |
|---|---|---|
| Did the reload take effect on the runner? | The CI error came from Kong worker **1160**. In the pre-fix CI failure it was **1114**. Locally, `kong reload` replaces worker 1114 with 1160 | the runner's error is from the post-reload worker |
| Is the setting effective in the running worker, not just in `.kong_env`? | admin API (`GET :8001/` via resty, inside the container) after `db-stack.sh`: `idle=10 pool=60 maxreq=100` | effective |
| Does warp time idle from request start, making long requests unsafe under a 10 s Kong idle limit? | `longreq.lua`: after requests of 1, 20 and 40 s, warp closed the idle connection **59.0, 38.9 and 47.9 s after the response** | **no**: always ≥ 30 s after the response, well above 10 s |
| Correlation | all three logged drops (local tr_3, CI `b1c16cc`, CI #106) fell within the window of `m2q2cAtomicSettlement` test 3's lock-blocked commit attempts. Those attempts are client-aborted after 3 s (Kong logs `499`) and later hit the 8 s statement timeout | correlated; mechanism unknown |
| Does test 3 plus load reproduce it locally with the fix? | 3 rounds of test 3 alongside 40 workers hammering read-only POSTs: **33,081 requests, 0 failures, 0 Kong drops** | not reproduced |
| Do client-aborted long requests poison Kong's pool? | `abort-probe.mjs`: 80 client aborts (499) of 6 s requests with a parallel hammer of **29,503 requests: 0 failures, 0 drops** | not reproduced |

**Assessment:**
- The fix removes the proven sweep race (35 → 0, deterministic).
- One residual upstream reset remains **unexplained**. It happens only on GitHub's x86_64 runner, correlates with test 3's lock-and-abort window, and does not reproduce on local aarch64.
- Candidate explanations, all **unverified**:
  - a runner-specific network or kernel effect under the CPU contention of test 3's `docker exec` polling;
  - a different PostgREST connection-close path that only shows under that timing;
  - stale-connection reuse for a reason not yet identified.

**Not done:**
- No further fix pushed. The root cause is not understood, and the brief allows a follow-up only with a supported fix.
- No reruns.

**Options for the owner:**
- **D1. One diagnostic CI run.** A commit to the draft PR that captures full Kong logs (no tail) at `info` level, the admin-API config, warp idle timing measured on the runner, and a socket snapshot around test 3. One run, not a loop.
- **D2. Discriminating mitigation.** Set `upstream_keepalive_pool_size = 0` in the test stack, which disables upstream keep-alive so every request uses a new connection.
  - If drops persist, the cause is not connection reuse.
  - If they stop, reuse was involved.
  - It costs a few milliseconds per request locally and needs a small fixed CI run budget to judge.

## 9. D2: transport isolation (owner-approved experiment)

**Question:** does the residual CI connection reset depend on Kong reusing upstream connections?

**Change (test stack only):**
- `db-stack.sh` reloads Kong with `upstream_keepalive_pool_size = 0`, keeping `idle_timeout = 10`.
- It verifies the **running workers'** configuration through the admin API (`scripts/ci/kong-effective-config.lua`, run with `resty` because the image has no curl) and fails closed unless it reports `pool=0`.
- `db-tests.sh` repeats that runtime check.
- On failure, the workflow also prints the effective configuration.

**Why `0` disables reuse (Kong 2.8.1 source, `kong/init.lua` balancer):**
- With `upstream_keepalive_pool_size > 0`, Kong builds `pool_opts` and calls `ngx.balancer.enable_keepalive(idle, max_requests)`.
- With `0`, no pool is set and keep-alive is never enabled.
- The generated `nginx-kong.conf` has no `keepalive` directive in `kong_upstream`.
- `conf_loader` accepts `0` ("must be 0 or greater"); it is also what the deprecated `nginx_upstream_keepalive = NONE` maps to.

**Runtime evidence (local):** after a 40-request burst, `/proc/net/tcp` in the Kong container showed:
- pool 60: **40 ESTABLISHED** idle Kong→PostgREST sockets;
- pool 0: **0 ESTABLISHED**, and only TIME_WAIT. Every request used a new connection, which Kong closed.

**Expected results, written before the GitHub run:**

| CI outcome | Interpretation |
|---|---|
| Pass, 0 Kong drops or resets | consistent with the residual reset depending on connection reuse. Not proof, given one run and an underlying rate of about 1 in several runs |
| Fail with a connection reset or premature close | the reset does **not** depend on reuse; the cause is elsewhere (PostgREST, runner networking). NO-GO; no further speculative fix |
| Guard fails | the setting can't be applied on the runner; stop |

**Costs and risks:**
- **Latency:** one TCP connect per request, sub-millisecond on a local bridge.
- **TIME_WAIT growth:** each closed connection waits about 60 s. The peak is measured during local suite runs (§9.1). The ephemeral port range is about 28k.

### 9.1 Local D2 validation (fresh stacks, every result kept)

| Check | Result |
|---|---|
| `db-stack.sh` effective config (admin API) | `pool=0 idle=10 maxreq=100` on every start |
| Routing | 40 parallel POSTs → all 200 |
| Reuse | after the burst: 0 ESTABLISHED Kong→PostgREST sockets, 40 TIME_WAIT |
| Deterministic sweep-aligned probe (offsets −150 to +75 ms) | **0/480** failures, 0 Kong drops |
| Guard negative test: re-enable pool 60, run `db-tests.sh` | refused: "Kong upstream keep-alive not disabled …" |
| Full `db-tests.sh`, fixed budget 3 runs | **3/3 pass** (34/34 suites each), 0 Kong drops, TIME_WAIT peak 1919 / 1927 / 1904 |

### 9.2 GitHub run

Exactly one initial run of the follow-up commit; see the PR. There is no manual rerun.
