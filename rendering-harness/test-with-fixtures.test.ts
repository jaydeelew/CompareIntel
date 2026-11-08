/**
 * Offline fixture tests for the rendering harness
 * These tests verify feature coverage detection without making API calls
 */

import { test, expect } from '@playwright/test';
import { waitForHarnessRender } from './test-helpers';

test.describe('Harness Feature Coverage Detection', () => {
  test('detects display math correctly', async ({ page }) => {
    await page.goto('/?modelId=test&content=' + encodeURIComponent('$$x^2 + y^2 = r^2$$'));
    await waitForHarnessRender(page);
    
    const coverage = await page.evaluate(() => {
      const container = document.querySelector('[data-render-container]');
      if (!container) return null;
      
      return {
        hasDisplayMath: container.querySelectorAll('.katex-display').length > 0,
        hasInlineMath: container.querySelectorAll('.katex:not(.katex-display)').length > 0,
      };
    });
    
    expect(coverage?.hasDisplayMath).toBe(true);
  });
  
  test('detects inline math correctly', async ({ page }) => {
    await page.goto('/?modelId=test&content=' + encodeURIComponent('The formula $x = 5$ is inline'));
    await waitForHarnessRender(page);
    
    const coverage = await page.evaluate(() => {
      const container = document.querySelector('[data-render-container]');
      if (!container) return null;
      
      return {
        hasInlineMath: container.querySelectorAll('.katex:not(.katex-display)').length > 0,
      };
    });
    
    expect(coverage?.hasInlineMath).toBe(true);
  });
  
  test('detects code blocks correctly', async ({ page }) => {
    const content = '```python\nprint("hello")\n```';
    await page.goto('/?modelId=test&content=' + encodeURIComponent(content));
    await waitForHarnessRender(page);
    
    const coverage = await page.evaluate(() => {
      const container = document.querySelector('[data-render-container]');
      if (!container) return null;
      
      const codeBlocks = container.querySelectorAll('pre code');
      return {
        hasCodeBlocks: codeBlocks.length > 0,
        codeBlockLanguages: Array.from(codeBlocks).map((block) => {
          const classes = Array.from((block as HTMLElement).classList);
          const langClass = classes.find((c) => c.startsWith('language-'));
          return langClass ? langClass.replace('language-', '') : 'plain';
        }),
      };
    });
    
    expect(coverage?.hasCodeBlocks).toBe(true);
    expect(coverage?.codeBlockLanguages).toContain('python');
  });
  
  test('detects tables correctly', async ({ page }) => {
    const content = '| A | B |\n|---|---|\n| 1 | 2 |';
    await page.goto('/?modelId=test&content=' + encodeURIComponent(content));
    await waitForHarnessRender(page);
    
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
  });
  
  test('preserves currency correctly (outside math)', async ({ page }) => {
    const content = 'The item costs $5 and shipping is $10.';
    await page.goto('/?modelId=test&content=' + encodeURIComponent(content));
    await waitForHarnessRender(page);
    
    const coverage = await page.evaluate(() => {
      const container = document.querySelector('[data-render-container]');
      if (!container) return null;
      
      const allText = container.textContent || '';
      return {
        preservedCurrency: /\$\d+/.test(allText),
      };
    });
    
    expect(coverage?.preservedCurrency).toBe(true);
  });
  
  test('detects KaTeX errors', async ({ page }) => {
    // Genuinely invalid LaTeX - unbalanced braces
    const content = '$$x = \\frac{a{b}$$';
    await page.goto('/?modelId=test&content=' + encodeURIComponent(content));
    await waitForHarnessRender(page);
    
    const coverage = await page.evaluate(() => {
      const container = document.querySelector('[data-render-container]');
      if (!container) return null;
      
      const mathErrors = container.querySelectorAll('.katex-error');
      return {
        mathErrors: Array.from(mathErrors).map(e => e.textContent || '').slice(0, 5),
      };
    });
    
    expect(coverage?.mathErrors.length).toBeGreaterThan(0);
  });
  
  test('detects links correctly', async ({ page }) => {
    const content = '[OpenAI](https://openai.com) and [Anthropic](https://anthropic.com)';
    await page.goto('/?modelId=test&content=' + encodeURIComponent(content));
    await waitForHarnessRender(page);
    
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
  });
  
  test('detects nested lists (3+ levels)', async ({ page }) => {
    const content = '- L1\n  - L2\n    - L3';
    await page.goto('/?modelId=test&content=' + encodeURIComponent(content));
    await waitForHarnessRender(page);
    
    const coverage = await page.evaluate(() => {
      const container = document.querySelector('[data-render-container]');
      if (!container) return null;
      
      const nestedLists = container.querySelectorAll('ul ul ul, ol ol ol, ul ol ul, ol ul ol');
      return {
        hasNestedLists: nestedLists.length > 0,
      };
    });
    
    expect(coverage?.hasNestedLists).toBe(true);
  });
});

test.describe('Harness Known-Bad Fixtures (should fail)', () => {
  test('FAILS when missing expected display math', async ({ page }) => {
    // Plain text with no math - should detect absence
    await page.goto('/?modelId=test&content=' + encodeURIComponent('Just plain text here'));
    await waitForHarnessRender(page);
    
    const coverage = await page.evaluate(() => {
      const container = document.querySelector('[data-render-container]');
      return {
        hasDisplayMath: container?.querySelectorAll('.katex-display').length! > 0,
      };
    });
    
    // This SHOULD be false for plain text
    expect(coverage.hasDisplayMath).toBe(false);
  });
  
  test('FAILS when KaTeX error present', async ({ page }) => {
    // Invalid LaTeX - unclosed environment
    const content = '$$\\begin{matrix} a & b$$';
    await page.goto('/?modelId=test&content=' + encodeURIComponent(content));
    await waitForHarnessRender(page);
    
    const hasErrors = await page.evaluate(() => {
      const container = document.querySelector('[data-render-container]');
      return container?.querySelectorAll('.katex-error').length! > 0;
    });
    
    // Should detect error
    expect(hasErrors).toBe(true);
  });
  
  test('FAILS when links are javascript: schemes', async ({ page }) => {
    // Unsafe link
    const content = '[Click](javascript:alert(1))';
    await page.goto('/?modelId=test&content=' + encodeURIComponent(content));
    await waitForHarnessRender(page);
    
    const coverage = await page.evaluate(() => {
      const container = document.querySelector('[data-render-container]');
      const links = container?.querySelectorAll('a[href]');
      const safeDests = Array.from(links || [])
        .map((a: any) => a.href)
        .filter(href => !href.startsWith('javascript:'));
      
      return {
        hasUnsafeLinks: links!.length > safeDests.length,
        safeLinksOnly: safeDests.length === links!.length,
      };
    });
    
    // Should detect unsafe link
    expect(coverage.hasUnsafeLinks).toBe(true);
    expect(coverage.safeLinksOnly).toBe(false);
  });

  test('unknown Prism language and empty code still reach complete (no hang)', async ({ page }) => {
    const content = '```not-a-real-language\nhello $world\n```\n\nPlain prose with no code after.';
    await page.goto('/?modelId=test&content=' + encodeURIComponent(content));
    await waitForHarnessRender(page);
    const complete = await page.locator('[data-render-complete]').count();
    expect(complete).toBeGreaterThan(0);
  });
});
