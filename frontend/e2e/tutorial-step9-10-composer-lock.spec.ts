import { expect, test, type Locator, type Page } from '@playwright/test'

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

const SEEDED_HISTORY_PROMPT = 'Seeded history prompt that must stay put'

async function seedHistoryConversation(page: Page): Promise<void> {
  await page.evaluate(prompt => {
    const id = 'e2e-history-1'
    // Newer than anything the tour saves, so the unregistered cap keeps this row.
    const createdAt = new Date(Date.now() + 86_400_000).toISOString()
    const summary = {
      id,
      input_data: prompt,
      models_used: ['anthropic/claude-sonnet-5.5', 'openai/gpt-5.2'],
      conversation_type: 'comparison',
      created_at: createdAt,
      message_count: 2,
      client_source: 'web',
      saved: false,
    }
    const record = {
      input_data: prompt,
      models_used: summary.models_used,
      conversation_type: 'comparison',
      created_at: createdAt,
      messages: [
        { role: 'user', content: prompt, created_at: createdAt },
        {
          role: 'assistant',
          content: 'seeded reply',
          created_at: createdAt,
          model_id: 'anthropic/claude-sonnet-5.5',
        },
      ],
    }
    localStorage.setItem('compareintel_conversation_history', JSON.stringify([summary]))
    localStorage.setItem(`compareintel_conversation_${id}`, JSON.stringify(record))
  }, SEEDED_HISTORY_PROMPT)
}

/** Pointer or touch on a visible part of the control that is not the tutorial card. */
async function activateAt(page: Page, locator: Locator): Promise<void> {
  const point = await locator.evaluate(el => {
    const rect = el.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) return null
    const candidates = [
      [rect.left + rect.width / 2, rect.top + Math.min(Math.max(rect.height / 2, 4), 18)],
      [rect.left + Math.min(10, rect.width / 2), rect.top + Math.min(10, rect.height / 2)],
      [rect.right - Math.min(10, rect.width / 2), rect.bottom - Math.min(10, rect.height / 2)],
    ]
    for (const [rawX, rawY] of candidates) {
      const x = Math.min(window.innerWidth - 2, Math.max(1, rawX))
      const y = Math.min(window.innerHeight - 2, Math.max(1, rawY))
      const hit = document.elementFromPoint(x, y)
      if (!hit) continue
      if (
        hit.closest(
          '#tutorial-portal-root, #mobile-tutorial-portal-root, .tutorial-tooltip, .mobile-tutorial-tooltip, .tutorial-close-button, .mobile-tutorial-close-button'
        )
      ) {
        continue
      }
      return { x, y }
    }
    return null
  })
  if (point) {
    const hasTouch = await page.evaluate(() => navigator.maxTouchPoints > 0)
    if (hasTouch) await page.touchscreen.tap(point.x, point.y)
    else await page.mouse.click(point.x, point.y)
    return
  }
  await locator.evaluate(el => {
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }))
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

async function pressActivationKeys(page: Page, locator: Locator): Promise<void> {
  await locator.evaluate(el => {
    if (!(el instanceof HTMLElement)) return
    el.focus()
    for (const key of ['Enter', ' ']) {
      el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
      el.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true }))
    }
  })
  await page.keyboard.press('Enter')
  await page.keyboard.press('Space')
}

async function expectLockedLook(locator: Locator): Promise<void> {
  await expect(locator).toHaveAttribute('data-tutorial-dropdown-locked', '')
  await expect(locator).toHaveCSS('opacity', '0.6')
  await expect(locator).toHaveCSS('cursor', 'not-allowed')
}

async function showModelMenus(page: Page): Promise<void> {
  await page.evaluate(() => {
    const show = document.querySelector(
      '[aria-label="Show model selection"]'
    ) as HTMLButtonElement | null
    show?.click()
  })
  await expect(page.locator('.advanced-settings-toggle').first()).toBeVisible({ timeout: 10_000 })
}

async function notificationCount(page: Page): Promise<number> {
  return page.locator('[data-notification="true"]').count()
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

test('steps 9 and 10 block composer text and dropdown items', async ({
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
  await seedHistoryConversation(page)
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

  const historyItem = page
    .locator('.history-inline-list .history-item')
    .filter({ hasText: SEEDED_HISTORY_PROMPT })
    .first()
  await expect(historyItem).toBeVisible()
  await expectLockedLook(historyItem)
  const historyCount = await page.locator('.history-inline-list .history-item').count()
  const historySave = historyItem.locator('input[type="checkbox"]')
  await expect(historySave).not.toBeChecked()
  const notesOnStep9 = await notificationCount(page)
  await activateAt(page, historyItem)
  await activateAt(page, historyItem.locator('.history-item-delete'))
  await activateAt(page, historySave)
  await pressActivationKeys(page, historyItem)
  await historyItem.evaluate(el => (el as HTMLElement).click())
  await expect(composer(page)).toHaveValue(step9Value)
  await expect(historySave).not.toBeChecked()
  await expect(page.locator('.history-inline-list .history-item')).toHaveCount(historyCount)
  expect(await notificationCount(page)).toBe(notesOnStep9)
  await expect(tutorialTooltip(page).first()).toContainText('Access Your History')

  await showModelMenus(page)
  const advanced = page.locator('.advanced-settings-toggle').first()
  const advancedExpanded = (await advanced.getAttribute('aria-expanded')) ?? 'false'
  await expectLockedLook(advanced)
  const temperature = page.locator('#temperature-slider')
  const temperatureBefore = (await temperature.count()) > 0 ? await temperature.inputValue() : null
  await activateAt(page, advanced)
  if (temperatureBefore != null) {
    await activateAt(page, temperature)
    await pressActivationKeys(page, temperature)
    await temperature.evaluate(el => {
      el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }))
      el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }))
      ;(el as HTMLInputElement).click()
    })
  }
  await pressActivationKeys(page, advanced)
  await advanced.evaluate(el => (el as HTMLButtonElement).click())
  await expect(advanced).toHaveAttribute('aria-expanded', advancedExpanded)
  if (temperatureBefore != null) await expect(temperature).toHaveValue(temperatureBefore)
  else await expect(temperature).toHaveCount(0)

  const help = page.locator('.help-me-choose-toggle').first()
  await expect(help).toHaveAttribute('aria-expanded', 'false')
  await expectLockedLook(help)
  await activateAt(page, help)
  await pressActivationKeys(page, help)
  await help.evaluate(el => (el as HTMLButtonElement).click())
  await expect(help).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator('.help-me-choose-content')).toHaveCount(0)

  const search = page.locator('.model-search-input').first()
  await expectLockedLook(search)
  await activateAt(page, search)
  await pressActivationKeys(page, search)
  await page.keyboard.type('claude')
  await search.evaluate(el => {
    el.dispatchEvent(
      new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        data: 'claude',
        inputType: 'insertText',
      })
    )
    el.dispatchEvent(
      new InputEvent('input', { bubbles: true, cancelable: true, data: 'claude' })
    )
  })
  await expect(search).toHaveValue('')
  await expect(page.locator('.model-search-suggestion')).toHaveCount(0)

  const providerHeader = page.locator('.provider-header').first()
  await expect(providerHeader).toBeVisible()
  const providerExpanded = (await providerHeader.getAttribute('aria-expanded')) ?? 'false'
  await expectLockedLook(providerHeader)
  await activateAt(page, providerHeader)
  await providerHeader.evaluate(el => (el as HTMLButtonElement).click())
  await pressActivationKeys(page, providerHeader)
  await expect(providerHeader).toHaveAttribute('aria-expanded', providerExpanded)

  const modelBox = page.locator(`[data-testid="model-checkbox-${TUTORIAL_MODEL_IDS[0]}"]`).first()
  if ((await modelBox.count()) > 0) {
    const modelChecked = await modelBox.isChecked()
    const modelOption = page.locator('.model-option').filter({ has: modelBox }).first()
    await expectLockedLook(modelOption)
    await activateAt(page, modelOption)
    await modelOption.evaluate(el => (el as HTMLElement).click())
    expect(await modelBox.isChecked()).toBe(modelChecked)
  }
  expect(await notificationCount(page)).toBe(notesOnStep9)

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

  const savedMenu = page.getByTestId('saved-selections-dropdown').filter({ visible: true }).first()
  const savedItem = savedMenu
    .locator('.saved-selection-item')
    .filter({ hasText: 'Starter Selection' })
    .first()
  await expect(savedItem).toBeVisible()
  await expectLockedLook(savedItem)
  const savedCount = await savedMenu.locator('.saved-selection-item').count()
  const defaultBox = savedItem.locator('.saved-selection-default-checkbox')
  const defaultChecked = await defaultBox.isChecked()
  const dialogs = await page.getByRole('dialog').count()
  const notesOnStep10 = await notificationCount(page)
  await activateAt(page, savedItem.locator('.saved-selection-info'))
  await activateAt(page, savedItem.locator('.saved-selection-delete'))
  await activateAt(page, defaultBox)
  await pressActivationKeys(page, savedItem.locator('.saved-selection-info'))
  await savedItem.locator('.saved-selection-info').evaluate(el => (el as HTMLElement).click())
  const headerInfo = savedMenu.locator('.saved-selections-header-info').first()
  await expectLockedLook(headerInfo)
  await activateAt(page, headerInfo)
  await headerInfo.evaluate(el => (el as HTMLButtonElement).click())
  await expect(composer(page)).toHaveValue(step10Value)
  await expect(savedMenu.locator('.saved-selection-item')).toHaveCount(savedCount)
  expect(await defaultBox.isChecked()).toBe(defaultChecked)
  expect(await notificationCount(page)).toBe(notesOnStep10)
  expect(await page.getByRole('dialog').count()).toBe(dialogs)
  await expect(page.locator('.saved-selections-dropdown')).toBeVisible()
  await expect(tutorialTooltip(page).first()).toContainText('Save Model Selections')

  await clickTutorialDoneButton(page, testInfo)
  await expect(tutorialTooltip(page).first()).toBeHidden({ timeout: 15_000 })

  await expect(page.locator('[data-tutorial-dropdown-locked]')).toHaveCount(0)
  await expect(page.locator('[data-tutorial-dropdown-host]')).toHaveCount(0)
  await expect(page.locator('.composer.tutorial-history-input-locked')).toHaveCount(0)
  await expect(page.locator('.composer.tutorial-save-input-locked')).toHaveCount(0)
  await showModelMenus(page)
  const advancedAfter = page.locator('.advanced-settings-toggle').first()
  const advancedWasOpen = (await advancedAfter.getAttribute('aria-expanded')) === 'true'
  await advancedAfter.click()
  await expect(advancedAfter).toHaveAttribute('aria-expanded', advancedWasOpen ? 'false' : 'true')
  const helpAfter = page.locator('.help-me-choose-toggle').first()
  await helpAfter.click()
  await expect(helpAfter).toHaveAttribute('aria-expanded', 'true')
  const after = composer(page)
  await expect(after).toHaveJSProperty('readOnly', false)
  await after.click()
  await after.pressSequentially(' after the tour')
  await expect(after).toHaveValue(`${step10Value} after the tour`)
})
