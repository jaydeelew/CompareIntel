/**
 * Regression tests for shared LatexRenderer bugs found by the model rendering QA harness
 * (rendering-harness/runs/2026-11-04). Inputs are minimal snippets of real model replies,
 * rendered with each model's production renderer config.
 */
import { render } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'

import { initializeRegistry } from '../../config/loadModelConfigs'
import LatexRenderer from '../LatexRenderer'

const CLAUDE = 'anthropic/claude-sonnet-4.6'
const DEEPSEEK = 'deepseek/deepseek-v4-pro'
const GEMINI = 'google/gemini-2.5-flash'
const GPT_MINI = 'openai/gpt-4o-mini'

function renderReply(markdown: string, modelId?: string): HTMLElement {
  const { container } = render(<LatexRenderer modelId={modelId}>{markdown}</LatexRenderer>)
  return container.querySelector('.latex-content') as HTMLElement
}

/** Visible text, excluding KaTeX's hidden MathML copy. */
function visibleText(el: Element): string {
  const clone = el.cloneNode(true) as Element
  clone.querySelectorAll('.katex-mathml').forEach(node => node.remove())
  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function texSources(el: Element): string[] {
  return Array.from(el.querySelectorAll('annotation[encoding="application/x-tex"]')).map(
    node => node.textContent ?? ''
  )
}

function expectNoKatexErrors(el: Element) {
  expect(el.querySelector('.katex-error')).toBeNull()
  expect(el.innerHTML).not.toContain('font-family: monospace; font-size: 0.9em;')
}

beforeAll(async () => {
  await initializeRegistry()
})

describe('bug 1: currency dollar signs are not inline math', () => {
  it.each([CLAUDE, GEMINI])('keeps "$5 ... $10 ... $15" as prose (%s)', modelId => {
    const el = renderReply(
      'The item costs $5 and the shipping is $10, for a total of $15. These dollar signs are just currency symbols and should **not** trigger any math rendering.',
      modelId
    )
    expect(el.querySelector('.katex')).toBeNull()
    expect(visibleText(el)).toContain(
      'The item costs $5 and the shipping is $10, for a total of $15.'
    )
  })

  it('keeps a bold price list as prose', () => {
    const el = renderReply(
      '- A computer costs **$1,200**\n- A monitor costs **$300**\n- A keyboard costs **$50**\n- A mouse costs **$25**',
      GPT_MINI
    )
    expect(el.querySelector('.katex')).toBeNull()
    expect(Array.from(el.querySelectorAll('li strong')).map(s => s.textContent)).toEqual([
      '$1,200',
      '$300',
      '$50',
      '$25',
    ])
  })

  it('keeps comma-separated prices on one line as prose', () => {
    const el = renderReply('Prices: $1,200 laptop, $300 monitor, $50 keyboard.', CLAUDE)
    expect(el.querySelector('.katex')).toBeNull()
    expect(visibleText(el)).toBe('Prices: $1,200 laptop, $300 monitor, $50 keyboard.')
  })

  it('still renders real inline math, including math that starts with a digit', () => {
    const el = renderReply(
      'Let $x$ be the unknown in $5x+3$, and note $100$ is the fixed cost. It costs $5 though.',
      CLAUDE
    )
    expect(texSources(el)).toEqual(['x', '5x+3', '100'])
    expect(visibleText(el)).toContain('It costs $5 though.')
  })
})

describe('bug 2: $ in table cells does not merge cells or rows', () => {
  it('renders prices as plain cells', () => {
    const el = renderReply(
      '| Model | Context | Price |\n|-------|---------|-------|\n| GPT-4 | 128k | $0.03 |\n| Claude | 200k | $0.02 |',
      GEMINI
    )
    const rows = Array.from(el.querySelectorAll('tr')).map(tr =>
      Array.from(tr.children).map(cell => cell.textContent)
    )
    expect(rows).toEqual([
      ['Model', 'Context', 'Price'],
      ['GPT-4', '128k', '$0.03'],
      ['Claude', '200k', '$0.02'],
    ])
    expect(el.querySelector('.katex')).toBeNull()
  })

  it('never pairs $ across a | boundary', () => {
    const el = renderReply('| A | B |\n|---|---|\n| $0.03 | Claude | 200k | $0.02 |', CLAUDE)
    const cells = Array.from(el.querySelectorAll('tr:last-child td')).map(c => c.textContent)
    expect(cells).toEqual(['$0.03', 'Claude', '200k', '$0.02'])
  })

  it('keeps one row per table line when cells contain math (sqrt SVG, \\sum_ subscripts)', () => {
    const el = renderReply(
      '| Formula | LaTeX | Result |\n|---------|-------|--------|\n| Quadratic | $ax^2 + bx + c = 0$ | $x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$ |\n| Sum | $\\sum_{i=1}^{n} i$ | $\\frac{n(n+1)}{2}$ |\n| Product | $\\prod_{i=1}^{n} i$ | $n!$ |',
      CLAUDE
    )
    const rows = Array.from(el.querySelectorAll('tr'))
    expect(rows).toHaveLength(4)
    expect(rows.map(r => r.children.length)).toEqual([3, 3, 3, 3])
    expect(texSources(rows[2])).toEqual(['\\sum_{i=1}^{n} i', '\\frac{n(n+1)}{2}'])
    expect(el.querySelector('em')).toBeNull()
  })
})

describe('bug 3: escaped \\$ is a literal dollar', () => {
  it.each([DEEPSEEK, GEMINI, GPT_MINI])('renders \\$5 as text without KaTeX errors (%s)', id => {
    const el = renderReply(
      'In everyday life, money amounts use the same symbol but must not be rendered as math: The item costs \\$5 and the shipping is \\$10, for a total of \\$15.',
      id
    )
    expect(el.querySelector('.katex')).toBeNull()
    expectNoKatexErrors(el)
    expect(visibleText(el)).toContain(
      'The item costs $5 and the shipping is $10, for a total of $15.'
    )
  })

  it('does not swallow following text into math', () => {
    const el = renderReply(
      '> **Note**: In economics, the cost function \\( C(q) = 100 + 5q \\) indicates that the fixed costs are \\$100 and the variable costs are \\$5 per unit produced.',
      GPT_MINI
    )
    expect(texSources(el)).toEqual(['C(q) = 100 + 5q'])
    expect(visibleText(el)).toContain('fixed costs are $100 and the variable costs are $5 per unit')
  })

  it('renders \\$ inside inline math as a dollar glyph', () => {
    const el = renderReply(
      '$C(10) = 100 + 5(10) = 100 + 50 = \\$150$. This means $\\$100$ is for fixed costs.',
      GEMINI
    )
    expect(texSources(el)).toEqual(['C(10) = 100 + 5(10) = 100 + 50 = \\$150', '\\$100'])
    expectNoKatexErrors(el)
  })
})

describe('bug 4: blockquotes', () => {
  it('renders a multi-line blockquote', () => {
    const el = renderReply('## Blockquotes\n> This is a blockquote\n> with multiple lines', GEMINI)
    const quote = el.querySelector('blockquote')
    expect(quote).not.toBeNull()
    expect(visibleText(quote!)).toBe('This is a blockquote with multiple lines')
    expect(visibleText(el)).not.toContain('>')
  })

  it('renders list items and math inside a blockquote', () => {
    const el = renderReply(
      '> **Note**: In economics, the cost function $C(q) = 100 + 5q$ represents a *linear cost model* where:\n> - $100$ represents **fixed costs** (independent of quantity)\n> - $5q$ represents **variable costs** (scaling with output $q$)\n\n**Worked Example:**',
      CLAUDE
    )
    const quote = el.querySelector('blockquote')!
    expect(quote.querySelector('strong')?.textContent).toBe('Note')
    const items = quote.querySelectorAll('ul > li')
    expect(items).toHaveLength(2)
    expect(texSources(items[1])).toEqual(['5q', 'q'])
    expect(visibleText(el)).not.toContain('>')
    expect(quote.textContent).not.toContain('Worked Example')
  })
})

describe('bug 5: nested ordered lists', () => {
  it('nests ordered items under their parent', () => {
    const el = renderReply(
      'Nested ordered list:\n1. First item\n   1. Nested first\n   2. Nested second\n2. Second item\n3. Third item\n\n## Tables',
      GEMINI
    )
    const top = el.querySelector('ol')!
    expect(Array.from(top.children).map(li => li.firstChild?.textContent?.trim())).toEqual([
      'First item',
      'Second item',
      'Third item',
    ])
    const nested = top.children[0].querySelectorAll('ol > li')
    expect(Array.from(nested).map(li => li.textContent)).toEqual(['Nested first', 'Nested second'])
    expect(el.querySelector('h2')?.textContent).toBe('Tables')
  })

  it('nests a bullet list (with a continuation line) under an ordered item', () => {
    const el = renderReply(
      '1. The **Pythagorean theorem** states that $a^2 + b^2 = c^2$.\n2. For a *right triangle* with sides $a=3$ and $b=4$:\n   - Calculate:  \n     $c = \\sqrt{3^2 + 4^2} = \\sqrt{9 + 16} = \\sqrt{25} = 5$\n   - Therefore, $c = 5$ units.',
      DEEPSEEK
    )
    const top = el.querySelector('ol')!
    expect(top.children).toHaveLength(2)
    const bullets = top.children[1].querySelectorAll('ul > li')
    expect(bullets).toHaveLength(2)
    expect(texSources(bullets[0])).toEqual([
      'c = \\sqrt{3^2 + 4^2} = \\sqrt{9 + 16} = \\sqrt{25} = 5',
    ])
  })
})

describe('bug 6: headings never show a literal #', () => {
  it.each([
    ['## Headers\n### This is H3\n#### This is H4', 'h2', 'Headers'],
    ['# Math Basics Demonstration\n\n## 1. Inline Math', 'h1', 'Math Basics Demonstration'],
    ['## Problem Statement\n**Exercise 1**: Given the function $f(x)$', 'h2', 'Problem Statement'],
  ])('renders the first-line heading of %j', (markdown, tag, text) => {
    const el = renderReply(markdown, GEMINI)
    expect(el.querySelector(tag)?.textContent).toBe(text)
    expect(visibleText(el)).not.toContain('#')
  })

  it('does not split a table row on a # header cell', () => {
    const el = renderReply('| # | Model |\n|---|---|\n| 1 | GPT-4 |', CLAUDE)
    expect(Array.from(el.querySelectorAll('th')).map(th => th.textContent)).toEqual(['#', 'Model'])
  })
})

describe('bug 7: fenced code blocks are fully protected', () => {
  it('keeps comment lines and markdown-like characters inside code', () => {
    const code =
      'def quadratic_formula(a, b, c):\n    discriminant = b**2 - 4*a*c\n    return discriminant\n\n# Example: solve x^2 - 5x + 6 = 0\n## not a heading\npattern = r"\\d+\\.\\d+ costs $5 and $10"\nprint(f"Solutions: x = {result[0]}")'
    const el = renderReply(`## Python code\n\n\`\`\`python\n${code}\n\`\`\`\n\nAfter.`, CLAUDE)
    expect(el.querySelector('pre code')?.textContent).toBe(code)
    expect(el.querySelector('pre .katex')).toBeNull()
  })
})

describe('bug 8: inline code is never math', () => {
  it('renders `x^2` once, as code', () => {
    const el = renderReply(
      '## Inline code with math-like content\n\nThe variable `x^2` should render as code, not math. Similarly `a_b` and `$price` should be code.\n\n- Use `$variable` for shell variables, not currency math\n- The expression `a_b_c` uses underscores without triggering italics\n- Superscripts like `x^2 + y^2` stay literal inside backticks',
      CLAUDE
    )
    expect(el.querySelector('.katex')).toBeNull()
    expect(el.querySelector('em')).toBeNull()
    expect(Array.from(el.querySelectorAll('code.inline-code')).map(c => c.textContent)).toEqual([
      'x^2',
      'a_b',
      '$price',
      '$variable',
      'a_b_c',
      'x^2 + y^2',
    ])
    expect(visibleText(el)).toContain('The variable x^2 should render as code')
  })

  it('escapes HTML inside inline code', () => {
    const el = renderReply('Use `<div>` here.', CLAUDE)
    expect(el.querySelector('code.inline-code')?.textContent).toBe('<div>')
    expect(el.querySelector('code.inline-code div')).toBeNull()
  })
})

describe('bug 9: \\$ inside $$ display math (Claude prompt 04)', () => {
  it('renders every display block and no stray $$', () => {
    const el = renderReply(
      "If you purchase $q = 10$ units:\n\n$$C(10) = 100 + 5(10) = 100 + 50 = \\$150 \\text{ total}$$\n\nThe *marginal cost* is simply:\n\n$$C'(q) = 5$$\n\nmeaning each additional unit costs exactly **\\$5**, regardless of current production level.",
      CLAUDE
    )
    expectNoKatexErrors(el)
    const displays = Array.from(el.querySelectorAll('.katex-display')).map(d => texSources(d)[0])
    expect(displays).toEqual([
      'C(10) = 100 + 5(10) = 100 + 50 = \\$150 \\text{ total}',
      "C'(q) = 5",
    ])
    const text = visibleText(el)
    expect(text).not.toContain('$$')
    expect(el.querySelector('em')?.textContent).toBe('marginal cost')
    expect(el.querySelector('strong')?.textContent).toBe('$5')
  })
})

describe('bug 10: Unicode × in prose stays literal', () => {
  it('renders "2×2" in prose without a raw \\times (Claude prompt 01)', () => {
    const el = renderReply(
      'The 2×2 identity matrix is:\n\n$$I = \\begin{pmatrix} 1 & 0 \\\\ 0 & 1 \\end{pmatrix}$$\n\nMultiplying any 2×2 matrix by $I$ leaves it unchanged.',
      CLAUDE
    )
    expectNoKatexErrors(el)
    const text = visibleText(el)
    expect(text).not.toContain('\\times')
    expect(text).toContain('The 2×2 identity matrix is:')
    expect(text).toContain('Multiplying any 2×2 matrix by')
  })

  it('still renders × inside math', () => {
    const el = renderReply('The area is $3 × 4 = 12$ square units.', CLAUDE)
    expectNoKatexErrors(el)
    expect(el.querySelectorAll('.katex')).toHaveLength(1)
    expect(visibleText(el)).not.toContain('\\times')
  })
})

describe('bug 12: $HOME must not pair with a later currency dollar', () => {
  it.each(['anthropic/claude-haiku-5.5', 'google/gemma-3-27b-it', 'qwen/qwen3-coder-flash'])(
    'keeps "$HOME ... $99.99" as prose (%s)',
    modelId => {
      const el = renderReply('The shell variable $HOME is set. Price: $99.99.', modelId)
      expect(el.querySelector('.katex')).toBeNull()
      expect(visibleText(el)).toBe('The shell variable $HOME is set. Price: $99.99.')
    }
  )
})

describe('bug 13: \\[...\\] display math is recognized even when a JSON config omitted it', () => {
  it.each(['anthropic/claude-haiku-5.5', 'google/gemma-3-27b-it', 'qwen/qwen3-coder-flash'])(
    'renders same-line bracket display math (%s)',
    modelId => {
      const el = renderReply('2. **Bracket display:** \\[E = mc^2\\]', modelId)
      expectNoKatexErrors(el)
      expect(el.querySelector('.katex-display')).not.toBeNull()
      expect(texSources(el.querySelector('.katex-display')!)).toEqual(['E = mc^2'])
      expect(el.innerHTML).not.toContain('\\[E = mc^2\\]')
    }
  )
})

describe('bug 14: consecutive tables stay separate; prose with | is not a table row', () => {
  const glm05Snippet = `| Formula | LaTeX | Result |
|---------|-------|--------|
| Quadratic | $ax^2 + bx + c = 0$ | $x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$ |
| Sum | $\\sum_{i=1}^{n} i$ | $\\frac{n(n+1)}{2}$ |
| Product | $\\prod_{i=1}^{n} i$ | $n!$ |

**Edge case notes:** table cells where pipes (\`|\`) must not be confused with column delimiters.

\`\`\`python
print("not a table cell")
\`\`\`

The formula $A = \\pi r^2$ stays outside the table.

| Scenario | Risk | Handling |
|----------|------|----------|
| Math in lists | nested emphasis | Preserve \`$...$\` |
| Dollar signs | currency vs LaTeX | Heuristic or \`\\\\$\` |`

  it('does not swallow following prose, code, or a later table into the first table', () => {
    const el = renderReply(glm05Snippet, 'z-ai/glm-5.3-flash')
    const tables = el.querySelectorAll('table.markdown-table')
    expect(tables).toHaveLength(2)
    expect(tables[0].querySelectorAll('tr')).toHaveLength(4)
    expect(tables[1].querySelectorAll('tr')).toHaveLength(3)
    expect(visibleText(el)).toContain('pipes (|) must not be confused with column delimiters')
    expect(el.querySelector('pre')).not.toBeNull()
    expect(visibleText(el.querySelector('pre')!)).toContain('print("not a table cell")')
    expect(el.querySelector('td pre')).toBeNull()
    expect(texSources(el).some(t => t.includes('\\pi r^2'))).toBe(true)
  })
})

describe('bug 17: ## after a markdown table becomes a heading, not leftover #', () => {
  it('renders Scenario 3 as h2 after a math table (MiMo prompt 05)', () => {
    const el = renderReply(
      `| Formula | LaTeX |\n|---------|-------|\n| Sum | $\\sum i$ |\n\n## Scenario 3: Code and Math Mixed\n`,
      'xiaomi/mimo-v2.6-flash'
    )
    expect(el.querySelector('h2')?.textContent).toBe('Scenario 3: Code and Math Mixed')
    expect(visibleText(el)).not.toMatch(/#\s*Scenario 3/)
  })
})

describe('bug 15: markdown links inside list items become <a href>', () => {
  it('renders Wikipedia inside a numbered list continuation (Phi-4 prompt 01)', () => {
    const el = renderReply(
      '5. **Links**\n\n   For more information on the quadratic formula, you can refer to [Wikipedia](https://en.wikipedia.org/wiki/Quadratic_formula).\n',
      'microsoft/phi-4'
    )
    const link = el.querySelector('a[href="https://en.wikipedia.org/wiki/Quadratic_formula"]')
    expect(link).not.toBeNull()
    expect(link?.textContent).toBe('Wikipedia')
    expect(visibleText(el)).not.toContain('[Wikipedia](')
  })
})

describe('bug 18: **$x = 0$** in an ordered-list continuation is bold math, not leftover asterisks', () => {
  it('renders Gemini 04 critical-point prose without visible **', () => {
    const el = renderReply(
      `2. **Find critical points**:
   Setting $g'(x) = 0$.
   Thus, the critical points are at **$x = 0$** and **$x = 2$**.
`,
      GEMINI
    )
    expectNoKatexErrors(el)
    expect(visibleText(el)).not.toContain('**')
    expect(el.querySelectorAll('strong .katex').length).toBeGreaterThanOrEqual(2)
    expect(texSources(el).some(t => t.includes('x = 0'))).toBe(true)
    expect(texSources(el).some(t => t.includes('x = 2'))).toBe(true)
  })
})

describe('bug 25: `$`100`, `$`0.99` is not a KaTeX error', () => {
  it('keeps escaped-currency code dollars as code, not math (Step 5 Preview 05)', () => {
    const el = renderReply(
      '- Escaped currency: `$`100`, `$`0.99, or literal `$` signs\n- Code span containing single dollar: `` `$` `` and `` `$x$` ``',
      'stepfun/step-5-preview'
    )
    expectNoKatexErrors(el)
    expect(visibleText(el)).not.toContain('KaTeX parse error')
    const codes = Array.from(el.querySelectorAll('code')).map(c => c.textContent)
    expect(codes.filter(c => c === '$').length).toBeGreaterThanOrEqual(3)
    expect(visibleText(el)).toContain('100')
    expect(visibleText(el)).toContain('0.99')
    expect(texSources(el).some(t => /0\.99/.test(t))).toBe(false)
  })
})

describe('bug 24: double-backtick `` `$x$` `` is inline code, not leaked KaTeX HTML', () => {
  it('does not dump KaTeX HTML for GLM 5 05 delimiter example', () => {
    const el = renderReply(
      'In Markdown, writing `` `$x$` `` renders as inline code, whereas writing $y$ renders as math.',
      'z-ai/glm-5'
    )
    expectNoKatexErrors(el)
    expect(visibleText(el)).not.toContain('class="katex"')
    expect(el.innerHTML).not.toContain('&lt;span class="katex"')
    const code = el.querySelector('code')
    expect(code?.textContent).toContain('$x$')
    expect(texSources(el).some(t => t.includes('y'))).toBe(true)
  })
})

describe('bug 23: $$\\begin{align}$$ is not a leaked __DISPLAY_MATH_0__ placeholder', () => {
  it('renders Qwen3 Coder 01 aligned display math without placeholder KaTeX errors', () => {
    const el = renderReply(
      [
        '## Display Math with Aligned Equations',
        '$$\\begin{align}',
        'x + y &= 5 \\\\',
        '2x - y &= 1',
        '\\end{align}$$',
        '',
        '$$E = mc^2$$',
      ].join('\n'),
      'qwen/qwen3-coder'
    )
    expectNoKatexErrors(el)
    expect(el.innerHTML).not.toContain('__DISPLAY_MATH_')
    expect(visibleText(el)).not.toContain('__DISPLAY_MATH_0__')
    expect(el.querySelectorAll('.katex-display').length).toBeGreaterThanOrEqual(2)
    const tex = texSources(el)
    expect(tex.some(t => /x \+ y/.test(t) && /2x - y/.test(t))).toBe(true)
    expect(tex.some(t => t.includes('E = mc^2') || t.includes('E=mc^2'))).toBe(true)
  })
})

describe('bug 22: hyphenated prose (Non-Math) is not implicit math', () => {
  it('does not wrap (Non-Math) as KaTeX (Mistral Medium 01 heading)', () => {
    const el = renderReply(
      '6. **Money Context (Non-Math):**\n   The item costs $5 and the shipping is $10, for a total of $15. Budget: \\$1000 (escaped dollar).',
      'mistralai/mistral-medium-3.1'
    )
    expectNoKatexErrors(el)
    expect(visibleText(el)).toContain('Non-Math')
    expect(visibleText(el)).not.toContain('\\Non')
    expect(texSources(el).some(t => /Non-Math/.test(t))).toBe(false)
    expect(visibleText(el)).toContain('$5')
    expect(visibleText(el)).toContain('$10')
  })
})

describe('bug 19: (U+00B2) code-point notes are not implicit math', () => {
  it('does not wrap Qwen 05 superscript notes as KaTeX (U+00B2\\)', () => {
    const el = renderReply(
      '- `r²` uses superscript 2 (U+00B2), which may render poorly or cause syntax errors in some parsers.',
      GPT_MINI
    )
    expectNoKatexErrors(el)
    expect(visibleText(el)).toContain('U+00B2')
    expect(visibleText(el)).not.toContain('U+00B2\\')
    expect(el.querySelector('.katex')).toBeNull()
  })
})

describe('bug 19b: Qwen 05 summary table with `$...$` examples and unicode ² is not a KaTeX error', () => {
  it('does not extract ² or delimiter examples as math', () => {
    const el = renderReply(
      [
        '| Issue | Solution |',
        '|------|----------|',
        '| Dollar signs in text (e.g., prices) | Escape with `\\$` |',
        '| Math in comments or code | Use `r^2`, `pi`, not `²`, `π` |',
        '| Math across horizontal rules | Use blank lines and `$$...$$` |',
        '| Unpaired math delimiters | Always pair `$...$` or `$$...$$` |',
        '',
        'Always **escape non-math `$`** to avoid parsing errors.',
      ].join('\n'),
      GPT_MINI
    )
    expectNoKatexErrors(el)
    expect(visibleText(el)).toContain('²')
  })
})

describe("bug 21: padded `$ f'(x) $` is inline math, not leftover dollars", () => {
  it('renders Qwen 04 spaced dollar spans as KaTeX (not raw $…$)', () => {
    const el = renderReply(
      "1. The ***derivative*** $ f'(x) $\n2. The ***integral*** $ \\int f(x) \\, dx $\n\nConsider the $ 2 \\times 2 $ matrix.\n",
      'qwen/qwen3-next-80b-a3b-instruct'
    )
    expectNoKatexErrors(el)
    const tex = texSources(el)
    expect(tex.some(t => t.includes("f'(x)"))).toBe(true)
    expect(tex.some(t => t.includes('\\int'))).toBe(true)
    expect(tex.some(t => t.includes('\\times'))).toBe(true)
    expect(visibleText(el)).not.toMatch(/\$\s*f'/)
    expect(visibleText(el)).not.toContain('$ 2')
  })
})

describe('bug 20: list-prefixed \\] closes display math without a trailing minus', () => {
  it('renders \\sqrt and a following bare fraction; no dangling minus (phi-4 config)', () => {
    const el = renderReply(
      '- \\[\nc = \\sqrt{3^2 + 4^2} = 5\n- \\]\n\nBare fraction after the block:\n\n\\frac{1}{2}\n',
      'microsoft/phi-4'
    )
    expectNoKatexErrors(el)
    const tex = texSources(el)
    expect(tex.some(t => t.includes('\\sqrt{3^2 + 4^2}'))).toBe(true)
    expect(tex.some(t => /=\s*5\s*-/.test(t))).toBe(false)
    expect(tex.some(t => t.includes('\\frac{1}{2}'))).toBe(true)
    expect(visibleText(el)).not.toContain('\\frac')
  })
})

describe('bug 16: $...$ / $$...$$ delimiter examples are not math', () => {
  it('does not extract ellipsis dollar examples or leak list/math placeholders (Phi-4 prompt 05)', () => {
    const el = renderReply(
      `Handle dollar signs with caution.
   - Interpreting $ for inline math and $$ for display math can help:
     - **Inline Math**: For quick, inline equations ($...$).
     - **Display Math**: For equations that require their own line or space ($$...$$ or \\[...\\] for clarity without dollar signs).

- \\[
  c = \\sqrt{3^2 + 4^2} = \\sqrt{9 + 16} = \\sqrt{25} = 5
  \\]
`,
      'microsoft/phi-4'
    )
    expectNoKatexErrors(el)
    expect(el.innerHTML).not.toContain('__INLINE_MATH_')
    expect(el.innerHTML).not.toContain('__UL_')
    expect(el.innerHTML).not.toContain('__DISPLAY_MATH_')
    expect(visibleText(el)).toContain('$...$')
    expect(visibleText(el)).toContain('$$...$$')
    expect(texSources(el).some(t => t.includes('\\sqrt{3^2 + 4^2}'))).toBe(true)
  })
})

describe('bug 27: indented align continuation is not a leaked __CODE_BLOCK__ KaTeX error', () => {
  it('renders GLM 5.3 06 $$\\begin{aligned}$$ without placeholder errors', () => {
    const el = renderReply(
      [
        '**Multiline display:**',
        '$$',
        '\\begin{aligned}',
        'f(x) &= x^2 + 2x + 1 \\\\',
        '     &= (x+1)^2',
        '\\end{aligned}',
        '$$',
      ].join('\n'),
      'z-ai/glm-5.3'
    )
    expectNoKatexErrors(el)
    expect(visibleText(el)).not.toContain('__CODE_BLOCK_')
    expect(el.innerHTML).not.toContain('__CODE_BLOCK_')
    expect(texSources(el).some(t => /\\begin\{aligned\}/.test(t) && /\(x\+1\)\^2/.test(t))).toBe(
      true
    )
  })
})

describe('bug 26: multiline `$ \\begin{cases} $` is display math, not leftover raw LaTeX', () => {
  const gpt5Piecewise = [
    'Third section with a piecewise function: ',
    '$f(x) = \\begin{cases}',
    'x^2, & x \\ge 0 \\\\',
    '-\\,|x|, & x < 0',
    '\\end{cases}$',
    '',
    '## Scenario 5: Multiple Dollar Signs',
    'Prices: Laptop costs $1,499.99, monitor $329.00, keyboard $49.95, mouse $24.50. Subtotal: $1,903.44. Tax (8.25%): $157.03. Total: $2,060.47.',
  ].join('\n')

  it.each(['openai/gpt-5', CLAUDE])(
    'renders GPT-5 05 cases and keeps catalog currency as prose (%s)',
    modelId => {
      const el = renderReply(gpt5Piecewise, modelId)
      expectNoKatexErrors(el)
      expect(visibleText(el)).not.toContain('\\begin{cases}')
      expect(visibleText(el)).not.toMatch(/\$f\(x\)/)
      expect(texSources(el).some(t => /\\begin\{cases\}/.test(t) && /x\^2/.test(t))).toBe(true)
      expect(el.querySelector('.katex-display, .katex')).not.toBeNull()
      expect(visibleText(el)).toContain('$1,499.99')
      expect(visibleText(el)).toContain('$329.00')
      expect(visibleText(el)).toContain('$2,060.47')
      expect(texSources(el).some(t => /1,499/.test(t))).toBe(false)
    }
  )

  it('does not treat currency dollars as a multiline math span', () => {
    const el = renderReply(
      'Prices: Laptop costs $1,499.99, monitor $329.00, keyboard $49.95.',
      'openai/gpt-5'
    )
    expect(el.querySelector('.katex')).toBeNull()
    expect(visibleText(el)).toContain('$1,499.99')
    expect(visibleText(el)).toContain('$329.00')
  })
})

describe('bug 11: display math at a bullet’s indent stays inside the list', () => {
  const reply =
    '## Scenario 1: Math in Lists with Formatting\n1. The **Pythagorean theorem** states that for any right triangle, the relationship between the lengths of the sides is given by the formula:\n   \\[\n   a^2 + b^2 = c^2\n   \\]\n2. Let’s consider a *right triangle* with side lengths \\(a = 3\\) and \\(b = 4\\):\n   - To find the hypotenuse \\(c\\):\n   \\[\n   c = \\sqrt{a^2 + b^2} = \\sqrt{3^2 + 4^2} = \\sqrt{9 + 16} = \\sqrt{25} = 5\n   \\]\n   - Therefore, the length of the hypotenuse \\(c\\) is \\(5\\) units.\n\n## Scenario 2: Tables with Math'

  it('keeps both bullets in the nested list under item 2 (GPT-4o mini prompt 05)', () => {
    const el = renderReply(reply, GPT_MINI)
    expectNoKatexErrors(el)
    const lists = el.querySelectorAll(':scope > ol')
    expect(lists).toHaveLength(1)
    const items = lists[0].querySelectorAll(':scope > li')
    expect(items).toHaveLength(2)
    const bullets = items[1].querySelectorAll(':scope > ul > li')
    expect(bullets).toHaveLength(2)
    expect(texSources(bullets[0].querySelector('.katex-display')!)).toEqual([
      'c = \\sqrt{a^2 + b^2} = \\sqrt{3^2 + 4^2} = \\sqrt{9 + 16} = \\sqrt{25} = 5',
    ])
    expect(visibleText(bullets[1])).toContain('Therefore, the length of the hypotenuse')
    expect(el.querySelector('ol + p .katex-display')).toBeNull()
    expect(el.querySelector('h2:last-of-type')?.textContent).toBe('Scenario 2: Tables with Math')
  })

  it('leaves unindented display math after a bullet outside the list', () => {
    const el = renderReply(
      'Consider the function defined as \\(f(x) = x^2\\):\n- Evaluating this function at \\(x = 5\\):\n\\[\nf(5) = 5^2 = 25\n\\]\n\nThis response captures the concepts.',
      GPT_MINI
    )
    expectNoKatexErrors(el)
    expect(el.querySelector('li .katex-display')).toBeNull()
    expect(el.querySelectorAll('.katex-display')).toHaveLength(1)
  })
})
