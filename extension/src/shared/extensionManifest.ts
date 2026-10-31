import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'

import type { ConfigEnv } from 'vite'

const require = createRequire(import.meta.url)
const { version } = require('../../package.json') as { version: string }

export const EXTENSION_VERSION = version

/** Chrome Web Store draft item ID. Public, not a secret. */
export const CHROME_STORE_EXTENSION_ID = 'iaeeeakmomhbakmjhgcifakpdkbenojj'

/**
 * Chrome Web Store public key (SPKI, base64). Used only in DEV/watch manifests
 * so unpacked loads share this ID. Never include in the production/store zip.
 */
export const CHROME_STORE_PUBLIC_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEArBN+4XPxgwq4fJ4YHWHFq3BZfKFt6G5QkBWoZYacaMZqCze2q7Yrvc8syjB4UNnkvN3NvFF94k7xhIdPAcQJHsusIig2SQjYNGDUdAf/x5JlTD1XMJmtgXwf86QpX4ToWX9GOsVfV87HrMCHNdDfPi2jIptgZWxPl689X0fw2jdaMs06inEJGXE1enmHtfpk6bruTHDvo0n/B1DtYil+14SuD5e7RX+1U8viELN0IZ0QRFrZwPWnw8Xn5XTMNvuH6qGiINkFHubWLebsj2zX12a+93zcJ6WnFQqh7gd6iCHrVRsHWLgj6K9Dbn1Pb/F2+PxBY58AD3Rf12a1bf0LYwIDAQAB'

/**
 * Chrome extension IDs are the first 32 hex chars of SHA-256(DER public key),
 * with 0-f mapped to a-p.
 */
export function chromeExtensionIdFromPublicKey(publicKeyBase64: string): string {
  const der = Buffer.from(publicKeyBase64, 'base64')
  const digest = createHash('sha256').update(der).digest('hex')
  return digest
    .slice(0, 32)
    .replace(/[0-9a-f]/g, (hex) => String.fromCharCode('a'.charCodeAt(0) + Number.parseInt(hex, 16)))
}

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

export type ManifestBuildEnv = Pick<ConfigEnv, 'mode' | 'command'>

export function isExtensionDevBuild(env: ManifestBuildEnv): boolean {
  return env.mode === 'development' || env.command === 'serve' || process.argv.includes('--watch')
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
      'Compare AI model responses side-by-side. Page context is optional and can come from any open tab, not just the active one.',
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
    content_scripts: [
      {
        matches: ['<all_urls>'],
        js: ['src/content/selection.ts'],
        run_at: 'document_idle',
      },
      {
        matches: webAppMatches,
        js: ['src/content/webAppBridge.ts'],
        run_at: 'document_idle',
      },
    ],
    permissions: ['sidePanel', 'storage', 'scripting', 'tabs', 'activeTab'],
    host_permissions: hostPermissions,
    optional_host_permissions: ['https://*/*', 'http://*/*'],
    externally_connectable: {
      matches: webAppMatches,
    },
    ...(isDev ? { key: CHROME_STORE_PUBLIC_KEY } : {}),
  }
}

export function createFirefoxManifest(env: ManifestBuildEnv) {
  const isDev = isExtensionDevBuild(env)

  return {
    manifest_version: 3,
    name: 'CompareIntel',
    version: EXTENSION_VERSION,
    description:
      'Compare AI model responses side-by-side. Page context is optional and can come from any open tab, not just the active one.',
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
    host_permissions: isDev
      ? ['https://compareintel.com/*', 'http://localhost:8000/*']
      : ['https://compareintel.com/*'],
    optional_host_permissions: ['<all_urls>'],
  }
}
