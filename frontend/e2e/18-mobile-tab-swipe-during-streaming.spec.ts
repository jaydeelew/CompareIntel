import { test, expect } from './fixtures'
import { submitAndAwaitCompareStream } from './helpers/comparisonStream'
import { isMobileChromeProject, touchSwipe } from './helpers/harnessTouchScroll'
import { toggleModelCheckbox } from './helpers/modelCheckbox'

test.describe('Mobile model-tab swipe while result content churns', () => {
  test.describe.configure({ timeout: 120000 })

  test.beforeEach(({ browserName: _browserName }, testInfo) => {
    test.skip(
      !isMobileChromeProject(testInfo.project.name),
      'CDP touch gestures run on Mobile Chrome device projects only'
    )
  })

  test('horizontal swipe switches model tabs while the panel DOM is being replaced', async ({
    mockedModelsAuthenticatedPage: page,
  }, testInfo) => {
    const projectName = testInfo.project.name
    const input = page.getByTestId('comparison-input-textarea')
    await input.fill('Tab swipe during streaming')

    await page.locator('.loading-message').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {})

    const providerHeader = page.locator('.provider-header').first()
    if ((await providerHeader.getAttribute('aria-expanded')) !== 'true') {
      await providerHeader.click()
      await page.waitForTimeout(500)
    }
    for (const modelId of ['openai/gpt-5', 'openai/gpt-4.1']) {
      const checkbox = page.getByTestId(`model-checkbox-${modelId}`)
      await expect(checkbox).toBeVisible({ timeout: 15000 })
      await toggleModelCheckbox(checkbox, projectName)
    }

    await submitAndAwaitCompareStream(page)

    await expect(page.locator('.results-tabs-container')).toBeVisible({ timeout: 30000 })
    const tabs = page.locator('.results-tab-button')
    await expect(tabs).toHaveCount(2)
    await expect(tabs.nth(0)).toHaveClass(/active/)

    const swipeZone = page.locator('.results-tab-content--swipe-zone')
    await swipeZone.scrollIntoViewIfNeeded()
    const box = await swipeZone.boundingBox()
    expect(box).toBeTruthy()

    const churnHandle = await page.evaluate(() => {
      const zone = document.querySelector('.results-tab-content--swipe-zone')
      const host =
        zone?.querySelector('.message-content') ??
        zone?.querySelector('.latex-content') ??
        zone?.querySelector('[data-testid^="result-card-"]') ??
        zone
      if (!host) return null
      let n = 0
      const id = window.setInterval(() => {
        host.innerHTML = `<p class="stream-churn">chunk ${n++}</p>`
      }, 25)
      return id
    })
    expect(churnHandle, 'results panel host for streaming churn').not.toBeNull()

    const midY = box!.y + box!.height * 0.55
    const fromX = box!.x + box!.width * 0.75
    const toX = box!.x + box!.width * 0.1

    await touchSwipe(page, fromX, midY, toX, midY)
    await page.waitForTimeout(200)

    await expect(tabs.nth(0)).not.toHaveClass(/active/)
    await expect(tabs.nth(1)).toHaveClass(/active/)

    await page.evaluate(handle => {
      if (typeof handle === 'number') window.clearInterval(handle)
    }, churnHandle)
  })
})