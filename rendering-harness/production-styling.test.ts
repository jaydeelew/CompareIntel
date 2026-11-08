import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { waitForHarnessRender } from './test-helpers'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TABLE_MD = fs.readFileSync(path.join(__dirname, 'fixtures/table-sample.md'), 'utf-8')
const VISUAL_DIR = path.join(__dirname, 'fixtures/visual')

async function openTable(page: import('@playwright/test').Page) {
  await page.goto('/?modelId=test&content=' + encodeURIComponent(TABLE_MD))
  await waitForHarnessRender(page)
}

async function tableComputed(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const html = document.documentElement
    const container = document.querySelector('[data-render-container]')
    const card = document.querySelector('.result-card.conversation-card')
    const message = document.querySelector('.message-content')
    const scroll = document.querySelector('.markdown-table-scroll') as HTMLElement | null
    const table = document.querySelector('table.markdown-table') as HTMLElement | null
    const th = table?.querySelector('th') as HTMLElement | null
    const td = table?.querySelector('td') as HTMLElement | null
    if (!scroll || !table || !th || !td || !container || !card || !message) {
      return { ok: false as const, reason: 'missing production table DOM' }
    }
    const scrollStyle = getComputedStyle(scroll)
    const tableStyle = getComputedStyle(table)
    const thStyle = getComputedStyle(th)
    const tdStyle = getComputedStyle(td)
    return {
      ok: true as const,
      theme: html.getAttribute('data-theme'),
      hasResultsSection: Boolean(document.querySelector('.results-section')),
      hasResultsGrid: Boolean(document.querySelector('.results-grid')),
      hasCard: Boolean(card),
      hasMessageContent: Boolean(message),
      scrollOverflowX: scrollStyle.overflowX,
      tableBorderCollapse: tableStyle.borderCollapse,
      tableMinWidth: tableStyle.minWidth,
      thPadding: {
        top: parseFloat(thStyle.paddingTop),
        right: parseFloat(thStyle.paddingRight),
        bottom: parseFloat(thStyle.paddingBottom),
        left: parseFloat(thStyle.paddingLeft),
      },
      tdPadding: {
        top: parseFloat(tdStyle.paddingTop),
        right: parseFloat(tdStyle.paddingRight),
        bottom: parseFloat(tdStyle.paddingBottom),
        left: parseFloat(tdStyle.paddingLeft),
      },
      thBorderBottomWidth: parseFloat(thStyle.borderBottomWidth),
      tdBorderBottomWidth: parseFloat(tdStyle.borderBottomWidth),
      tableScrollWidth: table.scrollWidth,
      scrollClientWidth: scroll.clientWidth,
    }
  })
}

function assertProductionTableStyles(
  styles: Awaited<ReturnType<typeof tableComputed>>,
  viewport: 'desktop' | 'mobile'
) {
  expect(styles.ok, 'reason' in styles ? styles.reason : '').toBe(true)
  if (!styles.ok) return
  expect(styles.theme).toBe('light')
  expect(styles.hasResultsSection).toBe(true)
  expect(styles.hasResultsGrid).toBe(true)
  expect(styles.hasCard).toBe(true)
  expect(styles.hasMessageContent).toBe(true)
  expect(styles.scrollOverflowX).toBe('auto')
  expect(styles.tableBorderCollapse).toBe('collapse')
  // results.css: th/td padding 0.75rem 1rem (12px / 16px at 16px root)
  expect(styles.thPadding.top).toBe(12)
  expect(styles.thPadding.right).toBe(16)
  expect(styles.thPadding.bottom).toBe(12)
  expect(styles.thPadding.left).toBe(16)
  expect(styles.tdPadding.top).toBe(12)
  expect(styles.tdPadding.right).toBe(16)
  expect(styles.tdPadding.bottom).toBe(12)
  expect(styles.tdPadding.left).toBe(16)
  expect(styles.thBorderBottomWidth).toBeGreaterThan(0)
  expect(styles.tdBorderBottomWidth).toBeGreaterThan(0)
  if (viewport === 'mobile') {
    expect(styles.tableScrollWidth).toBeGreaterThan(styles.scrollClientWidth)
  }
}

test.describe('Production result/table stylesheet context', () => {
  test('desktop 1280x800 table padding/borders/overflow match results.css', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await openTable(page)
    const styles = await tableComputed(page)
    assertProductionTableStyles(styles, 'desktop')
    fs.mkdirSync(VISUAL_DIR, { recursive: true })
    await page.locator('[data-render-container]').screenshot({
      path: path.join(VISUAL_DIR, 'table-desktop.png'),
    })
  })

  test('mobile 390x844 table overflow-x auto and same padding tokens', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openTable(page)
    const styles = await tableComputed(page)
    assertProductionTableStyles(styles, 'mobile')
    fs.mkdirSync(VISUAL_DIR, { recursive: true })
    await page.locator('[data-render-container]').screenshot({
      path: path.join(VISUAL_DIR, 'table-mobile.png'),
    })
  })
})
