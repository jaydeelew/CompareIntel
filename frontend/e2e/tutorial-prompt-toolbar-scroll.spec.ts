import { expect, test, type Page, type TestInfo } from '@playwright/test'

import {
  getProvidersForModelIds,
  resolveStarterSelectionModelIds,
} from '../src/utils/starterSelectionModels'

import { dismissMobileBlockers, isMobileE2eProject } from './helpers/modelCheckbox'
import {
  expandTutorialProvider,
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

async function reachEnterPrompt(page: Page, testInfo: TestInfo): Promise<void> {
  if (testInfo.project.name === 'Mobile Chrome - Pixel 5') {
    await page.setViewportSize({ width: 393, height: 851 })
  } else if (!isMobileE2eProject(testInfo.project.name)) {
    await page.setViewportSize({ width: 1440, height: 900 })
  }
  await page.route('**/api/models', route => route.fulfill({ json: MOCK_MODELS_RESPONSE }))
  await page.goto('/')
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
  await expect(tutorialTooltip(page).first()).toContainText('Enter Your Prompt', {
    timeout: 15_000,
  })
}

async function openAddFileModal(page: Page): Promise<void> {
  const opened = await page.evaluate(() => {
    const button = document.querySelector(
      '.composer:not(.composer-placeholder):not(.composer-hero-mirror) .file-upload-button'
    ) as HTMLButtonElement | null
    if (!button) return 'missing'
    button.inert = false
    button.removeAttribute('inert')
    button.style.pointerEvents = 'auto'
    button.click()
    return 'clicked'
  })
  expect(opened).toBe('clicked')
  await expect(page.getByRole('heading', { name: 'Add File' })).toBeVisible({ timeout: 5_000 })
}

test('step 5 locks unused toolbar buttons and the cutout follows the composer', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000)
  test.skip(
    !projectAllowed(testInfo.project.name),
    'desktop chromium, Mobile Safari, and Mobile Chrome'
  )
  await reachEnterPrompt(page, testInfo)

  const toolbar = await page.evaluate(() => {
    const root = document.querySelector(
      '.composer:not(.composer-placeholder):not(.composer-hero-mirror)'
    )
    const buttons = Array.from(root?.querySelectorAll('.composer-toolbar button') ?? [])
    const textarea = root?.querySelector('[data-testid="comparison-input-textarea"]')
    return {
      count: buttons.length,
      locked: buttons.every(
        button => button.hasAttribute('inert') || (button as HTMLElement).inert
      ),
      labels: buttons.map(button => button.getAttribute('aria-label') ?? button.className),
      textareaInert: Boolean(textarea?.closest('[inert]')),
    }
  })
  expect(toolbar.count).toBeGreaterThan(0)
  expect(toolbar.locked, toolbar.labels.join(', ')).toBe(true)
  expect(toolbar.textareaInert).toBe(false)

  const fileButton = page
    .locator('.composer:not(.composer-placeholder):not(.composer-hero-mirror) .file-upload-button')
    .first()
  const blockedChooser = page.waitForEvent('filechooser', { timeout: 1_500 }).catch(() => null)
  if (isMobileE2eProject(testInfo.project.name)) {
    await fileButton.tap({ timeout: 1_500 }).catch(() => {})
  } else {
    await fileButton.click({ timeout: 1_500 }).catch(() => {})
  }
  expect(await blockedChooser).toBeNull()
  await expect(page.getByRole('heading', { name: 'Add File' })).toHaveCount(0)

  if (isMobileE2eProject(testInfo.project.name)) {
    await openAddFileModal(page)
    const dialog = page.getByRole('dialog', { name: 'Add File' })
    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(page.getByRole('heading', { name: 'Add File' })).toHaveCount(0)

    await openAddFileModal(page)
    const chooser = page.waitForEvent('filechooser', { timeout: 4_000 }).catch(() => null)
    await page.getByTestId('action-tooltip-modal-confirm').click()
    await chooser
    await expect(page.getByRole('heading', { name: 'Add File' })).toHaveCount(0)
  }

  await page.locator('[data-testid="comparison-input-textarea"]').first().focus()
  await expect
    .poll(() =>
      page.evaluate(() => {
        const composer = document.querySelector(
          '.composer:not(.composer-placeholder):not(.composer-hero-mirror)'
        )
        const tip = document.querySelector(
          '.mobile-tutorial-tooltip, .tutorial-tooltip'
        ) as HTMLElement | null
        if (!composer || !tip) return 'wait'
        const highlighted =
          composer.classList.contains('mobile-tutorial-highlight') ||
          composer.classList.contains('tutorial-highlight')
        const hidden =
          tip.classList.contains('mobile-tutorial-tooltip--transitioning') ||
          tip.classList.contains('tutorial-tooltip--settling')
        return highlighted && !hidden && Number(getComputedStyle(tip).opacity) > 0.9
          ? 'ready'
          : 'wait'
      })
    )
    .toBe('ready')

  const aligned = await page.evaluate(async () => {
    const composer = document.querySelector(
      '.composer:not(.composer-placeholder):not(.composer-hero-mirror)'
    ) as HTMLElement | null
    if (!composer) return 'missing composer'
    const outset = 8
    const tolerance = 8
    const tip = document.querySelector(
      '.mobile-tutorial-tooltip, .tutorial-tooltip'
    ) as HTMLElement | null
    const tipBefore = tip?.getBoundingClientRect().top ?? null
    const composerBefore = composer.getBoundingClientRect().top
    const app = document.querySelector('.app') as HTMLElement | null
    const scrollBefore = app?.scrollTop ?? window.scrollY
    composer.dispatchEvent(new Event('touchstart', { bubbles: true }))
    composer.style.marginTop = '-120px'
    const deadline = performance.now() + 800
    let matched = false
    let tooltipFollowed = false
    let cutouts: DOMRect[] = []
    let target = composer.getBoundingClientRect()
    let tipAfter = tipBefore
    while (performance.now() < deadline && !(matched && tooltipFollowed)) {
      await new Promise<void>(resolve => {
        requestAnimationFrame(() => resolve())
      })
      if (app) app.scrollTop = scrollBefore
      else window.scrollTo(0, scrollBefore)
      target = composer.getBoundingClientRect()
      cutouts = Array.from(
        document.querySelectorAll('.mobile-tutorial-backdrop-cutout, .tutorial-backdrop-cutout')
      )
        .map(el => el.getBoundingClientRect())
        .filter(rect => rect.width > 2 && rect.height > 2)
      matched = cutouts.some(
        cutout =>
          Math.abs(cutout.top - (target.top - outset)) <= tolerance &&
          Math.abs(cutout.left - (target.left - outset)) <= tolerance &&
          Math.abs(cutout.bottom - (target.bottom + outset)) <= tolerance &&
          Math.abs(cutout.right - (target.right + outset)) <= tolerance
      )
      tipAfter = tip?.getBoundingClientRect().top ?? null
      const composerDelta = target.top - composerBefore
      tooltipFollowed =
        tipBefore == null ||
        tipAfter == null ||
        Math.abs(composerDelta) < 40 ||
        Math.abs(tipAfter - tipBefore) >= 12 ||
        tipAfter < 12
    }
    const highlighted =
      composer.classList.contains('mobile-tutorial-highlight') ||
      composer.classList.contains('tutorial-highlight')
    composer.style.marginTop = ''
    composer.dispatchEvent(new Event('touchend', { bubbles: true }))
    if (!highlighted) return 'highlight dropped while the prompt was focused'
    if (!tooltipFollowed) {
      return `tooltip did not follow the composer (${Math.round(tipBefore ?? 0)} -> ${Math.round(tipAfter ?? 0)}, composer ${Math.round(composerBefore)} -> ${Math.round(target.top)})`
    }
    if (matched) return 'ok'
    const nearest = cutouts[0]
    return nearest
      ? `cutout ${Math.round(nearest.top)},${Math.round(nearest.left)} ${Math.round(nearest.width)}x${Math.round(nearest.height)} composer ${Math.round(target.top)},${Math.round(target.left)} ${Math.round(target.width)}x${Math.round(target.height)}`
      : 'no cutout'
  })
  expect(aligned).toBe('ok')
})
