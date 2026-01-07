import { test, expect } from '@playwright/test'

/**
 * E2E Tests: Navigation and Content Pages
 *
 * Tests navigation and SEO/content pages:
 * - Footer navigation
 * - Page content loading
 * - Scroll behavior
 * - Links and routing
 */

test.describe('Navigation and Content Pages', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
  })

  test('User can navigate to About page', async ({ page }) => {
    const footerLink = page.getByLabel('Footer navigation').getByRole('link', {
      name: 'About',
      exact: true,
    })

    await footerLink.click()
    await page.waitForURL('**/about', { timeout: 5000 })
    await page.waitForLoadState('networkidle')

    expect(page.url()).toContain('/about')

    // Page should have content
    const mainContent = page.locator('main, .main-content, [role="main"]')
    await expect(mainContent.first()).toBeVisible()

    // Page should load at the top
    const scrollY = await page.evaluate(() => window.scrollY)
    expect(scrollY).toBe(0)
  })

  test('User can navigate to Features page', async ({ page }) => {
    const footerLink = page.getByLabel('Footer navigation').getByRole('link', {
      name: 'Features',
      exact: true,
    })

    await footerLink.click()
    await page.waitForURL('**/features', { timeout: 5000 })
    await page.waitForLoadState('networkidle')

    expect(page.url()).toContain('/features')

    // Features content should be visible
    const featuresContent = page.getByText(/feature|capability/i)
    await expect(featuresContent.first()).toBeVisible({ timeout: 2000 })
  })

  test('User can navigate to FAQ page', async ({ page }) => {
    const footerLink = page.getByLabel('Footer navigation').getByRole('link', {
      name: 'FAQ',
      exact: true,
    })

    await footerLink.click()
    await page.waitForURL('**/faq', { timeout: 5000 })
    await page.waitForLoadState('networkidle')

    expect(page.url()).toContain('/faq')

    // FAQ questions should be visible
    const faqContent = page.getByText(/question|answer|faq/i)
    await expect(faqContent.first()).toBeVisible({ timeout: 2000 })
  })

  test('User can navigate to How It Works page', async ({ page }) => {
    const footerLink = page.getByLabel('Footer navigation').getByRole('link', {
      name: 'How It Works',
      exact: true,
    })

    await footerLink.click()
    await page.waitForURL('**/how-it-works', { timeout: 5000 })
    await page.waitForLoadState('networkidle')

    expect(page.url()).toContain('/how-it-works')

    // Content should be visible
    const mainContent = page.locator('main, .main-content')
    await expect(mainContent.first()).toBeVisible()
  })

  test('User can navigate to Privacy Policy', async ({ page }) => {
    const footerLink = page.getByLabel('Footer navigation').getByRole('link', {
      name: 'Privacy Policy',
      exact: true,
    })

    await footerLink.click()
    await page.waitForURL('**/privacy-policy', { timeout: 5000 })
    await page.waitForLoadState('networkidle')

    expect(page.url()).toContain('/privacy-policy')

    // Privacy policy content should be visible
    const privacyContent = page.getByText(/privacy|data|information/i)
    await expect(privacyContent.first()).toBeVisible({ timeout: 2000 })
  })

  test('User can navigate to Terms of Service', async ({ page }) => {
    const footerLink = page.getByLabel('Footer navigation').getByRole('link', {
      name: 'Terms of Service',
      exact: true,
    })

    await footerLink.click()
    await page.waitForURL('**/terms-of-service', { timeout: 5000 })
    await page.waitForLoadState('networkidle')

    expect(page.url()).toContain('/terms-of-service')

    // Terms content should be visible
    const termsContent = page.getByText(/terms|service|agreement/i)
    await expect(termsContent.first()).toBeVisible({ timeout: 2000 })
  })

  test('Pages load at the top after navigation', async ({ page }) => {
    // Scroll down on homepage
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight)
    })
    await page.waitForTimeout(200)

    // Verify we scrolled
    const beforeScroll = await page.evaluate(() => window.scrollY)
    expect(beforeScroll).toBeGreaterThan(0)

    // Navigate to About page
    const footerLink = page.getByLabel('Footer navigation').getByRole('link', {
      name: 'About',
      exact: true,
    })
    await footerLink.click()

    await page.waitForURL('**/about', { timeout: 5000 })
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(300)

    // Page should be at the top
    const afterScroll = await page.evaluate(() => window.scrollY)
    expect(afterScroll).toBe(0)
  })

  test('User can navigate back to homepage', async ({ page }) => {
    // Navigate to a content page
    await page.goto('/about')
    await page.waitForLoadState('networkidle')

    // Click logo or brand to go home
    const logo = page.locator('.brand-logo, .logo-icon, [class*="logo"]')

    if (
      await logo
        .first()
        .isVisible({ timeout: 2000 })
        .catch(() => false)
    ) {
      await logo.first().click()
      await page.waitForURL('**/', { timeout: 5000 })
      await page.waitForLoadState('networkidle')

      // Should be on homepage
      expect(page.url()).toMatch(/\/$|\/\?/)

      // Comparison form should be visible
      const inputField = page.getByTestId('comparison-input-textarea')
      await expect(inputField).toBeVisible()
    }
  })

  test('Footer is visible on all pages', async ({ page }) => {
    const pages = ['/', '/about', '/features', '/faq']

    for (const pagePath of pages) {
      await page.goto(pagePath)
      await page.waitForLoadState('networkidle')

      // Scroll to footer
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight)
      })
      await page.waitForTimeout(200)

      // Footer should be visible
      const footer = page.getByLabel('Footer navigation')
      await expect(footer).toBeVisible({ timeout: 2000 })
    }
  })

  test('Navigation bar is consistent across pages', async ({ page }) => {
    const pages = ['/', '/about', '/features']

    for (const pagePath of pages) {
      await page.goto(pagePath)
      await page.waitForLoadState('networkidle')

      // Navigation should be visible
      const nav = page.locator('header, .navbar, nav')
      await expect(nav.first()).toBeVisible()

      // Logo/brand should be visible
      const logo = page.locator('.brand-logo, .logo-icon')
      await expect(logo.first()).toBeVisible({ timeout: 2000 })
    }
  })
})
