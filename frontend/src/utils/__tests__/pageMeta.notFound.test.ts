import { afterEach, describe, expect, it, vi } from 'vitest'

describe('updatePageMeta not-found documents', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
    document.head.innerHTML = ''
    document.title = ''
  })

  function head() {
    document.head.innerHTML = [
      '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />',
      '<meta name="description" content="homepage" />',
      '<link rel="canonical" href="https://compareintel.com/" />',
      '<meta property="og:url" content="https://compareintel.com/" />',
      '<meta property="og:title" content="Home" />',
      '<meta name="twitter:url" content="https://compareintel.com/" />',
      '<meta name="twitter:title" content="Home" />',
    ].join('')
  }

  it('removes the homepage canonical and sets noindex for unknown paths', async () => {
    vi.stubEnv('VITE_DEPLOY_ENV', 'production')
    head()
    const { updatePageMeta, isNotFoundPath } = await import('../pageMeta')

    expect(isNotFoundPath('/models/does-not-exist')).toBe(true)
    expect(isNotFoundPath('/random-page')).toBe(true)
    expect(isNotFoundPath('/privacy')).toBe(false)
    expect(isNotFoundPath('/reset-password')).toBe(false)
    expect(isNotFoundPath('/')).toBe(false)

    updatePageMeta('/models/does-not-exist')

    expect(document.title).toBe('404 - Page Not Found - CompareIntel')
    expect(document.querySelector('link[rel="canonical"]')).toBeNull()
    expect(document.querySelector('meta[property="og:url"]')).toBeNull()
    expect(document.querySelector('meta[name="twitter:url"]')).toBeNull()
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
      'noindex, nofollow'
    )
    expect(document.querySelector('meta[name="googlebot"]')?.getAttribute('content')).toBe(
      'noindex, nofollow'
    )
  })

  it('restores an indexable canonical after leaving a not-found path', async () => {
    vi.stubEnv('VITE_DEPLOY_ENV', 'production')
    head()
    const { updatePageMeta } = await import('../pageMeta')

    updatePageMeta('/random-page')
    updatePageMeta('/about')

    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'https://compareintel.com/about'
    )
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toContain(
      'index, follow'
    )
    expect(document.querySelector('meta[name="googlebot"]')).toBeNull()
  })

  it('keeps password-reset and admin documents noindex without pointing at the homepage', async () => {
    vi.stubEnv('VITE_DEPLOY_ENV', 'production')
    head()
    const { updatePageMeta } = await import('../pageMeta')

    updatePageMeta('/reset-password')

    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'https://compareintel.com/reset-password'
    )
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
      'noindex, nofollow'
    )
  })
})
