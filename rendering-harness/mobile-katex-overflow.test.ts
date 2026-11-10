import { test, expect } from '@playwright/test'

import {
  MOBILE_KATEX_FIXTURES,
  auditMobileKatexOverflow,
  harnessUrl,
  loadHarnessResponse,
  waitForHarnessRender,
} from '../frontend/e2e/helpers/harnessKatexOverflow'

test.describe('Mobile KaTeX overflow (390px)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  for (const cell of MOBILE_KATEX_FIXTURES) {
    test(`saved reply: ${cell.label}`, async ({ page }) => {
      const { modelId, content } = loadHarnessResponse(cell.jsonPath)
      await page.goto(harnessUrl(modelId, content))
      await waitForHarnessRender(page)

      const audit = await auditMobileKatexOverflow(page)
      expect(audit.ok, audit.reason).toBe(true)
      const minDisplay = cell.minDisplayMath ?? 1
      expect(audit.displayCount).toBeGreaterThanOrEqual(minDisplay)
    })
  }
})
