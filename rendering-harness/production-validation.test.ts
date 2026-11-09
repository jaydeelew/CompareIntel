/**
 * Tests for production validateRenderedHTML function
 * Uses actual HTML fixtures to test the validation logic
 */

import { test, expect } from '@playwright/test';
import { validateRenderedHTML } from './dom-assertions.js';

test.describe('Production validateRenderedHTML', () => {
  test('validates display math correctly', () => {
    const htmlWithMath = `<div class="katex-display"><span class="katex">x^2</span></div>`;
    const htmlWithoutMath = `<div>Plain text</div>`;
    
    const passResult = validateRenderedHTML(htmlWithMath, { displayMath: true });
    expect(passResult.pass).toBe(true);
    expect(passResult.coverage.hasDisplayMath).toBe(true);
    
    const failResult = validateRenderedHTML(htmlWithoutMath, { displayMath: true });
    expect(failResult.pass).toBe(false);
    expect(failResult.coverage.hasDisplayMath).toBe(false);
  });
  
  test('validates inline math correctly', () => {
    const htmlWithInline = `<span class="katex">x = 5</span>`;
    const htmlWithoutInline = `<div>x = 5</div>`;
    
    const passResult = validateRenderedHTML(htmlWithInline, { inlineMath: true });
    expect(passResult.pass).toBe(true);
    expect(passResult.coverage.hasInlineMath).toBe(true);
    
    const failResult = validateRenderedHTML(htmlWithoutInline, { inlineMath: true });
    expect(failResult.pass).toBe(false);
  });
  
  test('validates code blocks correctly', () => {
    const htmlWithCode = `<pre><code class="language-python">print("hello")</code></pre>`;
    const htmlWithoutCode = `<div>print("hello")</div>`;
    
    const passResult = validateRenderedHTML(htmlWithCode, { codeBlocks: true });
    expect(passResult.pass).toBe(true);
    expect(passResult.coverage.hasCodeBlocks).toBe(true);
    expect(passResult.coverage.codeBlockLanguages).toContain('python');
    
    const failResult = validateRenderedHTML(htmlWithoutCode, { codeBlocks: true });
    expect(failResult.pass).toBe(false);
  });
  
  test('validates tables correctly', () => {
    const htmlWithTable = `<table><tr><td>Cell</td></tr></table>`;
    const htmlWithoutTable = `<div>Cell</div>`;
    
    const passResult = validateRenderedHTML(htmlWithTable, { tables: true });
    expect(passResult.pass).toBe(true);
    expect(passResult.coverage.hasTables).toBe(true);
    expect(passResult.coverage.tableCellCount).toBeGreaterThan(0);
    
    const failResult = validateRenderedHTML(htmlWithoutTable, { tables: true });
    expect(failResult.pass).toBe(false);
  });
  
  test('validates links correctly', () => {
    const htmlWithLinks = `<a href="https://example.com">Link</a>`;
    const htmlWithoutLinks = `<span>Link</span>`;
    
    const passResult = validateRenderedHTML(htmlWithLinks, { links: true });
    expect(passResult.pass).toBe(true);
    expect(passResult.coverage.hasLinks).toBe(true);
    expect(passResult.coverage.linkDestinations[0]).toMatch(/^https:\/\/example\.com\/?$/);
    
    const failResult = validateRenderedHTML(htmlWithoutLinks, { links: true });
    expect(failResult.pass).toBe(false);
  });
  
  test('validates nested lists correctly', () => {
    const htmlWithNested = `
      <ul>
        <li>Level 1
          <ul>
            <li>Level 2
              <ul><li>Level 3</li></ul>
            </li>
          </ul>
        </li>
      </ul>`;
    const htmlWithoutNested = `<ul><li>Only one level</li></ul>`;
    
    const passResult = validateRenderedHTML(htmlWithNested, { nestedLists: true });
    expect(passResult.pass).toBe(true);
    expect(passResult.coverage.hasNestedLists).toBe(true);
    
    const failResult = validateRenderedHTML(htmlWithoutNested, { nestedLists: true });
    expect(failResult.pass).toBe(false);
  });
  
  test('validates currency preservation correctly', () => {
    const htmlWithCurrency = `<p>The item costs $50 and shipping is $10.</p>`;
    const htmlWithMathDollars = `<span class="katex">$x$</span>`;
    
    const passResult = validateRenderedHTML(htmlWithCurrency, { currency: true });
    expect(passResult.pass).toBe(true);
    expect(passResult.coverage.preservedCurrency).toBe(true);
    
    // Math dollars should not count as currency preservation
    const mathResult = validateRenderedHTML(htmlWithMathDollars, { currency: true });
    expect(mathResult.coverage.preservedCurrency).toBe(false);
  });
  
  test('detects KaTeX errors', () => {
    const htmlWithError = `<span class="katex-error">Parse error</span>`;
    const htmlWithoutError = `<span class="katex">x^2</span>`;
    
    const failResult = validateRenderedHTML(htmlWithError, { noKatexErrors: true });
    expect(failResult.pass).toBe(false);
    expect(failResult.coverage.mathErrors.length).toBeGreaterThan(0);
    
    const passResult = validateRenderedHTML(htmlWithoutError, { noKatexErrors: true });
    expect(passResult.pass).toBe(true);
    expect(passResult.coverage.mathErrors.length).toBe(0);
  });
  
  test('detects unsafe links', () => {
    const htmlWithUnsafe = `<a href="javascript:alert('xss')">Click</a>`;
    const htmlWithSafe = `<a href="https://example.com">Click</a>`;
    
    const failResult = validateRenderedHTML(htmlWithUnsafe, { safeLinksOnly: true });
    expect(failResult.pass).toBe(false);
    expect(failResult.coverage.hasUnsafeLinks).toBe(true);
    
    const passResult = validateRenderedHTML(htmlWithSafe, { safeLinksOnly: true });
    expect(passResult.pass).toBe(true);
    expect(passResult.coverage.hasUnsafeLinks).toBe(false);
  });
  
  test('returns detailed assertion results', () => {
    const html = `<div>No math here</div>`;
    const result = validateRenderedHTML(html, { 
      displayMath: true,
      inlineMath: true,
      codeBlocks: true 
    });
    
    expect(result.pass).toBe(false);
    expect(result.assertions.length).toBeGreaterThan(0);
    
    const failedAssertions = result.assertions.filter(a => !a.pass);
    expect(failedAssertions.length).toBe(3); // All three features missing
    
    failedAssertions.forEach(assertion => {
      expect(assertion).toHaveProperty('expected');
      expect(assertion).toHaveProperty('actual');
      expect(assertion).toHaveProperty('message');
    });
  });
});
