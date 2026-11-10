import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { validateRenderedHTML } from './dom-assertions.js'
import { getExpectedFeatures } from './expected-features.js'
import { detectSourceFeatures } from './source-features.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const prompt = fs.readFileSync(path.join(__dirname, 'prompts/07-rare-formats.md'), 'utf-8')

const RARE_FLAGS = [
  'hasDisplayMath',
  'hasInlineMath',
  'hasCodeBlocks',
  'hasTables',
  'hasLinks',
  'hasCurrency',
  'hasFootnotes',
  'hasTaskLists',
  'hasStrikethrough',
  'hasAutolinks',
  'hasBareUrls',
  'hasBreakHtml',
  'hasSupHtml',
  'hasDetailsHtml',
  'hasNestedBlockquote',
  'hasTableAlignment',
  'hasTablePipes',
  'hasTableInlineMath',
  'hasMermaid',
  'hasChemistry',
  'hasCases',
  'hasAligned',
  'hasBoxed',
  'hasTextUnicode',
  'hasEmoji',
  'hasRtl',
  'hasCjk',
  'hasLongUnbroken',
  'hasWideTable',
  'hasLongCodeLine',
  'hasCurrencyBesideMath',
] as const

function passHtml(): string {
  const longUrl = prompt.match(/https:\/\/example\.com\/rare-unbroken-url\/a+/)?.[0] || ''
  const unbroken = prompt.match(/UNBROKEN[x]+/)?.[0] || ''
  const longCode = prompt.match(/LONGCODELINE = "[x]+"/)?.[0] || ''
  return `
    <p>The boiling point needs a citation<sup class="footnote-ref"><a href="#fn-rare">1</a></sup>.</p>
    <section class="footnotes"><ol><li id="fn-rare">Measured at standard pressure.</li></ol></section>
    <ul class="task-list">
      <li class="task-list-item"><input type="checkbox" checked disabled> Calibrated</li>
      <li class="task-list-item"><input type="checkbox" disabled> Recheck</li>
    </ul>
    <p>The previous label was <del class="markdown-strikethrough">obsolete</del>.</p>
    <p><a href="https://example.com/rare-autolink">https://example.com/rare-autolink</a></p>
    <p><a href="https://example.com/rare-bare-url/with/a/long/path">bare</a></p>
    <p><a href="${longUrl}">${longUrl}</a></p>
    <p><a href="https://example.com/rare-docs">lab notes</a></p>
    <p>First line.<br>Second line. The ion is written Na<sup>+</sup>.</p>
    <details><summary>Instrument note</summary>The cuvette was rinsed twice.</details>
    <blockquote class="markdown-blockquote">
      Outer
      <blockquote class="markdown-blockquote">
        <ul><li>nested aliquot</li></ul>
        <pre><code>const nested = true</code></pre>
      </blockquote>
    </blockquote>
    <div class="markdown-table-scroll">
      <table class="markdown-table">
        <tr>
          <th style="text-align:left">left</th>
          <th style="text-align:center">center</th>
          <th style="text-align:right">right</th>
          <th style="text-align:left">pipe</th>
        </tr>
        <tr>
          <td><span class="katex"><annotation>\\alpha</annotation></span></td>
          <td style="text-align:center"><span class="katex"><annotation>x^2</annotation></span></td>
          <td style="text-align:right">1</td>
          <td>a | b</td>
        </tr>
      </table>
    </div>
    <div class="markdown-table-scroll"><table>
      <tr><td>1</td><td>2</td><td>3</td><td>4</td><td>5</td><td>6</td><td>7</td><td>8</td></tr>
    </table></div>
    <div class="code-block-direct" data-language="mermaid"><span class="code-language-label">mermaid</span>
      <pre class="language-mermaid"><code class="language-mermaid">graph TD</code></pre>
    </div>
    <span class="katex"><annotation>\\ce{H2O}</annotation></span>
    <span class="katex"><annotation>\\begin{cases}x\\end{cases}</annotation></span>
    <span class="katex"><annotation>\\begin{aligned}x\\end{aligned}</annotation></span>
    <span class="katex"><annotation>\\boxed{E = mc^2}</annotation></span>
    <span class="katex"><annotation>\\text{温度 25°C}</annotation></span>
    <p>Status emoji: ✅ and 🧪.</p>
    <p dir="rtl">مرحبا بالعالم</p>
    <p>你好世界 こんにちは</p>
    <p>${unbroken}</p>
    <pre><code>${longCode}</code></pre>
    <p>The fare is $12 beside <span class="katex"><annotation>E=mc^2</annotation></span>.</p>
    <div class="katex-display"><span class="katex"><annotation>x+y</annotation></span></div>
  `
}

test.describe('Prompt 07 rare formats', () => {
  test('the prompt file asks for every rare feature', () => {
    const src = detectSourceFeatures(prompt)
    for (const flag of RARE_FLAGS) {
      expect(src[flag], flag).toBe(true)
    }
    const expected = getExpectedFeatures('07-rare-formats', prompt)
    expect(expected.footnotes).toBe(true)
    expect(expected.taskLists).toBe(true)
    expect(expected.strikethrough).toBe(true)
    expect(expected.autolinks).toBe(true)
    expect(expected.bareUrls).toBe(true)
    expect(expected.breakHtml).toBe(true)
    expect(expected.supHtml).toBe(true)
    expect(expected.detailsHtml).toBe(true)
    expect(expected.nestedBlockquote).toBe(true)
    expect(expected.tableAlignment).toBe(true)
    expect(expected.tablePipes).toBe(true)
    expect(expected.tableInlineMath).toBe(true)
    expect(expected.mermaid).toBe(true)
    expect(expected.chemistry).toBe(true)
    expect(expected.cases).toBe(true)
    expect(expected.aligned).toBe(true)
    expect(expected.boxed).toBe(true)
    expect(expected.textUnicode).toBe(true)
    expect(expected.emoji).toBe(true)
    expect(expected.rtl).toBe(true)
    expect(expected.cjk).toBe(true)
    expect(expected.longUnbroken).toBe(true)
    expect(expected.wideTable).toBe(true)
    expect(expected.longCodeLine).toBe(true)
    expect(expected.currencyBesideMath).toBe(true)
    expect(expected.noKatexErrors).toBe(true)
    expect(expected.safeLinksOnly).toBe(true)
  })

  test('older prompt names do not inherit rare-format requirements', () => {
    const expected = getExpectedFeatures('01-math-basics')
    expect(expected.footnotes).toBeUndefined()
    expect(expected.chemistry).toBeUndefined()
    expect(expected.mermaid).toBeUndefined()
    expect(expected.rtl).toBeUndefined()
  })

  test('a complete DOM passes every rare check', () => {
    const result = validateRenderedHTML(passHtml(), getExpectedFeatures('07-rare-formats', prompt), prompt)
    const failed = result.assertions.filter(item => item.status === 'fail')
    expect(failed.map(item => item.message)).toEqual([])
    expect(result.status).toBe('pass')
  })

  test('missing mermaid language, chemistry, footnotes, and RTL dir fail', () => {
    const html = '<p>plain reply with no special formatting</p>'
    const result = validateRenderedHTML(html, getExpectedFeatures('07-rare-formats', prompt), prompt)
    const messages = result.assertions.filter(item => item.status === 'fail').map(item => item.message)
    expect(messages.some(message => /mermaid/.test(message))).toBe(true)
    expect(messages.some(message => /mhchem|chemistry|\\\\ce|ce /.test(message))).toBe(true)
    expect(messages.some(message => /footnote/.test(message))).toBe(true)
    expect(messages.some(message => /RTL/.test(message))).toBe(true)
    expect(result.status).toBe('fail')
  })
})
