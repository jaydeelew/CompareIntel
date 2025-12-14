import { test, expect, Page } from '@playwright/test';

/**
 * Test footer navigation and scroll-to-top behavior
 * 
 * Verifies that:
 * 1. Footer links navigate correctly
 * 2. Pages always load at the top (scrollY = 0)
 * 3. No cumulative scrolling occurs on repeated clicks
 */
test.describe('Footer Navigation', () => {
  const footerLinks = [
    { name: 'About', path: '/about' },
    { name: 'Features', path: '/features' },
    { name: 'How It Works', path: '/how-it-works' },
    { name: 'FAQ', path: '/faq' },
    { name: 'Privacy Policy', path: '/privacy-policy' },
    { name: 'Terms of Service', path: '/terms-of-service' },
  ];

  // Helper to get footer link (specifically from footer nav to avoid duplicates on pages)
  const getFooterLink = (page: Page, linkName: string) => {
    return page.getByLabel('Footer navigation').getByRole('link', { name: linkName, exact: true });
  };

  test.beforeEach(async ({ page }) => {
    // Navigate to homepage
    await page.goto('/');
    // Wait for page to load
    await page.waitForLoadState('networkidle');
  });

  test('footer links should navigate to correct pages', async ({ page }) => {
    for (const link of footerLinks) {
      // Scroll down to ensure footer is visible
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(100);

      // Click footer link (specifically from footer nav)
      const footerLink = getFooterLink(page, link.name);
      await footerLink.click();

      // Wait for navigation
      await page.waitForURL(`**${link.path}`, { timeout: 5000 });
      
      // Verify we're on the correct page
      expect(page.url()).toContain(link.path);
    }
  });

  test('pages should load at the top after clicking footer links', async ({ page }) => {
    for (const link of footerLinks) {
      // Scroll down on current page (as far as possible)
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(100);

      // Click footer link (specifically from footer nav)
      const footerLink = getFooterLink(page, link.name);
      await footerLink.click();

      // Wait for navigation and page to fully load
      await page.waitForURL(`**${link.path}`, { timeout: 5000 });
      await page.waitForLoadState('networkidle');
      
      // Wait a bit for any late scroll attempts
      await page.waitForTimeout(200);

      // Verify page is at the top
      const scrollAfter = await page.evaluate(() => window.scrollY);
      expect(scrollAfter).toBe(0);
    }
  });

  test('no cumulative scrolling on repeated footer link clicks', async ({ page }) => {
    // Test clicking the same link multiple times
    const testLink = footerLinks[0]; // Use "About" link
    
    for (let i = 0; i < 5; i++) {
      // Navigate to a different page first to ensure we're not already on the target
      await page.goto('/features');
      await page.waitForLoadState('networkidle');
      
      // Scroll down
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(100);

      // Click footer link (specifically from footer nav)
      const footerLink = getFooterLink(page, testLink.name);
      await footerLink.click();

      // Wait for navigation
      await page.waitForURL(`**${testLink.path}`, { timeout: 5000 });
      await page.waitForLoadState('networkidle');
      
      // Wait for any late scroll attempts
      await page.waitForTimeout(200);

      // Verify page is always at the top (no cumulative scrolling)
      const scrollY = await page.evaluate(() => window.scrollY);
      expect(scrollY).toBe(0);
    }
  });

  test('scroll position should reset when navigating between footer pages', async ({ page }) => {
    // Navigate to first page and scroll down
    await page.goto(footerLinks[0].path);
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(100);

    // Navigate through all footer pages
    for (let i = 1; i < footerLinks.length; i++) {
      const currentLink = footerLinks[i];
      
      // Click footer link (specifically from footer nav)
      const footerLink = getFooterLink(page, currentLink.name);
      await footerLink.click();

      // Wait for navigation
      await page.waitForURL(`**${currentLink.path}`, { timeout: 5000 });
      await page.waitForLoadState('networkidle');
      
      // Wait for any late scroll attempts
      await page.waitForTimeout(200);

      // Verify page is at the top
      const scrollY = await page.evaluate(() => window.scrollY);
      expect(scrollY).toBe(0);
    }
  });
});
