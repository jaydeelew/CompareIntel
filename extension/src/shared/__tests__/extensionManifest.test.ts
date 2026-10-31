import { describe, expect, it } from 'vitest'

import {
  EXTENSION_VERSION,
  createChromeManifest,
  createFirefoxManifest,
  isExtensionDevBuild,
} from '../extensionManifest'

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
    const serialized = JSON.stringify(prod)

    expect(serialized).not.toMatch(/localhost|127\.0\.0\.1/)
    expect(prod.host_permissions).toEqual(['https://compareintel.com/*'])
    expect(prod.externally_connectable.matches).toEqual(['https://compareintel.com/*'])
    expect(prod.content_scripts[1]?.matches).toEqual(['https://compareintel.com/*'])
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
    expect(dev.content_scripts[1]?.matches).toContain('http://localhost:5173/*')
    expect(dev.externally_connectable.matches).toContain('http://localhost:5173/*')
  })

  it('does not change the <all_urls> selection content script', () => {
    const prod = createChromeManifest({ mode: 'production', command: 'build' })
    expect(prod.content_scripts[0]).toMatchObject({
      matches: ['<all_urls>'],
      js: ['src/content/selection.ts'],
    })
  })

  it('strips localhost from the production Firefox overlay', () => {
    const prod = createFirefoxManifest({ mode: 'production', command: 'build' })
    expect(JSON.stringify(prod)).not.toMatch(/localhost|127\.0\.0\.1/)
    expect(prod.host_permissions).toEqual(['https://compareintel.com/*'])

    const dev = createFirefoxManifest({ mode: 'development', command: 'serve' })
    expect(dev.host_permissions).toContain('http://localhost:8000/*')
    expect(dev.version).toBe(EXTENSION_VERSION)
  })
})
