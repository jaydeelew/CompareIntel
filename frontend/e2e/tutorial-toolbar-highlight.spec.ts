import { expect, test } from '@playwright/test'

import { dismissTutorialOverlay, waitForReactHydration } from './fixtures'
import { mockModelsApi } from './helpers/mockModels'

test.describe('onboarding tutorial toolbar highlights (steps 7–8)', () => {
  test.use({ viewport: { width: 393, height: 800 } })

  test('step 8 bookmark highlight matches step 7 history (box-shadow, not clipped)', async ({
    page,
  }) => {
    await mockModelsApi(page)
    await page.goto('/')
    await waitForReactHydration(page)
    await dismissTutorialOverlay(page)

    const styles = await page.evaluate(() => {
      const history = document.querySelector('.history-toggle-button') as HTMLElement | null
      const saved = document.querySelector('.saved-selections-button') as HTMLElement | null
      const container = document.querySelector(
        '.saved-selections-container'
      ) as HTMLElement | null
      if (!history || !saved || !container) return null

      history.classList.add('mobile-tutorial-highlight')
      saved.classList.add('mobile-tutorial-highlight')

      const historyShadow = getComputedStyle(history).boxShadow
      const savedShadow = getComputedStyle(saved).boxShadow
      const containerOverflow = getComputedStyle(container).overflow

      return {
        historyShadow,
        savedShadow,
        containerOverflow,
        shadowsMatch: historyShadow === savedShadow,
      }
    })

    expect(styles).not.toBeNull()
    expect(styles?.shadowsMatch).toBe(true)
    expect(styles?.containerOverflow).toBe('visible')
    expect(styles?.historyShadow).not.toBe('none')
  })
})
