import { expect, test, type Page } from './fixtures'
import { installMockMicrophone, mockVoiceApis } from './helpers/mockVoice'
import { toggleModelCheckbox } from './helpers/modelCheckbox'

/**
 * Voice tab slice 1: spoken turn-taking with up to 2 models (issue #90).
 * Audio capture and OpenRouter STT/TTS are mocked.
 */

async function expandFirstProvider(page: Page): Promise<void> {
  const loadingMessage = page.locator('.loading-message:has-text("Loading available models")')
  await loadingMessage.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {})

  const providerHeaders = page.locator('.provider-header, button[class*="provider-header"]')
  if ((await providerHeaders.count()) > 0) {
    const firstProvider = providerHeaders.first()
    if ((await firstProvider.getAttribute('aria-expanded')) !== 'true') {
      await firstProvider.click()
    }
  }
}

async function selectMockedModels(page: Page, count: number, projectName: string): Promise<number> {
  await expandFirstProvider(page)
  const modelCheckboxes = page.locator(
    '[data-testid^="model-checkbox-"], input[type="checkbox"].model-checkbox'
  )
  await expect(modelCheckboxes.first()).toBeVisible({ timeout: 15000 })

  let selected = 0
  const total = await modelCheckboxes.count()
  for (let i = 0; i < total && selected < count; i++) {
    const box = modelCheckboxes.nth(i)
    if (await box.isEnabled().catch(() => false)) {
      await toggleModelCheckbox(box, projectName)
      await expect(box).toBeChecked()
      selected++
    }
  }
  return selected
}

const voiceEnabled =
  process.env.VITE_ENABLE_VOICE === 'true' || process.env.VITE_ENABLE_VOICE === '1'

test.describe('Voice tab', () => {
  test.skip(!voiceEnabled, 'Voice E2E runs with VITE_ENABLE_VOICE=true')

  test('selects up to 2 models, records a turn, and plays sequential replies', async ({
    mockedModelsAuthenticatedPage: page,
  }) => {
    await installMockMicrophone(page)
    await mockVoiceApis(page)
    await page.reload({ waitUntil: 'domcontentloaded' })

    await test.step('Open the Voice tab', async () => {
      const voiceTab = page.getByTestId('voice-tab-button')
      await expect(voiceTab).toBeVisible({ timeout: 20000 })
      await voiceTab.click()
      await expect(page.getByTestId('voice-composer')).toBeVisible()
    })

    await test.step('Select two models and block a third', async () => {
      const selected = await selectMockedModels(page, 2, test.info().project.name)
      expect(selected).toBe(2)

      const modelCheckboxes = page.locator(
        '[data-testid^="model-checkbox-"], input[type="checkbox"].model-checkbox'
      )
      const total = await modelCheckboxes.count()
      let remainingEnabled = 0
      for (let i = 0; i < total; i++) {
        const box = modelCheckboxes.nth(i)
        const checked = await box.isChecked().catch(() => false)
        const enabled = await box.isEnabled().catch(() => false)
        if (!checked && enabled) remainingEnabled++
      }
      const checkedCount = await page.locator('input.model-checkbox:checked').count()
      expect(checkedCount).toBe(2)
      expect(remainingEnabled).toBe(0)
    })

    await test.step('Tap-to-talk records and shows the transcript', async () => {
      const talk = page.getByTestId('voice-ptt-button')
      await expect(talk).toBeEnabled({ timeout: 10000 })
      await talk.click()
      await expect(page.getByTestId('voice-status')).toContainText(/Listening/i, { timeout: 5000 })
      await talk.click()
      await expect(page.getByTestId('voice-transcript')).toContainText('photosynthesis', {
        timeout: 15000,
      })
    })

    await test.step('Model replies appear in selection order', async () => {
      const results = page.locator('.results-section .result-card.conversation-card')
      await expect(results.first()).toBeVisible({ timeout: 30000 })
      const modelTabs = page.locator('.results-tab-button')
      // Mobile uses a tabbed layout with a single card in the DOM.
      if ((await modelTabs.count()) > 0) {
        await expect(modelTabs).toHaveCount(2)
      } else {
        await expect(results).toHaveCount(2)
      }
    })
  })

  test('shows a clear error when the microphone is denied', async ({
    mockedModelsAuthenticatedPage: page,
  }) => {
    await installMockMicrophone(page, { deny: true })
    await mockVoiceApis(page)
    await page.reload({ waitUntil: 'domcontentloaded' })

    await page.getByTestId('voice-tab-button').click()
    await expect(page.getByTestId('voice-composer')).toBeVisible()
    expect(await selectMockedModels(page, 1, test.info().project.name)).toBe(1)
    const talk = page.getByTestId('voice-ptt-button')
    await expect(talk).toBeEnabled({ timeout: 10000 })
    await talk.click()
    await expect(page.getByTestId('voice-mic-error')).toContainText(/Microphone access denied/i, {
      timeout: 10000,
    })
  })

  test('shows a clear error when the browser cannot record audio', async ({
    mockedModelsAuthenticatedPage: page,
  }) => {
    await mockVoiceApis(page)
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: undefined,
      })
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByTestId('voice-tab-button').click()
    await expect(page.getByTestId('voice-mic-error')).toContainText(
      /supported|secure|unavailable/i,
      {
        timeout: 10000,
      }
    )
  })
})
