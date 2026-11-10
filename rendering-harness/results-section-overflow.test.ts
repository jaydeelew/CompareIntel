import { test, expect } from '@playwright/test'
import { chromium } from 'playwright'
import { collectLayoutIssues } from './layout-checks.js'
import { launchVite } from './launch-vite.js'
import { openThemedPage, renderOnPage, PHONE_VIEW } from './captures.js'
import { findSavedCell } from './saved-cells.js'

const REPRESENTATIVE = [
  'google/gemini-3.8-flash:05-complex-scenarios',
  'anthropic/claude-opus-5:04-mixed-markdown-latex',
  'minimax/minimax-m3.1-flash:05-complex-scenarios',
] as const

test.describe('Results section mobile overflow', () => {
  for (const spec of REPRESENTATIVE) {
    test(`phone layout passes for ${spec}`, async () => {
      const vite = await launchVite()
      const browser = await chromium.launch()
      try {
        const page = await openThemedPage(browser, vite.port, 'light', PHONE_VIEW)
        const cell = await findSavedCell(spec)
        await renderOnPage(page, cell.modelId, cell.response, `regression:${spec}`)
        const issues = await page.evaluate(collectLayoutIssues, 'phone')
        expect(issues, JSON.stringify(issues)).toEqual([])
        const overflow = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }))
        expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1)
      } finally {
        await browser.close()
        vite.stop()
      }
    })
  }
})
