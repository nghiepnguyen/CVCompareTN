# Structure Optimization — Design Spec

**Date:** 2026-05-20  
**Status:** Implemented (merged to `main`, `daeddb6`)  
**Scope:** Phased repo hygiene, App/Analysis refactor, API routing documentation. No UX or API behavior changes.

> **Docs (2026-05):** `docs/3_frontend.md`, `AGENTS.md`, `README.md`, `docs/8_analytics.md` reflect `src/app/`, `context/analysis/`, and `landing/` sections.

---

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Graphify in Git | **Keep only** `graphify-out/GRAPH_REPORT.md`; untrack all other `graphify-out/*` |
| Analysis context split | **B2 — two providers** (`AnalysisRunProvider` + `SavedJdProvider`) |
| LandingView split | **Done** — `landing/*Section.tsx` + thin `LandingView.tsx` |
| Execution | **Three sequential PRs** (Phase 1 → 2 → 3) |

---

## Goals

1. Reduce repository noise and accidental commits of generated graph artifacts.
2. Split oversized frontend modules without changing user-visible behavior.
3. Document which backend surface (Vercel `api/`, Express `server/`, Supabase Edge) owns each capability.

## Non-goals

- Merging `api/` and `server/` into one runtime.
- Replacing React context with another state library.
- i18n for `LandingView`, `SupportDevelopmentPage`, or `AnalysisInputView`.
- Locale/`reportLanguage` refactor (separate from `UIContext`).
- Graphify hook or pipeline changes.

---

## Phase 1 — Repo hygiene

### Graphify `.gitignore`

Replace narrow `graphify-out/cache/` rule with:

```gitignore
# Graphify — regenerate with `graphify update .`; keep human-readable report only
graphify-out/*
!graphify-out/GRAPH_REPORT.md
```

Then `git rm --cached` all currently tracked files under `graphify-out/` except `GRAPH_REPORT.md`.

**Local:** Developers keep full `graphify-out/` locally; post-commit hook may still regenerate (optional `Operation not permitted` on cache log is non-blocking).

### Root / dead code cleanup

| Item | Action |
|------|--------|
| `grep_output.txt` | Delete from repo; add to `.gitignore` if regenerated often, or delete only |
| `tags.txt` | Delete if not referenced |
| `test-resend.ts` | Move to `scripts/test-resend.ts` or delete if obsolete |
| `src/services/storageService.ts` | **Delete** — zero imports in `src/`; bucket name `cv-files` documented in `docs/9_api_routes.md` / existing deployment docs |
| `CODING_CONVENTIONS.md` | Replace `MatchScoreDisplay.tsx` example with e.g. `ResultView.tsx` |
| `docs/3_frontend.md`, `docs/5_api.md`, `docs/7_deployment.md` | Remove `storageService.ts` references; cite bucket `cv-files` inline |

### Verification

- `npm run lint`
- `npm run build`
- `git status` shows no staged `graphify-out/` artifacts except `GRAPH_REPORT.md`

---

## Phase 2 — Split god files

### 2a — `App.tsx` decomposition

**Target layout:**

```
src/app/
  AppShell.tsx           # default export used by main — providers + ErrorBoundary + Suspense
  AppContent.tsx         # tab routing, layout, modals (moved from App.tsx body)
  AppErrorBoundary.tsx   # class ErrorBoundary
  AppSeo.tsx             # document title / meta / JSON-LD (if extracted)
  SavedJdModal.tsx       # save-JD modal + AnimatePresence block
  MobileBottomNav.tsx    # bottom navigation (mobile)
```

**`src/App.tsx`** becomes a thin re-export:

```typescript
export { default } from './app/AppShell';
```

**Provider order (unchanged):**

```
AuthProvider → UIProvider → AnalysisProvider (composer) → AppContent
```

**Constraints:**

- Lazy imports for views stay as today.
- `useAnalysis()` / `useUI()` / `useAuth()` call sites unchanged in Phase 2.
- No routing URL changes.

### 2b — Two analysis providers (B2)

**Target layout:**

```
src/context/analysis/
  types.ts                    # shared types (SavedJD import from historyService)
  AnalysisRunContext.tsx      # provider + useAnalysisRun
  SavedJdContext.tsx          # provider + useSavedJds
  AnalysisProvider.tsx        # composes both; backward-compat useAnalysis()
  index.ts                    # public exports
```

**`AnalysisRunProvider` owns:**

- JD/CV input state: `jd`, `jdUrl`, `jdInputMode`, `cvText`, `cvInputMode`, `files`
- Run pipeline: `isAnalyzing`, `analysisStatus`, `analysisProgress`, `handleAnalyze`, `handleExtractJD`, `isExtractingJD`
- Results: `results`, `setResults`, `selectedResult`, `setSelectedResult`
- History: `history`, `setHistory`, `isLoadingHistory`, `clearHistory`, `deleteHistoryItem`, `loadHistory` (internal)
- Helpers: `processFile`, `cleanText` (private to module)

**`SavedJdProvider` owns:**

- `savedJDs`, `setSavedJDs`, `isLoadingSavedJDs`, `isSavingJD`
- `loadSavedJDs`, `handleDeleteSavedJD`
- **`confirmSaveJD(title: string, jdContent: string)`** — explicit `jdContent` parameter (no read from sibling context)

**Composition:**

```tsx
export function AnalysisProvider({ children }: { children: React.ReactNode }) {
  return (
    <AnalysisRunProvider>
      <SavedJdProvider>{children}</SavedJdProvider>
    </AnalysisRunProvider>
  );
}

export function useAnalysis(): AnalysisContextType {
  const run = useAnalysisRun();
  const saved = useSavedJds();
  return { ...run, ...saved };
}
```

**`AnalysisContextType`** remains a single merged interface exported from `types.ts` for backward compatibility.

**Call-site change (only for save JD):**

- `App.tsx` / `SavedJdModal`: `onConfirmSaveJD` calls `confirmSaveJD(jdSaveTitle, jd)` where `jd` comes from `useAnalysis()`.

**Dependencies:**

- Both providers may use `useAuth()`, `useUI()` (`reportLanguage` on run only).
- `SavedJdProvider` uses `useGoogleReCaptcha` only if needed — today reCAPTCHA is in `handleAnalyze` (run only).

**Shim:** `src/context/AnalysisContext.tsx` re-exports from `context/analysis/` (consumers may keep old import path).

**Consumers (keep `useAnalysis()`):**

- `AppShell` / `AppContent`, `Header.tsx`, `DashboardView`, `AnalysisInputView`, `HistoryView`, `ResultView`

**Optional later:** migrate hot paths to `useAnalysisRun()` / `useSavedJds()` — not required in this phase.

### 2c — LandingView

**Implemented** after initial scope lock: thin `LandingView.tsx` + `src/components/views/landing/*Section.tsx`.

### Phase 2 verification

- `npm run lint`
- `npm run build`
- Manual smoke: landing → analyze tab → run analysis (localhost) → history → save JD modal → delete saved JD → privacy/terms tabs

---

## Phase 3 — Backend clarity

### New doc: `docs/9_api_routes.md`

Structured matrix:

| Capability | Vercel (`api/`) | Express (`server/routes/`) | Supabase Edge |
|------------|-----------------|---------------------------|---------------|
| Public config | `api/config.ts` | `config` | — |
| PDF extract | `POST /api/extract-pdf` | `POST /api/extract-pdf/extract` | `extract-pdf` (optional JD flows) |
| reCAPTCHA | `api/verify-recaptcha.ts` | mirror path | `verify-recaptcha` (analyze flow) |
| Feedback email | `api/send-feedback.ts` | mirror | — |
| Welcome email | `api/send-welcome-email.ts` | mirror | `send-email` (if used) |

Include Mermaid flow: **Browser → Supabase client / fetch `/api/*` / `functions.invoke`**.

### Cross-links

- `AGENTS.md` § File Processing → link `docs/9_api_routes.md`
- `docs/5_api.md` — add pointer at top: “Canonical routing matrix: `docs/9_api_routes.md`”

### Storage note

- Bucket **`cv-files`** — created in Supabase project; no dedicated `storageService.ts` after Phase 1.

---

## PR breakdown

| PR | Contents |
|----|----------|
| **PR1** | Phase 1 only |
| **PR2** | Phase 2a + 2b |
| **PR3** | Phase 3 |

---

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| `useAnalysis` merge stale closures | Single composer; run tests via lint/build + manual save-JD |
| Broken imports after App move | Keep `src/App.tsx` re-export; update only internal paths |
| CI missing graph files | `GRAPH_REPORT.md` remains; agents run `graphify update .` locally |
| Deleting `storageService.ts` | Grep confirmed no `src/` imports; docs updated |

---

## Success criteria

- [ ] Only `graphify-out/GRAPH_REPORT.md` tracked under `graphify-out/`
- [ ] `App.tsx` (shell) & analysis modules each &lt; ~250 lines (composer may be smaller)
- [ ] `useAnalysis()` API unchanged except `confirmSaveJD(title, jdContent)`
- [ ] `docs/9_api_routes.md` exists and linked from `AGENTS.md`
- [ ] `npm run lint` and `npm run build` pass on `main` after all PRs
