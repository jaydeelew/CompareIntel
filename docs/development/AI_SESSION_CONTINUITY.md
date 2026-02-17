# AI Session Continuity Guide

**Purpose:** This document instructs AI chat sessions on the CompareIntel project's goals, context, and progress. Use it to maintain continuity across sessions, since each chat has limited context and cannot remember prior conversations.

**For AI assistants:** Read this document at the start of every session. When you complete work, update the [Session Progress Checklist](#session-progress-checklist) so the next session knows what has been done.

---

## Project Goals (Non-Negotiable)

The CompareIntel web application (compareintel.com) is being refactored to meet these goals. All work must advance them:

| Goal | Description |
|------|-------------|
| **Not AI-generated** | Code and files must not read as AI-generated. Use domain-specific names, purposeful structure, and avoid generic/verbose patterns. |
| **Manageable** | Codebase must be easy to maintain. Avoid god components, excessive coupling, and unclear boundaries. |
| **Scalable** | Application must support growth (users, features, load). Use versioned APIs, modular routers, clear scaling assumptions. |
| **Understandable** | New developers must be able to onboard quickly. Documentation, architecture docs, and clear structure are essential. |
| **Sustainable** | Long-term viability. Enforce quality gates (lint, tests, coverage), pre-commit hooks, and CI. |
| **Expandable** | Easy to add features (models, providers, routes). Use documented workflows and composition over monolithic configs. |
| **Testable** | Adequate test coverage. Unit, integration, and E2E tests. Coverage thresholds enforced in CI. |

---

## Key Context for AI Sessions

### Codebase Overview

- **Frontend:** React 18 + TypeScript + Vite. Main complexity lives in `frontend/src/pages/MainPage.tsx` (~2,200 lines) and `frontend/src/hooks/useComparisonStreaming.ts` (~1,400 lines).
- **Backend:** FastAPI + SQLAlchemy + Pydantic. Routers in `backend/app/routers/`, LLM integration in `backend/app/llm/`.
- **Documentation:** `docs/` contains architecture, development, testing, and feature docs. See [README.md](../../README.md) and [docs/ARCHITECTURE.md](../ARCHITECTURE.md).

### Known Problem Areas

1. **MainPage.tsx** — "God" component with many hooks and effects. Target: extract `useMainPageEffects`, `ComparisonPageContent`, or use context to reduce size and coupling.
2. **useComparisonStreaming.ts** — Large hook with many concerns. Consider splitting into smaller hooks.
3. **SSEProcessorConfig / UseComparisonStreamingConfig** — Oversized config objects (~80+ fields). Consider composition or context.
4. **Coverage enforcement** — CI currently logs a warning but does not fail when coverage is below 70%. Should fail.

### Important Documents

| Document | Purpose |
|----------|---------|
| [README.md](../../README.md) | Overview, quick start, API reference |
| [ARCHITECTURE.md](../ARCHITECTURE.md) | Architecture, data flow, key files |
| [CONTRIBUTING.md](../../CONTRIBUTING.md) | Contribution workflow, code style, PR guidelines |
| [ENVIRONMENT_SETUP.md](ENVIRONMENT_SETUP.md) | Environment variables |
| [WORKFLOW.md](WORKFLOW.md) | Dev environments, deployment |
| [ONBOARDING.md](ONBOARDING.md) | First-day checklist: key files, common tasks |
| [FRONTEND_TESTING.md](../testing/FRONTEND_TESTING.md) | Frontend test guide |
| [BACKEND_TESTING.md](../testing/BACKEND_TESTING.md) | Backend test guide |

---

## Instructions for AI Sessions

1. **Read this document first** — Understand goals, context, and what has already been done.
2. **Check the Session Progress Checklist** — Do not duplicate completed work. Use the checklist to know the current state.
3. **Scope work to session length** — Prioritize 1–2 high-impact items. Avoid large refactors that span multiple sessions without clear handoff.
4. **Update the checklist when done** — Mark items as completed with the date. Add brief notes if helpful.
5. **Run tests before finishing** — Ensure `npm run test:run` (frontend) and `pytest tests/unit/` (backend) pass. Run `npm run type-check` and lint.
6. **Provide a concise git commit statement** — At the end of each session that produces code changes, supply a single-line commit message (50–72 chars). Example: `refactor: extract useMainPageEffects, add QUICKSTART, fix coverage CI`.
7. **Preserve project voice** — Code should feel product-specific. Avoid generic AI patterns (excessive JSDoc, verbose names, unnecessary abstraction).

---

## Session Progress Checklist

**How to use:** When you complete an item, check the box and add the date. If an item is partially done, add a note. The next AI session should continue from unchecked items.

### Completed ✅

- [x] **Pre-commit backend checks** — Added ruff, ruff format, mypy to `.husky/pre-commit` when backend `.py` files are staged. (2025-02)
- [x] **CONTRIBUTING.md** — Created with setup, workflow, code style, testing, and PR guidelines. (2025-02)
- [x] **Modal consolidation** — MainPage now uses `ModalManager` for auth, verification, reset, premium, disabled button, trial welcome, and disabled model modals. Reduced MainPage by ~30 lines. (2025-02)
- [x] **Extract `useMainPageEffects`** — Moved scroll, focus, history sync, error handling, and 13 other useEffects into `useMainPageEffects` hook. Reduced MainPage by ~260 lines. (2025-02)
- [x] **Add QUICKSTART.md** — Minimal "clone → install → run → first comparison" guide. (2025-02)
- [x] **Coverage fails CI** — Backend CI now fails when coverage is below 70%. (2025-02)
- [x] **Fix REFACTORING_TODO reference** — ARCHITECTURE.md now references `AI_SESSION_CONTINUITY.md` instead of the missing `REFACTORING_TODO.md`. (2025-02)
- [x] **Extract `ComparisonPageContent`** — Moved comparison view (form + models + results) into `frontend/src/components/main-page/ComparisonPageContent.tsx`. Composes Hero, ComparisonForm, CreditWarningBanner, ModelsArea, LoadingSection, ResultsArea. (2025-02-17)
- [x] **Add ONBOARDING.md** — First-day checklist for new developers: key files, common tasks, where to look. (2025-02-17)

### Pending
- [ ] **Backend in lint-staged** — Add backend Python files to lint-staged (or equivalent) so staged backend changes run ruff/mypy on commit.
- [ ] **Split `useComparisonStreaming`** — Break into smaller hooks (e.g. `useStreamConnection`, `useStreamTimeout`, `useStreamCompletion`).
- [ ] **Simplify streaming config** — Reduce `SSEProcessorConfig` and `UseComparisonStreamingConfig` via composition or context.
- [ ] **Feature-based routes** — Add routes like `/compare`, `/history` to avoid MainPage as single growing entry point.
- [ ] **Document scaling assumptions** — Note load, concurrency, and retention expectations for future scaling.

---

## Handoff Template (Optional)

When ending a session with incomplete work, you may add a short handoff note:

```markdown
## Handoff [DATE]
- **Completed this session:** [brief list]
- **In progress:** [what was started but not finished]
- **Blocked by:** [dependencies, decisions needed]
- **Next session should:** [concrete next step]
```

---

## Revision History

| Date | Change |
|------|--------|
| 2025-02 | Initial creation. Documented goals, context, instructions, and checklist from evaluation and first implementation round. |
| 2025-02-17 | Session: Fixed REFACTORING_TODO ref, coverage CI fail, QUICKSTART.md, useMainPageEffects extraction (~258 lines from MainPage). |
| 2025-02-17 | Added instruction: AI sessions must provide a concise git commit statement for each code-update. |
| 2025-02-17 | Session: Extracted ComparisonPageContent (form + models + results) into main-page component. |
| 2025-02-17 | Session: Added ONBOARDING.md first-day developer checklist. |
