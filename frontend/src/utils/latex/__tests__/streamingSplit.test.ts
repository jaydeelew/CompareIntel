import { describe, expect, it } from 'vitest'

import { splitStreamingRender, streamingVisibleSource } from '../streamingSplit'

function visible(source: string): string {
  return streamingVisibleSource(source)
}

function joined(source: string): string {
  const split = splitStreamingRender(source)
  return split.blocks.map(block => block.source).join('') + split.visibleTail + split.held
}

const ANSWER = [
  'The quadratic formula is settled.',
  '',
  '$$',
  'x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}',
  '$$',
  '',
  'A code sample follows.',
  '',
  '```mermaid',
  'graph TD',
  '  A-->B',
  '```',
  '',
  '| Method | Result |',
  '| --- | --- |',
  '| alpha | 1 |',
  '',
  'Bracket math:',
  '',
  '\\[',
  '\\alpha + \\beta',
  '\\]',
  '',
  '\\begin{align}',
  'y &= 2',
  '\\end{align}',
  '',
  'Final line.',
].join('\n')

describe('splitStreamingRender', () => {
  it('conserves every character', () => {
    const samples = [
      '',
      'Hello',
      'Hello\n\n',
      ANSWER,
      'use $$ as delimiter.\n\n$$E=mc^2$$',
      'Price is $5 and tax.\n',
      '```mermaid\ngraph TD\n',
      '| A | B |\n| --- |',
      '\\begin{align}\nx &= 1',
      '\\[\n\\alpha',
      'Inline $a^2+b^2=c^2$ stays.',
    ]
    for (const sample of samples) {
      expect(joined(sample)).toBe(sample)
    }
  })

  it('only appends blocks as the source grows', () => {
    let previous: string[] = []
    let built = ''
    for (let end = 1; end <= ANSWER.length; end += 1) {
      built = ANSWER.slice(0, end)
      const keys = splitStreamingRender(built).blocks.map(block => block.source)
      expect(keys.slice(0, previous.length)).toEqual(previous)
      previous = keys
    }
    expect(splitStreamingRender(ANSWER).held).toBe('')
  })

  it('hides an unclosed display-math opener and keeps the paragraph', () => {
    const source = 'The quadratic formula is settled.\n\n$$'
    const split = splitStreamingRender(source)
    expect(split.blocks.map(block => block.source)).toEqual([
      'The quadratic formula is settled.\n\n',
    ])
    expect(split.visibleTail).toBe('')
    expect(split.held).toBe('$$')
    expect(visible(source)).not.toContain('$$')
  })

  it('hides a half-written display equation', () => {
    const source = 'Done.\n\n$$\nx = \\frac{-b}{2a}'
    expect(visible(source)).toBe('Done.\n\n')
    expect(visible(source)).not.toContain('$$')
    expect(visible(source)).not.toContain('\\frac')
  })

  it('commits closed display math and leaves the next sentence in the tail', () => {
    const source = 'Done.\n\n$$\nE = mc^2\n$$\n\nNext'
    const split = splitStreamingRender(source)
    expect(split.held).toBe('')
    expect(split.blocks.some(block => block.source.includes('E = mc^2'))).toBe(true)
    expect(split.visibleTail).toBe('Next')
    const grown = splitStreamingRender(`${source} word`)
    expect(grown.blocks.map(block => block.source)).toEqual(split.blocks.map(block => block.source))
    expect(grown.visibleTail).toBe('Next word')
  })

  it('hides an unclosed mermaid fence, including its body', () => {
    const source = 'Done.\n\n```mermaid\ngraph TD\n  A-->B'
    expect(visible(source)).toBe('Done.\n\n')
    expect(visible(source)).not.toContain('```')
    expect(visible(source)).not.toContain('graph TD')
  })

  it('commits a closed fence once its closer line ends', () => {
    const open = 'Done.\n\n```mermaid\ngraph TD\n  A-->B\n```'
    expect(visible(open)).toBe('Done.\n\n')
    const closed = `${open}\n\nAfter`
    const split = splitStreamingRender(closed)
    expect(split.held).toBe('')
    expect(split.blocks.some(block => block.source.includes('graph TD'))).toBe(true)
    expect(split.blocks.some(block => block.source.includes('```mermaid'))).toBe(true)
    expect(split.visibleTail).toBe('After')
    expect(split.held).not.toContain('```')
  })

  it('hides a partial table separator', () => {
    const source = 'Done.\n\n| Method | Result |\n| --- |'
    expect(visible(source)).toBe('Done.\n\n')
    expect(visible(source)).not.toContain('| --- |')
    expect(visible(source)).not.toContain('| Method |')
  })

  it('keeps a terminated table stable when the next paragraph grows', () => {
    const table = 'Done.\n\n| Method | Result |\n| --- | --- |\n| alpha | 1 |\n\nAfter'
    const split = splitStreamingRender(table)
    expect(split.held).toBe('')
    expect(split.blocks.some(block => block.source.includes('| alpha | 1 |'))).toBe(true)
    expect(split.visibleTail).toBe('After')
    const grown = splitStreamingRender(`${table} word`)
    expect(grown.blocks).toEqual(split.blocks)
  })

  it('hides an unclosed bracket display and an unclosed align environment', () => {
    expect(visible('Done.\n\n\\[\n\\alpha + \\beta')).toBe('Done.\n\n')
    expect(visible('Done.\n\n\\begin{align}\ny &= 2')).toBe('Done.\n\n')
    expect(visible('Done.\n\n\\begin{ali')).toBe('Done.\n\n')
  })

  it('commits closed bracket math and a closed align environment', () => {
    const source = 'Done.\n\n\\[\n\\alpha\n\\]\n\n\\begin{align}\ny &= 2\n\\end{align}\n\nFinal'
    const split = splitStreamingRender(source)
    expect(split.held).toBe('')
    expect(split.visibleTail).toBe('Final')
    expect(split.blocks.some(block => block.source.includes('\\alpha'))).toBe(true)
    expect(split.blocks.some(block => block.source.includes('y &= 2'))).toBe(true)
  })

  it('hides an unclosed inline dollar that still looks like math', () => {
    expect(visible('The value is $a^2+b')).toBe('The value is ')
    const closed = 'The value is $a^2+b^2$ today'
    const split = splitStreamingRender(closed)
    expect(split.held).toBe('')
    expect(split.blocks.some(block => block.source.includes('$a^2+b^2$'))).toBe(true)
    expect(split.visibleTail).toBe(' today')
  })

  it('shows a finished currency amount instead of holding the rest of the line', () => {
    const source = 'Price is $5 and tax is included'
    expect(visible(source)).toBe(source)
    expect(splitStreamingRender(source).held).toBe('')
  })

  it('leaves a finished mid-line prose $$ in the visible source', () => {
    const source = 'use $$ as delimiter.\n\nNext'
    expect(splitStreamingRender(source).held).toBe('')
    expect(visible(source)).toContain('$$')
  })

  it('hides a trailing backslash that may still become a delimiter', () => {
    expect(visible('Done.\n\n\\')).toBe('Done.\n\n')
  })
})
