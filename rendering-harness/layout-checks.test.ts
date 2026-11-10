import { test, expect } from '@playwright/test'
import { collectLayoutIssues } from './layout-checks.js'

test.describe('Phone and dark layout checks', () => {
  test('a nowrap line past the page is overflow, a scrolling table is not', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.setContent(`
      <style>html, body { margin: 0; }</style>
      <div data-render-container>
        <div class="markdown-table-scroll" style="width:390px; max-width:100%; overflow-x:auto">
          <table style="width:900px"><tr><td>wide table stays in its scroller</td></tr></table>
        </div>
        <p style="white-space:nowrap; margin:0">${'A'.repeat(500)}</p>
      </div>
    `)
    const issues = await page.evaluate(collectLayoutIssues, 'phone')
    expect(issues.some(issue => issue.kind === 'page-overflow' && issue.sample.startsWith('AAAA'))).toBe(true)
    expect(issues.some(issue => issue.sample.includes('wide table stays'))).toBe(false)
  })

  test('overlapping text and clipped KaTeX are reported', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.setContent(`
      <div data-render-container style="position:relative; width:390px; height:200px">
        <p style="position:absolute; left:0; top:0; margin:0">Alpha overlap text</p>
        <p style="position:absolute; left:0; top:0; margin:0">Beta overlap text</p>
        <div style="overflow:hidden; height:10px; width:80px; margin-top:80px">
          <span class="katex" style="display:inline-block; height:48px">clipped math</span>
        </div>
      </div>
    `)
    const issues = await page.evaluate(collectLayoutIssues, 'phone')
    expect(issues.some(issue => issue.kind === 'text-overlap')).toBe(true)
    expect(issues.some(issue => issue.kind === 'clipped-katex')).toBe(true)
  })

  test('dark theme uses data-theme and flags low-contrast text', async ({ page }) => {
    await page.setContent(`
      <html data-theme="dark" style="color-scheme: dark">
        <body style="background:#111; color:#eee">
          <div data-render-container>
            <p style="color:#111; background:#111">invisible sentence</p>
          </div>
        </body>
      </html>
    `)
    const issues = await page.evaluate(collectLayoutIssues, 'dark')
    expect(issues.some(issue => issue.kind === 'dark-theme')).toBe(false)
    expect(issues.some(issue => issue.kind === 'dark-contrast')).toBe(true)
  })
})
