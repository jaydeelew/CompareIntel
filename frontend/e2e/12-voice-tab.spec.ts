import { expect, test, type Page } from './fixtures'
import { installMockMicrophone, mockVoiceApis } from './helpers/mockVoice'
import { toggleModelCheckbox } from './helpers/modelCheckbox'

/**
 * Voice mode (inside Text models): spoken turn-taking with up to 2 models (issue #90).
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

async function enableVoiceMode(page: Page): Promise<void> {
  const toggle = page.getByTestId('voice-mode-toggle')
  await expect(toggle).toBeVisible({ timeout: 20000 })
  if ((await toggle.getAttribute('aria-pressed')) !== 'true') {
    await toggle.click()
  }
  await expect(page.getByTestId('voice-composer')).toBeVisible()
}

test.describe('Voice mode', () => {
  test('lives on the Text models tab, records a turn, and plays sequential replies', async ({
    mockedModelsAuthenticatedPage: page,
  }) => {
    await installMockMicrophone(page)
    await mockVoiceApis(page)
    await page.reload({ waitUntil: 'domcontentloaded' })

    await test.step('Voice is a composer toggle, not a catalog tab', async () => {
      await expect(page.getByTestId('text-tab-button')).toBeVisible({ timeout: 20000 })
      await expect(page.getByTestId('image-tab-button')).toBeVisible()
      await expect(page.getByTestId('voice-tab-button')).toHaveCount(0)
      await enableVoiceMode(page)
      await expect(page.getByTestId('text-tab-button')).toHaveAttribute('aria-pressed', 'true')
      await expect(page.getByTestId('voice-mode-toggle')).toHaveAttribute('aria-pressed', 'true')
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
      if ((await modelTabs.count()) > 0) {
        await expect(modelTabs).toHaveCount(2)
      } else {
        await expect(results).toHaveCount(2)
      }
      // ResultsArea wraps ResultsDisplay; both use .results-section. Target cards.
      const spoken = results.first()
      await expect(spoken).toContainText(/Hello from the model/i)
      await expect(spoken).not.toContainText('**')
      await expect(spoken).not.toContainText('https://example.com')
    })

    await test.step('Turning Voice off restores the text composer', async () => {
      await page.getByTestId('voice-mode-toggle').click()
      await expect(page.getByTestId('voice-mode-toggle')).toHaveAttribute('aria-pressed', 'false')
      await expect(page.getByTestId('voice-composer')).toHaveCount(0)
      await expect(page.getByTestId('comparison-input-textarea')).toBeVisible()
    })
  })

  test('shows a clear error when the microphone is denied', async ({
    mockedModelsAuthenticatedPage: page,
  }) => {
    await installMockMicrophone(page, { deny: true })
    await mockVoiceApis(page)
    await page.reload({ waitUntil: 'domcontentloaded' })

    await enableVoiceMode(page)
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
    await enableVoiceMode(page)
    await expect(page.getByTestId('voice-mic-error')).toContainText(
      /supported|secure|unavailable/i,
      {
        timeout: 10000,
      }
    )
  })
})
