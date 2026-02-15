# Tutorial System

Onboarding flow: WelcomeModal → TutorialOverlay (per-step spotlight + tooltip). TutorialController orchestrates; overlay is lazy-loaded.

**Files:**

- `TutorialController` – step logic, completion detection, mounts overlay
- `TutorialOverlay` – render layer for backdrop/tooltip (uses useTutorialOverlay)
- `useTutorialOverlay` – element finding, positioning, cutouts, scroll logic
- `frontend/src/data/tutorialSteps.ts` – step config (selector, copy)
- `frontend/src/utils/tutorialPositioning.ts` – cutout calculations, tooltip positioning
- `tutorialUtils.ts` – `getComposerElement`, `getComposerCutoutRects`

**DOM dependencies** (layout changes can break the tutorial):

- `.hero-section`, `.composer`, `.composer-input-wrapper`, `.composer-toolbar`
- `.provider-dropdown[data-provider-name="Google"]`
- `.history-toggle-button`, `.history-inline-list`
- `.saved-selections-button`, `.saved-selections-dropdown`
- `[data-testid="comparison-input-textarea"]`, `[data-testid="comparison-submit-button"]`

**Run through manually:** Clear `compareintel_tutorial_completed` from localStorage, reload. Desktop only (hidden at ≤768px).

**Tests:** `npm run test:run -- src/components/tutorial/`
