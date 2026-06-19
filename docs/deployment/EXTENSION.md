# CompareIntel Browser Extension

Chrome MV3 side-panel extension for multi-model AI comparison with page context awareness.

## Development

```bash
# From repo root
npm install
npm run extension:build

# Load unpacked extension in Chrome
# chrome://extensions → Developer mode → Load unpacked → extension/dist
```

### Local API

Set `VITE_API_URL=http://localhost:8000/api` when building for local backend testing.

## Architecture

- **`packages/compare-core`** — shared auth adapters, API client, tab context prompt builder, `useComparisonPage` hook
- **`extension/src/background`** — service worker with `TabContextManager`
- **`extension/src/sidepanel`** — React side panel UI
- **`extension/src/content`** — selection capture content script

## Permissions

Phase 1 uses `activeTab` + `scripting` for on-demand page extraction. Users can opt into `<all_urls>` via `optional_host_permissions` for advanced auto-context (future setting).

## Production CORS

After publishing to the Chrome Web Store, add the extension origin to backend env:

```bash
EXTENSION_CORS_ORIGINS=chrome-extension://YOUR_EXTENSION_ID
```

## Firefox

Build with Firefox manifest overlay:

```bash
cp extension/manifest.firefox.json extension/manifest.config.ts.bak
# Use sidebar_action build — see manifest.firefox.json
```

Firefox uses `sidebar_action` instead of `side_panel`. A conditional build flag can be added in CI.

## Chrome Web Store

1. `npm run extension:build -w @compareintel/extension`
2. `node extension/scripts/package.mjs`
3. Upload `extension/compareintel-extension.zip` to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)

### Privacy disclosure

The extension reads page content **only when the user submits a comparison with Page context enabled**. Content is sent to CompareIntel servers for AI model comparison. See [Privacy Policy](https://compareintel.com/privacy) — extension usage follows the same data handling as the web app.

## Testing

```bash
npm run core:test
npm run test -w @compareintel/extension
```

E2E tests live in `extension/e2e/` (require Chrome with extension loaded).
