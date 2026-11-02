#!/usr/bin/env node

/**
 * Measure hero section heights at various breakpoints using Playwright
 * Run with: node scripts/measure-hero-heights.js
 */

import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BREAKPOINTS = [375, 768, 1024, 1280, 1440];

async function measureHeroHeights() {
  console.log('\n🔍 Measuring Hero Section Heights...\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Serve the built dist folder
  await page.goto(`http://localhost:8080/`);
  await page.waitForTimeout(1500);

  const measurements = {
    light: {},
    dark: {},
  };

  for (const theme of ['light', 'dark']) {
    console.log(`\n${theme.toUpperCase()} MODE:`);
    console.log('─'.repeat(50));

    // Set theme
    await page.evaluate((t) => {
      document.documentElement.setAttribute('data-theme', t);
    }, theme);
    await page.waitForTimeout(300);

    for (const width of BREAKPOINTS) {
      await page.setViewportSize({ width, height: 1000 });
      await page.waitForTimeout(500);

      const heroHeight = await page.evaluate(() => {
        const hero = document.querySelector('.hero-section');
        if (!hero) return 0;
        return hero.getBoundingClientRect().height;
      });

      measurements[theme][width] = Math.round(heroHeight);
      console.log(`  ${width}px: ${measurements[theme][width]}px`);
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('Summary:');
  console.log('='.repeat(50));
  console.log('\nLight Mode:', Object.entries(measurements.light).map(([w, h]) => `${w}px: ${h}px`).join(', '));
  console.log('Dark Mode:', Object.entries(measurements.dark).map(([w, h]) => `${w}px: ${h}px`).join(', '));
  console.log('');

  await browser.close();
}

measureHeroHeights().catch(console.error);
