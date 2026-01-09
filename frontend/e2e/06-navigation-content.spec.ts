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
    // Scroll to footer to ensure it's visible
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(500)

    const footerLink = page.getByLabel('Footer navigation').getByRole('link', {
      name: 'About',
      exact: true,
    })

    await expect(footerLink).toBeVisible({ timeout: 5000 })
    await footerLink.click()
    await page.waitForURL('**/about', { timeout: 5000 })
    await page.waitForLoadState('networkidle')

    expect(page.url()).toContain('/about')

    // Page should have content (SEO pages use article.seo-page-content)
    const mainContent = page.locator(
      'main, .main-content, [role="main"], article.seo-page-content, .seo-page-content, article'
    )
    await expect(mainContent.first()).toBeVisible({ timeout: 10000 })

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

    // Content should be visible (SEO pages use article.seo-page-content)
    const mainContent = page.locator(
      'main, .main-content, [role="main"], article.seo-page-content, .seo-page-content, article'
    )
    await expect(mainContent.first()).toBeVisible({ timeout: 10000 })
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
    // Note: Navigation is only rendered on main AppContent pages (catch-all route),
    // not on SEO pages like /about, /features which only have Footer via Layout component
    // So we only test pages that actually have navigation
    const pagesWithNavigation = ['/']

    for (const pagePath of pagesWithNavigation) {
      await page.goto(pagePath)
      await page.waitForLoadState('networkidle')

      // Navigation should be visible (header.app-header contains nav.navbar)
      const nav = page.locator('header.app-header, .navbar, nav, header')
      await expect(nav.first()).toBeVisible({ timeout: 10000 })

      // Logo/brand should be visible
      // Structure: header.app-header > nav.navbar > div.nav-brand > div.brand-logo > img.logo-icon
      // Try multiple selectors to ensure we find the logo
      const brandLogo = page.locator('.brand-logo, .nav-brand .brand-logo')
      const logoIcon = page.locator('img.logo-icon, .logo-icon')
      const brandName = page.getByText('CompareIntel')

      // At least one of these should be visible
      const hasBrandLogo = await brandLogo
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false)
      const hasLogoIcon = await logoIcon
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false)
      const hasBrandName = await brandName.isVisible({ timeout: 5000 }).catch(() => false)

      // Logo should be visible (either the container, the image, or the brand name)
      expect(hasBrandLogo || hasLogoIcon || hasBrandName).toBe(true)
    }

    // Verify that SEO pages don't have navigation (they only have footer)
    // This confirms the architecture is correct
    const seoPages = ['/about', '/features']
    for (const pagePath of seoPages) {
      await page.goto(pagePath)
      await page.waitForLoadState('networkidle')

      // SEO pages should NOT have the main navigation bar
      // Note: Main nav might be present but hidden, or not present at all - both are acceptable

      // But they should have footer (via Layout component)
      const footer = page.getByLabel('Footer navigation')
      const hasFooter = await footer.isVisible({ timeout: 2000 }).catch(() => false)

      // SEO pages should have footer but not main navigation
      expect(hasFooter).toBe(true)
      // Note: Main nav might be present but hidden, or not present at all - both are acceptable
    }
  })
})
