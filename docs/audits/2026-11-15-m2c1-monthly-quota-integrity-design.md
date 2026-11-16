# M2-C1 — Monthly Quota Integrity: Design & Security Audit (read-only)

Date: 2026-11-15 · Baseline: production `375b13e` (PR #79), `dpl_aW5A4b9WmqYHooRZ5unhfojhfX1J`
Method: repo at `375b13e` + read-only production catalog queries (`pg_proc`, `pg_policy`, privileges, constraints, triggers). No writes, no Gemini, no code or migration changes.

## 1. Current state (audited)

### 1.1 What is monthly-quota-gated
Only `POST /api/analyze` (personal flow and recruiter campaign both call it). Parse, Full CV rewrite, cover letter, review and follow-up are **not** monthly-gated (hourly caps only).

| Caller | Where | Role |
|---|---|---|
| Server quota check | `_server-lib/analyze/handler.ts:175-199` `check_analytics_quota(p_additional=1)` | Authority today; **fail-open** on error/timeout (`:197-198`) |
| Server increment | `handler.ts:224-238` `increment_usage_count` after Gemini success | **Fail-open**: a raised `monthly_limit_exceeded` is logged and the result still returned |
| Client pre-check | `AnalysisRunContext.tsx:268`, `RecruiterContext.tsx:198`, `ProfileView.tsx:34` | Advisory UX only |

Failures never charge today (increment runs only after success).

### 1.2 Live RPCs (production definitions)
- `check_analytics_quota(uuid,int)` — SECURITY DEFINER, EXECUTE: authenticated + service_role. Calls `sync_profile_usage_month` (a **write**), then reads without lock; `used + p_additional > limit` → denied.
- `increment_usage_count(uuid)` — DEFINER, EXECUTE: authenticated + service_role. Sync (write) → `SELECT … FOR UPDATE` → raise if `used >= limit` → `usage_count + 1`. Counter itself never exceeds limit.
- `sync_profile_usage_month(uuid)` — DEFINER, service_role only. Plan expiry → demote to free, `usage_count = 0`; cycle change → `usage_count = 0`.
- `current_quota_cycle(reset_day)` — cycle label in Asia/Ho_Chi_Minh; `quota_reset_day` CHECK 1..28, so no month-length edge cases.
- `resolve_monthly_analytics_limit` — custom → stored; recruiter 500; pro 100; else `get_default_monthly_analytics_limit()` (app setting). Admin role → unlimited (NULL).
- Plan changes write `usage_count`: `activate_pro_plan` / `admin_set_user_plan` keep usage on free→paid, reset to 0 on paid renewal/downgrade-to-free.

### 1.3 Permissions (production)
- `profiles`: RLS on; authenticated SELECT/UPDATE own row; column UPDATE limited to display_name, photo_url, is_new, has_permission, monthly_analytics_limit(_custom); trigger `profiles_guard_privileged_columns` rejects user changes to role/plan/usage_count/usage_month/quota_reset_day and non-admin changes to permission/limit columns. **Users cannot edit quota values directly.**
- CHECKs: `usage_count >= 0`, `monthly_analytics_limit >= 0`, admin-only unlimited.

### 1.4 Findings
| ID | Finding | Evidence | Class |
|---|---|---|---|
| Q1 | Check-then-increment TOCTOU: concurrent requests all pass the check; extra results delivered while counter stops at limit | M2-A R-S1 (15 results for 1 unit); M2-B bounds it to `hourlyAiLimit` per burst | **Confirmed defect (known debt)** |
| Q2 | Quota check fails open on RPC error/timeout | `handler.ts:197-198` | Confirmed (by design) |
| Q3 | Increment fails open; over-limit raise swallowed | `handler.ts:224-238` | Confirmed (by design) |
| Q4 | `authenticated` can EXECUTE `increment_usage_count` and `check_analytics_quota` on own row (check performs sync write) | `has_function_privilege` | Hygiene — self-harm only |
| Q5 | `anon`/`authenticated` hold TRUNCATE on `profiles` (RLS does not cover TRUNCATE) | `role_table_grants` | Hygiene — not reachable through PostgREST |
| Q6 | Client pre-check is advisory and reads committed usage only | `analyticsQuotaService.ts:18` | Expected |

## 2. Architecture

Keep `profiles.usage_count` as the **committed** counter (UI, admin report, `effective_usage_count` unchanged). Add a reservation ledger.

```
public.analytics_quota_reservations
  id            uuid PK default gen_random_uuid()        -- server-only, never returned to clients
  user_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE
  request_key   uuid NOT NULL                             -- client idempotency key (validated), or server-generated
  cycle         text NOT NULL                             -- current_quota_cycle at reserve time
  state         text NOT NULL CHECK (state IN ('reserved','committed','refunded','uncertain'))
  charged       boolean NOT NULL DEFAULT false            -- true only when commit incremented usage_count
  outcome       text                                      -- e.g. pre_gemini, provider_error, timeout, ttl_expired, prior_cycle, over_limit_waived
  created_at    timestamptz NOT NULL DEFAULT now()
  expires_at    timestamptz NOT NULL                      -- created_at + TTL
  settled_at    timestamptz
  UNIQUE (user_id, request_key)
  INDEX (user_id, cycle, state)
RLS ENABLED, no policies. REVOKE ALL FROM PUBLIC, anon, authenticated; GRANT ALL TO service_role.
```

### 2.1 State machine
```
            reserve
               │
           [reserved] ──commit──────────► [committed]  (charged=true, or false with outcome prior_cycle / over_limit_waived)
             │    │
   release   │    │ release(uncertain) / TTL expiry (lazy, under lock)
 (definite   │    ▼
 no-result)  │  [uncertain] ──late commit (once)──► [committed]
             ▼
         [refunded]   (terminal; never charged)
```
- `usage_count` is **only ever incremented**, only by commit, by exactly 1, under the profile lock. Never decremented by this feature. Refund = state change only.
- Every transition locks the reservation row and checks the source state, so commit/commit, release/release and commit/release races resolve to one winner; replays return the existing state.

### 2.2 Capacity rule (under the profile lock)
```
active    = count(state='reserved'  AND cycle=current AND expires_at > now())
uncertain = count(state='uncertain' AND cycle=current)            -- includes lazily-expired reserved rows
charged_uncertain = f(uncertain)                                   -- D1
capacity_used = usage_count + active + charged_uncertain
allowed = limit IS NULL OR capacity_used + 1 <= limit
```
Commit re-reads the limit under the lock. If `usage_count + 1 > limit` (admin lowered the limit, plan expired or was downgraded mid-flight), it records `committed`, `charged=false`, `outcome='over_limit_waived'` instead of exceeding the limit. Invariant: `0 <= usage_count <= limit` at all times for non-admin rows.

### 2.3 Handler integration (`/api/analyze`)
1. 400/413 input checks → auth → profile/lock/batch → log-based hourly count (all unchanged, no reservation yet)
2. **reserve** (fail closed: RPC error/timeout → 503 retryable, no Gemini)
3. M2-B atomic AI slot (denied → **release(pre_gemini)** → 429)
4. storage refs (fail → release(pre_gemini))
5. budget check (fail → release(pre_gemini))
6. Gemini → success → **commit** → 200 (commit failure: still return result; reservation follows TTL → uncertain path)
7. Gemini failure → release classified (below)

Reserving before the slot means a quota rejection never burns the non-refundable hourly slot. The old `check_analytics_quota` + `increment_usage_count` calls are removed from the handler in the same deploy.

### 2.4 Failure classes
| Class | Examples | Action |
|---|---|---|
| Definite no-result, Gemini not called | slot denied, storage error/timeout, budget exhausted, input rejected after reserve | release → `refunded` (`pre_gemini`) |
| Definite provider error response | Gemini HTTP 429 / 5xx / 4xx (`ApiError.status` present) | release → `refunded` (`provider_error`) |
| Uncertain | timeout/abort after request sent, JSON parse failure after a billed response, unknown SDK error, function crash, TTL expiry | → `uncertain` (D1 decides charging) |
| Success | Gemini result built | commit |
Requires the analyze service to expose "Gemini request started" and keep JSON-parse failures distinct from provider errors (today both fold into `gemini_error`).

## 3. Proposed SQL/RPC contracts (all SECURITY DEFINER, `SET search_path = ''`, schema-qualified, EXECUTE service_role only)

```sql
-- p_user_id MUST come from the verified JWT (getUserFromBearerToken), never from the request body:
-- service_role bypasses the auth.uid() checks used by the legacy RPCs.

reserve_analytics_quota(p_user_id uuid, p_request_key uuid, p_ttl_seconds int DEFAULT 360)
  RETURNS jsonb  -- {status: 'reserved'|'denied'|'duplicate', reservation_id?, used, reserved, uncertain, limit, cycle, reason?}
  1. SELECT … FROM public.profiles WHERE id = p_user_id FOR UPDATE   -- lock FIRST
  2. inline cycle sync (same rules as sync_profile_usage_month, on the locked row)
  3. lazy expiry: UPDATE reservations SET state='uncertain', outcome='ttl_expired'
       WHERE user_id = p_user_id AND state='reserved' AND expires_at <= now()
  4. duplicate key → return {status:'duplicate', state} (no new reservation)
  5. capacity rule (§2.2) → denied | INSERT reserved row

commit_analytics_quota(p_user_id uuid, p_reservation_id uuid)
  RETURNS jsonb  -- {state:'committed', charged, outcome?, replay}
  lock profile → lock reservation (must belong to p_user_id) →
  committed → replay; refunded → error 'already_refunded';
  reserved|uncertain → cycle changed ? charged=false 'prior_cycle'
                     : usage_count+1 > limit ? charged=false 'over_limit_waived'
                     : usage_count := usage_count + 1, charged=true

release_analytics_quota(p_user_id uuid, p_reservation_id uuid, p_outcome text)
  p_outcome ∈ ('pre_gemini','provider_error') → reserved → refunded
  p_outcome ∈ ('timeout','parse_error','unknown') → reserved → uncertain
  any terminal state → replay (no double refund)
```
- `check_analytics_quota` gains additive `reserved`/`uncertain` fields (non-breaking) so the client pre-check matches server capacity.
- `increment_usage_count` and `check_analytics_quota` are kept unchanged for rollback; revoking `authenticated` EXECUTE (Q4) is a later hygiene step.
- Retention: pg_cron purge of settled rows older than 90 days (purge only; capacity changes happen lazily under the lock).

## 4. Idempotency (D2)
- Client sends `Idempotency-Key: <uuid v4>` per CV per run (new key per click; batch = one key per file). Server validates UUID format; missing/invalid → server generates one (no dedupe, old clients keep working).
- Scope: `UNIQUE (user_id, request_key)`, so keys cannot collide across users.
- Duplicate key: `reserved` → 409 `in_progress` (no Gemini); `committed` → 409 `already_completed` (no result replay — there is no server result store; client points to History); `refunded`/`uncertain` → 409, and the client must mint a new key to retry. No path re-runs Gemini on a replayed key.
- The reservation id is internal to one request and never sent to the client.

## 5. Threat model
| Threat | Mitigation |
|---|---|
| Concurrent burst over limit (Q1) | Per-user `profiles` row lock serializes reserve; capacity counts active reservations |
| Forged/guessed reservation id | Never exposed; commit/release are service_role-only and check `user_id` ownership |
| Calling new RPCs via PostgREST | `REVOKE ALL … FROM PUBLIC, anon, authenticated` (default privileges auto-grant EXECUTE — tests must assert `has_function_privilege = false`) |
| Direct table access | RLS on, no policies, revoked grants |
| Spoofed user_id | RPC user id comes from the verified JWT only |
| Key replay for free results | Replay never runs Gemini |
| Forcing timeouts to get free analyses | D1 policy bounds forgiven uncertain usage per cycle; 413 caps; hourly slot |
| Crash between Gemini and commit | TTL → uncertain → D1 |
| Double charge / double refund | Single state transition under row lock; terminal states replay |
| Negative / over-limit usage | Increment-only; commit clamp; existing CHECK `usage_count >= 0` |
| search_path hijack | `SET search_path = ''`, schema-qualified |
| Ledger growth | Unique key, active rows bounded by limit, 90-day purge |
| Reserve RPC outage → silent free usage | Fail closed (503) — **behavior change** from today's fail-open (D3) |

## 6. Race analysis
| Race | Outcome |
|---|---|
| 20 concurrent reserves, 1 unit left | Serialized by row lock → exactly 1 `reserved`, 19 `denied` |
| Reserve vs commit (same user) | Serialized; commit moves 1 from active to used; invariant holds |
| Reserve vs cycle rollover | Sync runs inline on the locked row; prior-cycle reservations excluded from capacity |
| Commit vs commit (retry) | Second sees `committed` → replay, no increment |
| Commit vs release | First under lock wins; loser gets replay/conflict |
| Late commit after TTL expiry | `uncertain → committed` once, clamp applies; capacity already counted it, so no overshoot |
| Reserve vs plan change (`activate_pro_plan`, `admin_set_user_plan`) | Both lock the profile row; serialized; commit clamp covers a lowered limit |
| Two different users | Independent rows, no contention |
| Deadlock | Single lock order: profile → reservation, in every RPC |

## 7. Failure-mode matrix
| Failure point | Gemini ran? | Result to user | Reservation | Charged |
|---|---|---|---|---|
| Reserve RPC error/timeout | No | 503 retryable | none | No |
| Reserve denied | No | 429 monthly | none | No |
| Slot denied / storage / budget | No | 429/400/504 | refunded | No |
| Provider 429/5xx/4xx | Error response | 503/500 | refunded | No |
| Timeout / abort | Unknown | 504 | uncertain | D1 |
| JSON parse failure after response | Yes (billed) | 500 | uncertain | D1 |
| Success, commit OK | Yes | 200 | committed | Yes (or waived) |
| Success, commit fails | Yes | 200 | reserved → TTL → uncertain | D1 |
| Function killed (300s / crash) | Unknown | none | reserved → TTL → uncertain | D1 |
| Release fails | — | error | reserved → TTL → uncertain | D1 |

**TTL = 360s** (Vercel `maxDuration` 300s for `/api/analyze` + margin; the 65s deadline is soft — unpdf cannot be cancelled). A shorter TTL would let a live request commit after its capacity had been reused.

## 8. Monthly boundary and plan changes
- Reservation stores its cycle; only current-cycle rows count. A commit landing after rollover → `committed`, `charged=false`, `outcome='prior_cycle'` (recommended: one free result at the boundary rather than charging the new cycle).
- Upgrade: limit rises, nothing to do. Paid renewal/downgrade resets `usage_count` to 0 (existing behavior, unchanged); in-flight commits add 1 under the new limit with the clamp.
- Admin role: limit NULL → reserve always succeeds (still recorded for audit).
- Account deletion: cascade removes reservations.
- No existing quota numbers change.

## 9. Owner decisions
- **D1 — uncertain usage** (today: every failure is free)
  - U-A Always charge uncertain: strongest cost protection; users pay for timeouts (UX regression).
  - U-B Never charge, record only: matches today; timeout-forcing abuse bounded only by hourly slot and 413.
  - **U-C (recommended)** Forgive up to K uncertain per user per cycle (e.g. K = 2), charge beyond: near-today UX, bounded abuse, no refund transition needed (computed in the capacity rule).
- **D2 — idempotency contract**: header name, 409 semantics above, no result replay.
- **D3 — fail closed**: reserve outage → 503 (reverses today's fail-open). Adds a second Supabase dependency on the analyze path (with the M2-B slot).

## 10. Migration and rollback
- One additive migration: table, indexes, 3 RPCs, grants/revokes, additive `check_analytics_quota` fields, purge cron. No change to existing columns or quota numbers.
- Order: apply migration → verify grants/defs read-only → deploy app (handler switches to reserve/commit/release; client sends key).
- App rollback: redeploy previous app; legacy RPCs untouched; ledger harmless. Reservations stranded during the window only affect their own cycle; on re-enable, ignore reserved/uncertain rows created before the re-enable timestamp (or clear them via a one-off migration).
- DB rollback (after app rollback only): drop RPCs, cron job, table.
- Replay safety: run a fresh local migration replay (`supabase db reset`) before production, given the earlier replay breakage.

## 11. Test plan (M2-C2)
Prerequisite: local Postgres via `supabase start` (Docker 29.8.2 present; stack not yet started). Vitest mocks cannot prove atomicity.
- SQL/pgTAP or node-pg with N parallel connections:
  - 20 parallel reserves, 1 unit left → exactly 1 reserved
  - limit L, 3L parallel reserve+commit → `usage_count == L`, never above
  - commit+commit, release+release, commit+release races → one transition
  - TTL expiry vs late commit → single charge, clamp respected
  - rollover in flight → `prior_cycle`, new cycle unaffected
  - plan downgrade / admin limit decrease in flight → `over_limit_waived`
  - D1 policy boundary (K forgiven, K+1 charged)
  - grants: anon/authenticated cannot EXECUTE new RPCs or touch the table
  - fresh migration replay from zero
- Handler (vitest): reserve fail → 503 no Gemini; each failure class → correct release outcome; duplicate key → 409 without Gemini; commit failure still returns 200.
- Preview smoke: single analyze, double-click, quota at limit-1, provider errors via mocks only.

## 12. Remaining known debt (after M2-C2)
- Uncertain usage policy is an approximation of real cost (no billing signal for aborted requests).
- Fixed-window hourly slot boundary bursts (M2-B) unchanged.
- Parse/rewrite/document actions remain outside the monthly quota.
- Q4/Q5 grant hygiene not addressed unless approved separately.
- P2-2, P2-3, P2-7, P2-8, K0 unchanged.

## 13. Recommendation
**GO for M2-C2**, conditional on: (1) owner decisions D1–D3; (2) local Postgres available for real concurrency tests and migration replay. **NO-GO** if concurrency tests cannot run against a real database.

---

## M2-C2 design amendments (2026-11-16, owner decisions D1 = U-C with K = 2, D2 approved, D3 approved)

These supersede §2.2, §3 and §7 where they differ.

### A1. Uncertain accounting is persisted per row, not derived
The §2.2 rule `charged_uncertain = f(count)` was implicit: a row's charge depended on how many other rows existed, so it could change after the fact and the UI (`usage_count`) would not show it. Corrected model, decided once per row under the profile lock at the moment the row becomes `uncertain`:

| Condition (checked in this order) | Row fields | `usage_count` |
|---|---|---|
| Row's cycle ≠ current cycle | `forgiven=false, charged=false, outcome='<reason>:prior_cycle'` | unchanged |
| Admin (limit NULL) | `forgiven=false, charged=false` | unchanged |
| Fewer than **2** rows in this cycle with `state='uncertain' AND forgiven` | `forgiven=true, charged=false` | unchanged |
| `usage_count + 1 > limit` (limit lowered mid-flight) | `charged=false, outcome='<reason>:over_limit_waived'` | unchanged |
| Otherwise | `charged=true` | **+1** |

So capacity is always `usage_count + active reserved` — no hidden term — and the two forgiven requests are exactly the rows with `forgiven = true AND state = 'uncertain'` in the cycle.

### A2. Atomic forgiveness under concurrency
Every transition (reserve, commit, release, lazy expiry) first takes `SELECT … FROM profiles WHERE id = p_user_id FOR UPDATE`. The forgiven count is read and the row updated inside that lock, so two requests timing out at once cannot both take the second forgiveness slot.

### A3. Late commits cannot double-charge
Commit on an `uncertain` row: if `charged = true` it only flips state to `committed` (no increment); if `forgiven = true` it charges now (+1, clamp) and sets `forgiven = false`, which frees that forgiveness slot because the request turned out to be a success. A second commit sees `committed` and replays.

### A4. A failed commit never delivers an unaccounted result
The handler retries commit up to 3 times inside the remaining request budget. If all attempts fail it **withholds the analysis** and returns `503 {code: 'quota_settlement_unavailable', retryable: true}`; the reservation stays `reserved`, expires (TTL) and is settled as `uncertain` under A1. The user is never shown a result whose charge was not recorded.

### A5. Bounded settlement retry and durable recovery
Commit and release each retry at most 3 times (short backoff, capped by the request deadline). Anything left `reserved` is recovered lazily by the next reserve for that user (expired rows → `uncertain` via A1) — the ledger row itself is the durable record; no in-memory state is relied on.

### A6. TTL
`p_ttl_seconds` default 360 (Vercel `maxDuration` 300 s + margin), accepted range 1–900 so tests can expire rows quickly.

### A7. Cycle reset, downgrade, rollback
- Reserve calls the existing `sync_profile_usage_month` **after** taking the row lock; only current-cycle rows count.
- Plan changes (`activate_pro_plan`, `admin_set_user_plan`) lock the same row and are serialized; commit clamps to the limit at commit time.
- App rollback: the legacy `check_analytics_quota` / `increment_usage_count` are untouched. Reservations stranded by a rollback are settled by A1 when the feature returns (at most the number in flight at rollback time), and only within their own cycle.

### A8. Failure classification used by the handler
- Gemini request not started (`onGeminiStart` never fired): `pre_gemini` → refunded.
- Provider error response (`ApiError.status` 4xx/429/5xx): `provider_error` → refunded. Provider 4xx gets its own log category `gemini_rejected` (still HTTP 500, non-retryable).
- Everything else after the request started (timeout/abort, JSON parse failure, unknown): `uncertain`.
