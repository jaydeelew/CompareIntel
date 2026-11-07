/**
 * Offline fixture tests for the rendering harness
 * These tests verify feature coverage detection without making API calls
 */

import { test, expect } from '@playwright/test';
import { chromium } from 'playwright';

test.describe('Harness Feature Coverage Detection', () => {
  test('detects display math correctly', async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    
    await page.goto('http://localhost:5174/?modelId=test&content=' + encodeURIComponent('$$x^2 + y^2 = r^2$$'));
    await page.waitForSelector('[data-render-complete]', { timeout: 5000 });
    
    const coverage = await page.evaluate(() => {
      const container = document.querySelector('[data-render-container]');
      if (!container) return null;
      
      return {
        hasDisplayMath: container.querySelectorAll('.katex-display').length > 0,
        hasInlineMath: container.querySelectorAll('.katex:not(.katex-display)').length > 0,
      };
    });
    
    expect(coverage?.hasDisplayMath).toBe(true);
    await browser.close();
  });
  
  test('detects inline math correctly', async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    
    await page.goto('http://localhost:5174/?modelId=test&content=' + encodeURIComponent('The formula $x = 5$ is inline'));
    await page.waitForSelector('[data-render-complete]', { timeout: 5000 });
    
    const coverage = await page.evaluate(() => {
      const container = document.querySelector('[data-render-container]');
      if (!container) return null;
      
      return {
        hasInlineMath: container.querySelectorAll('.katex:not(.katex-display)').length > 0,
      };
    });
    
    expect(coverage?.hasInlineMath).toBe(true);
    await browser.close();
  });
  
  test('detects code blocks correctly', async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    
    const content = '```python\nprint("hello")\n```';
    await page.goto('http://localhost:5174/?modelId=test&content=' + encodeURIComponent(content));
    await page.waitForSelector('[data-render-complete]', { timeout: 5000 });
    
    const coverage = await page.evaluate(() => {
      const container = document.querySelector('[data-render-container]');
      if (!container) return null;
      
      const codeBlocks = container.querySelectorAll('pre code');
      return {
        hasCodeBlocks: codeBlocks.length > 0,
        codeBlockLanguages: Array.from(codeBlocks).map((block: any) => {
          const classes = Array.from(block.classList);
          const langClass = classes.find((c: any) => c.startsWith('language-'));
          return langClass ? langClass.replace('language-', '') : 'plain';
        }),
      };
    });
    
    expect(coverage?.hasCodeBlocks).toBe(true);
    expect(coverage?.codeBlockLanguages).toContain('python');
    await browser.close();
  });
  
  test('detects tables correctly', async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    
    const content = '| A | B |\n|---|---|\n| 1 | 2 |';
    await page.goto('http://localhost:5174/?modelId=test&content=' + encodeURIComponent(content));
    await page.waitForSelector('[data-render-complete]', { timeout: 5000 });
    
    const coverage = await page.evaluate(() => {
      const container = document.querySelector('[data-render-container]');
      if (!container) return null;
      
      return {
        hasTables: container.querySelectorAll('table').length > 0,
        tableCellCount: container.querySelectorAll('td, th').length,
      };
    });
    
    expect(coverage?.hasTables).toBe(true);
    expect(coverage?.tableCellCount).toBeGreaterThan(0);
    await browser.close();
  });
  
  test('preserves currency correctly (outside math)', async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    
    const content = 'The item costs $5 and shipping is $10.';
    await page.goto('http://localhost:5174/?modelId=test&content=' + encodeURIComponent(content));
    await page.waitForSelector('[data-render-complete]', { timeout: 5000 });
    
    const coverage = await page.evaluate(() => {
      const container = document.querySelector('[data-render-container]');
      if (!container) return null;
      
      const allText = container.textContent || '';
      return {
        preservedCurrency: /\$\d+/.test(allText),
      };
    });
    
    expect(coverage?.preservedCurrency).toBe(true);
    await browser.close();
  });
  
  test('detects KaTeX errors', async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    
    // Invalid LaTeX that should cause an error
    const content = '$$\\invalid{syntax}$$';
    await page.goto('http://localhost:5174/?modelId=test&content=' + encodeURIComponent(content));
    await page.waitForSelector('[data-render-complete]', { timeout: 5000 });
    
    const coverage = await page.evaluate(() => {
      const container = document.querySelector('[data-render-container]');
      if (!container) return null;
      
      const mathErrors = container.querySelectorAll('.katex-error');
      return {
        mathErrors: Array.from(mathErrors).map(e => e.textContent || '').slice(0, 5),
      };
    });
    
    expect(coverage?.mathErrors.length).toBeGreaterThan(0);
    await browser.close();
  });
  
  test('detects links correctly', async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    
    const content = '[OpenAI](https://openai.com) and [Anthropic](https://anthropic.com)';
    await page.goto('http://localhost:5174/?modelId=test&content=' + encodeURIComponent(content));
    await page.waitForSelector('[data-render-complete]', { timeout: 5000 });
    
    const coverage = await page.evaluate(() => {
      const container = document.querySelector('[data-render-container]');
      if (!container) return null;
      
      const links = container.querySelectorAll('a[href]');
      return {
        hasLinks: links.length > 0,
        linkDestinations: Array.from(links)
          .map((a: any) => a.href)
          .filter(href => !href.startsWith('javascript:')),
      };
    });
    
    expect(coverage?.hasLinks).toBe(true);
    expect(coverage?.linkDestinations.length).toBeGreaterThan(0);
    await browser.close();
  });
  
  test('detects nested lists (3+ levels)', async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    
    const content = '- L1\n  - L2\n    - L3';
    await page.goto('http://localhost:5174/?modelId=test&content=' + encodeURIComponent(content));
    await page.waitForSelector('[data-render-complete]', { timeout: 5000 });
    
    const coverage = await page.evaluate(() => {
      const container = document.querySelector('[data-render-container]');
      if (!container) return null;
      
      const nestedLists = container.querySelectorAll('ul ul ul, ol ol ol, ul ol ul, ol ul ol');
      return {
        hasNestedLists: nestedLists.length > 0,
      };
    });
    
    expect(coverage?.hasNestedLists).toBe(true);
    await browser.close();
  });
});
