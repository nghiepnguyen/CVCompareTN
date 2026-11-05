# P2C Follow-up Workflow Implementation Plan

> **Release status (2026-11-05):** P2C — DEPLOYED / PRODUCTION VERIFIED WITH KNOWN DEBT (PR #73, `15d90c1`). Authority: `docs/15_applications.md`. The steps and reports below are historical and unchanged.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic follow-up tracking and grounded follow-up drafting to the existing Application Tracker without creating a second tracker authority.

**Architecture:** Follow-up state is derived from append-only application events. P2C adds explicit outbound/inbound contact events, derives eligibility server-side, and uses the existing rewrite AI handler only for user-requested drafting from immutable application snapshots.

**Tech Stack:** Vite 6, React 19, TypeScript, Supabase/PostgreSQL, Gemini, Vitest 3, existing cvFit tracker and AI infrastructure.

**Spec:** `docs/superpowers/plans/2026-11-01-ai-job-search-integration-v2.md`

## Global Constraints

- Base: `origin/main = 3a3a5bb`. Never touch, stage, revert or format `graphify-out/GRAPH_REPORT.md`.
- P2B contracts stay intact: `applications.status`, `application_status_transitions.json`, `applied_at` ("Nộp lần đầu / First applied"), immutable `application_documents`, append-only `application_events`, existing RPC signatures.
- Never persist `needs_follow_up`, `follow_up_state`, `last_contact_at` or `follow_up_count` on `applications`. No new columns on `applications`.
- Threshold: `due_at = effective_last_contact_at + interval '7 days'` (elapsed time, no calendar rounding).
- Automatic follow-up state only for `status = 'applied'`. `drafted`, `interview`, `offer` and final statuses get no state.
- Soft limit: 2 unanswered follow-ups per reset point gives `limit_reached`. Logging is still allowed after it.
- `due` is computed by Postgres `now()`. The browser clock never decides `due`.
- No automatic `applied → no_response`. No cron, no sweep, no email, no notifications, no task CRUD.
- Vercel functions stay at **9**. The AI action is `action: 'follow_up'` on `/api/rewrite-cv`.
- AI drafting is only allowed for `status = 'applied'`, only on explicit click, never creates an event, and never mutates `applications`.
- The `follow_up` request body may carry only `action`, `applicationId` and `language`. The server loads CV/JD/letter snapshots itself.
- Gemini, analytics and Sentry never receive note text, `matchScore` or `jd.metadata.analysis`.
- Follow-up rows log as `analysis_log.kind = 'rewrite'` with marker `guard_metrics.followUp` and count against the shared document cap. No monthly Analyze quota is consumed.
- P2C does not read, change or sort by score. Analyze files are untouched.
- User-facing copy defaults to VI with EN in `src/translations/applications.ts`. Buttons use `cursor-pointer hover:scale-105 active:scale-95`.
- `_server-lib` relative imports (including `vi.mock` `typeof import(...)`) use `.js` extensions. Every task's verification runs `npm run lint`, `npm run lint:api` and `npm test`.
- No new npm dependencies.

## Review Focus

1. **A re-applied application uses its historical `applied_at`.** Expected: after `drafted→applied→withdrawn→applied`, the stage anchor is the second `applied` event, even if that event is backdated. Test owned by Task 3 (`reapply_uses_new_anchor`, `backdated_reapply_uses_inserted_order`).
2. **A note or details mutation resets follow-up timing.** Expected: `add_application_note` and `update_application_details` bump `updated_at` but leave `last_contact_at`, `follow_up_due_at` and `follow_ups_since_reset` unchanged. Test owned by Task 3 (`note_details_do_not_reset`).
3. **A client-supplied CV/JD leaks into the follow-up prompt.** Expected: a body containing `parsedCV`, `jd`, `coverLetter` or any extra key gets 400 with no Gemini call, and a valid request's Gemini input contains only snapshot text. Test owned by Task 10 (`rejects body-supplied documents`, `prompt is built from the stored snapshot`).
4. **New event types render blank in the deployed Timeline.** Expected: any unknown `event_type` renders a generic VI/EN title, never blank. This ships first, before the migration. Test owned by Task 1 (`unknown event type renders a generic title`).
5. **The follow-up action bypasses the shared document cap.** Expected: the cap query `.or(...)` includes `guard_metrics->followUp.not.is.null`, and at the cap the action returns 429 without calling Gemini. Tests owned by Task 8 (`follow_up shares the document cap`) and Task 10 (`429 at document cap`).

---

## Execution Boundaries

- **Branches:** Task 1 (P2C.0) branches from `origin/main` (`3a3a5bb`), not from `docs/p2b-production-verified`. Tasks 2–12 branch from `main` after P2C.0 is merged.
- This plan file is currently untracked on the docs branch. Carry it over or commit it on the work branch only when the user asks.
- **Executors stop at every USER-APPROVED CHECKPOINT:** push/PR, merge, production migration (preflight, dry-run, apply), deploy, production smoke and the docs closeout PR. Executors never run `supabase db push --linked` or merge on their own.
- Mobile/desktop layout can't be proven in jsdom. Tasks 6, 7 and 11 each end with a browser-preview check (`preview_start` + `resize_window` mobile 375 px and desktop: no horizontal scroll, badges, panels wrap).

## File Structure

| Path | Change | Responsibility |
|---|---|---|
| `supabase/migrations/20261105000000_application_follow_up.sql` | Create | CHECK extension, `log_application_contact` RPC, `application_follow_up_state` view, grants |
| `supabase/tests/application_follow_up.test.sql` | Create | Catalog, RPC, derivation, RLS, lock tests |
| `supabase/tests/application_follow_up_concurrency.test.sql` | Create | dblink: same key in parallel produces one event |
| `src/services/applicationTypes.ts` | Modify | Event types, `FollowUpState`, `FollowUpInfo`, error codes |
| `src/services/applicationService.ts` | Modify | `logApplicationContact`, `getFollowUpStates`, `listDueApplications` |
| `src/services/ai/analysisService.ts` | Modify | `generateFollowUpDraft` client call |
| `src/translations/applications.ts` | Modify | VI/EN copy |
| `src/components/views/ApplicationsView.tsx` | Modify | Card badge, "Needs follow-up" filter |
| `src/components/views/applications/status.tsx` | Modify | `FollowUpBadge`, new error-code messages |
| `src/components/views/applications/ApplicationDetailView.tsx` | Modify | Follow-up field, new panels, timeline labels + fallback |
| `src/components/views/applications/TrackerActions.tsx` | Modify | Export `occurredAtFor` |
| `src/components/views/applications/FollowUpActions.tsx` | Create | `ContactEventForm`, `FollowUpDraftPanel` |
| `_server-lib/accountLock.ts` | Modify | `follow_up` kind in document cap |
| `_server-lib/ai/suggestionGuard.ts` | Modify | `FollowUpGuardMetrics` in the `GuardMetrics` union |
| `_server-lib/ai/followUpService.ts` | Create | Prompt, Gemini call, guard and retry/fallback |
| `_server-lib/rewriteCv/followUpContext.ts` | Create | Owner-scoped snapshot + tracker-fact loader |
| `_server-lib/rewriteCv/handler.ts` | Modify | `follow_up` dispatch + `handleFollowUp` |
| `src/__tests__/components/ApplicationDetailView.test.tsx`, `ApplicationsView.test.tsx` | Modify | UI tests |
| `src/__tests__/services/applicationTracker.test.ts` | Modify | Service tests |
| `src/__tests__/services/followUpGuard.test.ts`, `followUpHandler.test.ts` | Create | Server tests |
| `src/__tests__/services/coverLetterHandler.test.ts`, `_server-lib/__tests__/accountLock.test.ts` | Modify | Cap filter expectation |
| `docs/15_applications.md`, roadmap, `docs/9_api_routes.md`, `docs/11_guard_metrics.md` | Modify | Authority docs |

Express parity needs no change: `server/routes/rewriteCv.ts` already delegates to `handleRewriteCv`.

---

## Tasks

### Task 1: Timeline renders unknown event types (ships alone, first)

This is a separate small PR (P2C.0). It is merged and deployed **before** the migration, so the production build and any rollback target can survive new event types.

**Files:**
- Modify: `src/components/views/applications/ApplicationDetailView.tsx:303-311` (`eventTitle`)
- Modify: `src/translations/applications.ts` (add `trackerEvUnknown`)
- Test: `src/__tests__/components/ApplicationDetailView.test.tsx` (`describe('Timeline')`)

**Interfaces:**
- Produces: translation key `trackerEvUnknown: { vi: "Hoạt động", en: "Activity" }`. `eventTitle` never returns `undefined`.

- [ ] **Step 1: Write the failing test** `it('unknown event type renders a generic title')`. Mock timeline rows with `type: 'future_event_type' as ApplicationEvent['type']` (stays outside `ApplicationEventType` permanently) plus the P2C-looking `follow_up_sent` and `contact_received` (unknown to the P2C.0 client), each with `note: 'x'`. Assert `screen.getByText('Hoạt động')` (VI) and, with EN, `'Activity'`. Assert the note `x` still renders.
- [ ] **Step 2: Run it and confirm it fails.** `npx vitest run src/__tests__/components/ApplicationDetailView.test.tsx -t "unknown event type"` should FAIL because the title isn't found.
- [ ] **Step 3: Implement.** Add `default: return t.trackerEvUnknown;` to the `eventTitle` switch, and add the key.
- [ ] **Step 4: Run it and confirm it passes.** Run the same command (PASS), then `npm run lint && npm test`.
- [ ] **Step 5: Commit** `fix(applications): render unknown timeline events with a generic title`.
- [ ] **Step 6: USER-APPROVED CHECKPOINT. Stop and report.** Push, PR, merge and deploy (Rollout Phase A) happen only on the user's explicit go-ahead.

### Task 2: Event types + `log_application_contact` RPC

**Files:**
- Create: `supabase/migrations/20261105000000_application_follow_up.sql`
- Create: `supabase/tests/application_follow_up.test.sql`, `supabase/tests/application_follow_up_concurrency.test.sql`

**Interfaces:**
- Produces: `public.log_application_contact(p_application_id uuid, p_event_type text, p_occurred_at timestamptz, p_note text, p_idempotency_key uuid) RETURNS jsonb`. It returns `{event_id, replayed}`, the same shape as `add_application_note`.
- New `event_type` values: `follow_up_sent`, `contact_received`.
- New error codes: `invalid_contact` (22023, unknown `p_event_type`) and `contact_not_allowed` (P0001, status is `drafted` or final). Existing codes are reused: `invalid_note`, `invalid_occurred_at`, `application_not_found`, `not_authenticated`, `account_locked`.

**Decisions:**
- **One RPC for both types.** The two events differ only in their effect on the read model, so one interface is smallest.
- **Rejection rule.** The RPC rejects `drafted` and final statuses and allows `applied`, `interview` and `offer`, so historical truth can be recorded. The UI exposes the actions only for `applied` (Task 7).
- **No CAS parameter.** The status gate is re-read under `FOR UPDATE`. Replay is checked first, as in P2B.
- **Order of operations** follows `transition_application_status`/`add_application_note`:
  1. `application_tracker_caller()`;
  2. input validation (type, note trimmed to NULL or 1–2000 characters, `occurred_at` bounds from `now() - 10 years` to `now() + 5 minutes`, NULL meaning `now()`);
  3. `pg_advisory_xact_lock(hashtextextended('application_events:'||uid||':'||key, 0))`;
  4. replay lookup by `(user_id, idempotency_key)`;
  5. `SELECT status … WHERE id AND user_id = uid FOR UPDATE`, failing with `application_not_found`;
  6. status gate;
  7. `UPDATE applications SET updated_at = now()`, the existing P2B policy that every mutation bumps it;
  8. `INSERT` event;
  9. return.
- The function is `SECURITY DEFINER` with `SET search_path = ''`, `REVOKE ALL … FROM PUBLIC, anon` and `GRANT EXECUTE … TO authenticated`. It never takes `user_id`.
- **CHECK changes.**
  - Drop and re-add `application_events_event_type_check`, using the actual auto-generated name. Confirm it locally with `pg_constraint` and assert the name in the test, as P2B did for the status CHECK. The new list is `created, status_changed, note, details_updated, follow_up_sent, contact_received`.
  - Drop and re-add `application_events_shape` with an explicit `WHEN 'created'` branch (note/from/to NULL) and `WHEN 'follow_up_sent', 'contact_received' THEN from_status IS NULL AND to_status IS NULL`, with note optional. Its `ELSE` becomes `false`.
- No backfill.

- [ ] **Step 1: Write the failing SQL tests** in `application_follow_up.test.sql`. Copy the P2B harness helpers (`set_user`, `fails`, `tr`, `save`, `events`) from `application_tracker.test.sql:4-37`, add `pg_temp.contact(app uuid, type text, intent text, at timestamptz DEFAULT NULL, note text DEFAULT NULL)`, and assert:
  - **catalog:** DEFINER, `search_path=""`, anon cannot EXECUTE, authenticated can EXECUTE; the CHECK names exist;
  - `contact(app_drafted, 'follow_up_sent', …)` fails with `P0001 contact_not_allowed`, and the same holds for each of the 5 final statuses and for `contact_received`;
  - for `applied`, `interview` and `offer`, each type inserts exactly one event with `from_status IS NULL AND to_status IS NULL`, and status is unchanged;
  - `updated_at` is bumped;
  - an unknown type fails with `22023 invalid_contact`; a 2001-character note fails with `invalid_note`; a note of only spaces is stored as NULL; `now()+6 min` fails with `invalid_occurred_at`; a backdated `now() - interval '30 days'` is accepted;
  - replay with the same key and a different type or note returns `replayed:true` and the same `event_id`, still 1 event;
  - a key already used by a P2B note intent replays and doesn't insert;
  - cross-user: user B on A's app fails with `P0002 application_not_found` and gets 0 events;
  - a locked account fails with `42501 account_locked` before any lookup;
  - direct `INSERT` into `application_events` as authenticated is denied;
  - shape CHECK: inserting as owner a `follow_up_sent` with `to_status` set fails `23514`, and a `created` with a note still fails `23514`;
  - after `save` + `tr(drafted→applied)` + one contact event, a `transition` still works.
- [ ] **Step 2: Write the failing concurrency test** `application_follow_up_concurrency.test.sql`, following the dblink pattern in `application_tracker_concurrency.test.sql`. Two sessions call `log_application_contact` with the same key and different notes. Assert 1 event and that both results carry the same `event_id`.
- [ ] **Step 3: Run them and confirm they fail.** `supabase/tests/local/run.sh "$PWD" /repo/tests/application_follow_up.test.sql /repo/tests/application_follow_up_concurrency.test.sql` should FAIL because the function doesn't exist.
- [ ] **Step 4: Implement the CHECK changes and the RPC** in the migration, as decided above.
- [ ] **Step 5: Run them and confirm they pass,** together with the P2A/P2B regression: `supabase/tests/local/run.sh "$PWD" /repo/tests/application_follow_up.test.sql /repo/tests/application_follow_up_concurrency.test.sql /repo/tests/application_tracker.test.sql /repo/tests/application_tracker_concurrency.test.sql /repo/tests/applications.test.sql /repo/tests/applications_concurrency.test.sql /repo/tests/account_lock.test.sql`. All must PASS with no `MIGRATION-ERR` line. Then run the backfill fixture test: `FIXTURE_BEFORE=20261104000000:/repo/tests/fixtures/pre_p2b_applications.sql supabase/tests/local/run.sh "$PWD" /repo/tests/applications_backfill.fixture-test.sql`.
- [ ] **Step 6: Commit** `feat(applications): add follow_up_sent / contact_received events and log RPC`.

### Task 3: Follow-up read model `application_follow_up_state`

**Files:**
- Modify: `supabase/migrations/20261105000000_application_follow_up.sql`
- Modify: `supabase/tests/application_follow_up.test.sql`

**Interfaces:**
- Produces the view `public.application_follow_up_state` with columns `application_id uuid`, `stage_entered_at timestamptz`, `last_contact_at timestamptz`, `follow_ups_since_reset int`, `follow_up_due_at timestamptz`, `follow_up_state text` (`'waiting' | 'due' | 'limit_reached'`).
- It has exactly one row per application with `status = 'applied'`. Other statuses have no row.

**Derivation (the algorithm; this SQL is fixed):**

```sql
CREATE VIEW public.application_follow_up_state WITH (security_invoker = true) AS
SELECT a.id AS application_id, s.stage_entered_at, c.last_contact_at, n.follow_ups_since_reset,
       c.last_contact_at + interval '7 days' AS follow_up_due_at,
       CASE WHEN n.follow_ups_since_reset >= 2 THEN 'limit_reached'
            WHEN now() >= c.last_contact_at + interval '7 days' THEN 'due'
            ELSE 'waiting' END AS follow_up_state
FROM public.applications a
-- Stage anchor: the event that put the app in its current status = newest INSERTED
-- status_changed with to_status = status (transition RPC is the only status writer;
-- CAS serializes transitions per app). Its occurred_at is the anchor value, so a
-- backdated re-apply still anchors on the new episode.
CROSS JOIN LATERAL (SELECT e.occurred_at AS stage_entered_at, e.created_at AS stage_created_at FROM public.application_events e
  WHERE e.application_id = a.id AND e.event_type = 'status_changed' AND e.to_status = a.status
  ORDER BY e.created_at DESC, e.id DESC LIMIT 1) s
CROSS JOIN LATERAL (SELECT
    max(e.occurred_at) FILTER (WHERE e.event_type = 'contact_received') AS last_reply,
    greatest(s.stage_entered_at, max(e.occurred_at)) AS last_contact_at
  FROM public.application_events e
  WHERE e.application_id = a.id AND e.event_type IN ('follow_up_sent', 'contact_received')
    AND e.created_at >= s.stage_created_at) c  -- current episode only (inserted at/after the anchor)
CROSS JOIN LATERAL (SELECT count(*)::int AS follow_ups_since_reset FROM public.application_events e
  WHERE e.application_id = a.id AND e.event_type = 'follow_up_sent'
    AND e.created_at >= s.stage_created_at
    AND e.occurred_at > greatest(s.stage_entered_at, c.last_reply)) n
WHERE a.status = 'applied';
```

- **Interpretation, recorded in docs:** the spec's "latest status_changed where to_status = status" means the newest *inserted* such event, ordered by `created_at DESC, id DESC`. Its `occurred_at` is the anchor. The largest `occurred_at` would pick an old episode after a backdated re-apply.
- **Episode scope (amended in Task 3):** contact events count only for the current stage episode, i.e. inserted at or after the anchor event (`e.created_at >= anchor.created_at`). Without it, a backdated re-apply would let an old-episode reply or follow-up with a later `occurred_at` control the new episode. `>=` keeps events written in the same transaction as the anchor (test fixtures) in the episode. Known limit: `created_at` is the transaction start, so under concurrent requests on one app a contact event can be attributed to the adjacent episode in either direction (a contact racing a re-apply, or an interview-era follow-up racing an `interview → applied` correction); impact is one event. An `applied` app with no anchor event (only possible via direct service writes) has no row, which consumers must read as "no follow-up indicator", never as an error or a reason to recompute client-side.
- **Tie rules:**
  - A follow-up counts only when its `occurred_at` is strictly after the reset point. This follows the spec's literal "occurring after".
  - When a reply and a follow-up share a timestamp, the reply wins and the count is 0.
  - A follow-up dated at or before the reset point neither moves the timer nor counts (it can never be the `max` that sets `last_contact_at`).
- **Grants:** `REVOKE ALL ON public.application_follow_up_state FROM PUBLIC, anon, authenticated; GRANT SELECT ON … TO authenticated, service_role;`. Supabase default privileges would otherwise grant anon. `security_invoker` makes base-table RLS apply, including owner policies and the RESTRICTIVE `account_unlocked_read`. It is supported on PostgreSQL ≥ 15: the local harness runs `postgres:16` and production runs PG 17.6 (docs/15).

- [ ] **Step 1: Write the failing SQL tests.** Use `now()` as the constant transaction time and backdate with `tr(..., at => now() - interval '...')`. Use the test names as `-- name` comments.
  - **catalog:** `reloptions` of the view contains `security_invoker=true`; `NOT has_table_privilege('anon', view, 'SELECT')`; authenticated has SELECT but no INSERT/UPDATE/DELETE.
  - `drafted_never_due`: a saved app has 0 rows.
  - `drafted_with_applied_at_never_due`: `drafted→applied→drafted` has `applied_at` NOT NULL and 0 rows.
  - `final_never_due`: for each of the 5 finals, reached through allowed paths, 0 rows. `interview` and `offer` also have 0 rows.
  - `new_applied_uses_anchor`: `tr(drafted→applied, at => now() - 3 days)` gives `stage_entered_at = now() - 3 days`, `waiting`, and `follow_up_due_at = now() + 4 days`.
  - `reapply_uses_new_anchor`: an applied event 60 days ago, then withdrawn, then `applied` again 2 days ago. The anchor is 2 days ago, the state `waiting`, and `applied_at` still 60 days ago.
  - `backdated_reapply_uses_inserted_order`: insert fixture events as owner with explicit `created_at` values. The chained-RPC `created_at` is identical inside one transaction, so don't chain RPCs here. The first `applied` event has `occurred_at` 10 days ago and `created_at` T1. The second has `occurred_at` 20 days ago and `created_at` T2 > T1, with status set directly to `applied`. Assert the anchor is 20 days ago, the second event.
  - `threshold_minus_1s_waiting`: applied at `now() - 7 days + 1 second` gives `waiting`.
  - `threshold_exact_due`: applied at `now() - 7 days` gives `due`.
  - `follow_up_resets_timer_and_counts`: applied 10 days ago (`due`), then `follow_up_sent` at `now() - 1 day`. Expect `waiting`, `last_contact_at = now() - 1 day`, count 1.
  - `contact_resets_timer_and_count`: applied 30 days ago, follow-ups at 20 and 15 days ago (`limit_reached`), then `contact_received` 9 days ago. Expect count 0, `last_contact_at = now() - 9 days`, `due`.
  - `two_unanswered_limit_reached`: two follow-ups after the anchor give `limit_reached` regardless of time.
  - `log_after_limit_allowed`: a third `follow_up_sent` is accepted, count 3, still `limit_reached`.
  - `follow_up_tie_with_reply_not_counted`: a reply and a follow-up at the same explicit `occurred_at` give count 0.
  - `follow_up_before_anchor_not_counted`: a follow-up from the previous episode is not counted after re-apply.
  - `note_details_do_not_reset`: applied 10 days ago (`due`); add a note and edit details. `updated_at` changes, but `last_contact_at`, `follow_up_due_at` and the state are unchanged (`due`).
  - `updated_at_not_authority`: `last_contact_at <> updated_at` after a note.
  - `rls_cross_account`: as user B, `SELECT count(*) FROM view WHERE application_id = A_app` is 0.
  - `rls_locked`: a locked user sees 0 rows of their own apps.
- [ ] **Step 2: Run them and confirm they fail.** The Task 2 run command should FAIL because the view doesn't exist.
- [ ] **Step 3: Implement** the view and grants above in the migration.
- [ ] **Step 4: Run them and confirm they pass.** Use the same full regression command as Task 2 Step 5 (all PASS).
- [ ] **Step 5: Commit** `feat(applications): derive follow-up state from events (security_invoker view)`.

### Task 4: Read-model performance check (decide the index)

**Files:**
- Create: `scratchpad` script only (not committed). The result goes into the Task 12 docs.

- [ ] **Step 1: Seed a disposable local DB** using the harness (`run.sh` with a seed SQL file in the scratchpad mounted through `HARNESS`). Seed 500 applications for one user (400 of them `applied`), about 20 events each, plus 5 other users with the same volume.
- [ ] **Step 2: Run EXPLAIN as an RLS-bound caller,** not superuser. Set `set_config('request.jwt.claims', …)`, then `SET ROLE authenticated`, then `EXPLAIN (ANALYZE, BUFFERS)` on:
  - (a) `SELECT * FROM application_follow_up_state WHERE application_id = ANY($20_ids)`;
  - (b) `SELECT application_id, follow_up_due_at FROM application_follow_up_state WHERE follow_up_state = 'due' ORDER BY follow_up_due_at, application_id LIMIT 21`.
- [ ] **Step 3: Decide using this rule.** If each lateral uses an index scan on `application_events_timeline_idx` (or the `application_id` prefix of the FK path) and query (b) runs under 50 ms locally, **add no index**. Otherwise add `CREATE INDEX application_events_contact_idx ON public.application_events (application_id, event_type, occurred_at DESC);` to the migration, re-run the plans and keep the before/after numbers.
- [ ] **Step 4: Record** both plans' key lines and the decision for the Task 12 docs. Commit only if an index was added: `perf(applications): index follow-up event lookups`.

### Task 5: Tracker client types + service

**Files:**
- Modify: `src/services/applicationTypes.ts`, `src/services/applicationService.ts`
- Test: `src/__tests__/services/applicationTracker.test.ts`

**Interfaces:**
- `ApplicationEventType` gains `'follow_up_sent' | 'contact_received'`.
- `export type ContactEventType = 'follow_up_sent' | 'contact_received';`
- `export type FollowUpState = 'waiting' | 'due' | 'limit_reached';`
- `export interface FollowUpInfo { state: FollowUpState; dueAt: string; lastContactAt: string; stageEnteredAt: string; followUpsSinceReset: number }`
- `TRACKER_ERROR_CODES` gains `'invalid_contact', 'contact_not_allowed'`. They are then definite rejections, which clear the intent key.
- `logApplicationContact(input: { applicationId: string; eventType: ContactEventType; occurredAt: string | null; note: string | null; idempotencyKey: string }): Promise<MutationResult>` calls RPC `log_application_contact`.
- `getFollowUpStates(applicationIds: string[]): Promise<Map<string, FollowUpInfo>>` makes one `.from('application_follow_up_state').select(...).in('application_id', ids)` call. An empty `ids` returns an empty map without a request.
- `listDueApplications({ page = 0, pageSize = APPLICATIONS_PAGE_SIZE }): Promise<{ items: (ApplicationSummary & { followUp: FollowUpInfo })[]; hasMore: boolean }>` works in two steps:
  1. view `.eq('follow_up_state','due').order('follow_up_due_at',{ascending:true}).order('application_id',{ascending:true}).range(from, from+pageSize)`;
  2. `applications.select(SUMMARY_COLUMNS).in('id', ids)`, re-ordered to the view order. Rows missing from step 2 (changed in between) are dropped.

- [ ] **Step 1: Write the failing tests:**
  - `logApplicationContact` sends `{p_application_id, p_event_type, p_occurred_at, p_note, p_idempotency_key}` and no `p_user_id`;
  - `contact_not_allowed`/`invalid_contact` map to those codes, and `isDefiniteRejection` is true;
  - `getFollowUpStates([])` makes no request;
  - `getFollowUpStates` maps snake_case to `FollowUpInfo`;
  - `listDueApplications` filters `follow_up_state = 'due'` only (never `limit_reached`), orders by `follow_up_due_at` then `application_id`, uses `.range(0, 20)`, keeps view order and drops missing rows;
  - no score column appears in any select string.
- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run src/__tests__/services/applicationTracker.test.ts` should FAIL.
- [ ] **Step 3: Implement** the interfaces above, following the existing `unwrap`/`toMutation` helpers.
- [ ] **Step 4: Run them and confirm they pass,** then `npm run lint`.
- [ ] **Step 5: Commit** `feat(applications): client service for follow-up state and contact events`.

### Task 6: List indicator + "Needs follow-up" filter

**Files:**
- Modify: `src/components/views/ApplicationsView.tsx`, `src/components/views/applications/status.tsx`, `src/translations/applications.ts`
- Test: `src/__tests__/components/ApplicationsView.test.tsx`

**Interfaces:**
- Consumes `getFollowUpStates`, `listDueApplications` and `FollowUpInfo` from Task 5.
- Produces `export function FollowUpBadge({ info, t }: { info: FollowUpInfo; t: UiLabels }): JSX.Element | null` in `status.tsx`.

**UX decision (explicit):** cards show a badge only for actionable or explanatory states.
- `due` gets an accent badge "Nên follow-up / Follow up".
- `limit_reached` gets a muted badge "Đã đủ lượt follow-up / Limit reached".
- `waiting` gets a **quiet text indicator** on the card (no chip), to avoid noise on most applied cards (Task 6 ruling). Waiting is also shown in the detail view (Task 7).
- "Hoạt động gần nhất / Last activity" stays unchanged.

**Filter:**
- A toggle button "Cần follow-up / Needs follow-up" next to the sort select.
- When active, the list uses `listDueApplications`, the sort select is disabled with the hint "Theo ngày đến hạn follow-up / By follow-up due date", and pagination is unchanged.
- The empty state reads "Không có hồ sơ cần follow-up. / No applications need a follow-up."
- `limit_reached` is excluded. The UI stops prompting for those apps, so they don't belong in an action list.

**Resilience:** the follow-up fetch is non-fatal. If `getFollowUpStates` rejects (for example, a preview before the migration), cards render with no follow-up indicators and a small role=status load-error notice.

- [ ] **Step 1: Write the failing tests:**
  - a `due` card shows "Nên follow-up", a `limit_reached` card shows the muted label, and a `waiting` card shows neither;
  - "Hoạt động gần nhất" still shows `updatedAt`;
  - clicking the filter calls `listDueApplications({page:0})`, disables the sort select and renders cards in returned order; clicking again restores `listApplications`;
  - a `getFollowUpStates` rejection still renders the list;
  - EN labels.
  - Layout at 375 px is checked in the browser preview step, not in Vitest.
- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run src/__tests__/components/ApplicationsView.test.tsx` should FAIL.
- [ ] **Step 3: Implement** the badge, filter state and the batched `getFollowUpStates(items.map(a => a.id))` after each page load, merged into a `Map` state.
- [ ] **Step 4: Run them and confirm they pass,** then `npm run lint && npm test`.
- [ ] **Step 5: Commit** `feat(applications): follow-up indicator and needs-follow-up filter`.

### Task 7: Detail follow-up state, contact actions, timeline labels

**Files:**
- Create: `src/components/views/applications/FollowUpActions.tsx` (`ContactEventForm`)
- Modify: `ApplicationDetailView.tsx` (load state, Field, panels, `eventTitle`), `TrackerActions.tsx` (export `occurredAtFor`), `status.tsx` (`trackerErrorMessage` cases), `src/translations/applications.ts`
- Test: `src/__tests__/components/ApplicationDetailView.test.tsx`

**Interfaces:**
- `export function ContactEventForm({ applicationId, eventType, onDone, onClose }: { applicationId: string; eventType: ContactEventType; onDone: (r?: MutationResult) => void; onClose: () => void })`. It has a date input (max `vnTodayYmd()`, sent through `occurredAtFor`) and an optional note (≤ `NOTE_MAX`). It uses `useTrackerMutation(\`${eventType}:${applicationId}\`, onDone)`.
- `Panel` gains `'follow_up_sent' | 'contact_received' | 'draft'`. `'draft'` is wired in Task 11.
- **Detail load** adds `getFollowUpStates([applicationId])`, which is non-fatal.
- **Overview Field** "Follow-up" appears only when `status === 'applied'` and info exists:
  - waiting: "Đang chờ phản hồi · có thể follow-up từ {date}" / "Waiting for a reply · follow up from {date}" (`formatVnDate(dueAt)`);
  - due: "Nên follow-up" / "Follow-up due";
  - limit_reached: "Đã follow-up 2 lần chưa có phản hồi" / "2 follow-ups without a reply", with the hint "Bạn có thể xem lại trạng thái hồ sơ." / "You may want to review this application's status."
- **Action buttons**, only when `status === 'applied'`: "Đánh dấu đã gửi follow-up / Mark as sent" and "Nhà tuyển dụng đã phản hồi / Employer replied".
- **Timeline:** `follow_up_sent` reads "Đã gửi follow-up / Follow-up sent"; `contact_received` reads "Nhà tuyển dụng đã liên hệ / Employer contacted you". Notes render as text through the existing `e.note`.
- **`trackerErrorMessage`:** `contact_not_allowed` reads "Không thể ghi follow-up ở trạng thái hiện tại." / "Follow-ups can't be logged in the current status."; `invalid_contact` maps to `trackerErrInvalid`.

- [ ] **Step 1: Write the failing tests:**
  - applied+waiting shows the waiting text with the due date; due shows "Nên follow-up"; limit shows the text and the neutral hint, with no status change triggered;
  - drafted, interview and final apps show no follow-up Field and no contact buttons;
  - Mark as sent sends one `logApplicationContact` with `eventType:'follow_up_sent'` and a past date as `YYYY-MM-DDT12:00:00+07:00`, today as `null`; a double click produces one call; an uncertain failure keeps the key across remount;
  - `contact_not_allowed` clears the key and shows the VI message, with nothing sent to Sentry;
  - Employer replied sends `eventType:'contact_received'`;
  - after success the detail reloads;
  - the timeline renders both new titles in VI and EN, and Task 1's unknown-type test is updated: `follow_up_sent` / `contact_received` are now known, the `future_event_type` fallback assertion stays;
  - existing Overview, Status, Notes and Details tests are unchanged and pass.
- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run src/__tests__/components/ApplicationDetailView.test.tsx` should FAIL.
- [ ] **Step 3: Implement** the interfaces above.
- [ ] **Step 4: Run them and confirm they pass,** then `npm run lint && npm test`.
- [ ] **Step 5: Commit** `feat(applications): follow-up state and contact logging in application detail`.

### Task 8: Shared document cap + guard-metrics marker

**Files:**
- Modify: `_server-lib/accountLock.ts:66-93,105-122`, `_server-lib/ai/suggestionGuard.ts:549-591`, `_server-lib/rewriteCv/handler.ts:27-31` (`authorize` kind union)
- Test: `_server-lib/__tests__/accountLock.test.ts`, `src/__tests__/services/coverLetterHandler.test.ts:159-168`

**Interfaces:**
- `checkHourlyAiLimit` / `checkAiAccess` `kind` unions gain `'follow_up'`. `document = kind === 'cover_letter' || kind === 'application_review' || kind === 'follow_up'`.
- The cap filter becomes exactly `'guard_metrics->coverLetter.not.is.null,guard_metrics->applicationReview.not.is.null,guard_metrics->followUp.not.is.null'`. The limit stays `Math.ceil(hourlyAiLimit(plan) / 2)`.
- `export type FollowUpGuardMetrics = { language: 'vi' | 'en'; outcome: 'valid' | 'recovered' | 'fallback' | 'error'; category?: string; firstPassViolations?: CoverLetterViolationCounts; retryViolations?: CoverLetterViolationCounts; retryOutcome?: FullCvRetryOutcome; geminiCalls: 0 | 1 | 2 };`
- `GuardMetrics` gains `| { v: 1; followUp: FollowUpGuardMetrics }`.

- [ ] **Step 1: Write the failing tests:**
  - `follow_up shares the document cap`: `checkHourlyAiLimit('u1','follow_up','free',100)` with count 5 returns `rate_limited`, and with count 4 returns `ok`; the recorded filters include `['eq','kind','rewrite']` and the 3-marker `or` string;
  - update the cover-letter cap test expectation to the 3-marker string. The behavior for cover letters and reviews is unchanged: the same limit and the same kind.
- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run _server-lib/__tests__/accountLock.test.ts src/__tests__/services/coverLetterHandler.test.ts` should FAIL.
- [ ] **Step 3: Implement** the interfaces above, and update the comment at `accountLock.ts:66-71` to name follow-ups.
- [ ] **Step 4: Run them and confirm they pass,** then `npm run lint:api && npm test`. `applicationReview.test.ts` and `guardMetrics.test.ts` must also pass.
- [ ] **Step 5: Commit** `feat(ai): count follow-up drafts in the shared document cap`.

### Task 9: Follow-up generation service (prompt + grounding guard)

**Files:**
- Create: `_server-lib/ai/followUpService.ts`
- Test: `src/__tests__/services/followUpGuard.test.ts`

**Interfaces:**
- `export const MAX_FOLLOW_UP_CHARS = 1500;`
- `export type FollowUpInput = { cvText: string; jd: string; coverLetter: string | null; language: 'vi' | 'en'; companyName: string | null; roleTitle: string | null; followUpNumber: number };` Here `followUpNumber = follow_ups_since_reset + 1`, and it is passed to the model as an ordinal word ("first"/"second"/"another"), never a digit.
- `export function buildFollowUpInstruction(language: 'vi' | 'en'): string`
- `export async function generateFollowUp(input: FollowUpInput, timeoutMs: number): Promise<{ content: string; usage: AiCallUsage; fidelityFallback?: true; guardMetrics: FollowUpGuardMetrics }>`

**Decisions:**
- **Reuse, don't extract.** The service calls the exported `validateCoverLetter({ cvText, jd, letter: draft, allowedPhrases })` and `countCoverLetterViolations`, and mirrors `generateCoverLetter`'s flow: first pass, then validate, then one retry with violations if budget remains, otherwise fallback with `content: ''` and `fidelityFallback: true`. It uses the same `getGeminiClient`/`GEMINI_REWRITE_MODEL` and a JSON `responseSchema` `{ message: string }`. P1A/P1B code is not refactored, so their behavior can't weaken.
- **Guard policy (option a).** The prompt forbids digits, dates, metrics, recruiter or person names, interview details, promises, availability statements, new skills or achievements, and company knowledge beyond the JD. Tracker dates are **not** given to the model. `allowedPhrases` holds the trimmed non-empty `companyName` and `roleTitle`. These are the owner's tracker metadata and must not be flagged as unsupported terms.
- **Guard corpus.** `cvText` is the serialized parsedCV only. The cover-letter snapshot is context for tone, not a fact corpus, because the user may have edited it.
- **Salutation.** The prompt fixes a generic recipient ("Kính gửi Anh/Chị phụ trách tuyển dụng," / "Dear Hiring Team,"). The guard catches invented names as unsupported terms.
- A draft longer than `MAX_FOLLOW_UP_CHARS` is treated as invalid and goes to retry or fallback.
- **Residual risk (documented):** promises and availability without digits ("I can start immediately") are enforced by the prompt only. No existing deterministic guard covers them.

- [ ] **Step 1: Write the failing tests** (mock `generateContent` as in `coverLetterHandler.test.ts:3-7`):
  - a realistic VI draft and EN draft (no digits, company and role named) are `valid`, with 1 Gemini call;
  - a draft with an invented metric ("tăng 30% doanh thu") or an invented skill not in the CV is invalid on the first pass; a clean retry gives `recovered` with 2 calls; an invalid retry gives `fallback` with `content ''`;
  - an invented person's name ("Dear Ms. Lan") is flagged;
  - an over-long draft goes to retry;
  - `buildFollowUpInstruction('vi')` contains the no-digits and no-availability rules, and the user content contains no `matchScore`.
- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run src/__tests__/services/followUpGuard.test.ts` should FAIL.
- [ ] **Step 3: Implement** the interfaces above.
- [ ] **Step 4: Run them and confirm they pass,** then `npm run lint:api`.
- [ ] **Step 5: Commit** `feat(ai): grounded follow-up draft generation`.

### Task 10: `follow_up` action with server-owned snapshots

**Files:**
- Create: `_server-lib/rewriteCv/followUpContext.ts`
- Modify: `_server-lib/rewriteCv/handler.ts:52-65` (dispatch) and add `handleFollowUp`
- Test: `src/__tests__/services/followUpHandler.test.ts`

**Interfaces:**
- `export type FollowUpContext = { status: 'ok'; input: Omit<FollowUpInput, 'language'>; defaultLanguage: 'vi' | 'en' } | { status: 'not_found' | 'not_allowed' | 'unavailable' };`
- `export async function loadFollowUpContext(userId: string, applicationId: string, timeoutMs: number, signal?: AbortSignal): Promise<FollowUpContext>`. It uses `getSupabaseAdmin()` with `withTimeout` and `abortSignal`, as `getAccountProfile` does.
  - `applications.select('id, status, language, company_name, role_title').eq('id', applicationId).eq('user_id', userId).maybeSingle()`. No row gives `not_found`; `status !== 'applied'` gives `not_allowed`.
  - `application_documents.select('document_type, content, metadata').eq('application_id', applicationId).eq('user_id', userId)`. A missing cv or jd, or a serialized CV over `MAX_COVER_LETTER_CV_CHARS`, gives `unavailable`.
  - `application_follow_up_state.select('follow_ups_since_reset').eq('application_id', applicationId).maybeSingle()`.
  - It never selects `application_events`. Note text is not reachable.
  - `defaultLanguage` = the `cover_letter` snapshot's `metadata.language` if it is `'vi'|'en'`, otherwise `applications.language`.
- **Request:** `POST /api/rewrite-cv { action: 'follow_up', applicationId: string, language?: 'vi' | 'en' }`.
- **Responses:** `200 { content, language }` or `200 { content: '', language, fidelityFallback: true }`. Errors: `400` (unexpected key, non-UUID id, invalid language), `401`, `403` locked, `404 { error: 'Application not found' }` (both cross-account and missing), `409 { error: 'Follow-up not available' }` (not applied), `422 { error: 'Snapshot unavailable' }`, `429`, `503`, `504`/`500` as in P1A.

**Rules:**
- **Body allowlist.** Any key outside `action, applicationId, language` returns 400 before auth. Rejecting is stricter than ignoring.
- **Order:** validate, then `authorize(authHeader, 'follow_up', deadline)`, then `loadFollowUpContext`, then the budget check, then `generateFollowUp`.
- **Logging.** `404`, `409` and `422` happen before any Gemini call and write no `analysis_log` row. AI attempts log `kind 'rewrite'` with `{ v: 1, followUp: guardMetrics }`. Failures log `[follow_up:<category>]`, the P1A convention.
- **Language precedence:** an explicit `language` in the request (the user's per-draft override) wins. Otherwise use `defaultLanguage`: cover-letter snapshot language, then `applications.language`. The UI locale is never used.
- **No writes.** No writes to `applications`, `application_documents` or `application_events`, and no `check_analytics_quota`/`increment_usage_count` RPC.

- [ ] **Step 1: Write the failing tests.** Extend the `coverLetterHandler.test.ts` admin mock with per-table fixtures for `applications`, `application_documents` and `application_follow_up_state`, and record every `insert/update/upsert/delete/rpc` call. Use sentinels: the CV snapshot contains `SNAPSHOT_CV_SENTINEL`, the JD snapshot `SNAPSHOT_JD_SENTINEL`, and `jd.metadata.analysis.requirements[0].requirement = 'ANALYSIS_SENTINEL'` with `matchScore: 77`.
  - `rejects body-supplied documents`: a body with `parsedCV`/`jd`/`coverLetter`/`cvText` returns 400 and `generateContent` is not called.
  - `prompt is built from the stored snapshot`: with a valid request, the `generateContent` arguments contain `SNAPSHOT_CV_SENTINEL` and `SNAPSHOT_JD_SENTINEL`, and contain none of `ANALYSIS_SENTINEL`, `matchScore`, `77` or `NOTE_SENTINEL`.
  - Both `applications` and `application_documents` filters include `['eq','user_id','user-1']`, and no `application_events` query is made.
  - `cross-account → 404`: the app row is absent for this user, giving 404 with no Gemini call and no `analysis_log` insert. The body doesn't differ from a nonexistent id.
  - `non-applied → 409` for `drafted`, `interview` and `rejected`, with no Gemini call.
  - `zero tracker writes`: after a 200 response, only `analysis_log.insert` was recorded.
  - `language authority`: a letter snapshot `en` with app `vi` gives a prompt in EN; no letter with app `vi` gives VI; `language:'en'` override with letter `vi` gives EN; the response's `language` matches.
  - `429 at document cap`: count 5 (free) gives 429 with no Gemini call.
  - `success log`: the insert has `kind 'rewrite'` and `guard_metrics.followUp.outcome`.
  - `no monthly quota`: no `rpc` call was recorded.
  - Existing `cover_letter`, `application_review` and `rewrite` tests still pass unchanged.
- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run src/__tests__/services/followUpHandler.test.ts` should FAIL.
- [ ] **Step 3: Implement** `loadFollowUpContext`, `handleFollowUp` and the dispatch line `if (action === 'follow_up') return handleFollowUp(authHeader, body);`.
- [ ] **Step 4: Run them and confirm they pass,** then `npm run lint:api && npm test`. `errorPrivacy.test.ts` must still pass.
- [ ] **Step 5: Commit** `feat(ai): follow_up action on rewrite-cv using server-loaded application snapshots`.

### Task 11: Draft follow-up UI

**Files:**
- Modify: `src/components/views/applications/FollowUpActions.tsx` (add `FollowUpDraftPanel`), `ApplicationDetailView.tsx` (button + `'draft'` panel), `src/services/ai/analysisService.ts`, `src/translations/applications.ts`
- Test: `src/__tests__/components/ApplicationDetailView.test.tsx`

**Interfaces:**
- `export async function generateFollowUpDraft(input: { applicationId: string; language?: 'vi' | 'en' }, authToken?: string): Promise<{ content: string; language: 'vi' | 'en'; fidelityFallback: boolean }>`. It sends `JSON.stringify({ action: 'follow_up', ...input })` with `AbortSignal.timeout(75_000)` and throws `CoverLetterRequestError(res.status)`.
- `export function FollowUpDraftPanel({ application, documents, onClose }: { application: ApplicationDetail; documents: ApplicationDocument[]; onClose: () => void })`.

**Behavior:**
- The button "Soạn follow-up / Draft follow-up" appears only for `status === 'applied'`, in every follow-up state.
- The language toggle starts from the cover-letter document's `metadata.language`, otherwise `application.language`, never `reportLanguage`. `language` is sent only when the user changed the toggle.
- Generate and Regenerate each make one request. The result shows in an editable textarea with a Copy button (`navigator.clipboard.writeText`).
- On `fidelityFallback`, show: "Không tạo được bản nháp an toàn từ hồ sơ đã nộp. Vui lòng thử lại hoặc tự viết." / "Couldn't produce a draft grounded in the submitted application. Try again or write your own."
- A persistent hint reads: "Bản nháp không được lưu và chưa được ghi là đã gửi." / "Drafts aren't saved and aren't logged as sent."
- **No tracker mutation** follows generation, and the timeline is not reloaded.
- Errors map by HTTP status: 429 is rate limit, 409 is "not available in the current status", other codes get the generic message. Reuse CoverLetterAction's status-to-message mapping if it's exported, otherwise add keys. Nothing goes to Sentry with draft text.

- [ ] **Step 1: Write the failing tests:**
  - Generate calls `generateFollowUpDraft({ applicationId })` with no `language` when untouched, and with UI locale `en` but app language `vi`, the toggle shows VI;
  - toggling to EN sends `language:'en'`;
  - the draft renders, and `logApplicationContact` and `transitionApplicationStatus` are **not** called and the timeline fetch count is unchanged;
  - Regenerate makes a second request;
  - fallback copy appears;
  - 429 shows the rate-limit message;
  - the button is hidden for drafted, interview and final apps.
- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run src/__tests__/components/ApplicationDetailView.test.tsx -t "Draft follow-up"` should FAIL.
- [ ] **Step 3: Implement** the interfaces above.
- [ ] **Step 4: Run them and confirm they pass,** then `npm run lint && npm test`.
- [ ] **Step 5: Commit** `feat(applications): follow-up draft panel (not persisted, never logs sent)`.

### Task 12: Full regression + pre-merge authority docs

**Files:**
- Modify: `docs/15_applications.md` (new "P2C" section), `docs/superpowers/plans/2026-11-01-ai-job-search-integration-v2.md` (P2C status: IMPLEMENTED, not production verified), `docs/9_api_routes.md` (row for `action: 'follow_up'`), `docs/11_guard_metrics.md` (`followUp` shape and the document-cap filter).

- [ ] **Step 1: Run every SQL suite in one harness run:** `supabase/tests/local/run.sh "$PWD" /repo/tests/application_follow_up.test.sql /repo/tests/application_follow_up_concurrency.test.sql /repo/tests/application_tracker.test.sql /repo/tests/application_tracker_concurrency.test.sql /repo/tests/applications.test.sql /repo/tests/applications_concurrency.test.sql /repo/tests/account_lock.test.sql`. Every line must be PASS with no `MIGRATION-ERR`. Then run the backfill fixture command from Task 2.
- [ ] **Step 2: Run** `npm run lint && npm run lint:api && npm test && npm run build`. All must pass.
- [ ] **Step 3: Check the function count and Analyze isolation:**
  - `ls api/*.ts api/*/*.ts | grep -v __tests__ | xargs grep -l "export default" | wc -l` should print `9`;
  - `git diff --stat origin/main -- _server-lib/analyze _server-lib/ai/analyzeService.ts _server-lib/ai/prompts* src/services/ai/prompts* api/analyze.ts` should be empty. Adjust the globs to the actual Analyze files with `graft grep "analyzeCV"`.
- [ ] **Step 4: Write the docs.** Cover:
  - event authority (two types, shape, RPC, error codes);
  - the derivation (anchor by insertion order, `max` for last contact, strict-after count, tie rules);
  - the 7-day threshold and the 2-follow-up soft limit;
  - `contact_received` semantics;
  - the view, `security_invoker` and grants;
  - the Task 4 EXPLAIN result and index decision;
  - the AI boundary (body allowlist, server-loaded snapshots, excluded inputs, language precedence);
  - quota (document cap, no monthly quota);
  - accepted debt (see Risks);
  - the rollout order;
  - status "IMPLEMENTED — NOT YET PRODUCTION VERIFIED".
- [ ] **Step 5: Commit** `docs(applications): P2C follow-up authority (pre-verification)`.

---

## Rollout

| Phase | Action | Gate |
|---|---|---|
| *Every phase below is a USER-APPROVED CHECKPOINT. Executors stop and report before A, C, D, E and F.* | | |
| A. Fallback first | PR P2C.0 (Task 1) goes through CI, merge and Vercel deploy. Confirm cvfit.pro serves the new `ApplicationDetailView` chunk. | Production Timeline shows a generic title for unknown types. **This build is the rollback target from now on**, not `3a3a5bb`. |
| B. Implementation PR | PR with Tasks 2–12; CI green. The migration is **not** applied. Preview deploys use production Supabase: the list shows no indicators plus a small role=status load-error notice, and the detail view fails silently (no Follow-up Field), and contact logging and drafts fail with not-found or 5xx. This is expected, as with P2A/P2B previews. | Review approved. |
| C. Migration | 1) **Preflight, read-only:** `20261105000000` is absent from `supabase_migrations.schema_migrations`; `pg_get_constraintdef` of the event_type CHECK and `application_events_shape` equal the P2B definitions; `to_regclass('public.application_follow_up_state') IS NULL`; `log_application_contact` is absent; event counts by type are recorded. 2) `supabase db push --linked --dry-run` lists exactly one migration. 3) Apply with `supabase db push --linked`. 4) **Verify, read-only:** the new CHECK definitions; view `reloptions` contains `security_invoker=true`; `has_table_privilege('anon', view, 'SELECT') = false`; authenticated has SELECT only; the RPC is DEFINER with `search_path=""`, anon EXECUTE false and authenticated true; event counts by type are unchanged; `SELECT count(*) FROM view` equals `SELECT count(*) FROM applications WHERE status = 'applied'`. | All checks pass. Any mismatch means stop. |
| D. Merge + deploy | Squash merge and Vercel production deploy. | Deployment success. |
| E. Production verification | See below. | All cases pass or are recorded as gaps. |
| F. Docs closeout | See below. | — |

**Why the migration lands before the app deploy:** the new app reads the view and calls the RPC, so deploying first would leave badges missing and logging broken. The old (Phase A) app never writes the new types, the CHECK extension is additive, and its Timeline renders unknown types with the fallback. So an app-only rollback after users log contact events is safe.

**Schema rollback:** leave the schema dormant (additive). Drop the view and RPC and restore the CHECKs only if there are 0 `follow_up_sent`/`contact_received` events.

## Production Verification

Use the controlled smoke account and synthetic applications only. Reach timing states through the UI date pickers (backdated transitions and contact dates). **No SQL writes on production.** Verify the DB side with read-only queries.

1. The existing P2B application (`P2B Smoke Corp`) still loads in the list and detail.
2. Its Timeline still renders, and all P2B events keep their titles.
3. Analyze → Save → `drafted → applied` (today) shows the `waiting` state in detail with a due date 7 days out, and the quiet "Đang chờ phản hồi" text indicator on the card.
4. A new smoke app with `drafted → applied` backdated 8 days shows `due` on the badge and in detail, and appears under "Needs follow-up", ordered by due date.
5. Draft follow-up on it produces text grounded in the saved CV/JD. The read-only check: the text references only snapshot facts, and the request payload (network panel) contains only `action`, `applicationId` and possibly `language`.
6. After generating, the Timeline count is unchanged (read-only `count(*)` by app).
7. Mark as sent produces exactly one `follow_up_sent` (Timeline plus a read-only count). A double click doesn't duplicate it.
8. The state returns to `waiting`.
9. Employer replied produces exactly one `contact_received`.
10. After the reply, `follow_ups_since_reset = 0` (read-only view query as the owner's data).
11. Two follow-ups logged after the reply give `limit_reached`. The card shows the muted badge, and the app is not in "Needs follow-up".
12. A third Mark as sent is accepted, and its event is visible.
13. A final-status app (`rejected`) shows no follow-up Field, no contact buttons and no draft button.
14. A drafted app shows the same: no follow-up UI.
15. Cross-account: with a second controlled account, the first account's application ID returns 404 for drafts and is not visible in the view. If no second account exists, record this as a verification gap covered by the SQL and server tests, as in P2B.
16. Mobile 375 px and desktop: list badge, filter, detail Field and all three panels, with no horizontal overflow.
17. The Vercel deployment lists 9 functions.
18. One Analyze run behaves as before (result renders, monthly usage +1, no follow-up code involved). The follow-up draft does not change monthly usage (read-only `profiles.usage_count` before and after).

Integrity after smoke: no orphan events; the event count per type matches the smoke actions; P2A/P2B snapshots are unchanged (fingerprint as in the P2B smoke).

## Documentation Closeout

After production verification passes, in a docs-only PR:
- `docs/15_applications.md`: mark P2C DEPLOYED / PRODUCTION VERIFIED with the date, PR and merge SHA, the migration apply timestamp, the smoke table (the 18 cases above with PASS or gap), and the verification gaps.
- Roadmap P2C section: status, deliberate deviations (interview/offer automation deferred, drafts not stored), and the accepted debt list.
- `docs/9_api_routes.md` and `docs/11_guard_metrics.md`: confirm they match production.
- Do not mark anything verified that wasn't smoke-tested.

## Risks / accepted debt (to carry into docs)

- A correction transition (for example `interview → applied`) creates a new stage anchor, so the reminder is later. This fails safe.
- User-backdated dates are trusted. A follow-up dated at or before the reset point neither moves the timer nor counts (`last_contact_at` is `greatest(stage_entered_at, max contact)`, and the count needs `occurred_at >` the reset point).
- Promises and availability without digits are guarded by the prompt only.
- `company_name` and `role_title` are mutable metadata and are used as allowed phrases.
- Sent follow-up text isn't stored, except in the optional private note.
- Interview and offer follow-up automation and drafts are deferred. The RPC accepts logging for them, but the UI doesn't expose it.
- Detail deep link: existing accepted debt.

## Final plan gate

*Gate answers were updated at Task 12 to reflect the shipped code.*

- **Does every persisted field have one authority?** Yes. The only new persisted data is append-only events. Status stays `applications.status`, and all follow-up values are derived in a view.
- **Can follow-up eligibility be reconstructed from events?** Yes. The view is a pure function of `applications.status`, `application_events` and `now()`.
- **Can a retry duplicate an event?** Retries and remounts reuse one UUID per intent, and the advisory lock on `(user, key)`, replay before writes and `UNIQUE(user_id, idempotency_key)` prevent duplicates (tested sequentially in Task 2 and in parallel). But an explicit Cancel after an unknown outcome clears the intent key, so resubmitting can create one duplicate event. This is OPEN Important and a release blocker (see docs/15).
- **Can a client replace snapshot content sent to Gemini?** No. The body allowlist rejects document fields, and the server loads snapshots filtered by `user_id` (Task 10 sentinel tests).
- **Can notes leak to Gemini or Sentry?** No. The loader never queries `application_events`. The tracker hook sends only a generic Sentry message (unchanged), and draft text never goes to Sentry (Tasks 10–11).
- **Can new event types break the old deployed UI?** No. The fallback ships and deploys first (Task 1, Phase A), and the old app never writes the new types.
- **Can follow-up bypass the document quota?** No. The cap filter includes `followUp` (Task 8), and the handler returns 429 before Gemini (Task 10).
- **Can P2C ship without touching Analyze scoring?** Yes. No Analyze file changes (Task 12 Step 3), and score is excluded from the prompt (Task 10).
