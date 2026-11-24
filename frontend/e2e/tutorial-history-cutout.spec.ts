import fs from 'node:fs'

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

const FRAME_OUTSET_PX = 8
const ALIGN_TOLERANCE_PX = 6

async function historyCutoutReason(page: Page, open: boolean): Promise<string> {
  return page.evaluate(
    ({ outset, tolerance, expectList }) => {
      const composer = document.querySelector(
        '[data-after-results-composer-slot] .composer:not(.composer-placeholder)'
      ) as HTMLElement | null
      if (!composer) return 'composer missing'
      const parts = [
        composer.querySelector('.composer-input-wrapper'),
        composer.querySelector('.composer-toolbar'),
        expectList ? composer.querySelector('.history-inline-list') : null,
      ].filter(Boolean) as HTMLElement[]
      if (expectList && !composer.querySelector('.history-inline-list'))
        return 'history list missing'
      let top = Infinity
      let left = Infinity
      let right = -Infinity
      let bottom = -Infinity
      for (const part of parts) {
        const rect = part.getBoundingClientRect()
        top = Math.min(top, rect.top)
        left = Math.min(left, rect.left)
        right = Math.max(right, rect.right)
        bottom = Math.max(bottom, rect.bottom)
      }
      const cutouts = Array.from(
        document.querySelectorAll('.mobile-tutorial-backdrop-cutout, .tutorial-backdrop-cutout')
      )
        .map(el => el.getBoundingClientRect())
        .filter(rect => rect.width > 2 && rect.height > 2)
      const matched = cutouts.some(
        cutout =>
          Math.abs(cutout.top - (top - outset)) <= tolerance &&
          Math.abs(cutout.left - (left - outset)) <= tolerance &&
          Math.abs(cutout.bottom - (bottom + outset)) <= tolerance &&
          Math.abs(cutout.right - (right + outset)) <= tolerance
      )
      if (!matched) {
        const nearest = cutouts[0]
        return nearest
          ? `cutout ${Math.round(nearest.top)}..${Math.round(nearest.bottom)} target ${Math.round(top)}..${Math.round(bottom)}`
          : 'no cutout'
      }
      const arrow = document.querySelector(
        '.mobile-tutorial-arrow, .tutorial-arrow'
      ) as HTMLElement | null
      if (!arrow) return 'missing arrow'
      const arrowBox = arrow.getBoundingClientRect()
      const pointsDown =
        arrow.classList.contains('mobile-tutorial-arrow-down') ||
        arrow.classList.contains('tutorial-arrow-top')
      const tipY = pointsDown ? arrowBox.bottom : arrowBox.top
      const gap = Math.min(
        ...cutouts.map(cutout => Math.abs(tipY - (pointsDown ? cutout.top : cutout.bottom)))
      )
      if (gap > tolerance) return `arrow gap ${Math.round(gap)}`
      return 'ok'
    },
    { outset: FRAME_OUTSET_PX, tolerance: ALIGN_TOLERANCE_PX, expectList: open }
  )
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

async function verticalCenterReason(page: Page): Promise<string> {
  return page.evaluate(() => {
    const mobile = window.innerWidth <= 768
    if (!mobile) {
      const cutouts = Array.from(
        document.querySelectorAll('.mobile-tutorial-backdrop-cutout, .tutorial-backdrop-cutout')
      )
        .map(el => el.getBoundingClientRect())
        .filter(rect => rect.width > 2 && rect.height > 2)
      const cutout = cutouts[0]
      if (!cutout) return 'no cutout'
      const offset = Math.abs(cutout.top + cutout.height / 2 - window.innerHeight / 2)
      if (cutout.height > window.innerHeight * 0.65) return 'ok'
      if (offset > 80) return `centerOffset ${Math.round(offset)}`
      return 'ok'
    }
    const composer = document.querySelector(
      '[data-after-results-composer-slot] .composer:not(.composer-placeholder)'
    ) as HTMLElement | null
    const tip = document.querySelector(
      '.mobile-tutorial-tooltip, .tutorial-tooltip'
    ) as HTMLElement | null
    if (!composer || !tip) return 'missing pair'
    const hidden =
      tip.classList.contains('mobile-tutorial-tooltip--transitioning') ||
      tip.classList.contains('tutorial-tooltip--transitioning')
    if (hidden || Number(getComputedStyle(tip).opacity) < 0.9) return 'tooltip hidden'
    const composerBox = composer.getBoundingClientRect()
    const tipBox = tip.getBoundingClientRect()
    const visual = window.visualViewport
    const viewTop = visual?.offsetTop ?? 0
    const viewH = Math.min(window.innerHeight, visual?.height || window.innerHeight)
    const top = Math.min(composerBox.top, tipBox.top)
    const bottom = Math.max(composerBox.bottom, tipBox.bottom)
    const offset = Math.abs((top + bottom) / 2 - (viewTop + viewH / 2))
    if (offset > 72) return `pairOffset ${Math.round(offset)}`
    const gap = viewTop + viewH - composerBox.bottom
    if (gap < 36 && bottom - top < viewH * 0.9) return `composerLow gap ${Math.round(gap)}`
    return 'ok'
  })
}

interface SpotlightBoxes {
  composerHighlighted: boolean
  historyHighlighted: boolean
  bookmarkHighlighted: boolean
  historyWidth: number
  historyHeight: number
  historyRadius: string
  historyPadding: string
  historyAnimation: string
  bookmarkWidth: number
  bookmarkHeight: number
  bookmarkRadius: string
  bookmarkPadding: string
  bookmarkAnimation: string
  composerRadius: string
  composerShadow: string
  composerBorderColor: string
  composerOpacity: string
  cutoutWidth: number
  cutoutHeight: number
  cutoutRadius: string
  cutoutBorderColor: string
  cutoutShadow: string
  cutoutOpacity: string
  cutoutClass: string
  fullBackdrop: boolean
  historyOpen: boolean
}

async function readSpotlightBoxes(page: Page): Promise<SpotlightBoxes> {
  return page.evaluate(() => {
    const buttonMetrics = (button: HTMLElement | null) => {
      const style = button ? getComputedStyle(button) : null
      const highlighted =
        !!button &&
        (button.classList.contains('tutorial-highlight') ||
          button.classList.contains('mobile-tutorial-highlight') ||
          button.classList.contains('mobile-tutorial-button-pulsate'))
      return {
        highlighted,
        width: button?.offsetWidth ?? 0,
        height: button?.offsetHeight ?? 0,
        radius: style?.borderRadius ?? '',
        padding: style?.padding ?? '',
        animation: style?.animationName ?? '',
      }
    }
    const composer = document.querySelector(
      '[data-after-results-composer-slot] .composer:not(.composer-placeholder)'
    ) as HTMLElement | null
    const toggle = (document.querySelector(
      '[data-after-results-composer-slot] .history-toggle-button'
    ) ?? document.querySelector('.history-toggle-button')) as HTMLElement | null
    const bookmark = (document.querySelector(
      '[data-after-results-composer-slot] .saved-selections-button'
    ) ?? document.querySelector('.saved-selections-button')) as HTMLElement | null
    const cutout = Array.from(
      document.querySelectorAll('.mobile-tutorial-backdrop-cutout, .tutorial-backdrop-cutout')
    ).find(el => {
      const rect = el.getBoundingClientRect()
      return rect.width > 2 && rect.height > 2
    }) as HTMLElement | undefined
    const cutoutBox = cutout?.getBoundingClientRect()
    const composerStyle = composer ? getComputedStyle(composer) : null
    const cutoutStyle = cutout ? getComputedStyle(cutout) : null
    const highlighted = (el: HTMLElement | null) =>
      !!el &&
      (el.classList.contains('tutorial-highlight') ||
        el.classList.contains('mobile-tutorial-highlight'))
    const history = buttonMetrics(toggle)
    const saved = buttonMetrics(bookmark)
    return {
      composerHighlighted: highlighted(composer),
      historyHighlighted: history.highlighted,
      bookmarkHighlighted: saved.highlighted,
      historyWidth: history.width,
      historyHeight: history.height,
      historyRadius: history.radius,
      historyPadding: history.padding,
      historyAnimation: history.animation,
      bookmarkWidth: saved.width,
      bookmarkHeight: saved.height,
      bookmarkRadius: saved.radius,
      bookmarkPadding: saved.padding,
      bookmarkAnimation: saved.animation,
      composerRadius: composerStyle?.borderRadius ?? '',
      composerShadow: composerStyle?.boxShadow ?? '',
      composerBorderColor: composerStyle?.borderColor ?? '',
      composerOpacity: composerStyle?.opacity ?? '',
      cutoutWidth: cutoutBox ? Math.round(cutoutBox.width) : 0,
      cutoutHeight: cutoutBox ? Math.round(cutoutBox.height) : 0,
      cutoutRadius: cutoutStyle?.borderRadius ?? '',
      cutoutBorderColor: cutoutStyle?.borderColor ?? '',
      cutoutShadow: cutoutStyle?.boxShadow ?? '',
      cutoutOpacity: cutoutStyle?.opacity ?? '',
      cutoutClass: cutout?.className ?? '',
      fullBackdrop: !!document.querySelector(
        '.mobile-tutorial-backdrop, .tutorial-backdrop:not(.tutorial-backdrop-cutout)'
      ),
      historyOpen: !!composer?.querySelector('.history-inline-list'),
    }
  })
}

function spotlightMismatch(before: SpotlightBoxes, after: SpotlightBoxes): string {
  if (!after.composerHighlighted || !after.bookmarkHighlighted) return 'step 10 missing highlight'
  if (after.historyHighlighted) return 'step 10 still highlights history'
  if (before.historyOpen !== after.historyOpen) return 'history open state changed'
  if (
    before.historyWidth !== after.bookmarkWidth ||
    before.historyHeight !== after.bookmarkHeight
  ) {
    return `highlight box ${before.historyWidth}x${before.historyHeight} vs ${after.bookmarkWidth}x${after.bookmarkHeight}`
  }
  if (before.historyRadius !== after.bookmarkRadius) return 'highlight radius changed'
  if (before.historyPadding !== after.bookmarkPadding) return 'highlight padding changed'
  if (before.historyAnimation !== after.bookmarkAnimation) return 'highlight glow changed'
  if (before.composerRadius !== after.composerRadius) return 'composer radius changed'
  if (before.composerShadow !== after.composerShadow) return 'composer glow changed'
  if (before.composerBorderColor !== after.composerBorderColor) return 'composer border changed'
  if (before.composerOpacity !== after.composerOpacity) return 'composer opacity changed'
  if (before.cutoutBorderColor !== after.cutoutBorderColor) return 'composer ring border changed'
  if (before.cutoutShadow !== after.cutoutShadow) return 'composer ring glow changed'
  if (before.cutoutOpacity !== after.cutoutOpacity) return 'composer ring opacity changed'
  if (before.cutoutClass !== after.cutoutClass) return 'composer ring class changed'
  if (after.cutoutOpacity !== '1') return `composer ring faded (${after.cutoutOpacity})`
  if (after.fullBackdrop) return 'dim overlay on composer ring'
  if (before.cutoutRadius !== after.cutoutRadius) return 'cutout radius changed'
  if (Math.abs(before.cutoutWidth - after.cutoutWidth) > 4) return 'cutout width changed'
  if (Math.abs(before.cutoutHeight - after.cutoutHeight) > 4) return 'cutout height changed'
  return 'ok'
}

async function resultsPanelStableReason(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
    const panel = document.querySelector('.results-section') as HTMLElement | null
    const card = document.querySelector('.result-card') as HTMLElement | null
    if (!panel || !card) return 'missing results'
    if (
      panel.classList.contains('mobile-tutorial-button-pulsate') ||
      card.classList.contains('mobile-tutorial-button-pulsate')
    ) {
      return 'results still pulsating'
    }
    const firstPanel = panel.getBoundingClientRect()
    const firstCard = card.getBoundingClientRect()
    const panelWidth = Math.round(firstPanel.width)
    const panelHeight = Math.round(firstPanel.height)
    const cardWidth = Math.round(firstCard.width)
    const cardHeight = Math.round(firstCard.height)
    for (let i = 0; i < 8; i++) {
      await sleep(250)
      const nextPanel = panel.getBoundingClientRect()
      const nextCard = card.getBoundingClientRect()
      if (
        Math.round(nextPanel.width) !== panelWidth ||
        Math.round(nextPanel.height) !== panelHeight
      ) {
        return `panel ${panelWidth}x${panelHeight} -> ${Math.round(nextPanel.width)}x${Math.round(nextPanel.height)}`
      }
      if (Math.round(nextCard.width) !== cardWidth || Math.round(nextCard.height) !== cardHeight) {
        return `card ${cardWidth}x${cardHeight} -> ${Math.round(nextCard.width)}x${Math.round(nextCard.height)}`
      }
    }
    return 'ok'
  })
}

async function saveStepReason(page: Page): Promise<string> {
  return page.evaluate(() => {
    const button = (document.querySelector(
      '[data-after-results-composer-slot] .saved-selections-button'
    ) ?? document.querySelector('.saved-selections-button')) as HTMLElement | null
    if (!button) return 'button missing'
    const highlighted =
      button.classList.contains('tutorial-highlight') ||
      button.classList.contains('mobile-tutorial-highlight') ||
      button.classList.contains('mobile-tutorial-button-pulsate')
    if (!highlighted) return 'button not highlighted'
    const history = (document.querySelector(
      '[data-after-results-composer-slot] .history-toggle-button'
    ) ?? document.querySelector('.history-toggle-button')) as HTMLElement | null
    if (
      history &&
      (history.classList.contains('tutorial-highlight') ||
        history.classList.contains('mobile-tutorial-highlight') ||
        history.classList.contains('mobile-tutorial-button-pulsate'))
    ) {
      return 'history toggle still highlighted'
    }
    const composer = document.querySelector(
      '[data-after-results-composer-slot] .composer:not(.composer-placeholder)'
    ) as HTMLElement | null
    if (
      !composer ||
      !(
        composer.classList.contains('tutorial-highlight') ||
        composer.classList.contains('mobile-tutorial-highlight')
      )
    ) {
      return 'composer not highlighted'
    }
    return 'ok'
  })
}

test('history cutout grows and shrinks with the dropdown', async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  const project = testInfo.project.name
  test.skip(
    project !== 'chromium' &&
      project !== 'Mobile Safari - iPhone 12' &&
      project !== 'Mobile Chrome - Pixel 5',
    'desktop, Mobile Safari, and mobile Chromium'
  )
  if (project === 'Mobile Chrome - Pixel 5') {
    await page.setViewportSize({ width: 393, height: 851 })
  } else if (!isMobileE2eProject(project)) {
    await page.setViewportSize({ width: 1440, height: 900 })
  }

  await page.route('**/api/models', route => route.fulfill({ json: MOCK_MODELS_RESPONSE }))
  await mockComparisonStream(page)
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
  await completeTutorialPromptInput(page, 'Hello from the history cutout test.', testInfo)
  await runTutorialComparison(page, testInfo, 25_000, 'Hello from the history cutout test.')
  await expect(tutorialTooltip(page).first()).toContainText('Continue the Conversation', {
    timeout: 20_000,
  })
  await runTutorialComparison(page, testInfo, 25_000, 'Follow-up for the history cutout test.')
  await clickTutorialDoneButton(page, testInfo)
  await expect(tutorialTooltip(page).first()).toContainText('Access Your History', {
    timeout: 20_000,
  })
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const tip = document.querySelector(
            '.mobile-tutorial-tooltip, .tutorial-tooltip'
          ) as HTMLElement | null
          if (!tip) return 'wait'
          const hidden =
            tip.classList.contains('mobile-tutorial-tooltip--transitioning') ||
            tip.classList.contains('tutorial-tooltip--transitioning')
          return !hidden && Number(getComputedStyle(tip).opacity) > 0.9 ? 'ready' : 'wait'
        }),
      { timeout: 8_000 }
    )
    .toBe('ready')

  await expect(resultsPanelStableReason(page)).resolves.toBe('ok')

  await expect
    .poll(() => page.locator('[data-after-results-composer-slot] .history-inline-list').count(), {
      timeout: 5_000,
    })
    .toBe(0)
  await expect(tutorialTooltip(page).getByRole('button', { name: 'Done' })).toBeDisabled()
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const button =
            document.querySelector('[data-after-results-composer-slot] .history-toggle-button') ??
            document.querySelector('.history-toggle-button')
          if (!button) return 'missing toggle'
          const highlighted =
            button.classList.contains('tutorial-highlight') ||
            button.classList.contains('mobile-tutorial-highlight') ||
            button.classList.contains('mobile-tutorial-button-pulsate')
          return highlighted ? 'ok' : 'toggle not highlighted'
        }),
      { timeout: 5_000, message: 'history toggle should be highlighted' }
    )
    .toBe('ok')
  await expect
    .poll(() => verticalCenterReason(page), {
      timeout: 8_000,
      message: 'history target and tooltip should be vertically centered',
    })
    .toBe('ok')
  await expect
    .poll(() => historyCutoutReason(page, false), {
      timeout: 2_000,
      message: 'collapsed history should frame the composer',
    })
    .toBe('ok')

  const prompt = page.locator(
    '[data-after-results-composer-slot] [data-testid="comparison-input-textarea"]'
  )
  const promptBefore = await prompt.inputValue()
  await prompt.click({ force: true })
  await page.keyboard.type('should-not-stick')
  await expect(prompt).toHaveValue(promptBefore)
  await expect.poll(() => prompt.evaluate(el => (el as HTMLTextAreaElement).readOnly)).toBe(true)

  await toggleHistory(page)
  await expect
    .poll(() => page.locator('.history-inline-list').count(), { timeout: 5_000 })
    .toBeGreaterThan(0)
  await page.waitForTimeout(400)
  await expect(tutorialTooltip(page).first()).toContainText('Access Your History')
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const button = (document.querySelector(
            '[data-after-results-composer-slot] .history-toggle-button'
          ) ?? document.querySelector('.history-toggle-button')) as HTMLElement | null
          if (!button) return 'missing toggle'
          const highlighted =
            button.classList.contains('tutorial-highlight') ||
            button.classList.contains('mobile-tutorial-highlight')
          return highlighted ? 'ok' : 'toggle not highlighted'
        }),
      { timeout: 2_000, message: 'open history toggle should stay highlighted' }
    )
    .toBe('ok')

  const surface = isMobileE2eProject(testInfo.project.name) ? 'mobile' : 'desktop'
  const phase = process.env.HISTORY_SHOT ?? 'after'
  const dir = `/opt/cursor/artifacts/tutorial-history-cutout/${phase}/${surface}`
  fs.mkdirSync(dir, { recursive: true })

  await expect
    .poll(() => historyCutoutReason(page, true), {
      timeout: 2_000,
      message: 'open history list should sit inside the cutout',
    })
    .toBe('ok')
  await page.screenshot({ path: `${dir}/09-open.png` })

  await toggleHistory(page)
  await expect.poll(() => page.locator('.history-inline-list').count(), { timeout: 5_000 }).toBe(0)
  await expect
    .poll(() => historyCutoutReason(page, false), {
      timeout: 2_000,
      message: 'closing history should shrink the cutout back to the composer',
    })
    .toBe('ok')
  await page.screenshot({ path: `${dir}/09-closed.png` })

  const step9Boxes = await readSpotlightBoxes(page)
  expect(step9Boxes.composerHighlighted).toBe(true)
  expect(step9Boxes.historyHighlighted).toBe(true)

  await clickTutorialDoneButton(page, testInfo)
  await expect(tutorialTooltip(page).first()).toContainText('Save Model Selections', {
    timeout: 20_000,
  })
  await expect
    .poll(() => saveStepReason(page), {
      timeout: 8_000,
      message: 'step 10 should highlight the composer and the saved-selections button',
    })
    .toBe('ok')
  await expect(resultsPanelStableReason(page)).resolves.toBe('ok')
  await expect
    .poll(async () => spotlightMismatch(step9Boxes, await readSpotlightBoxes(page)), {
      timeout: 8_000,
      message: 'step 10 bookmark highlight should match the step 9 history toggle',
    })
    .toBe('ok')
  await page.screenshot({ path: `${dir}/10-save.png` })
})
