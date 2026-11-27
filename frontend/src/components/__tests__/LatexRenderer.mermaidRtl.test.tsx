import fs from 'node:fs'
import path from 'node:path'

import { render, waitFor } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { initializeRegistry } from '../../config/loadModelConfigs'
import {
  compareSignatures,
  renderReferenceHtml,
  signatureFromElement,
  signatureFromHtml,
} from '../../utils/__tests__/renderingAudit'
import { extractHeadingSection, REPO_ROOT } from '../../utils/__tests__/renderingAudit/section'
import LatexRenderer from '../LatexRenderer'

const mermaidState = vi.hoisted(() => {
  let theme = 'default'
  return {
    initialize: vi.fn((config: { theme?: string }) => {
      theme = config.theme ?? 'default'
    }),
    parse: vi.fn(async (source: string) =>
      source.includes('NOT_A_DIAGRAM') ? false : { diagramType: 'flowchart' }
    ),
    render: vi.fn(async (_id: string, source: string) => ({
      svg: `<svg class="test-mermaid" data-theme="${theme}"><title>${source.length}</title></svg>`,
    })),
  }
})

vi.mock('mermaid', () => ({
  default: mermaidState,
}))

const PR320 = [
  'openai/gpt-6.2-astra',
  'openai/gpt-6.2-sol',
  'openai/gpt-6.2-astra-pro',
  'openai/gpt-6.2-sol-pro',
  'google/gemini-4-neon',
] as const

beforeAll(async () => {
  await initializeRegistry()
})

beforeEach(() => {
  ;(window as Window & { __CI_RENDER_MERMAID__?: boolean }).__CI_RENDER_MERMAID__ = true
  mermaidState.initialize.mockClear()
  mermaidState.parse.mockClear()
  mermaidState.render.mockClear()
})

function renderSection(markdown: string): HTMLElement {
  const { container } = render(<LatexRenderer modelId="__default__">{markdown}</LatexRenderer>)
  const root = container.querySelector('.latex-content') as HTMLElement | null
  if (!root) throw new Error('missing latex root')
  return root
}

function savedResponse(modelId: string): string {
  const file = path.join(
    REPO_ROOT,
    'rendering-harness/runs/2026-11-23-pr320',
    `${modelId.replace(/\//g, '_')}_06-edge-cases-boundaries.json`
  )
  const data = JSON.parse(fs.readFileSync(file, 'utf8')) as { response?: string }
  if (!data.response) throw new Error(`empty ${modelId}`)
  return data.response
}

function rtlHosts(root: ParentNode): string[] {
  return Array.from(root.querySelectorAll('p, li, td, th'))
    .filter(el => /[\u0590-\u08FF]/.test(el.textContent || ''))
    .filter(
      el =>
        !Array.from(el.querySelectorAll('p, li, td, th')).some(child =>
          /[\u0590-\u08FF]/.test(child.textContent || '')
        )
    )
    .map(
      el =>
        `${el.tagName.toLowerCase()}|${el.getAttribute('dir')}|${(el.textContent || '').replace(/\s+/g, ' ').trim()}`
    )
}

describe('mermaid diagrams and RTL blocks', () => {
  it('renders a mermaid fence as an SVG and keeps the source for the reference', async () => {
    const section = [
      '## Mermaid and chemistry',
      '',
      '```mermaid',
      'graph TD',
      '  A[Start] --> B[End]',
      '```',
      '',
    ].join('\n')
    const el = renderSection(section)
    await waitFor(() => {
      expect(el.querySelector('.mermaid-diagram svg')).not.toBeNull()
    })
    expect(el.querySelector('[data-mermaid-pending]')).toBeNull()
    expect(el.querySelector('.mermaid-diagram')?.getAttribute('data-mermaid-rendered')).toBe('true')
    expect(el.querySelector('code.language-mermaid')?.textContent).toContain('A[Start]')
    const { pass, diffs } = compareSignatures(
      signatureFromHtml(renderReferenceHtml(section)),
      signatureFromElement(el)
    )
    expect(pass, JSON.stringify(diffs, null, 2)).toBe(true)
  })

  it('falls back to a code block when mermaid cannot parse the fence', async () => {
    const section = ['```mermaid', 'NOT_A_DIAGRAM', '```', ''].join('\n')
    const el = renderSection(section)
    await waitFor(() => {
      expect(el.querySelector('[data-mermaid-fallback]')).not.toBeNull()
    })
    expect(el.querySelector('.mermaid-diagram svg')).toBeNull()
    expect(el.querySelector('[data-mermaid-pending]')).toBeNull()
    expect(el.querySelector('[data-language="mermaid"] code')?.textContent).toContain(
      'NOT_A_DIAGRAM'
    )
    const { pass, diffs } = compareSignatures(
      signatureFromHtml(renderReferenceHtml(section)),
      signatureFromElement(el)
    )
    expect(pass, JSON.stringify(diffs, null, 2)).toBe(true)
  })

  it('wraps the first paragraph after a heading that follows a mermaid diagram', async () => {
    const section = [
      '## Mermaid',
      '',
      '```mermaid',
      'graph TD',
      '  A[Start] --> B[End]',
      '```',
      '',
      '## RTL',
      '',
      'English stays on the left.',
      '',
      'مرحبا بالعالم',
      '',
    ].join('\n')
    const el = renderSection(section)
    await waitFor(() => {
      expect(el.querySelector('.mermaid-diagram svg, [data-mermaid-fallback]')).not.toBeNull()
    })
    const english = Array.from(el.querySelectorAll('p')).find(p =>
      (p.textContent || '').includes('English stays')
    )
    expect(
      english?.getAttribute('dir'),
      el.innerHTML.slice(el.innerHTML.indexOf('RTL'), el.innerHTML.indexOf('RTL') + 220)
    ).toBe('auto')
  })

  it('puts dir=auto on RTL paragraphs, list items, and table cells without flipping LTR, math, or code', () => {
    const section = [
      '## Emoji, RTL, CJK, and overflow',
      '',
      'English stays on the left.',
      '',
      'مرحبا بالعالم',
      '',
      '- First item',
      '- مرحبا بالعالم',
      '- שלום עולם',
      '',
      '| Name | Greeting |',
      '| --- | --- |',
      '| English | hello |',
      '| Arabic | مرحبا |',
      '',
      'Inline $x^2$ beside مرحبا بالعالم and `code_token`.',
      '',
      '```python',
      '# comment مرحبا',
      'print("ok")',
      '```',
      '',
    ].join('\n')
    const el = renderSection(section)
    const ref = renderReferenceHtml(section)
    expect(rtlHosts(el)).toEqual(rtlHosts(new DOMParser().parseFromString(ref, 'text/html')))
    const arabicParagraph = Array.from(el.querySelectorAll('p')).find(
      p =>
        (p.textContent || '').includes('مرحبا بالعالم') && !(p.textContent || '').includes('Inline')
    )
    expect(arabicParagraph?.getAttribute('dir')).toBe('auto')
    const english = Array.from(el.querySelectorAll('p')).find(p =>
      (p.textContent || '').includes('English stays')
    )
    expect(english?.getAttribute('dir')).toBe('auto')
    const arabicItem = Array.from(el.querySelectorAll('li')).find(li =>
      (li.textContent || '').trim().startsWith('مرحبا')
    )
    const hebrewItem = Array.from(el.querySelectorAll('li')).find(li =>
      (li.textContent || '').includes('שלום')
    )
    const englishItem = Array.from(el.querySelectorAll('li')).find(li =>
      (li.textContent || '').includes('First item')
    )
    expect(arabicItem?.getAttribute('dir')).toBe('auto')
    expect(hebrewItem?.getAttribute('dir')).toBe('auto')
    expect(englishItem?.getAttribute('dir')).toBe('auto')
    const arabicCell = Array.from(el.querySelectorAll('td')).find(td =>
      (td.textContent || '').includes('مرحبا')
    )
    const englishCell = Array.from(el.querySelectorAll('td')).find(td =>
      (td.textContent || '').includes('hello')
    )
    expect(arabicCell?.getAttribute('dir')).toBe('auto')
    expect(englishCell?.getAttribute('dir')).toBe('auto')
    expect(el.querySelector('.katex')?.getAttribute('dir')).toBe('ltr')
    expect(el.querySelector('code.inline-code')?.getAttribute('dir')).toBe('ltr')
    expect(el.querySelector('pre code')?.getAttribute('dir')).toBe('ltr')
    expect(el.querySelector('pre code')?.textContent).toContain('مرحبا')
    const { pass, diffs } = compareSignatures(signatureFromHtml(ref), signatureFromElement(el))
    expect(pass, JSON.stringify(diffs, null, 2)).toBe(true)
  })

  it.each(PR320)(
    'matches the reference for the full mermaid and RTL sections of %s',
    async modelId => {
      const response = savedResponse(modelId)
      const mermaid = extractHeadingSection(response, '^## .*[Mm]ermaid')
      const rtl = extractHeadingSection(response, '^## .*RTL')
      expect(mermaid).toMatch(/```mermaid/)
      expect(rtl).toMatch(/مرحبا/)

      for (const section of [mermaid, rtl]) {
        const el = renderSection(section)
        if (section.includes('```mermaid')) {
          await waitFor(() => {
            expect(el.querySelector('.mermaid-diagram svg, [data-mermaid-fallback]')).not.toBeNull()
          })
          expect(el.querySelector('code.language-mermaid')?.textContent).toMatch(/graph TD/)
        }
        const rtlBlocks = rtlHosts(el)
        expect(rtlBlocks.every(row => row.includes('|auto|'))).toBe(true)
        if (section.includes('مرحبا')) {
          expect(rtlBlocks.some(row => row.includes('مرحبا'))).toBe(true)
        }
        const ref = signatureFromHtml(renderReferenceHtml(section))
        const { pass, diffs } = compareSignatures(ref, signatureFromElement(el))
        expect(pass, JSON.stringify(diffs, null, 2)).toBe(true)
      }
    }
  )
})
