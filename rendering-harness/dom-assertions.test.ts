import { test, expect } from '@playwright/test';
import { waitForHarnessRender } from './test-helpers';

test.describe('DOM Assertions - Pass/Fail Validation', () => {
  test('PASS: detects expected display math', async ({ page }) => {
    await page.goto('/?modelId=test&content=' + encodeURIComponent('$$x^2 + y^2 = 1$$'));
    await waitForHarnessRender(page);
    
    const validation = await page.evaluate(() => {
      const container = document.querySelector('[data-render-container]');
      if (!container) return null;
      
      const hasDisplayMath = container.querySelectorAll('.katex-display').length > 0;
      return {
        pass: hasDisplayMath,
        feature: 'displayMath',
        found: hasDisplayMath,
      };
    });
    
    expect(validation?.pass).toBe(true);
    expect(validation?.found).toBe(true);
  });
  
  test('FAIL: missing expected display math', async ({ page }) => {
    await page.goto('/?modelId=test&content=' + encodeURIComponent('Just plain text'));
    await waitForHarnessRender(page);
    
    const validation = await page.evaluate(() => {
      const container = document.querySelector('[data-render-container]');
      if (!container) return null;
      
      const hasDisplayMath = container.querySelectorAll('.katex-display').length > 0;
      const expected = true;
      return {
        pass: hasDisplayMath === expected,
        feature: 'displayMath',
        expected,
        found: hasDisplayMath,
      };
    });
    
    // Should FAIL - expected math but found none
    expect(validation?.pass).toBe(false);
    expect(validation?.found).toBe(false);
  });
  
  test('FAIL: KaTeX errors present', async ({ page }) => {
    // Genuinely invalid LaTeX
    await page.goto('/?modelId=test&content=' + encodeURIComponent('$$\\frac{a{b}$$'));
    await waitForHarnessRender(page);
    
    const validation = await page.evaluate(() => {
      const container = document.querySelector('[data-render-container]');
      if (!container) return null;
      
      const mathErrors = container.querySelectorAll('.katex-error');
      const noErrors = mathErrors.length === 0;
      return {
        pass: noErrors,
        feature: 'noKatexErrors',
        expected: 'no errors',
        found: mathErrors.length > 0 ? `${mathErrors.length} errors` : 'no errors',
      };
    });
    
    // Should FAIL - expected no errors but found errors
    expect(validation?.pass).toBe(false);
  });
  
  test('PASS: expected table structure present', async ({ page }) => {
    const content = '| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |';
    await page.goto('/?modelId=test&content=' + encodeURIComponent(content));
    await waitForHarnessRender(page);
    
    const validation = await page.evaluate(() => {
      const container = document.querySelector('[data-render-container]');
      if (!container) return null;
      
      const tables = container.querySelectorAll('table');
      const cellCount = container.querySelectorAll('td, th').length;
      const hasTable = tables.length > 0;
      const hasMinCells = cellCount >= 4;
      
      return {
        pass: hasTable && hasMinCells,
        feature: 'table',
        found: { tables: tables.length, cells: cellCount },
      };
    });
    
    expect(validation?.pass).toBe(true);
    expect(validation?.found.tables).toBeGreaterThan(0);
    expect(validation?.found.cells).toBeGreaterThanOrEqual(4);
  });
  
  test('FAIL: missing expected nested lists', async ({ page }) => {
    // Only 2 levels - not 3+
    const content = '- L1\n  - L2';
    await page.goto('/?modelId=test&content=' + encodeURIComponent(content));
    await waitForHarnessRender(page);
    
    const validation = await page.evaluate(() => {
      const container = document.querySelector('[data-render-container]');
      if (!container) return null;
      
      const nestedLists = container.querySelectorAll('ul ul ul, ol ol ol');
      const has3Levels = nestedLists.length > 0;
      const expected = true;
      
      return {
        pass: has3Levels === expected,
        feature: 'nestedLists',
        expected: '3+ levels',
        found: has3Levels ? '3+ levels' : 'less than 3 levels',
      };
    });
    
    // Should FAIL - expected 3+ levels but found only 2
    expect(validation?.pass).toBe(false);
  });
  
  test('FAIL: unsafe javascript: links present', async ({ page }) => {
    const content = '[Click me](javascript:alert(1))';
    await page.goto('/?modelId=test&content=' + encodeURIComponent(content));
    await waitForHarnessRender(page);
    
    const validation = await page.evaluate(() => {
      const container = document.querySelector('[data-render-container]');
      if (!container) return null;
      
      const links = container.querySelectorAll('a[href]');
      const unsafeLinks = Array.from(links)
        .map((a: any) => a.href)
        .filter(href => href.startsWith('javascript:'));
      const allSafe = unsafeLinks.length === 0;
      
      return {
        pass: allSafe,
        feature: 'safeLinks',
        expected: 'all links safe',
        found: allSafe ? 'all safe' : `${unsafeLinks.length} unsafe`,
      };
    });
    
    // Should FAIL - found unsafe links
    expect(validation?.pass).toBe(false);
  });
  
  test('PASS: currency preserved in plain text', async ({ page }) => {
    const content = 'Price is $5 and $10';
    await page.goto('/?modelId=test&content=' + encodeURIComponent(content));
    await waitForHarnessRender(page);
    
    const validation = await page.evaluate(() => {
      const container = document.querySelector('[data-render-container]');
      if (!container) return null;
      
      const text = container.textContent || '';
      const hasCurrency = /\$\d+/.test(text);
      
      return {
        pass: hasCurrency,
        feature: 'currency',
        found: hasCurrency ? 'currency preserved' : 'currency not found',
      };
    });
    
    expect(validation?.pass).toBe(true);
  });
  
  test('PASS: code block dollar signs preserved', async ({ page }) => {
    const content = '```python\nprice = $50\n```';
    await page.goto('/?modelId=test&content=' + encodeURIComponent(content));
    await waitForHarnessRender(page);
    
    const validation = await page.evaluate(() => {
      const container = document.querySelector('[data-render-container]');
      if (!container) return null;
      
      const codeBlocks = container.querySelectorAll('pre code');
      let foundDollar = false;
      for (const block of codeBlocks) {
        if (block.textContent?.includes('$')) {
          foundDollar = true;
          break;
        }
      }
      
      return {
        pass: foundDollar,
        feature: 'codeDollars',
        found: foundDollar ? 'dollars preserved' : 'dollars not found',
      };
    });
    
    expect(validation?.pass).toBe(true);
  });
});
