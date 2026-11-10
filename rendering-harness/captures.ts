/**
 * Extra harness captures: phone width and the site's real dark theme.
 * Theme uses the production key `compareintel-theme` plus data-theme and
 * color-scheme, the same mechanism as frontend/index.html and ThemeContext.
 */

import fs from 'fs/promises'
import path from 'path'
import type { Browser, Page } from 'playwright'
import { collectLayoutIssues, type LayoutIssue } from './layout-checks.js'
import { pageStateReady } from './page-state.js'

export const THEME_STORAGE_KEY = 'compareintel-theme'
export const HARNESS_ORIGIN = 'http://127.0.0.1:5174/'

export const PHONE_VIEW = { width: 390, height: 844, deviceScaleFactor: 3 }
export const DARK_VIEW = { width: 1280, height: 800, deviceScaleFactor: 2 }
export const EVIDENCE_VIEW = { width: 960, height: 800, deviceScaleFactor: 2 }

export async function openThemedPage(
  browser: Browser,
  port: number,
  theme: 'light' | 'dark',
  viewport: { width: number; height: number; deviceScaleFactor: number }
): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.deviceScaleFactor,
  })
  const page = await context.newPage()
  // tsx/esbuild keepNames injects __name around helpers. Playwright serializes
  // collectLayoutIssues into the page, where that helper does not exist.
  await page.addInitScript('globalThis.__name = (fn) => fn')
  await page.addInitScript(
    ({ key, theme }) => {
      localStorage.setItem(key, theme)
    },
    { key: THEME_STORAGE_KEY, theme }
  )
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-harness-listening'), {
    timeout: 30000,
  })
  const applied = await page.evaluate(() => document.documentElement.getAttribute('data-theme'))
  if (applied !== theme) {
    throw new Error(`Expected data-theme=${theme} from the site theme script, got ${applied}`)
  }
  return page
}

export async function renderOnPage(
  page: Page,
  modelId: string,
  content: string,
  generation: string
): Promise<void> {
  await page.evaluate(
    ({ modelId, content, generation }) => {
      document.querySelector('[data-render-container]')?.removeAttribute('data-render-complete')
      window.postMessage({ type: 'render', modelId, content, generation }, '*')
    },
    { modelId, content, generation }
  )
  await page.waitForFunction(pageStateReady, generation, { timeout: 30000 })
  const failed = await page.evaluate(() => {
    const el = document.querySelector('[data-render-failed]')
    return el?.getAttribute('data-render-failed') || null
  })
  if (failed) throw new Error(`Render readiness failed: ${failed}`)
}

export async function shootContainer(page: Page, outputPath: string): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  const element = await page.$('[data-render-container]')
  if (!element) throw new Error('Render container missing for screenshot')
  await element.screenshot({ path: outputPath })
}

export async function readRenderedHtml(page: Page): Promise<string> {
  return page.evaluate(() => document.querySelector('[data-render-container]')?.innerHTML || '')
}

export async function capturePhoneAndDark(opts: {
  phonePage: Page
  darkPage: Page
  modelId: string
  content: string
  phonePath?: string
  darkPath?: string
}): Promise<{ phone: LayoutIssue[]; dark: LayoutIssue[] }> {
  const generation = `${opts.modelId}:${Date.now()}`
  await renderOnPage(opts.phonePage, opts.modelId, opts.content, `${generation}:phone`)
  const phone = await opts.phonePage.evaluate(collectLayoutIssues, 'phone')
  if (opts.phonePath) await shootContainer(opts.phonePage, opts.phonePath)

  await renderOnPage(opts.darkPage, opts.modelId, opts.content, `${generation}:dark`)
  const dark = await opts.darkPage.evaluate(collectLayoutIssues, 'dark')
  if (opts.darkPath) await shootContainer(opts.darkPage, opts.darkPath)
  return { phone, dark }
}
