import { expect, test, type Page } from '@playwright/test'

import {
  getProvidersForModelIds,
  resolveStarterSelectionModelIds,
} from '../src/utils/starterSelectionModels'

import { mockComparisonStream } from './helpers/mockModels'
import { dismissMobileBlockers, isMobileE2eProject } from './helpers/modelCheckbox'
import {
  clickTutorialDoneButton,
  completeTutorialPromptInput,
  expandTutorialProvider,
  runTutorialComparison,
  selectTutorialModelCheckbox,
  tutorialTooltip,
} from './helpers/tutorialFlow'

const mockModel = (id: string, name: string, provider: string) => ({
  id,
  name,
  description: `${name} test model`,
  category: provider.toLowerCase(),
  provider,
  available: true,
  tier_access: 'unregistered' as const,
})

const fillers = ['Amazon', 'Cohere', 'Google', 'Meta', 'Mistral']
const MOCK_MODELS: Record<string, ReturnType<typeof mockModel>[]> = {
  Anthropic: [mockModel('anthropic/claude-sonnet-5.5', 'Claude Sonnet 5.5', 'Anthropic')],
}
for (const name of fillers) {
  MOCK_MODELS[name] = [mockModel(`${name.toLowerCase()}/filler`, `${name} Filler`, name)]
}
MOCK_MODELS.OpenAI = [mockModel('openai/gpt-5.2', 'GPT-5.2', 'OpenAI')]

const MOCK_MODELS_RESPONSE = {
  models: Object.values(MOCK_MODELS).flat(),
  models_by_provider: MOCK_MODELS,
}

const TUTORIAL_MODEL_IDS = resolveStarterSelectionModelIds(MOCK_MODELS)
const TUTORIAL_PROVIDERS = getProvidersForModelIds(MOCK_MODELS, TUTORIAL_MODEL_IDS)

function projectAllowed(project: string): boolean {
  return (
    project === 'chromium' ||
    project === 'Mobile Safari - iPhone 12' ||
    project === 'Mobile Chrome - Pixel 5'
  )
}

function composer(page: Page) {
  return page.getByTestId('comparison-input-textarea').filter({ visible: true }).first()
}

async function composerHighlighted(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const composerEl = document.querySelector(
      '[data-after-results-composer-slot] .composer:not(.composer-placeholder)'
    )
    if (!(composerEl instanceof HTMLElement)) return false
    return (
      composerEl.classList.contains('tutorial-highlight') ||
      composerEl.classList.contains('mobile-tutorial-highlight')
    )
  })
}

/** Typing, paste, and Enter must leave the prompt unchanged and unfocused. */
async function expectComposerRejectsText(page: Page, label: string): Promise<string> {
  const field = composer(page)
  await expect(field).toBeVisible()
  await expect.poll(() => field.evaluate(el => (el as HTMLTextAreaElement).readOnly)).toBe(true)
  await expect.poll(() => composerHighlighted(page)).toBe(true)
  const before = await field.inputValue()
  let streams = 0
  const countStream = (request: { method: () => string; url: () => string }) => {
    if (request.method() === 'POST' && request.url().includes('compare-stream')) streams += 1
  }
  page.on('request', countStream)

  await field.click({ force: true })
  await page.keyboard.type(' should-not-stick')
  await page.keyboard.insertText(' pasted-text')
  await field.evaluate(el => {
    const paste = new ClipboardEvent('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(paste, 'clipboardData', {
      value: {
        getData: (type: string) => (type === 'text/plain' ? 'clipboard paste' : ''),
        files: [],
        items: [],
      },
    })
    el.dispatchEvent(paste)
    el.dispatchEvent(
      new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        data: 'beforeinput paste',
        inputType: 'insertFromPaste',
      })
    )
  })
  await field.press('Enter')
  await page.waitForTimeout(400)

  await expect(field).toHaveValue(before)
  expect(streams, `${label} must not send another comparison`).toBe(0)
  await expect
    .poll(() =>
      page.evaluate(
        () => document.activeElement?.getAttribute('data-testid') ?? document.activeElement?.tagName
      )
    )
    .not.toBe('comparison-input-textarea')
  await expect(field).toHaveJSProperty('readOnly', true)
  page.off('request', countStream)
  return before
}

async function toggleHistory(page: Page): Promise<void> {
  await page.evaluate(() => {
    const slotted = document.querySelector(
      '[data-after-results-composer-slot] .history-toggle-button'
    ) as HTMLButtonElement | null
    const fallback = document.querySelector('.history-toggle-button') as HTMLButtonElement | null
    ;(slotted ?? fallback)?.click()
  })
}

async function toggleSavedSelections(page: Page): Promise<void> {
  await page.evaluate(() => {
    const slotted = document.querySelector(
      '[data-after-results-composer-slot] .saved-selections-button'
    ) as HTMLButtonElement | null
    const fallback = document.querySelector('.saved-selections-button') as HTMLButtonElement | null
    ;(slotted ?? fallback)?.click()
  })
}

test('steps 9 and 10 block composer text and typing works after the tutorial', async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000)
  test.skip(!projectAllowed(testInfo.project.name), 'desktop chromium and the two phone projects')
  const mobile = isMobileE2eProject(testInfo.project.name)
  await page.setViewportSize(
    mobile
      ? testInfo.project.name.includes('Pixel')
        ? { width: 393, height: 851 }
        : { width: 390, height: 844 }
      : { width: 1440, height: 900 }
  )
  await page.route('**/api/models', route => route.fulfill({ json: MOCK_MODELS_RESPONSE }))
  await mockComparisonStream(page)
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.removeItem('compareintel_tutorial_completed')
    localStorage.removeItem('compareintel_tutorial_progress')
  })
  await page.reload()
  await page.getByRole('button', { name: 'Start Tutorial' }).click()
  await tutorialTooltip(page).first().waitFor({ state: 'visible', timeout: 20_000 })
  await dismissMobileBlockers(page)

  const first = TUTORIAL_PROVIDERS[0]!
  const second = TUTORIAL_PROVIDERS[1]!
  await expandTutorialProvider(page, first, testInfo)
  await selectTutorialModelCheckbox(page, TUTORIAL_MODEL_IDS[0]!, first, testInfo)
  await expandTutorialProvider(page, second, testInfo)
  await selectTutorialModelCheckbox(page, TUTORIAL_MODEL_IDS[1]!, second, testInfo, {
    requireMinSelected: 2,
  })
  await completeTutorialPromptInput(page, 'Hello from the step 9 and 10 lock test.', testInfo)
  await runTutorialComparison(page, testInfo, 25_000, 'Hello from the step 9 and 10 lock test.')

  await expect(tutorialTooltip(page).first()).toContainText('Continue the Conversation', {
    timeout: 25_000,
  })
  await runTutorialComparison(page, testInfo, 25_000, 'Follow-up for the step 9 and 10 lock test.')

  await expect(tutorialTooltip(page).first()).toContainText('Review the New Responses', {
    timeout: 25_000,
  })
  await clickTutorialDoneButton(page, testInfo)
  await expect(tutorialTooltip(page).first()).toContainText('Access Your History', {
    timeout: 15_000,
  })

  const step9Value = await expectComposerRejectsText(page, 'step 9')
  await expect(page.locator('.composer.tutorial-history-input-locked').first()).toBeVisible()

  await toggleHistory(page)
  await expect
    .poll(() => page.locator('.history-inline-list').count(), { timeout: 5_000 })
    .toBeGreaterThan(0)
  await expect(composer(page)).toHaveValue(step9Value)
  await clickTutorialDoneButton(page, testInfo)
  await expect(tutorialTooltip(page).first()).toContainText('Save Model Selections', {
    timeout: 15_000,
  })

  const step10Value = await expectComposerRejectsText(page, 'step 10')
  expect(step10Value).toBe(step9Value)
  await expect(page.locator('.composer.tutorial-save-input-locked').first()).toBeVisible()
  await expect(page.locator('.composer.tutorial-review-input-locked')).toHaveCount(0)

  await toggleSavedSelections(page)
  await expect
    .poll(() => page.locator('.saved-selections-dropdown').count(), { timeout: 5_000 })
    .toBeGreaterThan(0)
  await expect(composer(page)).toHaveValue(step10Value)
  await clickTutorialDoneButton(page, testInfo)
  await expect(tutorialTooltip(page).first()).toBeHidden({ timeout: 15_000 })

  await expect(page.locator('.composer.tutorial-history-input-locked')).toHaveCount(0)
  await expect(page.locator('.composer.tutorial-save-input-locked')).toHaveCount(0)
  const after = composer(page)
  await expect(after).toHaveJSProperty('readOnly', false)
  await after.click()
  await after.pressSequentially(' after the tour')
  await expect(after).toHaveValue(`${step10Value} after the tour`)
})
