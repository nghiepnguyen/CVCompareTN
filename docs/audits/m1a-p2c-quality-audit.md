# M1-A — P2C Quality Fixes: Baseline Audit

**Status: READ-ONLY AUDIT — no runtime change, not committed.** Roadmap: `2026-11-15-roadmap-reprioritization.md` M1 (on `feat/p3a-interview-prep` at `7707eb3`; not on `main`).

| Gate (unchanged) | Status |
|---|---|
| CP6 independent review | RESOURCE-BLOCKED / PENDING (`BLOCKED — INDEPENDENT REVIEW PENDING`) |
| D-H7 / Financial gate | NOT AUTHORIZED / BLOCKED |
| Live smoke, CP6 execution, P3A production | NO-GO |
| M1 release (push, PR, merge, deploy) | BLOCKED until owner approval A1 |

Audited 2026-11-15 by the implementing AI agent (Claude Opus 5.5).

**Status update 2026-11-15 (M1-B):** the owner chose GO for issues 1 and 2, and **Option A** (accept and document, no runtime mitigation) for issue 3. The §6 NO-GO for issue 3 is resolved by that decision. The implementation is uncommitted in this worktree; see `m1b-p2c-browser-verification-checklist.md`.

## 1. Baseline and isolation proof

| Check | Result |
|---|---|
| `main`, `origin/main` (after `git fetch origin main`), `git ls-remote origin refs/heads/main` | all `dacb266cbcd359ba854de694a5ca30a695d82648` |
| Worktree | `/Users/nghiepnguyen/My Files/cv-compare-tn-m1a`, branch `audit/m1a-p2c-quality` (local, unpushed), created from `origin/main` |
| P3A / CP6 absent | `git merge-base --is-ancestor 0871d03 HEAD` exit 1; `git grep "interview_prep\|InterviewPrepTab"` over `src _server-lib api`: 0 files |
| Dependencies | `package.json` and `package-lock.json` identical between `origin/main` and `feat/p3a-interview-prep`, so the main checkout's `node_modules` was symlinked for one test run, then removed |
| Baseline tests | `src/__tests__/components/ApplicationDetailView.test.tsx`: 117/117 pass on `dacb266` |
| Network | `git fetch` and `ls-remote` only. No Gemini call, no database access, no Supabase call |
| Hook disclosure | The `post-checkout` graphify hook rewrote the worktree's `graphify-out/GRAPH_REPORT.md` when the worktree was created. The rebuild finished, and the file was restored with `git checkout --` in the worktree only. The main checkout's file is unchanged (SHA-256 `22b1476b…`, still unstaged) |

## 2. Findings matrix

| | Issue 1: duplicate unknown-outcome message | Issue 2: keyboard focus-visible | Issue 3: duplicate events after reload |
|---|---|---|---|
| **Class** | **Confirmed** (code and tests) | **Verification gap plus inconsistency**, not a confirmed defect | **By-design residual**, not observed in production |
| **Reproduction** | Applied application. Open Add note, Mark as sent or Employer replied. Make the RPC fail with a network error (`Failed to fetch`). Two messages appear: the alert "Chưa xác nhận được kết quả. Bạn có thể thử lại an toàn." and the status "Chưa xác nhận được lần gửi trước đã được ghi nhận hay chưa. Bấm Thử lại…" | Tab through Application Detail in Chrome or Firefox. Buttons show the browser's default ring; inputs show only a 1px border colour change. Safari does not Tab to buttons by default (platform setting), so test Chrome and Firefox | Submit a note or contact event, then lose the response (unknown outcome) after the request commits. Reload the page (or use a second tab) and submit the same entry again. Result: two events |
| **Root cause / evidence** | Unresolved mode exists only when the error code is `unknown` (`isDefiniteRejection = code !== 'unknown'`, `applicationService.ts:89`). In that state `FormShell` renders `trackerErrorMessage(t, 'unknown')` = `trackerErrGeneric` as `role="alert"` (`TrackerActions.tsx:18-25`, `status.tsx:67`), while `UnresolvedActions` renders `trackerUnresolvedExplain` as `role="status"` (`TrackerActions.tsx:128`). Both say "unconfirmed" | No `focus-visible` class in the P2C components; the only repository use is `AdminView.tsx:1160` (`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2`). Tailwind 4.2.1 preflight keeps `:-moz-focusring { outline: auto }`, and does not remove button outlines. `fieldClass` sets `focus:outline-none focus:border-accent` (`TrackerActions.tsx:14`); the ConfirmDialog input does the same (`ConfirmDialog.tsx:96`) | Intents are memory-only by design: they hold private note text and must never go to sessionStorage (`useTrackerMutation.ts:6-13`). A reload or another tab creates a new UUID key. The server deduplicates only by `(user_id, idempotency_key)` and **ignores the payload**: `log_application_contact` (`20261105000000_application_follow_up.sql:68-73`) and `add_application_note` (`20261104000000_application_tracker.sql`, function at line 305, replay at its lines 20-24) |
| **Affected components and data paths** | `NoteForm`, `ContactEventForm` (`TrackerActions.tsx`, `FollowUpActions.tsx`) → `FormShell`, `UnresolvedActions`. UI only; no data path | `primaryButton` and `secondaryButton` (`TrackerActions.tsx:15-16`), the detail action buttons and tabs (`ApplicationDetailView.tsx:142-190`), the draft language toggle (`FollowUpActions.tsx`), `fieldClass`, ConfirmDialog. UI only | `add_application_note` and `log_application_contact` → `application_events`. Status and details are **not** affected: compare-and-swap (`expectedStatus`, `expectedUpdatedAt`) rejects a stale repeat |
| **Production impact** | UX only: redundant, partly overlapping copy, announced twice by screen readers | Accessibility (WCAG 2.4.7 focus visible): weak input indication, browser-dependent button ring | Duplicate events are **permanent**: there is no delete path for `application_events` (only `ON DELETE CASCADE` with the application). A duplicate `follow_up_sent` raises `follow_ups_since_reset` and can move an application to `limit_reached` early. Counting real duplicates would need a production aggregate query (owner approval A4) |
| **Existing coverage** | R3 suite (`ApplicationDetailView.test.tsx:1427-1498`) asserts the neutral copy next to Retry for note and contact forms; lines ~312 and 623-669 also assert it. These assertions **encode the duplicate** | None (jsdom cannot check focus rendering) | Same-page retry and remount are covered: R1 cases 1, 4, 6, 9a-9c, 10, 15-18. Reload and second tab are not covered (by design) |

Adjacent, out of scope: the unresolved marker dot on the action buttons is `aria-hidden`. Its only other signal is a `title` attribute, which screen readers may not announce.

## 3. Minimal implementation plan (M1-B)

1. **Issue 1.** In `NoteForm` and `ContactEventForm`, when `unresolved` is set, pass `trackerUnresolvedExplain` as the `FormShell` error (the `role="alert"` slot, which is announced on insertion). Remove the separate `<p role="status">` from `UnresolvedActions`.
   - The status and details forms have no unresolved UI and keep the neutral copy unchanged.
   - Copy: `trackerErrGeneric` stays for status and details. No translation key changes.
2. **Issue 2.** Add one shared focus class, following the AdminView convention: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2`, with a ring-offset colour matching the surface so dark mode shows no white halo.
   - Apply it to `primaryButton`, `secondaryButton`, the detail action buttons, the tabs and the language toggle.
   - Add `focus:ring-1 focus:ring-accent` to `fieldClass`.
   - Leave the ConfirmDialog alone unless the browser check shows it needs the same treatment; it is a shared component, so changing it widens the scope.
3. **Issue 3. No implementation until the owner chooses:**
   - **(A) Accept and document** the reload and second-tab residual in `docs/15_applications.md`.
   - **(C) Exact-match warning:** before submitting a note or contact event, if the loaded first timeline page (newest first by `occurred_at`, `applicationService.ts:154-156`) has an event with the same type, the same trimmed note and the same ICT day, ask for confirmation. No storage, no migration, no server change. Known misses: a request still in flight that commits after the reload's fetch, and duplicates older than page one. Legitimate repeats remain possible after confirmation.
   - **Ruled out:**
     - Persisting the key across a reload. Because the server ignores the payload, a different entry sent under an old key returns `replayed: true` and the new content is **silently lost**.
     - Persisting the key plus a payload digest in sessionStorage. That reverses the documented memory-only decision for private note text.
     - A server-side content dedupe. It needs a migration, which is out of scope.

## 4. Test plan

| Issue | Tests (M1-B) |
|---|---|
| 1 | Update R3 and lines ~312 and 623-669: unknown outcome on note, follow_up_sent or contact_received shows **exactly one** message (`trackerUnresolvedExplain`) and never the definite-failure copy, in VI and EN. A second unknown outcome on Retry still shows exactly one message, with the same key. Status and details neutral-copy tests (~213, 256, 459; R3 status case) pass **unchanged**. This changes the R3 test contract and needs owner acknowledgement |
| 2 | Class-level assertion that every listed control carries the shared focus class. **Browser check (exit criterion, BLOCKED):** keyboard Tab in Chrome and Firefox, light and dark, at 375 px and 1024 px, on a logged-in Application Detail page. This needs the production smoke account or a preview deploy, which is owner approval A1/A7 |
| 3 (if C) | Exact match → confirmation, cancel sends nothing. A different note, day or type → no prompt. Confirm → one RPC with a new key. No sessionStorage or localStorage write (spy) |
| All | `npm run lint`, `npm run lint:api`, `npm test`, `npm run build` |

## 5. Risks and rollback

- **Data.** Issues 1 and 2 touch no data path. Option C only adds a client confirmation step. No migration, no RPC change, no Gemini call.
- **UX.**
  - Issue 1: one fewer message. Make sure the remaining alert is still announced on a repeated unknown outcome (test above).
  - Issue 2: visual change on every tracker control; needs the browser check.
  - Option C: false prompts for legitimately identical entries on the same day (acceptable with confirmation).
- **Rollback.** Revert the client commit. There is no schema or data state to undo. Never roll back the app below the P2C.0 floor `b6e3c47`.

## 6. Recommendation

| Item | Decision |
|---|---|
| Issue 1 | **GO** for M1-B, with the R3 test-contract change acknowledged by the owner |
| Issue 2 | **GO** for the code and class-level tests. The browser exit criterion stays **BLOCKED** until A1/A7 |
| Issue 3 | **NO-GO** until the owner chooses A or C |
| Release | **BLOCKED** until A1 (push, PR, merge, deploy each need approval) |

Owner decisions needed: acknowledge the R3 contract change (issue 1), choose A or C (issue 3), and provide a browser verification route (A1/A7).
