#!/usr/bin/env node

/**
 * Measure hero pricing line contrast ratios using Playwright
 * Run with: node scripts/measure-pricing-contrast.js
 */

import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getRelativeLuminance(r, g, b) {
  const rsrgb = r / 255;
  const gsrgb = g / 255;
  const bsrgb = b / 255;

  const rlin = rsrgb <= 0.03928 ? rsrgb / 12.92 : Math.pow((rsrgb + 0.055) / 1.055, 2.4);
  const glin = gsrgb <= 0.03928 ? gsrgb / 12.92 : Math.pow((gsrgb + 0.055) / 1.055, 2.4);
  const blin = bsrgb <= 0.03928 ? bsrgb / 12.92 : Math.pow((bsrgb + 0.055) / 1.055, 2.4);

  return 0.2126 * rlin + 0.7152 * glin + 0.0722 * blin;
}

function getContrastRatio(rgb1, rgb2) {
  const l1 = getRelativeLuminance(rgb1[0], rgb1[1], rgb1[2]);
  const l2 = getRelativeLuminance(rgb2[0], rgb2[1], rgb2[2]);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function rgbStringToArray(rgb) {
  const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return [0, 0, 0];
  return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
}

async function measureContrast() {
  console.log('\n🔍 Measuring Hero Pricing Line Contrast Ratios...\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const distPath = path.join(__dirname, '..', 'dist', 'index.html');
  await page.goto(`http://localhost:8080/`);
  await page.waitForTimeout(1500);

  const results = {};

  for (const theme of ['light', 'dark']) {
    console.log(`\n${theme.toUpperCase()} MODE:`);
    console.log('─'.repeat(50));

    await page.evaluate((t) => {
      document.documentElement.setAttribute('data-theme', t);
    }, theme);
    await page.waitForTimeout(500);

    // Verify theme was applied
    const appliedTheme = await page.evaluate(() => {
      return document.documentElement.getAttribute('data-theme');
    });
    console.log(`  Applied theme: ${appliedTheme}`);

    // Check if element exists
    const elementExists = await page.evaluate(() => {
      const el = document.querySelector('.hero-pricing-line');
      return el !== null;
    });
    console.log(`  Element exists: ${elementExists}`);

    const { textColor, bgColor } = await page.evaluate((currentTheme) => {
      const el = document.querySelector('.hero-pricing-line');
      if (!el) return { textColor: '', bgColor: '' };
      const styles = window.getComputedStyle(el);
      
      let bgEl = el;
      let bg = '';
      while (bgEl && !bg) {
        const bgStyle = window.getComputedStyle(bgEl);
        const bgColorVal = bgStyle.backgroundColor;
        if (bgColorVal && bgColorVal !== 'rgba(0, 0, 0, 0)' && bgColorVal !== 'transparent') {
          bg = bgColorVal;
          break;
        }
        bgEl = bgEl.parentElement;
      }
      
      return {
        textColor: styles.color,
        bgColor: bg || (currentTheme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(17, 24, 39)'),
      };
    }, theme);

    const textRgb = rgbStringToArray(textColor);
    const bgRgb = rgbStringToArray(bgColor);
    const contrast = getContrastRatio(textRgb, bgRgb);

    results[theme] = {
      textColor,
      bgColor,
      contrast: contrast.toFixed(2),
      wcagAA: contrast >= 4.5,
    };

    console.log(`  Text: ${textColor}`);
    console.log(`  Background: ${bgColor}`);
    console.log(`  Contrast: ${contrast.toFixed(2)}:1`);
    console.log(`  WCAG AA: ${contrast >= 4.5 ? '✓ PASS' : '✗ FAIL'}`);
  }

  console.log('\n' + '='.repeat(50));
  console.log('Summary:');
  console.log('='.repeat(50));
  console.log(`\nLight Mode: ${results.light.contrast}:1 (${results.light.wcagAA ? 'PASS' : 'FAIL'})`);
  console.log(`Dark Mode: ${results.dark.contrast}:1 (${results.dark.wcagAA ? 'PASS' : 'FAIL'})`);
  console.log('');

  await browser.close();
}

measureContrast().catch(console.error);
