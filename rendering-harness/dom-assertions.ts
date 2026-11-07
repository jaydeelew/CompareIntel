/**
 * DOM assertion validation for rendered responses
 * Checks if expected features are present based on prompt requirements
 */

export interface AssertionResult {
  pass: boolean;
  expected: string;
  actual: string;
  message: string;
}

export interface ValidationResult {
  pass: boolean;
  assertions: AssertionResult[];
  coverage: {
    hasDisplayMath: boolean;
    hasInlineMath: boolean;
    hasCodeBlocks: boolean;
    hasTables: boolean;
    hasLinks: boolean;
    hasNestedLists: boolean;
    mathErrors: string[];
    preservedCurrency: boolean;
    preservedCodeDollars: boolean;
    linkDestinations: string[];
    tableCellCount: number;
    codeBlockLanguages: string[];
    hasUnsafeLinks: boolean;
  };
}

/**
 * Validate rendered HTML against expected features
 */
export function validateRenderedHTML(
  html: string,
  expectedFeatures: {
    displayMath?: boolean;
    inlineMath?: boolean;
    codeBlocks?: boolean;
    tables?: boolean;
    links?: boolean;
    nestedLists?: boolean;
    currency?: boolean;
    noKatexErrors?: boolean;
    safeLinksOnly?: boolean;
  }
): ValidationResult {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const container = doc.body;
  
  const assertions: AssertionResult[] = [];
  
  // Check display math
  const displayMath = container.querySelectorAll('.katex-display');
  const hasDisplayMath = displayMath.length > 0;
  if (expectedFeatures.displayMath !== undefined) {
    assertions.push({
      pass: hasDisplayMath === expectedFeatures.displayMath,
      expected: expectedFeatures.displayMath ? 'display math present' : 'no display math',
      actual: hasDisplayMath ? `${displayMath.length} display math blocks` : 'no display math',
      message: expectedFeatures.displayMath && !hasDisplayMath 
        ? 'Expected display math ($$...$$) but none found'
        : !expectedFeatures.displayMath && hasDisplayMath
        ? 'Did not expect display math but found it'
        : 'Display math assertion passed',
    });
  }
  
  // Check inline math
  const inlineMath = container.querySelectorAll('.katex:not(.katex-display)');
  const hasInlineMath = inlineMath.length > 0;
  if (expectedFeatures.inlineMath !== undefined) {
    assertions.push({
      pass: hasInlineMath === expectedFeatures.inlineMath,
      expected: expectedFeatures.inlineMath ? 'inline math present' : 'no inline math',
      actual: hasInlineMath ? `${inlineMath.length} inline math expressions` : 'no inline math',
      message: expectedFeatures.inlineMath && !hasInlineMath
        ? 'Expected inline math ($...$) but none found'
        : !expectedFeatures.inlineMath && hasInlineMath
        ? 'Did not expect inline math but found it'
        : 'Inline math assertion passed',
    });
  }
  
  // Check code blocks
  const codeBlocks = container.querySelectorAll('pre code');
  const hasCodeBlocks = codeBlocks.length > 0;
  const codeBlockLanguages = Array.from(codeBlocks).map(block => {
    const classes = Array.from(block.classList);
    const langClass = classes.find(c => c.startsWith('language-'));
    return langClass ? langClass.replace('language-', '') : 'plain';
  }).filter((v, i, a) => a.indexOf(v) === i);
  
  if (expectedFeatures.codeBlocks !== undefined) {
    assertions.push({
      pass: hasCodeBlocks === expectedFeatures.codeBlocks,
      expected: expectedFeatures.codeBlocks ? 'code blocks present' : 'no code blocks',
      actual: hasCodeBlocks ? `${codeBlocks.length} code blocks (${codeBlockLanguages.join(', ')})` : 'no code blocks',
      message: expectedFeatures.codeBlocks && !hasCodeBlocks
        ? 'Expected code blocks (```...```) but none found'
        : !expectedFeatures.codeBlocks && hasCodeBlocks
        ? 'Did not expect code blocks but found them'
        : 'Code blocks assertion passed',
    });
  }
  
  // Check tables
  const tables = container.querySelectorAll('table');
  const hasTables = tables.length > 0;
  const tableCellCount = container.querySelectorAll('td, th').length;
  
  if (expectedFeatures.tables !== undefined) {
    assertions.push({
      pass: hasTables === expectedFeatures.tables,
      expected: expectedFeatures.tables ? 'tables present' : 'no tables',
      actual: hasTables ? `${tables.length} tables (${tableCellCount} cells)` : 'no tables',
      message: expectedFeatures.tables && !hasTables
        ? 'Expected tables but none found'
        : !expectedFeatures.tables && hasTables
        ? 'Did not expect tables but found them'
        : 'Tables assertion passed',
    });
  }
  
  // Check links
  const links = container.querySelectorAll('a[href]');
  const hasLinks = links.length > 0;
  const linkDestinations = Array.from(links)
    .map((a: any) => a.href)
    .slice(0, 10);
  const unsafeLinks = linkDestinations.filter(href => href.startsWith('javascript:'));
  const hasUnsafeLinks = unsafeLinks.length > 0;
  
  if (expectedFeatures.links !== undefined) {
    assertions.push({
      pass: hasLinks === expectedFeatures.links,
      expected: expectedFeatures.links ? 'links present' : 'no links',
      actual: hasLinks ? `${links.length} links` : 'no links',
      message: expectedFeatures.links && !hasLinks
        ? 'Expected links but none found'
        : !expectedFeatures.links && hasLinks
        ? 'Did not expect links but found them'
        : 'Links assertion passed',
    });
  }
  
  if (expectedFeatures.safeLinksOnly !== undefined && expectedFeatures.safeLinksOnly) {
    assertions.push({
      pass: !hasUnsafeLinks,
      expected: 'all links safe (no javascript:)',
      actual: hasUnsafeLinks ? `${unsafeLinks.length} unsafe links: ${unsafeLinks.join(', ')}` : 'all links safe',
      message: hasUnsafeLinks
        ? `Found unsafe javascript: links: ${unsafeLinks.join(', ')}`
        : 'All links are safe',
    });
  }
  
  // Check nested lists
  const nestedLists = container.querySelectorAll('ul ul ul, ol ol ol, ul ol ul, ol ul ol');
  const hasNestedLists = nestedLists.length > 0;
  
  if (expectedFeatures.nestedLists !== undefined) {
    assertions.push({
      pass: hasNestedLists === expectedFeatures.nestedLists,
      expected: expectedFeatures.nestedLists ? '3+ level nested lists' : 'no nested lists',
      actual: hasNestedLists ? `${nestedLists.length} nested list structures` : 'no nested lists',
      message: expectedFeatures.nestedLists && !hasNestedLists
        ? 'Expected 3+ level nested lists but none found'
        : !expectedFeatures.nestedLists && hasNestedLists
        ? 'Did not expect nested lists but found them'
        : 'Nested lists assertion passed',
    });
  }
  
  // Check preserved currency
  const allText = container.textContent || '';
  const preservedCurrency = /\$\d+/.test(allText);
  
  if (expectedFeatures.currency !== undefined) {
    assertions.push({
      pass: preservedCurrency === expectedFeatures.currency,
      expected: expectedFeatures.currency ? 'preserved currency ($N)' : 'no currency',
      actual: preservedCurrency ? 'found $N patterns' : 'no currency found',
      message: expectedFeatures.currency && !preservedCurrency
        ? 'Expected preserved currency ($5, $10, etc.) but none found'
        : !expectedFeatures.currency && preservedCurrency
        ? 'Did not expect currency but found it'
        : 'Currency assertion passed',
    });
  }
  
  // Check for KaTeX errors
  const mathErrors = container.querySelectorAll('.katex-error');
  const hasMathErrors = mathErrors.length > 0;
  
  if (expectedFeatures.noKatexErrors !== undefined && expectedFeatures.noKatexErrors) {
    assertions.push({
      pass: !hasMathErrors,
      expected: 'no KaTeX errors',
      actual: hasMathErrors ? `${mathErrors.length} KaTeX errors` : 'no errors',
      message: hasMathErrors
        ? `Found ${mathErrors.length} KaTeX rendering errors`
        : 'No KaTeX errors',
    });
  }
  
  // Check code dollar preservation
  const preservedCodeDollars = Array.from(codeBlocks).some(block => 
    block.textContent?.includes('$')
  );
  
  const allPass = assertions.every(a => a.pass);
  
  return {
    pass: allPass,
    assertions,
    coverage: {
      hasDisplayMath,
      hasInlineMath,
      hasCodeBlocks,
      hasTables,
      hasLinks,
      hasNestedLists,
      mathErrors: Array.from(mathErrors).map(e => e.textContent || '').slice(0, 5),
      preservedCurrency,
      preservedCodeDollars,
      linkDestinations,
      tableCellCount,
      codeBlockLanguages,
      hasUnsafeLinks,
    },
  };
}
