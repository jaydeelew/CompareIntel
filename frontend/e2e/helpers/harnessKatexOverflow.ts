import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import type { Page } from '@playwright/test'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

export interface HarnessFixtureCell {
  label: string
  jsonPath: string
  /** When set, assert at least this many `.katex-display` nodes (0 = page/table/code only). */
  minDisplayMath?: number
}

/** Cells PR 227 audit flagged as clipped at 390px (full saved replies). */
export const CLIP_ARTIFACT_CELLS: HarnessFixtureCell[] = [
  {
    label: 'google/gemini-3.8-flash · 05-complex-scenarios',
    jsonPath: 'rendering-harness/runs/2026-11-08-14/google_gemini-3.8-flash_05-complex-scenarios.json',
  },
  {
    label: 'anthropic/claude-opus-5 · 04-mixed-markdown-latex',
    jsonPath: 'rendering-harness/runs/2026-11-08-19/anthropic_claude-opus-5_04-mixed-markdown-latex.json',
  },
  {
    label: 'minimax/minimax-m3.1-flash · 05-complex-scenarios',
    jsonPath: 'rendering-harness/runs/2026-11-08-05/minimax_minimax-m3.1-flash_05-complex-scenarios.json',
  },
]

export const MOBILE_KATEX_FIXTURES: HarnessFixtureCell[] = [
  {
    label: 'google/gemini-3.8-flash · 04-mixed-markdown-latex',
    jsonPath: 'rendering-harness/runs/2026-11-08-14/google_gemini-3.8-flash_04-mixed-markdown-latex.json',
  },
  ...CLIP_ARTIFACT_CELLS.slice(0, 1),
  {
    label: 'google/gemini-3.8-flash · 06-edge-cases-boundaries',
    jsonPath: 'rendering-harness/runs/2026-11-08-14/google_gemini-3.8-flash_06-edge-cases-boundaries.json',
  },
  {
    label: 'qwen/qwen3-30b-a3b-instruct-2507 · 05-complex-scenarios',
    jsonPath:
      'rendering-harness/runs/2026-11-08-04/qwen_qwen3-30b-a3b-instruct-2507_05-complex-scenarios.json',
    minDisplayMath: 0,
  },
  CLIP_ARTIFACT_CELLS[2],
  {
    label: 'qwen/qwen3-coder-next · 05-complex-scenarios',
    jsonPath: 'rendering-harness/runs/2026-11-08-06/qwen_qwen3-coder-next_05-complex-scenarios.json',
  },
  CLIP_ARTIFACT_CELLS[1],
  {
    label: 'anthropic/claude-opus-5 · 05-complex-scenarios',
    jsonPath: 'rendering-harness/runs/2026-11-08-19/anthropic_claude-opus-5_05-complex-scenarios.json',
  },
]

export const ARTIFACT_REPRESENTATIVE_CELLS = CLIP_ARTIFACT_CELLS

/** Master mobile rules before this PR (overrides fix with !important). */
export const MASTER_MOBILE_CLIP_CSS = `
.message-content,
.message-content .result-output {
  overflow-x: hidden !important;
}
@media (max-width: 768px) {
  .result-card {
    overflow-x: hidden !important;
  }
  .results-section {
    overflow-x: hidden !important;
  }
}
`

export function loadHarnessResponse(jsonRelPath: string): { modelId: string; content: string } {
  const abs = path.join(repoRoot, jsonRelPath)
  const raw = JSON.parse(fs.readFileSync(abs, 'utf-8')) as {
    modelId: string
    response: string
  }
  return { modelId: raw.modelId, content: raw.response }
}

export function harnessUrl(modelId: string, content: string): string {
  return `/?modelId=${encodeURIComponent(modelId)}&content=${encodeURIComponent(content)}`
}

export async function waitForHarnessRender(page: Page): Promise<void> {
  await page.waitForSelector('[data-render-complete], [data-render-failed]', { timeout: 120000 })
  const failed = page.locator('[data-render-failed]').first()
  if ((await failed.count()) > 0) {
    const reason =
      (await failed.getAttribute('data-render-failed')) ??
      (await page.locator('[data-render-container]').getAttribute('data-render-failed')) ??
      'unknown'
    throw new Error(`Harness render failed: ${reason}`)
  }
  await page.evaluate(() => document.fonts.ready)
  await page.waitForFunction(() => {
    const container = document.querySelector('[data-render-container]')
    if (!container) return false
    const pending = container.querySelectorAll('.katex-html[style*="visibility: hidden"]')
    return pending.length === 0
  })
}

export async function openHarnessWithContent(
  page: Page,
  harnessBase: string,
  modelId: string,
  content: string
): Promise<void> {
  const useUrl = content.length < 6000
  if (useUrl) {
    await page.goto(`${harnessBase}${harnessUrl(modelId, content)}`)
  } else {
    await page.goto(`${harnessBase}/?modelId=${encodeURIComponent(modelId)}`)
    await page.waitForFunction(
      () => {
        const text = document.body.textContent || ''
        return (
          text.includes('Waiting for render request') ||
          Boolean(document.querySelector('[data-render-complete]'))
        )
      },
      { timeout: 120000 }
    )
    await page.evaluate(
      ({ modelId: mid, content: body }) => {
        window.postMessage({ type: 'render', modelId: mid, content: body }, '*')
      },
      { modelId, content }
    )
  }
  await waitForHarnessRender(page)
}

export async function applyBeforeClipCss(page: Page): Promise<void> {
  await page.addStyleTag({ content: MASTER_MOBILE_CLIP_CSS })
  await page.evaluate(() => document.fonts.ready)
}

export type ClipProbe = {
  clipped: boolean
  kind: 'katex-display' | 'markdown-table-scroll' | 'code-block' | 'pre' | 'none'
  elementIndex: number
  scrollWidth: number
  clientWidth: number
  cardClientWidth: number
  contentRight: number
  cardRight: number
  overflowPx: number
  texSource: string | null
}

export async function probeWideContentClip(page: Page): Promise<ClipProbe> {
  return page.evaluate(() => {
    const empty = {
      clipped: false,
      kind: 'none',
      elementIndex: -1,
      scrollWidth: 0,
      clientWidth: 0,
      cardClientWidth: 0,
      contentRight: 0,
      cardRight: 0,
      overflowPx: 0,
      texSource: null,
    }

    const card = document.querySelector('.result-card.conversation-card, .result-card')
    if (!card) return empty

    const cardRect = card.getBoundingClientRect()
    const cardClientWidth = card.clientWidth
    const candidates: Array<{
      kind: string
      index: number
      overflowPx: number
      scrollWidth: number
      clientWidth: number
      contentRight: number
      texSource: string | null
    }> = []

    const groups = [
      ['katex-display', '.katex-display'],
      ['markdown-table-scroll', '.markdown-table-scroll'],
      ['code-block', '.code-block'],
      ['pre', 'pre'],
    ]

    for (let gi = 0; gi < groups.length; gi++) {
      const kind = groups[gi][0]
      const selector = groups[gi][1]
      const nodes = Array.from(card.querySelectorAll(selector))
      for (let index = 0; index < nodes.length; index++) {
        const htmlEl = nodes[index]
        const scrollWidth = htmlEl.scrollWidth
        const clientWidth = htmlEl.clientWidth
        const rect = htmlEl.getBoundingClientRect()
        const katexHtml = htmlEl.querySelector('.katex-html')
        const contentRight = Math.max(
          rect.right,
          katexHtml ? katexHtml.getBoundingClientRect().right : rect.right
        )

        let clips = false
        let node = htmlEl.parentElement
        while (node && node !== card) {
          const ox = getComputedStyle(node).overflowX
          if (ox === 'hidden' || ox === 'clip') {
            clips = true
            break
          }
          node = node.parentElement
        }
        const cardOx = getComputedStyle(card).overflowX
        if (cardOx === 'hidden' || cardOx === 'clip') clips = true
        if (!clips) continue

        const widerThanVisible = scrollWidth > clientWidth + 2
        const widerThanCard = scrollWidth > cardClientWidth + 2
        const pastCardEdge = contentRight > cardRect.right - 0.5
        if (!widerThanVisible && !widerThanCard && !pastCardEdge) continue

        const overflowPx = Math.max(
          scrollWidth - clientWidth,
          contentRight - cardRect.right,
          scrollWidth - cardClientWidth
        )
        if (overflowPx <= 4) continue

        const ann = htmlEl.querySelector('annotation[encoding="application/x-tex"]')
        const texSource = ann?.textContent?.trim() || null
        candidates.push({
          kind,
          index,
          overflowPx,
          scrollWidth,
          clientWidth,
          contentRight,
          texSource,
        })
      }
    }

    if (candidates.length === 0) {
      return { ...empty, cardClientWidth, cardRight: cardRect.right }
    }

    const displays = candidates.filter(c => c.kind === 'katex-display')
    const best =
      displays.length > 0
        ? displays.sort((a, b) => b.overflowPx - a.overflowPx)[0]
        : candidates.sort((a, b) => b.overflowPx - a.overflowPx)[0]
    return {
      clipped: true,
      kind: best.kind,
      elementIndex: best.index,
      scrollWidth: best.scrollWidth,
      clientWidth: best.clientWidth,
      cardClientWidth,
      contentRight: best.contentRight,
      cardRight: cardRect.right,
      overflowPx: best.overflowPx,
      texSource: best.texSource,
    }
  }) as Promise<ClipProbe>
}

export async function captureCardFullViewport(page: Page): Promise<Buffer> {
  const clip = await page.evaluate(() => {
    const card = document.querySelector('.result-card.conversation-card, .result-card') as HTMLElement | null
    if (!card) return null
    const r = card.getBoundingClientRect()
    const top = Math.max(0, Math.floor(r.top))
    const height = Math.ceil(r.height) + 1
    return { x: 0, y: top, width: 390, height: Math.min(height, 2400) }
  })
  if (!clip) throw new Error('No result card for viewport capture')
  return page.screenshot({ clip })
}

export async function scrollClipTargetToEnd(page: Page, probe: ClipProbe): Promise<void> {
  await page.evaluate(
    ({ kind, elementIndex }) => {
      const card = document.querySelector('.result-card')
      if (!card) return
      let selector = '.katex-display'
      if (kind === 'markdown-table-scroll') selector = '.markdown-table-scroll'
      else if (kind === 'code-block') selector = '.code-block'
      else if (kind === 'pre') selector = 'pre'
      const nodes = card.querySelectorAll(selector)
      const el = nodes[elementIndex] as HTMLElement | undefined
      if (!el) return
      el.scrollLeft = Math.max(0, el.scrollWidth - el.clientWidth)
    },
    { kind: probe.kind, elementIndex: probe.elementIndex }
  )
  await page.waitForFunction(
    ({ kind, elementIndex }) => {
      const card = document.querySelector('.result-card')
      if (!card) return false
      let selector = '.katex-display'
      if (kind === 'markdown-table-scroll') selector = '.markdown-table-scroll'
      else if (kind === 'code-block') selector = '.code-block'
      else if (kind === 'pre') selector = 'pre'
      const el = card.querySelectorAll(selector)[elementIndex] as HTMLElement | undefined
      if (!el || el.scrollWidth <= el.clientWidth + 2) return true
      return el.scrollLeft >= el.scrollWidth - el.clientWidth - 2
    },
    { kind: probe.kind, elementIndex: probe.elementIndex }
  )
}

function extractMarkdownTables(content: string): string[] {
  const re = /(?:^|\n)(\|[^\n]+\|\r?\n\|[-: |\t]+\|\r?\n(?:\|[^\n]+\|\r?\n?)+)/g
  return [...content.matchAll(re)].map(m => m[1].trim())
}

export function rawSourceExcerptForProbe(probe: ClipProbe, fullContent: string): string {
  if (probe.kind === 'katex-display' && probe.texSource) {
    return `$$\n${probe.texSource}\n$$`
  }
  if (probe.kind === 'markdown-table-scroll') {
    const tables = extractMarkdownTables(fullContent)
    const table = tables[probe.elementIndex] ?? tables.sort((a, b) => b.length - a.length)[0]
    if (table) {
      if (probe.texSource) {
        return `${table}\n\n# clipped cell math\n$${probe.texSource}$`
      }
      return table
    }
  }
  if (probe.texSource) return `$$\n${probe.texSource}\n$$`
  const blocks = [...fullContent.matchAll(/\$\$[\s\S]*?\$\$/g)]
    .map(m => m[0])
    .sort((a, b) => b.length - a.length)
  return blocks[0]?.trim() ?? fullContent.slice(0, 800)
}

/** @deprecated use rawSourceExcerptForProbe */
export function texExcerptFromProbe(probe: ClipProbe, fullContent: string): string {
  return rawSourceExcerptForProbe(probe, fullContent)
}

export type KatexOverflowAudit = {
  ok: boolean
  reason?: string
  displayCount: number
  viewportWidth: number
  documentScrollWidth: number
}

export async function auditMobileKatexOverflow(page: Page): Promise<KatexOverflowAudit> {
  return page.evaluate(() => {
    const docEl = document.documentElement
    const viewportWidth = docEl.clientWidth
    const documentScrollWidth = docEl.scrollWidth
    const card = document.querySelector('.result-card.conversation-card, .result-card') as HTMLElement | null

    if (documentScrollWidth > viewportWidth + 1) {
      return {
        ok: false,
        reason: `document scrollWidth ${documentScrollWidth} exceeds viewport ${viewportWidth}`,
        displayCount: 0,
        viewportWidth,
        documentScrollWidth,
      }
    }

    const displays = Array.from(document.querySelectorAll('.katex-display')) as HTMLElement[]
    for (const display of displays) {
      const style = getComputedStyle(display)
      const overflowX = style.overflowX
      const fitsInside = display.scrollWidth <= display.clientWidth + 1
      const scrollable = overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'overlay'

      if (!fitsInside && !scrollable) {
        return {
          ok: false,
          reason: `katex-display not fully visible and overflow-x is ${overflowX}`,
          displayCount: displays.length,
          viewportWidth,
          documentScrollWidth,
        }
      }

      let node: HTMLElement | null = display.parentElement
      while (node && node !== card) {
        const ox = getComputedStyle(node).overflowX
        if (ox === 'hidden' || ox === 'clip') {
          return {
            ok: false,
            reason: `ancestor ${node.className || node.tagName} clips with overflow-x: ${ox}`,
            displayCount: displays.length,
            viewportWidth,
            documentScrollWidth,
          }
        }
        node = node.parentElement
      }

      if (card) {
        const cardOx = getComputedStyle(card).overflowX
        if (cardOx === 'hidden' || cardOx === 'clip') {
          return {
            ok: false,
            reason: `result-card clips with overflow-x: ${cardOx}`,
            displayCount: displays.length,
            viewportWidth,
            documentScrollWidth,
          }
        }
      }
    }

    return {
      ok: true,
      displayCount: displays.length,
      viewportWidth,
      documentScrollWidth,
    }
  })
}
