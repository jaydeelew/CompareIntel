import { createRequire } from 'node:module'

import type { ConfigEnv } from 'vite'

const require = createRequire(import.meta.url)
const { version } = require('../../package.json') as { version: string }

export const EXTENSION_VERSION = version

export const PRODUCTION_WEB_APP_MATCHES = ['https://compareintel.com/*'] as const
export const DEV_WEB_APP_MATCHES = [
  'https://compareintel.com/*',
  'http://localhost:5173/*',
] as const

export const PRODUCTION_HOST_PERMISSIONS = ['https://compareintel.com/*'] as const
export const DEV_HOST_PERMISSIONS = [
  'https://compareintel.com/*',
  'http://localhost:8000/*',
  'http://127.0.0.1:8000/*',
  'http://localhost:5173/*',
] as const

/** Chrome production API permissions. `tabs` and optional all-http hosts are intentionally omitted. */
export const CHROME_PERMISSIONS = ['sidePanel', 'storage', 'scripting', 'activeTab'] as const

/** Firefox has sidebar_action instead of sidePanel. */
export const FIREFOX_PERMISSIONS = ['storage', 'scripting', 'activeTab'] as const

export type ManifestBuildEnv = Pick<ConfigEnv, 'mode' | 'command'>

export function isExtensionDevBuild(env: ManifestBuildEnv): boolean {
  return env.mode === 'development' || env.command === 'serve' || process.argv.includes('--watch')
}

function webAppBridgeContentScript(webAppMatches: string[]) {
  return {
    matches: webAppMatches,
    js: ['src/content/webAppBridge.ts'],
    run_at: 'document_idle' as const,
  }
}

export function createChromeManifest(env: ManifestBuildEnv) {
  const isDev = isExtensionDevBuild(env)
  const webAppMatches = [...(isDev ? DEV_WEB_APP_MATCHES : PRODUCTION_WEB_APP_MATCHES)]
  const hostPermissions = [...(isDev ? DEV_HOST_PERMISSIONS : PRODUCTION_HOST_PERMISSIONS)]

  return {
    manifest_version: 3,
    name: 'CompareIntel',
    version: EXTENSION_VERSION,
    description:
      'Compare AI model responses side-by-side. Page context is optional and is read only after you open CompareIntel or submit a comparison.',
    icons: {
      '16': 'public/icons/icon-16.png',
      '32': 'public/icons/icon-32.png',
      '48': 'public/icons/icon-48.png',
      '128': 'public/icons/icon-128.png',
    },
    action: {
      default_title: `CompareIntel v${EXTENSION_VERSION}`,
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
    content_scripts: [webAppBridgeContentScript(webAppMatches)],
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'",
    },
    permissions: [...CHROME_PERMISSIONS],
    host_permissions: hostPermissions,
    externally_connectable: {
      matches: webAppMatches,
    },
  }
}

export function createFirefoxManifest(env: ManifestBuildEnv) {
  const isDev = isExtensionDevBuild(env)

  return {
    manifest_version: 3,
    name: 'CompareIntel',
    version: EXTENSION_VERSION,
    description:
      'Compare AI model responses side-by-side. Page context is optional and is read only after you open CompareIntel or submit a comparison.',
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
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'",
    },
    permissions: [...FIREFOX_PERMISSIONS],
    host_permissions: isDev
      ? ['https://compareintel.com/*', 'http://localhost:8000/*']
      : ['https://compareintel.com/*'],
  }
}
