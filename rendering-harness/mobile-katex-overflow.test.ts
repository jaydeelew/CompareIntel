import { test, expect } from '@playwright/test'

import {
  CLIP_ARTIFACT_CELLS,
  MOBILE_KATEX_FIXTURES,
  applyBeforeClipCss,
  auditMobileKatexOverflow,
  loadHarnessResponse,
  openHarnessWithContent,
  probeWideContentClip,
} from '../frontend/e2e/helpers/harnessKatexOverflow'

const HARNESS_BASE = 'http://127.0.0.1:5174'

test.describe('Mobile KaTeX overflow (390px)', () => {
  test.use({ viewport: { width: 390, height: 900 } })

  for (const cell of MOBILE_KATEX_FIXTURES) {
    test(`saved reply: ${cell.label}`, async ({ page }) => {
      const { modelId, content } = loadHarnessResponse(cell.jsonPath)
      await openHarnessWithContent(page, HARNESS_BASE, modelId, content)

      const audit = await auditMobileKatexOverflow(page)
      expect(audit.ok, audit.reason).toBe(true)
      const minDisplay = cell.minDisplayMath ?? 1
      expect(audit.displayCount).toBeGreaterThanOrEqual(minDisplay)
    })
  }

  for (const cell of CLIP_ARTIFACT_CELLS) {
    test(`before CSS clips wide content (regression proof): ${cell.label}`, async ({ page }) => {
      const { modelId, content } = loadHarnessResponse(cell.jsonPath)
      await openHarnessWithContent(page, HARNESS_BASE, modelId, content)
      await applyBeforeClipCss(page)
      const probe = await probeWideContentClip(page)
      expect(probe.clipped, JSON.stringify(probe)).toBe(true)
      expect(probe.scrollWidth).toBeGreaterThan(probe.clientWidth + 4)
      expect(probe.overflowPx).toBeGreaterThan(8)
    })
  }
})
