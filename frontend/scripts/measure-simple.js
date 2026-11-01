#!/usr/bin/env node
/**
 * Simple hero background height measurement - just loads page naturally (signed out)
 */
import { chromium } from 'playwright';

const WIDTHS = [320, 375, 390, 414, 430, 768, 820, 1024, 1280, 1440, 1920];

async function measure() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const results = { light: {}, dark: {} };
  
  for (const theme of ['light', 'dark']) {
    await page.goto('http://localhost:8080/');
    await page.evaluate((t) => {
      document.documentElement.setAttribute('data-theme', t);
    }, theme);
    await page.waitForTimeout(300);
    
    console.log(`\n${theme.toUpperCase()}:`);
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 1080 });
      await page.waitForTimeout(200);
      
      const height = await page.evaluate(() => {
        const hero = document.querySelector('.hero-section');
        return hero ? Math.round(hero.getBoundingClientRect().height) : 0;
      });
      
      results[theme][width] = height;
      console.log(`  ${width}px: ${height}px`);
    }
  }
  
  await browser.close();
  return results;
}

measure().catch(console.error);
