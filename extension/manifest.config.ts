import type { ManifestV3Export } from '@crxjs/vite-plugin'

const manifest: ManifestV3Export = {
  manifest_version: 3,
  name: 'CompareIntel',
  version: '0.1.3',
  description:
    'Compare AI model responses side-by-side. Page context is optional and can come from any open tab, not just the active one.',
  icons: {
    '16': 'public/icons/icon-16.png',
    '32': 'public/icons/icon-32.png',
    '48': 'public/icons/icon-48.png',
    '128': 'public/icons/icon-128.png',
  },
  action: {
    default_title: 'CompareIntel v0.1.3',
    default_icon: {
      '16': 'public/icons/icon-16.png',
      '32': 'public/icons/icon-32.png',
    },
  },
  side_panel: {
    default_path: 'src/sidepanel/index.html',
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/selection.ts'],
      run_at: 'document_idle',
    },
    {
      matches: ['https://compareintel.com/*', 'http://localhost:5173/*'],
      js: ['src/content/webAppBridge.ts'],
      run_at: 'document_idle',
    },
  ],
  permissions: ['sidePanel', 'storage', 'scripting', 'tabs', 'activeTab'],
  host_permissions: [
    'https://compareintel.com/*',
    'http://localhost:8000/*',
    'http://127.0.0.1:8000/*',
    'http://localhost:5173/*',
  ],
  optional_host_permissions: ['https://*/*', 'http://*/*'],
  externally_connectable: {
    matches: ['https://compareintel.com/*', 'http://localhost:5173/*'],
  },
  web_accessible_resources: [
    {
      resources: ['src/sidepanel/index.html'],
      matches: ['<all_urls>'],
    },
  ],
}

export default manifest
