import { expect, test } from '@playwright/test'

const KNOWN_ROUTES = [
  '/',
  '/about',
  '/features',
  '/how-it-works',
  '/faq',
  '/pricing',
  '/image-generation',
  '/help-me-choose-methodology',
  '/privacy-policy',
  '/terms-of-service',
  '/models',
  '/models/claude-opus-5',
  '/admin',
  '/reset-password',
  '/terms',
]

test.describe('Canonical URLs and HTTP status', () => {
  test('known routes return 200', async ({ request }) => {
    for (const path of KNOWN_ROUTES) {
      const response = await request.get(path)
      expect(response.status(), path).toBe(200)
    }
  })

  test('/privacy redirects to the canonical privacy policy', async ({ request }) => {
    const response = await request.get('/privacy', { maxRedirects: 0 })
    expect(response.status()).toBe(301)
    expect(response.headers().location).toBe('/privacy-policy')
  })

  test('unknown URLs return 404 without a homepage canonical', async ({ request }) => {
    for (const path of ['/models/does-not-exist', '/random-page']) {
      const response = await request.get(path)
      expect(response.status(), path).toBe(404)
      const html = await response.text()
      expect(html).toContain('404 - Page Not Found')
      expect(html).toContain('noindex')
      expect(html).not.toMatch(/rel="canonical"/i)
      expect(html).not.toContain('property="og:url" content="https://compareintel.com/"')
    }
  })

  test('password-reset shell does not canonicalize to the homepage', async ({ request }) => {
    const response = await request.get('/reset-password?token=abc')
    expect(response.status()).toBe(200)
    const html = await response.text()
    expect(html).toContain('noindex')
    expect(html).not.toMatch(/rel="canonical" href="https:\/\/compareintel\.com\/"/)
  })

  test('password-reset deep link opens the reset form', async ({ page }) => {
    await page.goto('/reset-password?token=abc')
    await expect(page.getByRole('heading', { name: 'Reset Password' })).toBeVisible()
  })

  test('/terms keeps the client redirect to the terms page', async ({ page }) => {
    await page.goto('/terms')
    await expect(page).toHaveURL(/\/terms-of-service$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeVisible()
  })
})
