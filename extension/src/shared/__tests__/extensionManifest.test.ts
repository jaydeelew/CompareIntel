import { describe, expect, it } from 'vitest'

import {
  CHROME_PERMISSIONS,
  EXTENSION_VERSION,
  FIREFOX_PERMISSIONS,
  createChromeManifest,
  createFirefoxManifest,
  isExtensionDevBuild,
} from '../extensionManifest'

function serialized(value: unknown): string {
  return JSON.stringify(value)
}

describe('extensionManifest', () => {
  it('reads the package version once for Chrome and Firefox', () => {
    expect(EXTENSION_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
    expect(createChromeManifest({ mode: 'production', command: 'build' }).version).toBe(
      EXTENSION_VERSION,
    )
    expect(createFirefoxManifest({ mode: 'production', command: 'build' }).version).toBe(
      EXTENSION_VERSION,
    )
  })

  it('treats serve, development mode, and --watch as dev builds', () => {
    expect(isExtensionDevBuild({ mode: 'production', command: 'build' })).toBe(false)
    expect(isExtensionDevBuild({ mode: 'development', command: 'build' })).toBe(true)
    expect(isExtensionDevBuild({ mode: 'production', command: 'serve' })).toBe(true)
  })

  it('keeps localhost only in development Chrome manifests', () => {
    const prod = createChromeManifest({ mode: 'production', command: 'build' })
    const text = serialized(prod)

    expect(text).not.toMatch(/localhost|127\.0\.0\.1/)
    expect(prod.host_permissions).toEqual(['https://compareintel.com/*'])
    expect(prod.externally_connectable.matches).toEqual(['https://compareintel.com/*'])
    expect(prod.content_scripts).toHaveLength(1)
    expect(prod.content_scripts[0]?.matches).toEqual(['https://compareintel.com/*'])
    expect(prod.content_scripts[0]?.js).toEqual(['src/content/webAppBridge.ts'])
    expect(prod).not.toHaveProperty('web_accessible_resources')

    const dev = createChromeManifest({ mode: 'development', command: 'serve' })
    expect(dev.host_permissions).toEqual(
      expect.arrayContaining([
        'https://compareintel.com/*',
        'http://localhost:8000/*',
        'http://127.0.0.1:8000/*',
        'http://localhost:5173/*',
      ]),
    )
    expect(dev.content_scripts[0]?.matches).toContain('http://localhost:5173/*')
    expect(dev.externally_connectable.matches).toContain('http://localhost:5173/*')
  })

  it('does not register an <all_urls> selection content script', () => {
    const prod = createChromeManifest({ mode: 'production', command: 'build' })
    const dev = createChromeManifest({ mode: 'development', command: 'serve' })
    const firefox = createFirefoxManifest({ mode: 'production', command: 'build' })

    for (const manifest of [prod, dev, firefox]) {
      expect(serialized(manifest)).not.toContain('<all_urls>')
      expect(serialized(manifest)).not.toContain('selection.ts')
    }
  })

  it('keeps only least-privilege Chrome permissions', () => {
    const prod = createChromeManifest({ mode: 'production', command: 'build' })
    expect(prod.permissions).toEqual([...CHROME_PERMISSIONS])
    expect(prod.permissions).toEqual(['sidePanel', 'storage', 'scripting', 'activeTab'])
    expect(prod.permissions).not.toContain('tabs')
    expect(prod).not.toHaveProperty('optional_host_permissions')
    expect(prod.content_security_policy.extension_pages).toBe("script-src 'self'; object-src 'self'")
  })

  it('strips localhost from the production Firefox overlay', () => {
    const prod = createFirefoxManifest({ mode: 'production', command: 'build' })
    expect(serialized(prod)).not.toMatch(/localhost|127\.0\.0\.1/)
    expect(prod.host_permissions).toEqual(['https://compareintel.com/*'])
    expect(prod.permissions).toEqual([...FIREFOX_PERMISSIONS])
    expect(prod.permissions).not.toContain('tabs')
    expect(prod).not.toHaveProperty('optional_host_permissions')
    expect(prod).not.toHaveProperty('content_scripts')
    expect(prod.content_security_policy.extension_pages).toBe("script-src 'self'; object-src 'self'")

    const dev = createFirefoxManifest({ mode: 'development', command: 'serve' })
    expect(dev.host_permissions).toContain('http://localhost:8000/*')
    expect(dev.version).toBe(EXTENSION_VERSION)
  })
})
