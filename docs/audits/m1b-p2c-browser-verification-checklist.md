# M1-B — P2C Quality Remediation: Browser Verification Checklist

**Status: NOT PERFORMED — browser verification PENDING.** Nothing here is a PASS. Running it needs separate owner approval for:
- a preview deployment of the M1-B commit;
- a dedicated smoke account.

| Gate (unchanged) | Status |
|---|---|
| CP6 independent review | RESOURCE-BLOCKED / PENDING (`BLOCKED — INDEPENDENT REVIEW PENDING`) |
| D-H7 / Financial gate | NOT AUTHORIZED / BLOCKED |
| Live smoke, CP6 execution, P3A production | NO-GO |
| M1-B commit / push / preview / merge / deploy | each needs separate owner approval |

## 0. Preconditions (owner)

- [ ] The M1-B change is committed on `audit/m1a-p2c-quality` (base `dacb266`, no P3A or CP6 code), and the preview build is from that exact SHA. Record the SHA:
- [ ] The preview deployment is authorized, and its Supabase target is recorded. Preview and production share the project unless configured otherwise, so treat writes as real data.
- [ ] A dedicated smoke account is used. No real user data. One application in status `applied`, with synthetic company and role names.
- [ ] No Gemini call is needed: do **not** press Draft generate.
- [ ] Browsers: Chrome (current) and Firefox (current). Safari only with "Press Tab to highlight each item" enabled, as a note, not a gate.

## 1. Issue 1 — single unknown-outcome message

An unknown outcome needs a lost response. Simulate it in DevTools: Network → Offline (or block the `rpc/add_application_note` and `rpc/log_application_contact` URLs), click Save, then go back online.

| # | Step | Expected | Chrome | Firefox |
|---|---|---|---|---|
| 1.1 | Add note → offline → Save | Exactly **one** message: "Chưa xác nhận được lần gửi trước đã được ghi nhận hay chưa…" (red alert slot). The text "Chưa xác nhận được kết quả. Bạn có thể thử lại an toàn." is **absent**. Retry, Close and Abandon are shown. The message sits **above** the Retry / Close / Abandon row, in red (`role="alert"`) | | |
| 1.2 | Same for Mark as sent | Same as 1.1 | | |
| 1.3 | Same for Employer replied | Same as 1.1 | | |
| 1.4 | While unresolved, stay offline and press Retry | Still exactly one message, no second copy | | |
| 1.5 | Back online → Retry | Exactly one new timeline event, no duplicate. If the first request had committed, the replay notice appears | | |
| 1.6 | Change status → offline → Save | The neutral copy "Chưa xác nhận được kết quả…" is still shown (status form unchanged) | | |
| 1.7 | Edit details → offline → Save | Same as 1.6 | | |
| 1.8 | EN UI: repeat 1.1 | One message: "We couldn't confirm whether your earlier submission was recorded…" | | |
| 1.9 | Screen reader (VoiceOver or NVDA, optional) at 1.1 and 1.4 | The explanation is announced once at 1.1 and **announced again** after a repeated unknown at 1.4 (the alert unmounts while Retry is in flight and remounts on the next unknown) | | |

## 2. Issue 2 — keyboard focus-visible

Use the keyboard only (Tab / Shift+Tab). Test light and dark mode, each at 375 px and 1024 px.

| # | Control | Expected | Light 375 | Light 1024 | Dark 375 | Dark 1024 |
|---|---|---|---|---|---|---|
| 2.1 | Back button | 2px accent ring with offset; no white halo in dark mode (`ring-offset-surface` is an addition to the AdminView pattern, which uses the default white offset) | | | | |
| 2.2 | Tabs (Overview / Documents / Timeline) | Ring visible and **not clipped** by the scrolling tab bar (it has 4px padding; ring plus offset = 4px) | | | | |
| 2.3 | Overview actions (Change status, Edit details, Add note, Mark as sent, Employer replied, Draft) | Ring visible on each | | | | |
| 2.4 | Form Save / Cancel; Retry / Close / Abandon | Ring visible; **disabled** buttons stay dimmed with no scale on hover; `Đang lưu…` loading state unchanged | | | | |
| 2.5 | Date input, note textarea, status select | Accent border plus 1px ring on focus, by keyboard **and** by mouse click (text fields match `:focus-visible` on click; intentional change) | | | | |
| 2.6 | Draft panel: language toggle, Close (do not press Generate) | Ring visible; `aria-pressed` state is still distinguishable | | | | |
| 2.7 | Timeline "Load more" (if shown) | Ring visible | | | | |
| 2.8 | Mouse click on any **button** (not text fields, see 2.5) | **No** ring after a pointer click (`:focus-visible` only) | | | | |
| 2.9 | ConfirmDialog (Abandon, final-status correction) | Out of scope: record what you see, no change expected | | | | |
| 2.10 | No horizontal page scroll at 375 px | Pass or fail | | | | |

## 3. Regression spot checks

- [ ] Mark as sent at status `applied`: one event, the follow-up state updates.
- [ ] Status change to `interview`: the contact buttons hide, the timeline shows the status event.
- [ ] Console: 0 errors during §1–§2.

## 4. Issue 3 — no browser test

Option A is owner-accepted: the duplicate-event risk after a reload or in a second tab is documented, not mitigated (`docs/15_applications.md`, P2C "Known debt (open)"). Do not try to reproduce it on the shared Supabase project: duplicate events cannot be deleted.

## 5. Record

| Field | Entry |
|---|---|
| Tester | |
| Date | |
| Preview URL and SHA | |
| Smoke account (alias only) | |
| Result (PASS / PASS WITH GAPS / FAIL) and gaps | |
