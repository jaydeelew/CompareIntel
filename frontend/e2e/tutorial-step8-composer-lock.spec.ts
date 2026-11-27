import { mkdirSync } from 'node:fs'

import { expect, test, type Page } from '@playwright/test'

import {
  getProvidersForModelIds,
  resolveStarterSelectionModelIds,
} from '../src/utils/starterSelectionModels'

import { mockComparisonStream } from './helpers/mockModels'
import { dismissMobileBlockers, isMobileE2eProject } from './helpers/modelCheckbox'
import {
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

/** The step 8 card stays above the results and off the follow-up composer. */
async function cardClearsComposer(page: Page): Promise<string> {
  return page.evaluate(() => {
    const tip = Array.from(
      document.querySelectorAll<HTMLElement>('.tutorial-tooltip, .mobile-tutorial-tooltip')
    ).find(el => {
      const box = el.getBoundingClientRect()
      const style = getComputedStyle(el)
      return (
        box.width > 2 &&
        box.height > 2 &&
        style.visibility !== 'hidden' &&
        Number(style.opacity) > 0.05
      )
    })
    if (!tip) return 'missing-card'
    const a = tip.getBoundingClientRect()
    const composerEl = document.querySelector(
      '[data-after-results-composer-slot] .composer:not(.composer-placeholder)'
    )
    if (!(composerEl instanceof HTMLElement)) return 'no-composer'
    const box = composerEl.getBoundingClientRect()
    if (box.width < 2 || box.height < 2) return 'no-composer'
    const overlapW = Math.min(a.right, box.right) - Math.max(a.left, box.left)
    const overlapH = Math.min(a.bottom, box.bottom) - Math.max(a.top, box.top)
    return overlapW > 1 && overlapH > 1 ? 'overlaps-composer' : 'clear'
  })
}

test('step 8 blocks composer text and typing works after the step ends', async ({
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
  await completeTutorialPromptInput(page, 'Hello from the step 8 lock test.', testInfo)
  await runTutorialComparison(page, testInfo, 25_000, 'Hello from the step 8 lock test.')

  await expect(tutorialTooltip(page).first()).toContainText('Continue the Conversation', {
    timeout: 25_000,
  })
  await runTutorialComparison(page, testInfo, 25_000, 'Follow-up for the step 8 lock test.')

  const review = tutorialTooltip(page).first()
  await expect(review).toContainText('Review the New Responses', { timeout: 25_000 })
  await expect.poll(() => cardClearsComposer(page), { timeout: 8_000 }).toBe('clear')

  if (testInfo.project.name.includes('Pixel')) {
    const dir = '/opt/cursor/artifacts/tutorial-step8-composer-lock/pixel'
    mkdirSync(dir, { recursive: true })
    await page.screenshot({ path: `${dir}/step8.png`, animations: 'disabled' })
  }

  const field = composer(page)
  await expect(field).toBeVisible()
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
  const submit = page.getByTestId('comparison-submit-button').filter({ visible: true }).first()
  await submit.click({ force: true }).catch(() => {})
  await page.waitForTimeout(400)

  await expect(field).toHaveValue(before)
  expect(streams, 'step 8 must not send another comparison').toBe(0)
  await expect
    .poll(() =>
      page.evaluate(
        () => document.activeElement?.getAttribute('data-testid') ?? document.activeElement?.tagName
      )
    )
    .not.toBe('comparison-input-textarea')
  await expect(field).toHaveJSProperty('readOnly', true)

  await review.getByRole('button', { name: 'Done' }).click()
  // Done leaves step 8. The next card is the history toggle, which already
  // refuses text, so close the tour and then type.
  await expect(tutorialTooltip(page).first()).toContainText('Access Your History', {
    timeout: 15_000,
  })
  await expect(page.locator('.composer.tutorial-review-input-locked')).toHaveCount(0)
  await page.getByRole('button', { name: 'Skip tutorial' }).click()
  await expect(tutorialTooltip(page).first()).toBeHidden({ timeout: 15_000 })

  const after = composer(page)
  await expect(after).toHaveJSProperty('readOnly', false)
  await after.click()
  await after.pressSequentially(' after the tour')
  await expect(after).toHaveValue(`${before} after the tour`)
  expect(streams, 'leaving step 8 must not submit on its own').toBe(0)
  page.off('request', countStream)
})
