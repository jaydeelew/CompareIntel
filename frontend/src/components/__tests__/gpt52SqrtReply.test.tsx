/**
 * The GPT 5.2 square-root reply must render as KaTeX and markdown in the
 * formatted tab, including while the renderer chunk is still loading.
 */
import { render, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import { initializeRegistry } from '../../config/loadModelConfigs'
import { GPT52_SQRT_REPLY } from '../../testSupport/gpt52SqrtReply'
import { FormattedAnswerWithInlinePreviews } from '../comparison/FormattedAnswerWithInlinePreviews'
import {
  clearLoadedLatexRendererForTests,
  setLatexRendererLoaderForTests,
  setLoadedLatexRenderer,
} from '../conversation/latexRendererCache'
import { MessageBubble } from '../conversation/MessageBubble'
import LatexRenderer from '../LatexRenderer'

function visibleText(root: ParentNode): string {
  const clone = (root as Element).cloneNode(true) as Element
  clone.querySelectorAll('.katex-mathml, annotation, script, style').forEach(node => node.remove())
  return (clone.textContent ?? '').replace(/[\u200b\u2060]/g, '')
}

function expectFormattedMath(root: ParentNode): void {
  expect(root.querySelectorAll('.katex').length).toBeGreaterThanOrEqual(3)
  expect(root.querySelector('strong')?.textContent).toBe('irrational')
  const text = visibleText(root)
  expect(text).not.toContain('\\(')
  expect(text).not.toContain('\\[')
  expect(text).not.toContain('**')
  expect(text).toContain('positive number')
  expect(text).toContain('forever without repeating')
}

beforeAll(async () => {
  await initializeRegistry()
})

afterEach(() => {
  setLatexRendererLoaderForTests(null)
  setLoadedLatexRenderer(LatexRenderer)
})

describe('GPT 5.2 square-root reply', () => {
  it('renders \\( \\), \\[ \\], and bold after the reply is complete', () => {
    const { container } = render(
      <LatexRenderer modelId="openai/gpt-5.2">{GPT52_SQRT_REPLY}</LatexRenderer>
    )
    expectFormattedMath(container)
    const sources = Array.from(
      container.querySelectorAll('annotation[encoding="application/x-tex"]')
    ).map(node => node.textContent ?? '')
    expect(sources).toEqual(
      expect.arrayContaining([
        '\\sqrt{2}',
        '(\\sqrt{2})^2 = 2',
        '\\sqrt{2} \\approx 1.41421356237\\ldots',
      ])
    )
  })

  it('renders the same reply while streaming', () => {
    const { container } = render(
      <LatexRenderer modelId="openai/gpt-5.2" streaming>
        {GPT52_SQRT_REPLY}
      </LatexRenderer>
    )
    expect(container.querySelector('[data-streaming-render]')).toBeTruthy()
    expectFormattedMath(container)
  })

  it('renders a closed inline delimiter before the rest of the reply arrives', () => {
    const partial = '\\(\\sqrt{2}\\) is the positive number'
    const { container } = render(
      <LatexRenderer modelId="openai/gpt-5.2" streaming>
        {partial}
      </LatexRenderer>
    )
    expect(container.querySelector('.katex')).toBeTruthy()
    expect(visibleText(container)).not.toContain('\\(')
    expect(visibleText(container)).toContain('positive number')
  })

  it('renders $...$, $$...$$, and bold', () => {
    const { container } = render(
      <LatexRenderer modelId="openai/gpt-5.2">
        {'Inline $\\sqrt{2}$ then $$\\sqrt{2}$$ and **irrational**.'}
      </LatexRenderer>
    )
    expect(container.querySelectorAll('.katex').length).toBeGreaterThanOrEqual(2)
    expect(container.querySelector('strong')?.textContent).toBe('irrational')
    expect(visibleText(container)).not.toContain('**')
    expect(visibleText(container)).not.toMatch(/\$/)
  })

  it('does not paint raw delimiters in the formatted tab while the renderer chunk is loading', async () => {
    clearLoadedLatexRendererForTests()
    let release: (component: typeof LatexRenderer) => void = () => {}
    setLatexRendererLoaderForTests(
      () =>
        new Promise(resolve => {
          release = resolve
        })
    )

    const { container } = render(
      <MessageBubble
        id="gpt52-1"
        type="assistant"
        content={GPT52_SQRT_REPLY}
        timestamp="2026-11-26T18:46:56.000Z"
        modelId="openai/gpt-5.2"
        modelName="GPT 5.2"
      />
    )

    const bubble = container.querySelector('.conversation-message.assistant .message-content')
    expect(bubble?.querySelector('[data-renderer-pending="true"]')).toBeTruthy()
    expect(bubble?.textContent ?? '').not.toContain('\\(')
    expect(bubble?.textContent ?? '').not.toContain('\\[')
    expect(bubble?.textContent ?? '').not.toContain('**')
    expect(container.querySelector('.katex')).toBeNull()

    release(LatexRenderer)
    await waitFor(() => {
      expect(container.querySelectorAll('.katex').length).toBeGreaterThanOrEqual(3)
    })
    expectFormattedMath(container)
  })

  it('does not paint raw delimiters in the link-preview formatted view while loading', async () => {
    clearLoadedLatexRendererForTests()
    let release: (component: typeof LatexRenderer) => void = () => {}
    setLatexRendererLoaderForTests(
      () =>
        new Promise(resolve => {
          release = resolve
        })
    )

    const { container } = render(
      <FormattedAnswerWithInlinePreviews
        content={GPT52_SQRT_REPLY}
        modelId="openai/gpt-5.2"
        enabled
      />
    )

    expect(container.querySelector('[data-renderer-pending="true"]')).toBeTruthy()
    expect(container.textContent ?? '').not.toContain('\\(')
    expect(container.textContent ?? '').not.toContain('**')

    release(LatexRenderer)
    await waitFor(() => {
      expect(container.querySelector('strong')?.textContent).toBe('irrational')
    })
    expectFormattedMath(container)
  })
})
