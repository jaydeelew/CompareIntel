import { readFileSync } from 'node:fs'
import path from 'node:path'

import { render } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'

import LatexRenderer from '../../components/LatexRenderer'
import { initializeRegistry } from '../../config/loadModelConfigs'

const MODEL = 'google/gemini-4-hydrogen'
const FIXTURE = path.resolve(
  __dirname,
  '../../../../rendering-harness/fixtures/google_gemini-4-hydrogen_08-casual-prose.json'
)

function renderReply(markdown: string): HTMLElement {
  const { container } = render(<LatexRenderer modelId={MODEL}>{markdown}</LatexRenderer>)
  return container.querySelector('.latex-content') as HTMLElement
}

function visibleText(el: Element): string {
  const clone = el.cloneNode(true) as Element
  clone.querySelectorAll('.katex-mathml, pre, code, annotation').forEach(node => node.remove())
  const paragraphs = [...clone.querySelectorAll('p')]
    .map(p => (p.textContent ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  if (paragraphs.length > 0) {
    return paragraphs.join(' ')
  }
  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function texSources(el: Element): string[] {
  return Array.from(el.querySelectorAll('annotation[encoding="application/x-tex"]')).map(
    node => node.textContent ?? ''
  )
}

beforeAll(async () => {
  await initializeRegistry()
})

/** CommonMark/GFM visible text for this saved reply (no KaTeX rewrites in casual prose). */
const REFERENCE_VISIBLE = JSON.parse(readFileSync(FIXTURE, 'utf8'))
  .response.replace(/\s+/g, ' ')
  .trim()

describe('08-casual-prose hydrogen regression', () => {
  it('renders the full saved reply visible text (money as money, no paragraph loss)', () => {
    const { response } = JSON.parse(readFileSync(FIXTURE, 'utf8')) as { response: string }
    const el = renderReply(response)
    const visible = visibleText(el)
    expect(visible).toBe(REFERENCE_VISIBLE)
    expect(texSources(el)).toEqual([])
  })
})