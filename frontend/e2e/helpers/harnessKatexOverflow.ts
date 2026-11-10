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

export const MOBILE_KATEX_FIXTURES: HarnessFixtureCell[] = [
  {
    label: 'google/gemini-3.8-flash · 04-mixed-markdown-latex',
    jsonPath: 'rendering-harness/runs/2026-11-08-14/google_gemini-3.8-flash_04-mixed-markdown-latex.json',
  },
  {
    label: 'google/gemini-3.8-flash · 05-complex-scenarios',
    jsonPath: 'rendering-harness/runs/2026-11-08-14/google_gemini-3.8-flash_05-complex-scenarios.json',
  },
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
  {
    label: 'minimax/minimax-m3.1-flash · 05-complex-scenarios',
    jsonPath: 'rendering-harness/runs/2026-11-08-05/minimax_minimax-m3.1-flash_05-complex-scenarios.json',
  },
  {
    label: 'qwen/qwen3-coder-next · 05-complex-scenarios',
    jsonPath: 'rendering-harness/runs/2026-11-08-06/qwen_qwen3-coder-next_05-complex-scenarios.json',
  },
  {
    label: 'anthropic/claude-opus-5 · 04-mixed-markdown-latex',
    jsonPath: 'rendering-harness/runs/2026-11-08-19/anthropic_claude-opus-5_04-mixed-markdown-latex.json',
  },
  {
    label: 'anthropic/claude-opus-5 · 05-complex-scenarios',
    jsonPath: 'rendering-harness/runs/2026-11-08-19/anthropic_claude-opus-5_05-complex-scenarios.json',
  },
]

/** Representative cells for before/after artifact captures. */
export const ARTIFACT_REPRESENTATIVE_CELLS: HarnessFixtureCell[] = [
  MOBILE_KATEX_FIXTURES[1],
  MOBILE_KATEX_FIXTURES[7],
  MOBILE_KATEX_FIXTURES[5],
]

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
  await page.waitForSelector('[data-render-complete], [data-render-failed]', { timeout: 60000 })
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
