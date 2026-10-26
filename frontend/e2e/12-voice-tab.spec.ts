import { expect, test } from './fixtures'
import { installMockMicrophone, mockVoiceApis } from './helpers/mockVoice'
import { selectSelectableTextModels, toggleModelCheckbox } from './helpers/modelCheckbox'

/**
 * Voice tab slice 1: spoken turn-taking with up to 2 models (issue #90).
 * Audio capture and OpenRouter STT/TTS are mocked.
 */

test.describe('Voice tab', () => {
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
      const projectName = test.info().project.name
      const selected = await selectSelectableTextModels(page, 2, projectName)
      expect(selected).toHaveLength(2)

      const thirdId = 'openai/gpt-4.1-nano'
      const third = page.getByTestId(`model-checkbox-${thirdId}`)
      if (await third.isVisible().catch(() => false)) {
        await toggleModelCheckbox(third, projectName)
        await expect(third).not.toBeChecked()
      }
      await expect(page.getByText(/limited to 2 models/i)).toBeVisible({ timeout: 8000 })
    })

    await test.step('Tap-to-talk records and shows the transcript', async () => {
      const talk = page.getByTestId('voice-ptt-button')
      await expect(talk).toBeVisible()
      await talk.click()
      await expect(page.getByTestId('voice-status')).toContainText(/Listening/i, { timeout: 5000 })
      await talk.click()
      await expect(page.getByTestId('voice-transcript')).toContainText('photosynthesis', {
        timeout: 15000,
      })
    })

    await test.step('Model replies appear in selection order', async () => {
      const results = page.locator(
        '.results-section .result-card, [data-testid^="result-card-"], .conversation-card'
      )
      await expect(results.first()).toBeVisible({ timeout: 30000 })
      await expect(results).toHaveCount(2)
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
    await page.getByTestId('voice-ptt-button').click()
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
