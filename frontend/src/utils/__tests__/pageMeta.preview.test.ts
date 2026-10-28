import { afterEach, describe, expect, it, vi } from 'vitest'

describe('updatePageMeta preview noindex', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
    document.head.innerHTML = ''
  })

  it('sets robots and googlebot to noindex on preview deploys', async () => {
    vi.stubEnv('VITE_DEPLOY_ENV', 'preview')
    document.head.innerHTML = '<meta name="robots" content="index, follow" />'

    const { updatePageMeta } = await import('../pageMeta')
    updatePageMeta('/')

    const robots = document.querySelector('meta[name="robots"]')
    const googlebot = document.querySelector('meta[name="googlebot"]')
    expect(robots?.getAttribute('content')).toBe('noindex, nofollow')
    expect(googlebot?.getAttribute('content')).toBe('noindex, nofollow')
  })

  it('does not force noindex in production', async () => {
    vi.stubEnv('VITE_DEPLOY_ENV', 'production')
    document.head.innerHTML = '<meta name="robots" content="index, follow" />'

    const { updatePageMeta } = await import('../pageMeta')
    updatePageMeta('/')

    const robots = document.querySelector('meta[name="robots"]')
    expect(robots?.getAttribute('content')).toBe('index, follow')
    expect(document.querySelector('meta[name="googlebot"]')).toBeNull()
  })
})
