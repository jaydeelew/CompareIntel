#!/usr/bin/env node
/**
 * Measure the blue hero background (.hero-section) height at various breakpoints
 * This measures the actual blue background container, not inner content
 */
import { chromium } from 'playwright';

const WIDTHS = [320, 375, 390, 414, 430, 768, 820, 1024, 1280, 1440, 1920];
const HEIGHT = 1080; // Fixed viewport height for consistency

async function measureHeroBackground() {
  console.log('\n🔍 Measuring Hero Background (.hero-section) Heights...\n');

  const browser = await chromium.launch({ headless: true });
  
  const measurements = {
    light: { signedOut: {}, signedIn: {} },
    dark: { signedOut: {}, signedIn: {} },
  };

  for (const theme of ['light', 'dark']) {
    console.log(`\n${theme.toUpperCase()} MODE:`);
    console.log('═'.repeat(70));

    for (const authState of ['signedOut', 'signedIn']) {
      const context = await browser.newContext();
      const page = await context.newPage();

      // Set theme
      await page.goto('http://localhost:8080/');
      await page.evaluate((t) => {
        document.documentElement.setAttribute('data-theme', t);
      }, theme);

      // Mock auth state if needed (signed in state)
      if (authState === 'signedIn') {
        await page.evaluate(() => {
          localStorage.setItem('auth_token', 'mock-token');
        });
        await page.reload();
      }

      await page.waitForTimeout(500);

      console.log(`\n  ${authState === 'signedOut' ? 'Signed Out' : 'Signed In'}:`);
      console.log('  ' + '─'.repeat(66));

      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: HEIGHT });
        await page.waitForTimeout(300);

        const heroHeight = await page.evaluate(() => {
          const heroSection = document.querySelector('.hero-section');
          if (!heroSection) return 0;
          const rect = heroSection.getBoundingClientRect();
          return rect.height;
        });

        measurements[theme][authState][width] = Math.round(heroHeight);
        console.log(`    ${String(width).padStart(4)}px: ${measurements[theme][authState][width]}px`);
      }

      await context.close();
    }
  }

  console.log('\n' + '═'.repeat(70));
  console.log('Summary Table:');
  console.log('═'.repeat(70));
  console.log('\nLight Mode (Signed Out):');
  console.log(Object.entries(measurements.light.signedOut).map(([w, h]) => `${w}px: ${h}px`).join(', '));
  console.log('\nLight Mode (Signed In):');
  console.log(Object.entries(measurements.light.signedIn).map(([w, h]) => `${w}px: ${h}px`).join(', '));
  console.log('\nDark Mode (Signed Out):');
  console.log(Object.entries(measurements.dark.signedOut).map(([w, h]) => `${w}px: ${h}px`).join(', '));
  console.log('\nDark Mode (Signed In):');
  console.log(Object.entries(measurements.dark.signedIn).map(([w, h]) => `${w}px: ${h}px`).join(', '));
  console.log('');

  await browser.close();
}

measureHeroBackground().catch(console.error);
