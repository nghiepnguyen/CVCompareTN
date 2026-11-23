# M3-B A2 — Live benchmark protocol v3 (A2.2 — PLAN ONLY, NOT EXECUTED)

- Status: **frozen criteria, draft for owner approval.** `LIVE_ENABLED = false`. Supersedes v2 (`audit/m3b-a1-score-stability@3fd9b74:docs/audits/2026-11-22-m3b-a2-benchmark-protocol.md`). The §4 evaluation criteria and §5 rules are carried over **unchanged** from v2.
- Changes vs v2 (A2.2, owner-approved OD-B, OD-E, OD-G): production canonical-en-v2 response classification; round-robin order; protocol checkpoints; OD-G soft stops; model-version pinning; SHA-locked live authorization.
- Pending owner decisions that this protocol does **not** assume: OD-A (cost bound), OD-C (production SQL), OD-17 (labels), OD-D (host), OD-H (execution SHA).
- Frozen inputs: `scripts/m3b-a1/A2_FIXTURES_MANIFEST.json` (fixtures, labels, rendered requests, prompt template, request config, production response-handling files, rubric, this document) and `scripts/m3b-a1/A2_FROZEN.json` (runner, transport).
- Report: [`2026-11-23-m3b-a22-runner-alignment.md`](2026-11-23-m3b-a22-runner-alignment.md).

## 1. Purpose

- **A2.0 (pilot)** = go/no-go for expansion, not validation. 5 runs per fixture are not statistically sufficient for production validation.
- **A2.1 (expanded, held-out)** = validation on held-out fixtures frozen before any A2.0 output exists (`a21Fixtures.ts`), under the frozen rubric version. Not to be confused with the "A2.1 readiness" audit (A2.1-R).
- Both compare, on the same captured responses, the production canonical-en-v2 `matchScore` (validated, rounded once) and the deterministic rubric score (`rubric-proto-v1-candidate`). The rubric adds no model call.

## 2. A2.0

| Item | Value |
|---|---|
| Fixtures | A = `a2-strong`, B = `a2-boundary-80`, C = `a2-boundary-60`, D = `a2-semantic-stress` (`a2Fixtures.ts`) |
| Order (OD-E) | **round-robin**: A, B, C, D — run 1; A, B, C, D — run 2; … through run 5 |
| Primary calls | 4 × 5 = 20 |
| Retries | ≤ 4, only after HTTP 429 / 500 / 503, re-sent immediately for the same run; **every retry is a call** |
| **Ceiling** | **24 generateContent requests including retries**, concurrency 1 |
| Calls per attempt | 1 production-identical analyze request (equivalent to `language: 'en'`); no localization, no parse_cv, no rewrite |
| Success | only a response production would accept: no `promptFeedback.blockReason`, first candidate `finishReason = STOP`, JSON object, `normalizeMatchScore` valid. Anything else = `invalid_output` (a completed, charged run; measured; never re-sent; excluded from score statistics) |
| Reservation | per attempt = ⌈((request bytes + 1,024) × $0.50/M + 65,536 × $3.00/M) to $0.0001⌉ — assumption H2; **not a guaranteed bound** while OD-A is open |
| Authorization ceiling | $5.00 cumulative (A2.0 + A2.1), reservation-based. **Not a billing cap**: one call's provider cost has no documented upper bound (OD-A) |

### 2.1 Checkpoints (durable stops; each needs an owner resume with an approval reference)

| Checkpoint | Fires after |
|---|---|
| CP0 | call 1 |
| CP1 | the call that completes run 1 of all four fixtures (call 4 if no retry) |
| CP2 | call 12 |
| CP3 | call 20 — or, if call 20 completes the plan, the completed run is the final review point |

Call numbers count every request of the stage, retries included. No checkpoint advances without explicit owner approval.

### 2.2 OD-G soft stops (post-settlement; not billing caps)

Each is evaluated after a call has settled. It prevents the next call; it never caps the call that trips it.

| Soft stop | Threshold |
|---|---|
| Stage actual spend, usage-reported (from `usageMetadata`; reservation-charged retryable-HTTP / unknown outcomes are excluded — they are bounded by the hard reservation ceiling) | > $1.00 |
| Single call actual cost | > $0.10 |
| Output tokens (candidates + thoughts) in one call | > 17,408 (16,384 + 1,024: falsifies the H1 cost model) |
| Invalid outputs in the stage | ≥ 2 |
| Consecutive non-ok settlements (retryable HTTP, invalid output, model mismatch) | ≥ 2 |

Exposure accepted only if OD-A is approved as option (ii): realized spend ≤ (n − 1) × $0.0635 + one call of unknown cost.

## 3. A2.1 (held-out)

- Starts only after the A2.0 report is reviewed and A2.1 is separately approved.
- Cumulative caps on the shared ledger (A2.0 + A2.1, retries included): ≤ 88 attempts, ≤ $5.00 reservation-based. A2.1 may reserve only `$5.00 − A2.0 settled spend − open reservations`.
- Fixtures run in the frozen priority order of `a21Fixtures.ts`: weak, career-transition, seniority-mismatch, vi-vi, keyword-stuffed, long; round-robin within the approved subset. No reordering or cherry-picking after A2.0 results.
- Recruiter trio and PDF-modality pairs are out of scope (recorded as debt).

## 4. Frozen evaluation criteria

"Model" = model-authored `matchScore`; "rubric" = rubric score on the same response (defaults: keywords excluded, list-only full credit). OD-12 list-only `partial` and "keywords included" are reported as zero-cost ablations, never used to pick a winner after the fact.

### 4.1 Semantic consistency (what the model classifies)

| Metric | A2.0 | A2.1 |
|---|---|---|
| Requirement status agreement with owner-signed labels (exact) | reported; **fail if < 60%** | ≥ 85% |
| Required/preferred agreement with labels | reported; fail if < 70% | ≥ 90% |
| Status stability across runs (modal agreement per requirement) | reported | ≥ 90% |
| Row identity stability (Jaccard of normalized keys across runs) | reported | median ≥ 0.8 |
| Split/merge, alias, keywords-excluded, duplicate counts | reported from rubric diagnostics | same |

### 4.2 Numeric stability (same fixture, repeated)

| Metric | A2.0 | A2.1 |
|---|---|---|
| Replay variance on identical normalized findings | 0 (offline, met) | 0 |
| Score range per fixture | rubric ≤ model on ≥ 3/4 fixtures; rubric ≤ 8 on ≥ 3/4 | rubric ≤ 6 on ≥ 80% |
| SD per fixture | reported (n = 5, wide CI) | median rubric SD ≤ 2.5 |
| Band flips vs fixture modal band | rubric ≤ model per fixture, fewer pooled | ≤ 5% pooled and < model |

### 4.3 Discrimination (lower variance alone is not acceptance)

| Metric | A2.0 | A2.1 |
|---|---|---|
| median(strong) − median(boundary-60) | rubric ≥ 25 **and** ≥ 0.8 × model gap | — |
| Human fit order on rubric medians | strong > boundary-80 > boundary-60 | held-out order Kendall τ ≥ 0.8 in ≥ 90% of resamples; weak lowest |
| Gap compression | rubric gap ≥ 0.8 × model gap | same |

### 4.4 Calibration (reported, not tuned)

Rubric medians vs the owner-approved **acceptable intervals** (readiness doc §6). A2.0: reported only. A2.1: rubric median inside its interval on ≥ 80% of fixtures. Intervals are references for a fit score; they are not hiring-probability calibration and are never adjusted after results.

### 4.5 Operational

| Metric | Threshold |
|---|---|
| Invalid-output rate (parse/schema failure, empty comparison) | A2.0 fail if > 1/20; A2.1 ≤ 2% |
| Latency | report p50/p95; fail if any attempt > 45 s |
| Cost | actual ≤ reservation on every attempt (mandatory); report actual vs worst case |

## 5. Rules against self-validation

1. No rubric tuning on pilot output presented as validation.
2. Any rubric change after A2.0 results are seen ⇒ new `rubricVersion`, re-freeze, and validation only on A2.1 held-out fixtures (or newer, unseen ones).
3. Thresholds, intervals and failure criteria change only by a new version of this document before a run.
4. Labels are owner-signed before any run and never edited afterwards.

## 6. Stop conditions (enforced by `a2Runner.ts`)

Before sending: live disabled; live authorization missing or not SHA-locked to the running code (`checkLiveAuthorization`); forbidden credential env present; soft stops or checkpoints overridden in live mode; config hash mismatch; caps above `APPROVED_CAPS`; ledger lock held; ledger corrupt/torn/out-of-sequence; open reservation; durable stop without resume; remaining plan worst case above the cumulative budget; plan above the cumulative attempt ceiling.

During: next reservation exceeds the budget; unknown outcome (timeout, abort, network) — charged at full reservation; HTTP 4xx other than 429; retries exhausted; usage metadata missing; usage inconsistent (`totalTokenCount`), above the model limit or input bound, or with an unexpected billable dimension; `modelVersion` missing, not the analyze model, or different from the pinned version (an owner `expectedModelVersion` is matched exactly; otherwise the first accepted response pins it); ledger or artifact write failure; any §2.1 checkpoint; any §2.2 soft stop. Every stop after a send is durable and needs an operator resume record with an owner approval reference. **No automatic budget, ceiling or stage expansion.**

## 7. Artifacts and privacy

Raw responses (synthetic only) and the ledger on durable local disk in the isolated host, gitignored, retrieved per the runbook. The ledger holds accounting fields, the canonical score or invalid reason, and the model version — never response text or credentials. Only artifacts whose SHA-256 appears in a settled `ok` or `invalid_output` record are analyzed. Committed: sanitized summary and report.

## 8. Authorization boundary

A2.0 PASS = permission to request A2.1. A2.1 PASS = evidence for an A3 spec (shadow first). Neither authorizes production scoring changes, migrations, deployment or P4A ranking.
