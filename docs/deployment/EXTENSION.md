# CompareIntel Browser Extension

Chrome MV3 side-panel extension for multi-model AI comparison with page context awareness.

## Overview

| Package | Role |
|---------|------|
| [`extension/`](../../extension/) | MV3 extension (side panel, service worker, compareintel.com web-app bridge) |
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
npm run extension:dev   # vite dev (CRXJS) — leave running while editing
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
| Page context fails | Restricted tab (`chrome://`, Chrome Web Store) or the toolbar icon was not used on this tab | Open a normal `https://` page and click the CompareIntel icon |
| Changes not appearing | Forgot reload after watch build | Reload on `chrome://extensions` |
| “Manifest file is missing or unreadable” | Watch/dev write raced `dist/` | Run `npm run extension:build` (one-shot; fails if `dist/manifest.json` is missing), reload unpacked extension; restart `extension:dev` |
| `extension:build` hangs or reprints `vite build` forever | Nested restore from CRXJS `closeBundle` | Fixed: production builds no longer respawn Vite; they exit non-zero if the manifest is missing |

---

## Architecture

- **`extension/src/background`** — service worker, `TabContextManager`
- **`extension/src/sidepanel`** — React side panel UI
- **`extension/src/content/webAppBridge.ts`** — auth/handoff bridge, injected only on compareintel.com
- **`packages/compare-core`** — shared hooks, API client, prompt builder

Page text and the current selection are read **on submit only** (and only when page context is on) with `chrome.scripting.executeScript` and the `activeTab` grant. Opening the side panel does not read the page. There is no `<all_urls>` content script.

## Permissions

Production Chrome permissions (also the Chrome Web Store justification table):

| Permission | Why we need it |
|------------|----------------|
| **`sidePanel`** | Opens the comparison UI in Chrome's side panel. |
| **`storage`** | Stores sign-in tokens and extension settings on the device. |
| **`scripting`** | Injects a one-shot reader into the current tab to copy visible text and the current selection. |
| **`activeTab`** | Lets that injection run only after the user opens CompareIntel (toolbar icon / side panel / submit), not on every page visit. |
| **`host_permissions: https://compareintel.com/*`** | Calls the CompareIntel API and runs the web-app auth bridge on compareintel.com. Localhost hosts are added only in development builds. |

**Not requested (and why):**

| Dropped | Why it is not needed |
|---------|----------------------|
| **`tabs`** | Would show Chrome's “Read your browsing history” warning. The invoked tab's URL is available through `activeTab`. Pinning another page means opening CompareIntel on that tab; we do not scan every open tab. |
| **`optional_host_permissions` for `http://*/*` and `https://*/*`** | No feature injects into a site the user has not invoked the extension on. Cached text from a previously invoked pinned tab is reused until that tab navigates. |
| **`<all_urls>` content scripts** | Replaced by on-demand `executeScript`. The only remaining content script is the compareintel.com web-app bridge. |

Page content is read when you **submit with page context on**, not when the panel opens, not continuously, and not on chrome:// or Chrome Web Store pages.

### Auth and handoff (security)

- Access tokens live in `chrome.storage.session`. Refresh tokens live in `chrome.storage.local` with `setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })` so content scripts cannot read them. **Firefox: `setAccessLevel` is a no-op** (API not implemented). A 401 from `/auth/refresh` clears both.
- Runtime messages from content scripts (any `sender.tab` or non-extension-page origin) are **allowlisted**: only `GET_HANDOFF`, `BROADCAST_LOGOUT`, and `WEB_APP_BRIDGE_READY`. Every other type requires an extension-page sender. Default is deny. `STORE_HANDOFF` never accepts page-supplied tokens.
- The web app already sends tokens to the extension with `chrome.runtime.sendMessage(extensionId)` (`CI_AUTH`, `externally_connectable`).
- The content-script bridge **must not** put access or refresh tokens on `window.postMessage`. Handoff responses include conversation state plus a one-time `handoffNonce` bound to the opened tab. `crypto.randomUUID` is the only nonce source.
- **Follow-up (web app):** on `?handoff=1`, call `chrome.runtime.sendMessage(extensionId, { type: 'CI_CLAIM_HANDOFF', nonce })` from that tab and use the returned tokens to establish the cookie session. Until that ships, opening the web app from the extension hydrates prompt/results without transferring the session.

---

## Production Preparation

### Extension build

1. Remove `extension/.env` (production API only).
2. Bump `version` in [`extension/package.json`](../../extension/package.json) — Chrome and Firefox manifests both read this value.
3. Build and package:
   ```bash
   npm run package -w @compareintel/extension
   ```
   Produces `extension/compareintel-extension.zip`.

`npm run extension:build` is a one-shot production build: it must write `extension/dist/manifest.json` and exit. The production manifest omits localhost from `host_permissions`, `externally_connectable`, and the web-app content-script matches (those stay in `vite` / `extension:dev` only). It must not register content scripts on `<all_urls>`. The side panel is not listed in `web_accessible_resources`. `content_security_policy.extension_pages` is `script-src 'self'; object-src 'none'`.

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

Paste the table from [Permissions](#permissions) into the store listing. Short form:

| Permission | Single-sentence justification |
|------------|-------------------------------|
| `sidePanel` | Show the CompareIntel comparison UI beside the current page. |
| `storage` | Remember sign-in tokens and the user's extension settings. |
| `scripting` | Read visible page text and the current selection when the user asks for page context. |
| `activeTab` | Limit that read to the tab the user invoked CompareIntel on. |
| Host: `https://compareintel.com/*` | Talk to the CompareIntel API and sign the user in on compareintel.com. |

### Privacy questionnaire

Answer consistently with the privacy policy:

- Collects page content: **Yes**, only when the user enables Page context and opens CompareIntel or submits — not via a script on every website
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
| Bump version in `extension/package.json` | Every store update |
| `npm run package -w @compareintel/extension` | Each release |
| Upload zip to Developer Dashboard | Each release |
| Local + production smoke tests | Before each upload |
| Keep `EXTENSION_CORS_ORIGINS` in sync | If extension ID changes (rare after publish) |

---

## Firefox (future)

Firefox uses `sidebar_action` instead of `side_panel`. See [`extension/manifest.firefox.ts`](../../extension/manifest.firefox.ts) for a manifest overlay that shares `version` with `extension/package.json` and the same least-privilege model (`storage`, `scripting`, `activeTab`, compareintel.com host permission; no `<all_urls>` content script). A conditional build flag can be added in CI.

---

## Quick Reference

```bash
npm install

# Local API (extension/.env → localhost:8000)
npm run extension:dev          # vite dev (CRXJS) — leave running while editing
npm run extension:build        # one-off build

# Production API (no extension/.env)
npm run extension:build

npm run core:test
npm run test -w @compareintel/extension
npm run package -w @compareintel/extension   # store zip
```

**Reload after every build:** `chrome://extensions` → CompareIntel → Reload
