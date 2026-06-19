/**
 * Firefox manifest overlay.
 * Firefox does not support chrome.sidePanel — use sidebar_action instead.
 * Apply at build time with FIREFOX_BUILD=1.
 */
import type { ManifestV3Export } from '@crxjs/vite-plugin'

const manifest: ManifestV3Export = {
  manifest_version: 3,
  name: 'CompareIntel',
  version: '0.1.0',
  description:
    'Compare AI model responses side-by-side with awareness of your current browser tab.',
  browser_specific_settings: {
    gecko: {
      id: 'compareintel@compareintel.com',
      strict_min_version: '109.0',
    },
  },
  icons: {
    '16': 'public/icons/icon-16.png',
    '32': 'public/icons/icon-32.png',
    '48': 'public/icons/icon-48.png',
    '128': 'public/icons/icon-128.png',
  },
  action: {
    default_title: 'Open CompareIntel',
    default_icon: {
      '16': 'public/icons/icon-16.png',
      '32': 'public/icons/icon-32.png',
    },
  },
  sidebar_action: {
    default_title: 'CompareIntel',
    default_panel: 'src/sidepanel/index.html',
    open_at_install: false,
  },
  background: {
    scripts: ['src/background/index.ts'],
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/selection.ts'],
      run_at: 'document_idle',
    },
  ],
  permissions: ['storage', 'scripting', 'tabs', 'activeTab'],
  host_permissions: ['https://compareintel.com/*', 'http://localhost:8000/*'],
  optional_host_permissions: ['<all_urls>'],
}

export default manifest
