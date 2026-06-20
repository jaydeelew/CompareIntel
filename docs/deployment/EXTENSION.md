# CompareIntel Browser Extension

Chrome MV3 side-panel extension for multi-model AI comparison with page context awareness.

## Overview

| Package | Role |
|---------|------|
| [`extension/`](../../extension/) | MV3 extension (side panel, service worker, content script) |
| [`packages/compare-core/`](../../packages/compare-core/) | Shared auth adapters, API client, tab context, `useComparisonPage` hook |

**API strategy:** use the **local backend** for day-to-day development and the **production API** for pre-release validation and Chrome Web Store builds. Switch via [`extension/.env`](../../extension/.env) and rebuild.

---

## Prerequisites

- Node.js 20+ and npm (repo uses npm workspaces)
- Google Chrome 114+ (Side Panel API)
- For **local API** work: Python venv, backend deps, database (SQLite is fine — see [`backend/.env.example`](../../backend/.env.example))

**WSL:** Chrome runs on Windows. Load the extension from `\\wsl$\<distro>\home\<user>\jaydeelew\CompareIntel\extension\dist`, or copy `extension/dist` to a Windows folder.

---

## One-Time Setup

### 1. Install dependencies

From repo root:

```bash
npm install
```

### 2. Configure local backend (for local API)

1. Copy `backend/.env.example` → `backend/.env` if needed.
2. Set `ENVIRONMENT=development` — enables permissive CORS so the unpacked extension can call the API without a fixed extension ID.
3. Set required keys (e.g. `OPENROUTER_API_KEY`).
4. Start the backend:

```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Verify: `http://localhost:8000/docs`

### 3. Configure extension for local API (default dev)

Create [`extension/.env`](../../extension/.env):

```bash
VITE_API_URL=http://localhost:8000/api
```

`VITE_API_URL` is **baked in at build time** — changing it requires a rebuild.

See [`extension/.env.example`](../../extension/.env.example) for reference.

### 4. Build and load in Chrome

```bash
npm run extension:build
```

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select `extension/dist`
4. Click the toolbar icon to open the side panel

---

## API Targets: When and How to Switch

### When to use each target

| Situation | API target | `extension/.env` | Backend running? |
|-----------|------------|------------------|------------------|
| UI, tab context, streaming, auth | **Local** | `VITE_API_URL=http://localhost:8000/api` | Yes |
| API errors, credits, rate limits | **Local** | Same | Yes |
| Backend changes before deploy | **Local** | Same | Yes |
| Pre-release smoke test | **Production** | Remove/rename `.env` | No |
| Chrome Web Store build | **Production** | No `.env` | No |

**Rule of thumb:** develop on **local**; validate on **production** at least once per release.

Without `.env`, the extension defaults to `https://compareintel.com/api` (see [`extension/src/sidepanel/api.ts`](../../extension/src/sidepanel/api.ts)).

### Switch to LOCAL API

1. Set `extension/.env`:
   ```
   VITE_API_URL=http://localhost:8000/api
   ```
2. Start backend with `ENVIRONMENT=development`.
3. Rebuild:
   ```bash
   npm run extension:build
   # or while coding:
   npm run extension:dev
   ```
4. Reload the extension on `chrome://extensions`.
5. Confirm: models load and comparisons stream text.

### Switch to PRODUCTION API

1. **Remove or rename** `extension/.env` (never ship a store build with localhost).
2. Rebuild: `npm run extension:build`
3. **CORS (required):** copy the extension ID from `chrome://extensions` and set on the production server:
   ```bash
   EXTENSION_CORS_ORIGINS=chrome-extension://YOUR_EXTENSION_ID
   ```
   See [`backend/.env.example`](../../backend/.env.example) and [`backend/app/main.py`](../../backend/app/main.py). Redeploy/restart the backend.

   Unpacked extension IDs change unless you use a fixed `.pem` key. After Chrome Web Store publish, use the **stable store extension ID** once.

4. Reload extension and test sign-in + compare.

---

## Daily Development Workflow

```bash
npm run extension:dev   # vite build --watch — leave running while editing
```

After each rebuild: `chrome://extensions` → CompareIntel → **Reload**

### Manual test checklist

- [ ] Side panel opens from toolbar icon
- [ ] Models list loads
- [ ] Page context ON → submit → models stream text
- [ ] Page context OFF → compare works without tab text
- [ ] Pin tab / `@` mention (optional)
- [ ] Sign in / sign out
- [ ] Credits/rate limit line updates
- [ ] Service worker console: no failed network requests

### Automated tests

```bash
npm run core:test
npm run test -w @compareintel/extension
npm run extension:build
```

CI runs on push to `extension/**` and `packages/compare-core/**` — see [`.github/workflows/extension-build.yml`](../../.github/workflows/extension-build.yml).

E2E tests: [`extension/e2e/`](../../extension/e2e/) (require a built extension).

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| “No response” for all models | Stale build or SSE handling | Rebuild + reload extension |
| CORS / network errors in service worker | Production API without `EXTENSION_CORS_ORIGINS` | Add extension ID to server env |
| Models never load | Backend down or wrong `VITE_API_URL` | Start backend; rebuild after `.env` change |
| Auth works on web but not extension | Extension uses Bearer tokens, not cookies | Sign in via extension modal |
| Page context fails | Non-HTTP(S) tab | Test on a normal `https://` page |
| Changes not appearing | Forgot reload after watch build | Reload on `chrome://extensions` |

---

## Architecture

- **`extension/src/background`** — service worker, `TabContextManager`
- **`extension/src/sidepanel`** — React side panel UI
- **`extension/src/content`** — selection capture content script
- **`packages/compare-core`** — shared hooks, API client, prompt builder

## Permissions

- **`sidePanel`** — main UI
- **`scripting` + `activeTab` + `tabs`** — on-demand page extraction when user submits with context enabled
- **`storage`** — auth tokens (session storage)
- **`host_permissions: https://compareintel.com/*`** — production API
- **`optional_host_permissions: <all_urls>`** — future opt-in for broader context

Page content is read **on submit only**, not continuously.

---

## Production Preparation

### Extension build

1. Remove `extension/.env` (production API only).
2. Bump `version` in [`extension/manifest.config.ts`](../../extension/manifest.config.ts).
3. Build and package:
   ```bash
   npm run package -w @compareintel/extension
   ```
   Produces `extension/compareintel-extension.zip`.

4. **Optional before store:** remove `http://localhost:*` from `host_permissions` in the store manifest if reviewers flag dev-only entries.

### Backend

On production (`ENVIRONMENT=production`):

```bash
EXTENSION_CORS_ORIGINS=chrome-extension://PUBLISHED_EXTENSION_ID
```

Redeploy via your normal process ([`deploy-production.sh`](../../deploy-production.sh), Docker, etc.).

### Privacy

Deploy frontend so [`compareintel.com/privacy`](https://compareintel.com/privacy) includes the browser extension section ([`frontend/src/components/pages/PrivacyPolicy.tsx`](../../frontend/src/components/pages/PrivacyPolicy.tsx)).

---

## Chrome Web Store

### Developer account (one-time)

1. [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Pay one-time registration fee (if needed)
3. Complete publisher profile

### Create listing

1. **New item** → upload `extension/compareintel-extension.zip`
2. Prepare assets:

| Asset | Notes |
|-------|-------|
| Name | CompareIntel |
| Short description | ~132 chars — multi-model compare with optional page context |
| Detailed description | Side-by-side models, page context toggle, pin tabs, sign-in |
| Category | Productivity or Developer Tools |
| Icon | 128×128 — [`extension/public/icons/`](../../extension/public/icons/) |
| Screenshots | At least one (1280×800 or 640×400) — side panel on a sample page |
| Privacy policy | `https://compareintel.com/privacy` |

### Permissions justification (for review)

- **`sidePanel`** — comparison UI
- **`scripting` / `activeTab` / `tabs`** — page text only when user submits with context on
- **`storage`** — session auth tokens
- **`host_permissions: https://compareintel.com/*`** — API calls
- **`content_scripts` on `<all_urls>`** — text selection capture only

### Privacy questionnaire

Answer consistently with the privacy policy:

- Collects page content: **Yes**, only when user enables Page context and submits
- Purpose: AI comparison service
- Shared with: AI providers via backend (OpenRouter)
- Not sold

### Submit and publish

1. Public or Unlisted (beta)
2. Submit for review (typically a few days)
3. On rejection: address feedback, bump version, resubmit

### Post-publish (critical)

1. Note the **store extension ID** from the listing or `chrome://extensions`
2. Set `EXTENSION_CORS_ORIGINS=chrome-extension://STORE_EXTENSION_ID` on production
3. Redeploy backend
4. Install from store and smoke-test login, compare, page context

---

## Ongoing Maintenance

| Task | When |
|------|------|
| Bump version in `extension/manifest.config.ts` | Every store update |
| `npm run package -w @compareintel/extension` | Each release |
| Upload zip to Developer Dashboard | Each release |
| Local + production smoke tests | Before each upload |
| Keep `EXTENSION_CORS_ORIGINS` in sync | If extension ID changes (rare after publish) |

---

## Firefox (future)

Firefox uses `sidebar_action` instead of `side_panel`. See [`extension/manifest.firefox.ts`](../../extension/manifest.firefox.ts) for a manifest overlay; a conditional build flag can be added in CI.

---

## Quick Reference

```bash
npm install

# Local API (extension/.env → localhost:8000)
npm run extension:dev          # watch rebuild
npm run extension:build        # one-off build

# Production API (no extension/.env)
npm run extension:build

npm run core:test
npm run test -w @compareintel/extension
npm run package -w @compareintel/extension   # store zip
```

**Reload after every build:** `chrome://extensions` → CompareIntel → Reload
