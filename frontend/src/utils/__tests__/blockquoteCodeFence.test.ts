import { describe, expect, it } from 'vitest'

import { extractCodeBlocks } from '../codeBlockPreservation'
import { markBlockquotes, renderBlockquoteMarkers } from '../latex/blockquotes'
import { processMarkdownLists, convertListPlaceholdersToHTML } from '../latex/lists'

const NESTED_SOURCE = [
  '> Outer observation from the bench.',
  '>',
  '> > - nested aliquot',
  '> > - nested blank',
  '> >',
  '> > ```js',
  '> > const nested = true',
  '> > ```',
].join('\n')

describe('blockquote nested code placeholder', () => {
  it('keeps code block HTML inside nested blockquote markers', () => {
    const extracted = extractCodeBlocks(NESTED_SOURCE)
    expect(extracted.blocks).toHaveLength(1)
    const marked = markBlockquotes(extracted.text)
    expect(marked).toMatch(/\uE010[\s\S]*\uE010[\s\S]*__CODE_BLOCK_0__[\s\S]*\uE011[\s\S]*\uE011/)
    const withCode = marked.replace(
      /__CODE_BLOCK_0__/,
      '<pre><code>const nested = true</code></pre>'
    )
    const html = renderBlockquoteMarkers(withCode)
    expect(html).toMatch(/<blockquote[\s\S]*<blockquote[\s\S]*const nested = true/)
  })

  it('keeps placeholder inside nested markers after list conversion', () => {
    const extracted = extractCodeBlocks(NESTED_SOURCE)
    let marked = markBlockquotes(extracted.text)
    marked = processMarkdownLists(marked)
    marked = convertListPlaceholdersToHTML(marked)
    expect(marked).toMatch(/\uE010[\s\S]*\uE010[\s\S]*__CODE_BLOCK_0__[\s\S]*\uE011[\s\S]*\uE011/)
    const withCode = marked.replace(
      /__CODE_BLOCK_0__/,
      '<div class="code-block-direct"><pre><code>const nested = true</code></pre></div>'
    )
    const html = renderBlockquoteMarkers(withCode)
    expect(html).toMatch(/<blockquote[\s\S]*<blockquote[\s\S]*const nested = true/)
  })
})
