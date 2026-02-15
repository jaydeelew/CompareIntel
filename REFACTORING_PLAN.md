# CompareIntel Comprehensive Refactoring Plan

## Instructions for AI Sessions

When you receive this document, treat it as a runbook. Each session can be completed in a single chat. Follow this workflow every run:

1. **Read the Execution Progress table** (in the Execution Progress section). Identify the **next session to execute**:
   - Find the first session with Status `Pending` whose dependencies (per the Session Execution Order table) are all marked `Done`. If no dependencies are listed, the session is available.
   - If the next session has unmet dependencies, complete those dependency sessions first (they should already be Done; if not, do them in order).

2. **Execute that session** according to its section in this document. Run the specified test commands (e.g. `cd backend && python -m pytest`) and fix any regressions.

3. **After the session is complete and tests pass**, update this document:
   - In the Execution Progress table, change that session's Status from `Pending` to `Done`.
   - Add a brief Note summarizing what was accomplished (e.g. files created/changed, key outcomes).
   - Save the change in the same commit as the session work.

4. **Commit** with a message like: `refactor: <short description> (Session N)`.

The goal is that feeding this document to a new AI chat yields continuous progress: each run picks up where the last left off, executes the next session, and updates the progress table so the next run knows what to do.

---

## Purpose

This document provides detailed, file-by-file instructions for refactoring the CompareIntel codebase. The goals are:

1. Remove the appearance of AI-assisted development -- eliminate verbose comments, section dividers, patronizing annotations, and over-engineering.
2. Make the codebase understandable and maintainable -- split mega-files into focused modules, reduce prop drilling, standardize patterns.
3. Preserve all existing functionality -- nothing should break. All existing tests must pass unless there is explicit justification for changing them.

**Safety rule for every session:** After completing each session, run the full test suite (`cd frontend && npm run test:run` and `cd backend && python -m pytest`) and fix any regressions before proceeding to the next session.

The plan is divided into **22 sessions**, each sized to be completable in a single Cursor IDE chat session. Execute them in the order specified in the Session Execution Order table at the bottom of this document.

---

## Session 1: Comment Cleanup -- Backend Python Files

**Goal:** Remove AI-telltale commenting patterns from all backend Python files only.

### 1.1 Remove Section Divider Comments

Search all `.py` files under `backend/` for lines matching `# ====` and delete them entirely. Do not replace them with anything. If a block of code needs a label, use a single short comment like `# User management` -- never a decorative box.

**Files with known instances:**
- `backend/app/model_runner.py` (lines 30-31, and others throughout)
- `backend/app/routers/api.py` (2 instances)
- `backend/app/routers/admin.py` (2 instances)
- `backend/app/schemas.py` (16 instances)
- `backend/app/config/validation.py` (18 instances)
- `backend/app/config/constants.py` (8 instances)
- `backend/app/rate_limiting.py` (4 instances)
- `backend/app/type_defs.py` (16 instances)
- `backend/tests/conftest.py` (4 instances)
- `backend/tests/factories.py` (18 instances)
- `backend/tests/load/locustfile.py` (2 instances)
- `backend/tests/integration/test_streaming.py` (2 instances)

### 1.2 Remove Capitalized Marker Comments from Backend

Search all `.py` files under `backend/` for comments containing `IMPORTANT:`, `CRITICAL:`, `NOTE:`, `CAUTION:`, `WARNING:` used as comment annotations (not in actual warning/error string literals or log messages). Remove these markers or rewrite the comment to be plain.

**Before:**
```
# IMPORTANT: Check and reset credits FIRST if reset time has passed
check_and_reset_credits_if_needed(current_user.id, db)
ensure_credits_allocated(current_user.id, db)
```

**After:**
```
check_and_reset_credits_if_needed(current_user.id, db)
ensure_credits_allocated(current_user.id, db)
```

**Backend files with known instances:**
- `backend/app/routers/api.py` (5 instances)
- `backend/app/model_runner.py` (7 instances)
- `backend/app/routers/admin.py` (1 instance)
- `backend/app/config/settings.py` (1 instance)
- `backend/app/rate_limiting.py` (2 instances)

### 1.3 Remove Comments That Restate the Code in Backend

Go through every backend Python file and delete comments that merely describe what the next line of code does. Keep only comments that explain WHY something is done in a non-obvious way.

**Delete** comments like `# Extract client IP from request` before `def get_client_ip()` or `# Check if mock mode is enabled` before `if user.mock_mode_enabled:`. The code is self-evident.

**Keep** comments like `# OpenRouter returns 402 when max_tokens exceeds the model's credit limit, not when the user is out of credits. Retry with reduced max_tokens.` This explains non-obvious API behavior.

### 1.4 Shorten Overly Long Docstrings in Backend

Many functions have docstrings longer than the function body. Shorten to one line when the function signature with type hints already makes the purpose clear. If the Args/Returns section just restates the type hints, remove it. Keep multi-line docstrings only when they explain complex behavior, side effects, or non-obvious preconditions.

Apply to all functions in `model_runner.py`, `routers/api.py`, `routers/admin.py`, `routers/auth.py`, `email_service.py`, and all other backend Python files.

### 1.5 Remove Inline Comments on Model Definitions

In `model_runner.py`, remove trailing comments from MODELS_BY_PROVIDER entries (e.g., `# Supports tool use`, `# All Claude models support function calling`). The field name `supports_web_search` is self-documenting.

Also remove pricing classification comments on UNREGISTERED_TIER_MODELS and FREE_TIER_MODELS entries.

**After this session:** Run `cd backend && python -m pytest` to verify.

---

## Session 2: Comment Cleanup -- Frontend TypeScript Files

**Goal:** Remove AI-telltale commenting patterns from all frontend TypeScript/TSX files.

### 2.1 Remove Section Divider Comments
Search all `.ts` and `.tsx` files under `frontend/src/` for `// ====` lines and delete them.

### 2.2 Remove Capitalized Marker Comments from Frontend
Remove or rewrite comments containing `IMPORTANT:`, `CRITICAL:`, `NOTE:`, `CAUTION:`, `WARNING:` as annotations.

**Frontend files with known instances:**
- `frontend/src/components/comparison/ComparisonView.tsx` (1)
- `frontend/src/components/tutorial/TutorialOverlay.tsx` (8)
- `frontend/src/components/LatexRenderer.tsx` (20)
- `frontend/src/main.tsx` (1)
- `frontend/src/utils/codeBlockPreservation.ts` (2)

### 2.3 Remove the "2025 best practices" Comment
In `frontend/src/pages/MainPage.tsx` line 53, delete: `// Combined hooks (2025 best practices)`. Dead giveaway of AI generation.

### 2.4 Remove Comments That Restate the Code in Frontend
Same rules as Session 1.3, applied to all frontend `.ts` and `.tsx` files.

**After this session:** Run `cd frontend && npm run test:run` to verify.

---

## Session 3: Comment Cleanup -- CI Workflows, Shell Scripts, Config Files

**Goal:** Remove AI-telltale commenting patterns from non-application-code files.

### 3.1 Normalize CI Workflows
In all `.github/workflows/*.yml` files: remove `# ====` dividers, remove verbose comment blocks explaining secrets/concurrency/fetch-depth. Replace with minimal comments where needed.

### 3.2 Clean Up Shell Script Headers
In `deploy-production.sh`, `setup-compareintel-ssl.sh`, `GoogleBingSearchRank.sh`: replace decorative box headers with 1-2 line descriptions.

**After this session:** No application tests needed.

---

## Session 4: Extract Model Registry and Tier Data to JSON

**Goal:** Move MODELS_BY_PROVIDER (lines 181-818, 637 lines), UNREGISTERED_TIER_MODELS (lines 42-60), and FREE_TIER_MODELS (lines 66-101) from `model_runner.py` to `backend/data/models_registry.json`.

1. Create JSON file with keys: `models_by_provider`, `unregistered_tier_models`, `free_tier_additional_models`.
2. Replace ~780 lines of inline data in `model_runner.py` with a JSON loader (~15 lines).
3. Keep OPENROUTER_MODELS as the flattened list derived from MODELS_BY_PROVIDER.

**After this session:** Run `cd backend && python -m pytest` to verify.

---

## Session 5: Extract FAQ and Glossary Content to Data Files

### 5.1 FAQ (frontend/src/components/pages/FAQ.tsx lines 43-1817)
Move faqData array to `frontend/src/data/faq.tsx`. FAQ.tsx becomes ~100-150 lines.

### 5.2 Glossary (frontend/src/components/pages/Glossary.tsx lines 21-854)
Move glossaryTerms, categoryLabels, categoryDescriptions to `frontend/src/data/glossary.ts`. Glossary.tsx becomes ~300 lines.

**After this session:** Run `cd frontend && npm run test:run` to verify.

---

## Session 6: Extract Email HTML Templates

Move inline HTML from `backend/app/email_service.py` (1,071 lines) to 7 separate template files in `backend/app/templates/`. Each function loads its template, substitutes variables, sends. Target: email_service.py at ~200-300 lines.

Template files: verification_email.html, password_reset_email.html, subscription_confirmation.html, usage_limit_warning.html, model_availability_report.html, new_user_signup.html, trial_expired.html.

**After this session:** Run `cd backend && python -m pytest` to verify.

---

## Session 7: Split model_runner.py into backend/app/models/ Package

**Prerequisite:** Sessions 1 and 4 must be complete.

Create `backend/app/models/` with:
1. `__init__.py` -- Re-exports all public symbols for backward compatibility.
2. `registry.py` (~80 lines) -- JSON loading, model constants, is_model_available_for_tier(), filter_models_by_tier(), client.
3. `tokens.py` (~400 lines) -- All token counting, tokenizer management, credit calculation functions.
4. `text_processing.py` (~130 lines) -- detect_repetition(), clean_model_response().
5. `streaming.py` -- call_openrouter_streaming(), call_openrouter(). Still large; further decomposition in Session 20.
6. `connection.py` (~50 lines) -- test_connection_quality().

Replace `model_runner.py` with backward-compatible shim. Update direct imports throughout backend.

**After this session:** Run `cd backend && python -m pytest` to verify.

---

## Session 8: Rewrite Admin Model Management for JSON Registry

**Goal:** Update admin model add/delete/update functions to work with JSON instead of modifying Python source code.

1. Replace find_matching_brace(), find_provider_list_bounds(), find_models_by_provider_end(), extract_providers_from_content() with JSON load/save helpers.
2. Rewrite add_model(), add_model_stream(), delete_model(), update_model_knowledge_cutoff() to load JSON, modify, save, reload.
3. Add reload_registry() to backend/app/models/registry.py.

**After this session:** Run `cd backend && python -m pytest`. Test admin model operations if possible.

---

## Session 9: Split admin.py into backend/app/routers/admin/ Package

**Goal:** Split admin.py (3,647 lines) into focused sub-modules.

Create `backend/app/routers/admin/` with:
1. `__init__.py` -- Combines sub-routers.
2. `helpers.py` -- ensure_usage_reset(), log_admin_action(), shared deps.
3. `users.py` (~700 lines) -- User management routes.
4. `analytics.py` (~200 lines) -- Stats and visitor analytics.
5. `settings.py` (~250 lines) -- App settings, mock mode, maintenance.
6. `models_management.py` (~600 lines) -- Model CRUD routes.
7. `search_providers.py` (~200 lines) -- Search provider routes.

Delete old single admin.py after package works.

**After this session:** Run `cd backend && python -m pytest` to verify.

---

## Session 10: Slim Down routers/api.py

**Goal:** Reduce api.py (2,961 lines) to under 500 lines.

1. Extract generate_stream() (lines 1153-2254) to `backend/app/services/comparison_stream.py`.
2. Consolidate get_client_ip() into `backend/app/utils/request.py`.
3. Move geo utilities to `backend/app/utils/geo.py`.
4. Split routes into: `conversations.py`, `credits.py`, `preferences.py`, `dev.py`.
5. Update main.py to include new routers.

**After this session:** Run `cd backend && python -m pytest` to verify.

---

## Session 11: Split AdminPanel.tsx into Tab Components

**Goal:** Split AdminPanel.tsx (4,333 lines) into per-tab components.

Create under `frontend/src/components/admin/`:
1. `UsersTab.tsx` -- User management state, handlers, JSX.
2. `ModelsTab.tsx` -- Model management state, handlers, JSX.
3. `ActionLogsTab.tsx` -- Action logs state, handlers, JSX.
4. `VisitorAnalyticsTab.tsx` -- Visitor analytics state, handlers, JSX.
5. `SearchProvidersTab.tsx` -- Search provider state, handlers, JSX.
6. `utils.ts` -- formatDateToCST(), formatName(), waitForServerRestart().

AdminPanel.tsx becomes ~150 lines: tab navigation + active tab rendering.

**After this session:** Run `cd frontend && npm run test:run` to verify.

---

## Session 12: Split MainPage.tsx

**Goal:** Reduce MainPage.tsx (2,477 lines) to under 600 lines.

1. Create `useGeolocation.ts`, `useAuthModals.ts`, `useTooltipManager.ts` hooks.
2. Create typed prop group interfaces (HistoryProps, SelectionProps, FileProps) and update ComparisonForm to use grouped props instead of 30+ flat props.

**After this session:** Run `cd frontend && npm run test:run` to verify.

---

## Session 13: Split ComparisonForm.tsx

**Goal:** Reduce ComparisonForm.tsx (2,361 lines) to under 600 lines.

Create:
- `FileUpload.tsx` -- file handling logic and UI
- `TokenUsageDisplay.tsx` -- token usage calculation and display
- `SavedSelectionsDropdown.tsx` -- saved selections state and UI

**After this session:** Run `cd frontend && npm run test:run` to verify.

---

## Session 14: Split useComparisonStreaming.ts

**Goal:** Reduce useComparisonStreaming.ts (2,239 lines) to under 500 lines.

Create:
- `frontend/src/services/sseProcessor.ts` -- SSE event handlers, connection management
- `frontend/src/utils/comparisonValidation.ts` -- input validation
- `frontend/src/utils/conversationPreparer.ts` -- conversation history formatting

**After this session:** Run `cd frontend && npm run test:run` to verify.

---

## Session 15: Split LatexRenderer.tsx into Utility Modules

**Goal:** Reduce LatexRenderer.tsx (3,224 lines) to under 300 lines.

Create `frontend/src/utils/latex/` with:
- `cleanup.ts` -- cleanMalformedContent() (Stage 1)
- `fixSyntax.ts` -- fixLatexIssues() (Stage 2)
- `implicitMath.ts` -- convertImplicitMath() (Stage 3)
- `lists.ts` -- processMarkdownLists() (Stage 5)
- `mathRenderer.ts` -- math rendering and extraction functions (Stage 6)
- `codeBlocks.ts` -- renderCodeBlock()
- `helpers.ts` -- safeRenderKatex(), looksMathematical(), convertSquareRoots(), looksProse()
- `index.ts` -- re-exports

**After this session:** Run `cd frontend && npm run test:run` to verify.

---

## Session 16: Split TutorialOverlay.tsx

**Goal:** Reduce TutorialOverlay.tsx (2,381 lines) to under 500 lines.

Create:
- `frontend/src/utils/tutorialPositioning.ts` -- cutout calculations, element finding, tooltip positioning
- `frontend/src/data/tutorialSteps.ts` -- step definitions (if hardcoded)

**After this session:** Run `cd frontend && npm run test:run` to verify.

---

## Session 17: Clean Up Console Logging

**Goal:** Remove unnecessary console.log statements and create a logging utility.

1. Create `frontend/src/utils/logger.ts` with dev-only debug/info and always-on warn/error.
2. DELETE console.log calls logging routine state transitions. CONVERT meaningful debug logging to logger.debug(). CONVERT error logging to logger.error().
3. Files to process: MainPage.tsx (24), AdminPanel tabs (22), useComparisonStreaming.ts (21), useConversationHistory.ts (12), loadModelConfigs.ts (12), RegisterForm.tsx (9), useScreenshotCopy.ts (9), sessionState.ts (8), AuthContext.tsx (7), useConversationManager.ts (7), and all others.

**After this session:** Run `cd frontend && npm run test:run` to verify.

---

## Session 18: CI/CD Consolidation and Documentation Reduction

### 18.1 Delete Unnecessary Workflows
Delete: `dast.yml`, `visual-regression.yml`, `pwa-testing.yml`, `performance.yml`, `e2e-comprehensive.yml`.

### 18.2 Simplify deploy-smoke.yml
Remove SSL cert and response time checks. Keep health checks.

### 18.3 Delete Planning Documents
Delete entire `docs/planning/` directory.

### 18.4 Delete Misplaced Files
Delete `.github/workflows/WORKFLOW_ANALYSIS.md` and `.vscode/GITHUB_ACTIONS_SETUP.md`.

### 18.5 Consolidate Redundant Documents
Merge UI docs, auth docs, rate limiting docs, dev workflow docs into single files each.

**After this session:** No application tests needed.

---

## Session 19: Simplify Shell Scripts

1. Split `deploy-production.sh` (655 lines) into `scripts/deploy/` with focused sub-scripts. Main script becomes ~100-line dispatcher.
2. Extract Python from `GoogleBingSearchRank.sh` (527 lines) to `scripts/search_rank_checker.py`. Shell script becomes ~30 lines.
3. Simplify `setup-compareintel-ssl.sh` (267 lines). Target: ~150 lines.

Remove colored logging functions from all scripts; use plain echo prefixes.

**After this session:** No application tests needed.

---

## Session 20: Standardize Error Handling

### 20.1 Backend
Create `backend/app/utils/error_handling.py` with ClassifiedError dataclass and classify_api_error() function. Move ~190 lines of nested error parsing from streaming.py into this function.

### 20.2 Frontend
Standardize all catch blocks to check ApiError first. Remove console.error calls that re-log without adding context.

**After this session:** Run both backend and frontend tests.

---

## Session 21: Minor Cleanup

1. Remove dead Pydantic models from main.py (lines 355-372) if they duplicate schemas.py.
2. Clean up root package.json (remove frontend deps that don't belong there).
3. Trim .gitignore from 336 lines to ~150 (remove unused technology patterns).
4. Remove coverage.xml and htmlcov/ from repository; ensure in .gitignore.

**After this session:** Run both test suites.

---

## Session 22: Final Test Verification

1. Run all tests: backend pytest, frontend vitest, frontend playwright e2e.
2. Verify application startup (backend + frontend).
3. Add critical tests for: models/registry.py (JSON loading), utils/error_handling.py (error classification).
4. Verify success criteria:
   - No file exceeds 600 lines (except streaming.py under 1,000)
   - No function exceeds 200 lines
   - No component receives more than 15 flat props
   - Zero `# ====` dividers remain
   - Zero IMPORTANT:/CRITICAL:/NOTE: markers remain
   - Console.log calls replaced or removed
   - All tests pass
   - CI pipeline has 5 or fewer workflows

---

## Execution Progress

The AI must update this table after completing each session (see Instructions for AI Sessions above). It determines what has been accomplished and what to do next.

| Session | Status | Notes |
|---------|--------|-------|
| 1 | Done | Removed WARNING/CREDITS-BASED markers from rate_limiting.py, database.py. Removed restating comments from api.py, model_runner.py, email_service.py, config/settings.py, admin.py. Shortened docstrings in model_runner.py, rate_limiting.py. No # ==== dividers found (already absent). |
| 2 | Pending | |
| 3 | Pending | |
| 4 | Done | Registry in `backend/data/models_registry.json`. `model_runner.py` loads via JSON. Admin model add/delete still edits Python source; Session 8 will switch to JSON. |
| 5 | Pending | |
| 6 | Pending | |
| 7 | Pending | |
| 8 | Pending | |
| 9 | Pending | |
| 10 | Pending | |
| 11 | Pending | |
| 12 | Pending | |
| 13 | Pending | |
| 14 | Pending | |
| 15 | Pending | |
| 16 | Pending | |
| 17 | Pending | |
| 18 | Pending | |
| 19 | Pending | |
| 20 | Pending | |
| 21 | Pending | |
| 22 | Pending | |

---

## Session Execution Order and Dependencies

| Session | Description | Risk | Dependencies |
|---------|-------------|------|-------------|
| 1 | Comment cleanup: Backend Python | Zero | None |
| 2 | Comment cleanup: Frontend TypeScript | Zero | None |
| 3 | Comment cleanup: CI, shell scripts, configs | Zero | None |
| 4 | Extract model registry to JSON | Low | Session 1 |
| 5 | Extract FAQ and Glossary content | Low | None |
| 6 | Extract email HTML templates | Low | None |
| 7 | Split model_runner.py into models/ package | Medium | Sessions 1, 4 |
| 8 | Rewrite admin model management for JSON | Medium | Sessions 4, 7 |
| 9 | Split admin.py into admin/ package | Medium | Session 8 |
| 10 | Slim down api.py | Medium | Session 7 |
| 11 | Split AdminPanel.tsx into tab components | Medium | Session 2 |
| 12 | Split MainPage.tsx | Medium | Session 2 |
| 13 | Split ComparisonForm.tsx | Medium | Session 12 |
| 14 | Split useComparisonStreaming.ts | Medium | Session 2 |
| 15 | Split LatexRenderer.tsx | Medium | Session 2 |
| 16 | Split TutorialOverlay.tsx | Medium | Session 2 |
| 17 | Clean up console logging | Low | Sessions 11-16 |
| 18 | CI/CD consolidation + documentation | Zero | Session 3 |
| 19 | Shell script simplification | Low | Session 3 |
| 20 | Standardize error handling | Medium | Sessions 7, 10 |
| 21 | Minor cleanup | Low | None |
| 22 | Final test verification | N/A | All previous |
