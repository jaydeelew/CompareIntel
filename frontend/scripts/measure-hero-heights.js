#!/usr/bin/env node
/**
 * Comprehensive hero height measurement across all required widths and viewport heights
 * Tests: widths 320, 375, 390, 414, 430, 768, 820, 1024, 1280, 1440, 1920
 *        viewport heights 600, 700, 800, 1000
 */
import { chromium } from 'playwright';

const WIDTHS = [320, 375, 390, 414, 430, 768, 820, 1024, 1280, 1440, 1920];
const VIEWPORT_HEIGHTS = [600, 700, 800, 1000];

async function measureAllCombinations() {
  console.log('\n🔍 Comprehensive Hero Height Measurement\n');
  console.log('Testing all combinations of widths and viewport heights...\n');

  const browser = await chromium.launch({ headless: true });
  const results = {};

  for (const theme of ['light', 'dark']) {
    results[theme] = {};
    
    for (const vpHeight of VIEWPORT_HEIGHTS) {
      results[theme][vpHeight] = {};
      
      const page = await browser.newPage();
      await page.goto('http://localhost:8080/');
      
      // Set theme
      await page.evaluate((t) => {
        document.documentElement.setAttribute('data-theme', t);
      }, theme);
      await page.waitForTimeout(300);

      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: vpHeight });
        await page.waitForTimeout(200);

        const height = await page.evaluate(() => {
          const hero = document.querySelector('.hero-section');
          return hero ? Math.round(hero.getBoundingClientRect().height) : 0;
        });

        results[theme][vpHeight][width] = height;
      }

      await page.close();
    }
  }

  await browser.close();

  // Print results
  for (const theme of ['light', 'dark']) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`${theme.toUpperCase()} MODE`);
    console.log('='.repeat(80));

    for (const vpHeight of VIEWPORT_HEIGHTS) {
      console.log(`\nViewport Height: ${vpHeight}px`);
      console.log('-'.repeat(80));
      
      for (const width of WIDTHS) {
        const height = results[theme][vpHeight][width];
        console.log(`  ${String(width).padStart(4)}px width: ${String(height).padStart(4)}px`);
      }
    }
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log('Summary Table (for comparison with baseline)');
  console.log('='.repeat(80));

  for (const vpHeight of VIEWPORT_HEIGHTS) {
    console.log(`\nViewport Height ${vpHeight}px - Light Mode:`);
    console.log(WIDTHS.map(w => `${w}px: ${results.light[vpHeight][w]}px`).join(', '));
    
    console.log(`\nViewport Height ${vpHeight}px - Dark Mode:`);
    console.log(WIDTHS.map(w => `${w}px: ${results.dark[vpHeight][w]}px`).join(', '));
  }

  console.log('');
}

measureAllCombinations().catch(console.error);
