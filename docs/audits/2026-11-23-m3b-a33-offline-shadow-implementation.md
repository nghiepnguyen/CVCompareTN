# M3-B A3.3 — fit-score-v1 offline shadow implementation: status report

- **Date:** 2026-11-23
- **Result: NO-GO — blocked on a prerequisite, not on a defect.** Phase 0 is complete. Phases 1–5 (production code) were **not started**, as the brief requires: "If PR-1 or PR-2 is not merged, stop before production-code implementation and report the dependency." Neither PR exists on GitHub; `origin/main` is still `5776735` (fetched 2026-11-23).
- **Mode:** offline. **0 Gemini calls.** No production file changed, no push, no PR opened, no merge, no deployment, no migration, no flag set.

## 1. Implementation summary

| Phase | Status |
|---|---|
| 0 — branch and CI preparation | **Done locally.** PR-1 and PR-2 branches are prepared and verified; neither is pushed (owner action) |
| 1 — `fit-score-v1` module | Not started (needs PR-1 + PR-2 merged, then A3.3 cut from the new main) |
| 2 — shadow integration and flags | Not started |
| 3 — `fitShadow` metrics | Not started |
| 4 — offline tests | Not started (the plan is unchanged: A3.2 §9) |
| 5 — verification | Done for PR-2 only (§4) |

## 2. Files changed (prepared branches, local only)

### PR-1 — `docs/m3b-a2-a3-reports` (worktree `../cv-compare-tn-pr1-docs`, from `origin/main` `5776735`)

Docs only (0 non-doc files). Cherry-picked from the audit branches:

- `docs/audits/2026-11-22-m3b-a21-benchmark-readiness.md` (A2.1-R)
- `docs/audits/2026-11-23-m3b-a31-deterministic-scoring-audit.md` (A3.1)
- `docs/audits/2026-11-23-m3b-a32-scoring-contract.md` (A3.2)
- this report

Housekeeping fix: the last A3.2 commit (`e78ffe6`) had accidentally included the auto-generated `graphify-out/GRAPH_REPORT.md` (a `commit -a`). It was amended out on both the PR-1 branch and the A3.2 audit branch (now `f54ea02`). None of these was ever pushed.

### PR-2 — `test/m3b-benchmark-harness` (worktree `../cv-compare-tn-pr2-harness`, from `origin/main` `5776735`)

Commits `fb4becc`, `08e61c3` (the A2.2 harness, cherry-picked from `3b47f37`, `f6450df`) and `93f6f3c` (CI split):

| File | Change |
|---|---|
| `scripts/m3b-a1/**` | benchmark harness (runner, transport, fixtures, rubric prototype, parity/isolation/characterization tests, freeze manifests) — as A2.2 |
| `docs/audits/2026-11-23-m3b-a2-benchmark-protocol-v3.md`, `…-a22-runner-alignment.md` | protocol v3 and the A2.2 report |
| `vitest.config.ts` | `BASE_EXCLUDE` and `BENCHMARK_FREEZE_TESTS` exported. The normal suite excludes **only** `a2Manifest.test.ts`, `rubricFreeze.test.ts` and `freezeCheck.test.ts` |
| `scripts/m3b-a1/vitest.offline.config.ts` | restores the freeze tests and adds the offline guard |
| `package.json` | `test:benchmark` script (one line) |
| `.github/workflows/benchmark-freeze.yml` | new workflow: `npm run test:benchmark`, path-filtered to the frozen scoring files, `workflow_dispatch`, `contents: read`. **Not a required check** (a new workflow is not required unless the owner adds it to the ruleset) |
| `scripts/m3b-a1/freezeCheck.ts` (new) | `staleFreeze()`: recomputes the manifest and every frozen hash and the config hash. It returns a reason (never file contents) on drift and fails closed if a file is unreadable |
| `scripts/m3b-a1/a2Runner.ts` | the live path calls `staleFreeze()` after `checkLiveAuthorization` and refuses with `config_mismatch: freeze stale: …`. **A stale freeze on main can never authorize a live run** |
| `scripts/m3b-a1/A2_FROZEN.json` | re-frozen: runner `0bdf13ac…fba67`, `freezeCheck.ts` `fd80e416…635d` added. Manifest, prompt, schema and config hash (`0892cba0…5a45`) unchanged |

Production diff of PR-2 vs `origin/main`: **0 lines** under `src/`, `_server-lib/`, `api/`, `server/`, `server.ts`, `supabase/`, `vercel.json`.

## 3. Policy compliance (Phase 0 requirements)

| Requirement | Evidence |
|---|---|
| PR-1 docs only | `git diff --name-only origin/main` → 4 files, all under `docs/` |
| PR-2 harness + CI separation | §2 |
| Parity and isolation stay in required CI | `npx vitest list` (normal config) lists `isolation.test`, `a2RequestParity`, `responseParity`, `responseParitySdk` and `currentPipelineCharacterization` (81 entries); it lists **0** freeze tests |
| Only freeze checks move to the dedicated non-required job | `npx vitest list --config scripts/m3b-a1/vitest.offline.config.ts scripts/m3b-a1` lists the freeze tests (13 entries) |
| Stale freeze cannot authorize live execution | runner live-path guard + `freezeCheck.test.ts` (stale manifest / stale hash / wrong config hash / unreadable → refusal; source check that the guard sits on the live path after authorization). `LIVE_ENABLED` is still `false` |
| No automatic merge | nothing pushed or opened |

**Tripwire probe** (done, then reverted): appending a comment to `_server-lib/ai/analysisService.ts`:
- normal `vitest run scripts/m3b-a1` → **all pass** (10 files, 245 tests), so unrelated CI is not blocked;
- `npm run test:benchmark` → **fails** (`a2Manifest`, `freezeCheck`), meaning a re-freeze is needed.

The probe edit was reverted (`git diff --quiet -- _server-lib` clean).

## 4. Test results (PR-2 branch, exact commands)

| Command | Result |
|---|---|
| `env -u GEMINI_API_KEY npm test` | 129 files passed, 8 skipped; **2005 passed**, 76 skipped; exit 0 |
| `npm run test:benchmark` | **14 files, 270 passed**, 1 skipped (by design) |
| `npm run lint` | exit 0 |
| `npm run lint:api` | exit 0 |
| `npm run build` | exit 0 |

The worktree has no `.env`, and `node_modules` is a symlink to an install with an identical lockfile (`../cv-compare-tn-sec2-fix`).

## 5. Shadow metrics verification

Not applicable yet: no shadow code exists. The contract to verify in Phases 3–4 is A3.2 §4.2/§5.2. Its required tests are listed in A3.2 §9, including a privacy test asserting that `guard_metrics.fitShadow` contains no string outside the enums, and that the API response body is byte-identical with the shadow on and off.

## 6. Privacy findings

No new data is collected by anything in PR-1 or PR-2. The A3.2 open point stands: `analysis_log` has **no retention job**, and `fitShadow` would add a user-linked evaluation number. That needs OD-M2 before any shadow deploy (not before A3.3 offline).

## 7. Known risks

- **Branch drift.** The A2.2 report inside PR-2 states the older runner hash (`8728ecc…`) and lists the CI-coupling choice as pending. Both are superseded by `93f6f3c` and this report, which is the authoritative status.
- **Tamper tests depend on the tree.** `freezeCheck.test.ts`'s tamper tests assume the rest of the tree is fresh. On a stale tree they report the manifest drift first. This is acceptable because the file runs only in the freeze job.
- **No gate on merging a stale freeze.** The freeze job is non-required, so a scoring PR can merge with a red freeze run. The live-run guard makes that safe for spend, but the harness would then need a re-freeze before its next use. Recommendation: a PR-template checkbox ("benchmark freeze green or re-frozen").
- **Ordering.** A3.3 must start from main **after** PR-2 merges, because adding `fitScore.ts` and the shadow call to `analysisService.ts` must be re-frozen in the same change.

## 8. Production readiness

No production change exists. PR-1 and PR-2 are safe to review: docs and test/CI-only, 0 production lines. Pushing a branch triggers a Vercel Preview build (an existing repo behaviour). Preview carries no traffic and sends no Gemini calls, but it is still an outward action for the owner to take.

## 9. Owner approvals required

1. **Push and open PR-1** (`docs/m3b-a2-a3-reports`), review, merge.
2. **Push and open PR-2** (`test/m3b-benchmark-harness`), review, merge. Optionally add a PR-template checkbox for scoring PRs.
3. Confirm that `benchmark-freeze` stays **non-required** in the branch ruleset.
4. After both merges: authorize starting **A3.3 Phases 1–5** from the new main. The plan is unchanged: A3.2 §9, approved shadow-only policy values, both flags default off.
5. Before any later shadow deploy (A3.4): OD-M2 retention/privacy.

**Verdict: NO-GO (dependency).** Re-run A3.3 once PR-1 and PR-2 are merged. Phase 0 needs no rework.

---

## Tóm tắt (tiếng Việt)

- Đã chuẩn bị xong hai nhánh nhưng **chưa đẩy lên GitHub**:
  - **PR-1:** chỉ gồm tài liệu A2.1, A3.1, A3.2 và báo cáo này.
  - **PR-2:** bộ benchmark, tách 3 bài kiểm tra "đóng băng" sang một job CI riêng, không bắt buộc. Các bài kiểm tra parity và isolation vẫn nằm trong CI bắt buộc. Runner tự kiểm tra lại trạng thái đóng băng trước mọi lần chạy thật, nên dữ liệu đóng băng đã cũ không thể cho phép gọi Gemini.
- Kết quả kiểm tra: tất cả test, lint và build đều đạt. Không thay đổi dòng mã production nào.
- Theo yêu cầu, **chưa viết mã chấm điểm** vì PR-1 và PR-2 chưa được merge. Kết luận: **NO-GO do phụ thuộc**, không phải do lỗi.
- **Việc cần anh/chị làm:**
  - đẩy và mở PR-1, PR-2, rồi duyệt và merge;
  - giữ job benchmark-freeze ở chế độ không bắt buộc;
  - sau đó cho phép bắt đầu A3.3 (giai đoạn 1–5) từ main mới.
