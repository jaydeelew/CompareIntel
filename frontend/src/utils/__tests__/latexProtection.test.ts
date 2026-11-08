import { describe, expect, it } from 'vitest'

import {
  LITERAL_DOLLAR,
  convertListPlaceholdersToHTML,
  extractInlineCode,
  markBlockquotes,
  processMarkdownLists,
  protectCurrencyDollars,
  protectEscapedDollars,
  renderBlockquoteMarkers,
  restoreInlineCode,
  restoreLiteralDollars,
  safeRenderKatex,
} from '../latex'

const L = LITERAL_DOLLAR

describe('protectCurrencyDollars', () => {
  it.each([
    ['costs $5 and the shipping is $10', `costs ${L}5 and the shipping is ${L}10`],
    ['a $1,200 laptop, $300 monitor', `a ${L}1,200 laptop, ${L}300 monitor`],
    ['for a total of $15.', `for a total of ${L}15.`],
    ['$5-$10 range', `${L}5-${L}10 range`],
    ['between $5 and $x$ here', `between ${L}5 and $x$ here`],
  ])('treats %j as currency', (input, expected) => {
    expect(protectCurrencyDollars(input)).toBe(expected)
  })

  it.each(['$x$', '$5x+3$', '$100$ represents', '$a^2 + b^2 = c^2$', 'Let $x$ and $y = 2$'])(
    'leaves real inline math %j untouched',
    input => {
      expect(protectCurrencyDollars(input)).toBe(input)
    }
  )

  it('leaves padded inline math with spaces inside the dollars untouched (Qwen 04)', () => {
    const input = "1. The derivative $ f'(x) $\n2. The integral $ \\int f(x) \\, dx $"
    expect(protectCurrencyDollars(input)).toBe(input)
  })

  it('pairs dollars per table cell', () => {
    expect(protectCurrencyDollars('| $0.03 | Claude | 200k | $0.02 |')).toBe(
      `| ${L}0.03 | Claude | 200k | ${L}0.02 |`
    )
    expect(protectCurrencyDollars('| Sum | $\\sum_{i=1}^{n} i$ | $n!$ |')).toBe(
      '| Sum | $\\sum_{i=1}^{n} i$ | $n!$ |'
    )
    expect(protectCurrencyDollars('| $x | y$ |')).toBe(`| ${L}x | y${L} |`)
  })

  it('ignores $$ display delimiters', () => {
    expect(protectCurrencyDollars('$$x$$ costs $5')).toBe(`$$x$$ costs ${L}5`)
  })

  it('does not pair $HOME with a later currency $', () => {
    expect(protectCurrencyDollars('The shell variable $HOME is set. Price: $99.99.')).toBe(
      `The shell variable ${L}HOME is set. Price: ${L}99.99.`
    )
  })
})

describe('escaped dollars', () => {
  it('turns \\$ into a literal token but leaves \\\\$ alone', () => {
    expect(protectEscapedDollars('costs \\$5 and \\$10')).toBe(`costs ${L}5 and ${L}10`)
    expect(protectEscapedDollars('a \\\\$x$')).toBe('a \\\\$x$')
    expect(restoreLiteralDollars(`${L}5`)).toBe('$5')
  })

  it('renders literal tokens inside math as \\$', () => {
    const html = safeRenderKatex(`= ${L}150`, false)
    expect(html).toContain('katex')
    expect(html).not.toContain('katex-error')
    expect(html).toContain('\\&#36;150')
  })
})

describe('inline code protection', () => {
  it('round-trips spans as escaped <code>', () => {
    const { text, spans } = extractInlineCode('The variable `x^2` and `<b>` and `$price`.')
    expect(text).not.toContain('`')
    expect(text).not.toContain('x^2')
    expect(spans).toEqual(['x^2', '<b>', '$price'])
    expect(restoreInlineCode(text, spans)).toBe(
      'The variable <code class="inline-code">x^2</code> and <code class="inline-code">&lt;b&gt;</code> and <code class="inline-code">$price</code>.'
    )
  })

  it('keeps `` `$x$` `` as one code span so $x$ is not math (GLM 5 05)', () => {
    const { text, spans } = extractInlineCode(
      'In Markdown, writing `` `$x$` `` renders as inline code, whereas writing $y$ renders as math.'
    )
    expect(spans).toEqual(['`$x$`'])
    expect(text).not.toContain('$x$')
    expect(text).toContain('$y$')
    expect(restoreInlineCode(text, spans)).toContain('<code class="inline-code">`$x$`</code>')
  })
})

describe('blockquotes', () => {
  it('strips nested > markers so leftover quotes are not visible (GLM 5 05)', () => {
    const marked = markBlockquotes(
      '> **Euler**\n> $$ e^{i\\pi} + 1 = 0 $$\n>\n> > Nested quote containing inline code:\n> > You can verify this.'
    )
    expect(marked).not.toMatch(/^>/m)
    expect(marked).not.toContain('> Nested')
    expect(marked).toContain('Nested quote containing inline code:')
  })

  it('strips > markers and wraps the run', () => {
    const marked = markBlockquotes('Intro\n> This is a blockquote\n> with multiple lines\nAfter')
    expect(marked).not.toContain('>')
    const html = renderBlockquoteMarkers(marked)
    expect(html).toMatch(
      /<blockquote class="markdown-blockquote"[^>]*>This is a blockquote\nwith multiple lines<\/blockquote>/
    )
    expect(html).toContain('Intro')
    expect(html).toContain('After')
  })

  it('exposes quoted list items to list processing', () => {
    const marked = markBlockquotes('> Note:\n> - one\n> - two')
    expect(processMarkdownLists(marked)).toContain('__UL_0__one__/UL__\n__UL_0__two__/UL__')
  })
})

describe('lists', () => {
  it('does not count the preceding blank line as indentation', () => {
    expect(processMarkdownLists('Intro\n\n1. First\n2. Second')).toContain(
      '\n\n__OL_0_1__First__/OL__\n__OL_0_2__Second__/OL__'
    )
  })

  it('keeps the blank line after an ordered list', () => {
    expect(processMarkdownLists('1. Third item\n\n## Tables')).toBe(
      '__OL_0_1__Third item__/OL__\n\n## Tables'
    )
  })

  it('builds nested ordered and mixed lists', () => {
    const placeholders = processMarkdownLists(
      '1. First item\n   1. Nested first\n   2. Nested second\n2. Second item\n   - bullet'
    )
    expect(convertListPlaceholdersToHTML(placeholders)).toBe(
      '<ol><li value="1">First item<ol><li value="1">Nested first</li><li value="2">Nested second</li></ol></li>' +
        '<li value="2">Second item<ul><li>bullet</li></ul></li></ol>'
    )
  })

  it('merges indented continuation lines into the bullet above', () => {
    expect(processMarkdownLists('- Calculate:  \n     $c = 5$\n- Next')).toBe(
      '__UL_0__Calculate:<br>$c = 5$__/UL__\n__UL_0__Next__/UL__'
    )
  })

  it('applies bold to ordered-list continuation lines (Gemini 04 leftover **)', () => {
    const out = processMarkdownLists(
      '2. **Find critical points**:\n   Thus the points are at **$x = 0$** and **$x = 2$**.\n'
    )
    expect(out).toContain('<strong>$x = 0$</strong>')
    expect(out).toContain('<strong>$x = 2$</strong>')
    expect(out).not.toContain('**$x = 0$**')
  })
})
