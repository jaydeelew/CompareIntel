import { test, expect } from './fixtures'
import {
  CLIP_ARTIFACT_CELLS,
  MOBILE_KATEX_FIXTURES,
  applyBeforeClipCss,
  auditMobileKatexOverflow,
  loadHarnessResponse,
  openHarnessWithContent,
  probeWideContentClip,
} from './helpers/harnessKatexOverflow'

const HARNESS_BASE = 'http://127.0.0.1:5174'

/**
 * Validates wide KaTeX display math at phone width using saved rendering-harness replies.
 * Uses the rendering-harness dev app (port 5174) so no OpenRouter calls are needed.
 */
test.describe('Mobile KaTeX overflow (390px)', () => {
  test.describe.configure({ mode: 'parallel' })

  test.beforeEach(({ browserName }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium',
      'Harness fixture rendering runs on Chromium only to keep CI time bounded'
    )
    test.skip(browserName !== 'chromium', 'Harness fixture rendering runs on Chromium only')
  })

  test.use({
    baseURL: HARNESS_BASE,
    viewport: { width: 390, height: 900 },
    deviceScaleFactor: 1,
  })

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

  test('desktop 960px layout: no new horizontal page overflow vs harness baseline', async ({
    page,
  }) => {
    const cell = MOBILE_KATEX_FIXTURES[1]
    const { modelId, content } = loadHarnessResponse(cell.jsonPath)
    await page.setViewportSize({ width: 960, height: 900 })
    await openHarnessWithContent(page, HARNESS_BASE, modelId, content)

    const metrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      displayCount: document.querySelectorAll('.katex-display').length,
    }))

    expect(metrics.displayCount).toBeGreaterThan(0)
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1)
  })
})
