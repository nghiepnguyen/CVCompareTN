# M2-A repro tests (baseline evidence)

Offline repro tests from the M2-A audit (2026-11-15, tree `254cae1`). They assert
the **pre-fix** behavior, so they are stored as `.txt` and are not collected by
vitest. To re-run against the baseline: check out `254cae1`, copy both files to
`src/__tests__/m2a-audit/` without the `.txt` suffix, run
`npx vitest run src/__tests__/m2a-audit`.

The inverted, post-fix versions live in the regular test suite (M2-B):
`src/__tests__/services/m2bStabilization.test.ts` and
`src/__tests__/context/m2bRunGuards.test.tsx`.
