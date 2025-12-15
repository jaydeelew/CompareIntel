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
      // Scroll both window and .app container
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
        const appContainer = document.querySelector('.app') as HTMLElement;
        if (appContainer) {
          appContainer.scrollTop = appContainer.scrollHeight;
        }
      });
      await page.waitForTimeout(100);

      // Click footer link (specifically from footer nav)
      const footerLink = getFooterLink(page, link.name);
      await footerLink.click();

      // Wait for navigation and page to fully load
      await page.waitForURL(`**${link.path}`, { timeout: 5000 });
      await page.waitForLoadState('networkidle');
      
      // Wait a bit for any late scroll attempts
      await page.waitForTimeout(300);

      // Verify both window and .app container are at the top
      const scrollData = await page.evaluate(() => {
        const appContainer = document.querySelector('.app') as HTMLElement;
        return {
          windowScrollY: window.scrollY,
          appScrollTop: appContainer ? appContainer.scrollTop : 0,
          documentElementScrollTop: document.documentElement.scrollTop,
          bodyScrollTop: document.body.scrollTop,
        };
      });
      
      expect(scrollData.windowScrollY).toBe(0);
      expect(scrollData.appScrollTop).toBe(0);
      expect(scrollData.documentElementScrollTop).toBe(0);
      expect(scrollData.bodyScrollTop).toBe(0);
    }
  });

  test('no cumulative scrolling on repeated footer link clicks', async ({ page }) => {
    // Test clicking the same link multiple times
    const testLink = footerLinks[0]; // Use "About" link
    
    for (let i = 0; i < 5; i++) {
      // Navigate to a different page first to ensure we're not already on the target
      await page.goto('/features');
      await page.waitForLoadState('networkidle');
      
      // Scroll down both window and .app container
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
        const appContainer = document.querySelector('.app') as HTMLElement;
        if (appContainer) {
          appContainer.scrollTop = appContainer.scrollHeight;
        }
      });
      await page.waitForTimeout(100);

      // Click footer link (specifically from footer nav)
      const footerLink = getFooterLink(page, testLink.name);
      await footerLink.click();

      // Wait for navigation
      await page.waitForURL(`**${testLink.path}`, { timeout: 5000 });
      await page.waitForLoadState('networkidle');
      
      // Wait for any late scroll attempts
      await page.waitForTimeout(300);

      // Verify page is always at the top (no cumulative scrolling)
      const scrollData = await page.evaluate(() => {
        const appContainer = document.querySelector('.app') as HTMLElement;
        return {
          windowScrollY: window.scrollY,
          appScrollTop: appContainer ? appContainer.scrollTop : 0,
        };
      });
      
      expect(scrollData.windowScrollY).toBe(0);
      expect(scrollData.appScrollTop).toBe(0);
    }
  });

  test('verify scroll-to-top when navigating FROM an SEO page', async ({ page }) => {
    // Navigate directly to an SEO page (About)
    await page.goto('/about');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    
    // Scroll down significantly on the SEO page
    await page.evaluate(() => {
      // Try scrolling both window and .app container
      window.scrollTo(0, 2000);
      const appContainer = document.querySelector('.app') as HTMLElement;
      if (appContainer) {
        appContainer.scrollTop = 2000;
      }
      // Also try scrolling the document
      document.documentElement.scrollTop = 2000;
      document.body.scrollTop = 2000;
    });
    await page.waitForTimeout(300);
    
    // Verify we scrolled down
    const beforeScroll = await page.evaluate(() => {
      const appContainer = document.querySelector('.app') as HTMLElement;
      return {
        windowScrollY: window.scrollY,
        appScrollTop: appContainer ? appContainer.scrollTop : 0,
        documentElementScrollTop: document.documentElement.scrollTop,
        bodyScrollTop: document.body.scrollTop,
      };
    });
    
    console.log('Before clicking footer link - Scroll positions:', beforeScroll);
    
    // Make sure we actually scrolled
    const hasScrolled = beforeScroll.windowScrollY > 100 || 
                       beforeScroll.appScrollTop > 100 ||
                       beforeScroll.documentElementScrollTop > 100;
    
    if (!hasScrolled) {
      console.log('WARNING: Could not scroll down on About page. Page might be too short.');
    }
    
    // Scroll to footer to make it visible
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(200);
    
    // Click footer link to navigate to another SEO page
    const footerLink = getFooterLink(page, 'How It Works');
    await footerLink.click();
    
    // Wait for navigation
    await page.waitForURL('**/how-it-works', { timeout: 5000 });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    
    // Check scroll positions multiple times
    const checks = [100, 300, 500, 1000];
    for (const delay of checks) {
      await page.waitForTimeout(delay);
      const scrollData = await page.evaluate(() => {
        const appContainer = document.querySelector('.app') as HTMLElement;
        return {
          windowScrollY: window.scrollY,
          appScrollTop: appContainer ? appContainer.scrollTop : 0,
          documentElementScrollTop: document.documentElement.scrollTop,
          bodyScrollTop: document.body.scrollTop,
        };
      });
      console.log(`After ${delay}ms - Scroll positions:`, scrollData);
      
      // All should be 0
      expect(scrollData.windowScrollY).toBe(0);
      expect(scrollData.appScrollTop).toBe(0);
      expect(scrollData.documentElementScrollTop).toBe(0);
      expect(scrollData.bodyScrollTop).toBe(0);
    }
  });

  test('verify scroll behavior with detailed debugging', async ({ page }) => {
    // Navigate to homepage and scroll down significantly
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Scroll both window and .app container down
    await page.evaluate(() => {
      window.scrollTo(0, 2000);
      const appContainer = document.querySelector('.app') as HTMLElement;
      if (appContainer) {
        appContainer.scrollTop = 2000;
      }
    });
    await page.waitForTimeout(200);
    
    // Get initial scroll positions
    const beforeScroll = await page.evaluate(() => {
      const appContainer = document.querySelector('.app') as HTMLElement;
      return {
        windowScrollY: window.scrollY,
        appScrollTop: appContainer ? appContainer.scrollTop : 0,
        appScrollHeight: appContainer ? appContainer.scrollHeight : 0,
        appClientHeight: appContainer ? appContainer.clientHeight : 0,
      };
    });
    
    console.log('Before click - Scroll positions:', beforeScroll);
    
    // Click footer link
    const footerLink = getFooterLink(page, 'About');
    await footerLink.click();
    
    // Wait for navigation
    await page.waitForURL('**/about', { timeout: 5000 });
    await page.waitForLoadState('networkidle');
    
    // Wait for scroll attempts with multiple checks
    await page.waitForTimeout(100);
    const after100ms = await page.evaluate(() => {
      const appContainer = document.querySelector('.app') as HTMLElement;
      return {
        windowScrollY: window.scrollY,
        appScrollTop: appContainer ? appContainer.scrollTop : 0,
      };
    });
    console.log('After 100ms - Scroll positions:', after100ms);
    
    await page.waitForTimeout(200);
    const after300ms = await page.evaluate(() => {
      const appContainer = document.querySelector('.app') as HTMLElement;
      return {
        windowScrollY: window.scrollY,
        appScrollTop: appContainer ? appContainer.scrollTop : 0,
      };
    });
    console.log('After 300ms - Scroll positions:', after300ms);
    
    // Final check
    const finalScroll = await page.evaluate(() => {
      const appContainer = document.querySelector('.app') as HTMLElement;
      return {
        windowScrollY: window.scrollY,
        appScrollTop: appContainer ? appContainer.scrollTop : 0,
        documentElementScrollTop: document.documentElement.scrollTop,
        bodyScrollTop: document.body.scrollTop,
      };
    });
    console.log('Final - Scroll positions:', finalScroll);
    
    // Verify page is at the top
    expect(finalScroll.windowScrollY).toBe(0);
    expect(finalScroll.appScrollTop).toBe(0);
    expect(finalScroll.documentElementScrollTop).toBe(0);
    expect(finalScroll.bodyScrollTop).toBe(0);
  });

  test('scroll position should reset when navigating between footer pages', async ({ page }) => {
    // Navigate to first page and scroll down
    await page.goto(footerLinks[0].path);
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
      const appContainer = document.querySelector('.app') as HTMLElement;
      if (appContainer) {
        appContainer.scrollTop = appContainer.scrollHeight;
      }
    });
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
      await page.waitForTimeout(300);

      // Verify page is at the top
      const scrollData = await page.evaluate(() => {
        const appContainer = document.querySelector('.app') as HTMLElement;
        return {
          windowScrollY: window.scrollY,
          appScrollTop: appContainer ? appContainer.scrollTop : 0,
        };
      });
      
      expect(scrollData.windowScrollY).toBe(0);
      expect(scrollData.appScrollTop).toBe(0);
    }
  });
});
