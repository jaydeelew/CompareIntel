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

    await page
      .locator('.loading-message')
      .waitFor({ state: 'hidden', timeout: 15000 })
      .catch(() => {})

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
    const reply = swipeZone.locator('.conversation-message.assistant').first()
    await reply.scrollIntoViewIfNeeded()
    const box = await reply.boundingBox()
    expect(box).toBeTruthy()

    const churnHandle = await page.evaluate(() => {
      const zone = document.querySelector('.results-tab-content--swipe-zone')
      const host =
        zone?.querySelector('.conversation-message.user .message-content') ??
        zone?.querySelector('.message-content') ??
        zone?.querySelector('.latex-content') ??
        zone
      if (!host) return null
      // Streaming updates text in place. A sibling is torn down on each tick so
      // the panel DOM is still being replaced during the gesture. The swipe
      // itself stays on the assistant reply: after the formatted renderer
      // mounts, 55% of the whole zone can land on this replaced sibling, and
      // Chrome then delivers neither touchend nor touchcancel.
      let churn = host.querySelector('p.stream-churn')
      if (!churn) {
        churn = document.createElement('p')
        churn.className = 'stream-churn'
        host.appendChild(churn)
      }
      const aside = document.createElement('div')
      aside.className = 'stream-churn-aside'
      host.appendChild(aside)
      let n = 0
      const id = window.setInterval(() => {
        churn.textContent = `chunk ${n}`
        aside.innerHTML = `<span>replaced ${n}</span>`
        n += 1
      }, 25)
      return id
    })
    expect(churnHandle, 'results panel host for streaming churn').not.toBeNull()

    const viewport = page.viewportSize()
    const viewH = viewport?.height ?? 727
    const midY = Math.min(viewH - 24, Math.max(24, box!.y + Math.min(box!.height * 0.5, 48)))
    const fromX = box!.x + box!.width * 0.8
    const toX = box!.x + box!.width * 0.15

    await touchSwipe(page, fromX, midY, toX, midY)
    await page.waitForTimeout(200)

    await expect(tabs.nth(0)).not.toHaveClass(/active/)
    await expect(tabs.nth(1)).toHaveClass(/active/)

    await page.evaluate(handle => {
      if (typeof handle === 'number') window.clearInterval(handle)
    }, churnHandle)
  })
})
