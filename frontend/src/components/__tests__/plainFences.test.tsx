/**
 * Untagged and alternate fences must survive the shared LatexRenderer.
 * The formatted tab used to paint language-less fences as one nowrap line.
 */
import { render } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'

import { initializeRegistry } from '../../config/loadModelConfigs'
import LatexRenderer from '../LatexRenderer'

const SONNET = 'anthropic/claude-sonnet-5.5'
const GPT = 'openai/gpt-4o-mini'

function renderReply(markdown: string, modelId: string): HTMLElement {
  const { container } = render(<LatexRenderer modelId={modelId}>{markdown}</LatexRenderer>)
  return container.querySelector('.latex-content') as HTMLElement
}

function blockTexts(el: HTMLElement): string[] {
  return Array.from(el.querySelectorAll('.code-block-direct code')).map(
    node => node.textContent ?? ''
  )
}

const SWAP = 'Before: x=10, y=20\nAfter:  x=20, y=10'

beforeAll(async () => {
  await initializeRegistry()
})

describe('plain fenced code in the shared renderer', () => {
  const markdown = [
    'Output:',
    '```',
    'Before: x=10, y=20',
    'After:  x=20, y=10',
    '```',
    '',
    'C has only pass-by-value, so you pass **pointers** to the variables. A function like `void swap(int a, int b)` would only swap local copies.',
    '',
    '```text',
    'alpha = $1',
    'beta = $2',
    '```',
    '',
    '```plaintext',
    'line one',
    'line two',
    '```',
    '',
    '~~~',
    'tilde = $9',
    'still = 1',
    '~~~',
    '',
    '- Swap them:',
    '    ```',
    '    Before: x=10, y=20',
    '    After:  x=20, y=10',
    '    ```',
    '',
    'The old ~~name~~ stays.',
    '',
    '```python',
    'print("ok")',
    '```',
  ].join('\n')

  it.each([SONNET, GPT])('keeps every fence variant readable (%s)', modelId => {
    const el = renderReply(markdown, modelId)
    expect(blockTexts(el)).toEqual([
      SWAP,
      'alpha = $1\nbeta = $2',
      'line one\nline two',
      'tilde = $9\nstill = 1',
      SWAP,
      'print("ok")',
    ])
    expect(el.querySelector('.preformatted-text')).toBeNull()
    expect(el.querySelectorAll('.code-block-direct pre code')).toHaveLength(6)
    for (const block of el.querySelectorAll('.code-block-direct')) {
      expect(block.querySelector('.katex')).toBeNull()
    }
    expect(el.textContent).toContain('Output:')
    expect(el.querySelector('h1, h2')).toBeNull()
    expect(el.querySelector('code.inline-code')?.textContent).toBe('void swap(int a, int b)')
    expect(el.querySelector('strong')?.textContent).toBe('pointers')
    expect(el.querySelector('.markdown-strikethrough')?.textContent).toBe('name')
    expect(el.textContent).not.toContain('```')
    expect(el.textContent).not.toContain('~~~')
  })

  it('keeps a CRLF untagged fence as two lines', () => {
    const el = renderReply(`Output:\r\n\`\`\`\r\n${SWAP}\r\n\`\`\`\r\n`, SONNET)
    expect(blockTexts(el)).toEqual([SWAP])
    expect(el.textContent).toContain('Output:')
    expect(el.querySelector('.katex')).toBeNull()
  })
})
