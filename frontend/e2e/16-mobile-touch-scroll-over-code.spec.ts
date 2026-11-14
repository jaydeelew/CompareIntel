import { test, expect } from './fixtures'
import {
  assertTouchActionAllowsVerticalPan,
  findWidestHorizScrollable,
  isMobileTouchScrollProject,
  openHarnessSavedFixture,
  openHarnessWideCode,
  touchSwipe,
} from './helpers/harnessTouchScroll'

const HARNESS_BASE = 'http://127.0.0.1:5174'

test.describe('Mobile touch scroll over wide result content', () => {
  test.describe.configure({ mode: 'parallel' })

  test.beforeEach(({ browserName: _browserName }, testInfo) => {
    test.skip(
      !isMobileTouchScrollProject(testInfo.project.name),
      'Runs on Mobile Chrome and Mobile Safari device projects only'
    )
  })

  test('vertical swipe on a code block scrolls the page; horizontal swipe scrolls the block', async ({
    page,
  }) => {
    await openHarnessWideCode(page, HARNESS_BASE)

    const codeBlock = page.locator('.code-block-direct').first()
    await codeBlock.scrollIntoViewIfNeeded()
    await expect(codeBlock).toBeVisible()
    await assertTouchActionAllowsVerticalPan(codeBlock)

    const wide = await findWidestHorizScrollable(page)
    expect(wide, 'harness should render horizontally scrollable code content').not.toBeNull()

    const box = await codeBlock.boundingBox()
    expect(box).toBeTruthy()

    await page.evaluate(() => {
      window.scrollTo(0, 0)
    })
    await page.waitForTimeout(100)

    const startX = box!.x + box!.width * 0.5
    const startY = box!.y + box!.height * 0.5
    const scrollBefore = await page.evaluate(() => window.scrollY)

    await touchSwipe(page, startX, startY, startX, startY - 120)

    await page.waitForTimeout(200)
    const scrollAfter = await page.evaluate(() => window.scrollY)
    expect(
      scrollAfter,
      'vertical swipe starting on code block should scroll the page'
    ).toBeGreaterThan(scrollBefore + 40)

    const horizScrollable = await codeBlock.evaluate(el => {
      const pre = el.querySelector('pre')
      const target =
        pre && pre.scrollWidth > pre.clientWidth + 8
          ? pre
          : el.scrollWidth > el.clientWidth + 8
            ? el
            : null
      return target
        ? { before: target.scrollLeft, range: target.scrollWidth - target.clientWidth }
        : null
    })
    expect(horizScrollable, 'code block content should overflow horizontally').not.toBeNull()

    const boxAfterVertical = await codeBlock.boundingBox()
    expect(boxAfterVertical).toBeTruthy()
    const hx = boxAfterVertical!.x + 24
    const hy = boxAfterVertical!.y + boxAfterVertical!.height * 0.65

    await touchSwipe(page, hx + 40, hy, hx - 160, hy)
    await page.waitForTimeout(200)
    const horizAfter = await codeBlock.evaluate(el => {
      const pre = el.querySelector('pre')
      const target =
        pre && pre.scrollWidth > pre.clientWidth + 8
          ? pre
          : el.scrollWidth > el.clientWidth + 8
            ? el
            : el
      return target.scrollLeft
    })
    expect(
      horizAfter,
      'horizontal swipe on code block should scroll the block horizontally'
    ).toBeGreaterThan((horizScrollable?.before ?? 0) + 8)
  })

  test('wide KaTeX display allows vertical page scroll from touch', async ({ page }) => {
    await openHarnessSavedFixture(
      page,
      HARNESS_BASE,
      'rendering-harness/runs/2026-11-08-14/google_gemini-3.8-flash_04-mixed-markdown-latex.json'
    )

    const wide = await findWidestHorizScrollable(page, '.katex-display')
    test.skip(!wide, 'No wide display math in fixture')

    const katex = wide!.locator
    await assertTouchActionAllowsVerticalPan(katex)
    await katex.scrollIntoViewIfNeeded()
    const box = await katex.boundingBox()
    expect(box).toBeTruthy()

    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(150)

    const startX = box!.x + Math.min(box!.width * 0.5, box!.width - 8)
    const startY = box!.y + Math.min(box!.height * 0.5, box!.height - 8)
    const scrollBefore = await page.evaluate(() => window.scrollY)
    await touchSwipe(page, startX, startY, startX, startY - 100)
    await page.waitForTimeout(200)
    const scrollAfter = await page.evaluate(() => window.scrollY)
    expect(scrollAfter).toBeGreaterThan(scrollBefore + 30)
  })
})
