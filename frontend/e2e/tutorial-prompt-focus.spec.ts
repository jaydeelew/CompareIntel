import fs from 'node:fs'

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

const FRAME_OUTSET_PX = 8
const ALIGN_TOLERANCE_PX = 6

function projectAllowed(project: string): boolean {
  return (
    project === 'chromium' ||
    project === 'Mobile Safari - iPhone 12' ||
    (project === 'Mobile Chrome - Pixel 5' && process.env.TUTORIAL_MOBILE_CHROMIUM === '1')
  )
}

/** Click the visible prompt field and type, the way a tap opens the keyboard. */
async function focusAndType(page: Page, text: string): Promise<void> {
  const point = await page.evaluate(() => {
    const areas = Array.from(
      document.querySelectorAll('[data-testid="comparison-input-textarea"]')
    ) as HTMLTextAreaElement[]
    const textarea = areas.find(el => {
      const rect = el.getBoundingClientRect()
      return rect.width > 2 && rect.height > 2 && el.closest('[aria-hidden="true"]') == null
    })
    if (!textarea) return null
    const rect = textarea.getBoundingClientRect()
    return {
      x: rect.left + Math.min(rect.width / 2, 48),
      y: rect.top + Math.min(rect.height / 2, 18),
    }
  })
  expect(point, 'visible prompt textarea').not.toBeNull()
  await page.mouse.click(point!.x, point!.y)
  await expect
    .poll(() =>
      page.evaluate(
        () => document.activeElement?.getAttribute('data-testid') === 'comparison-input-textarea'
      )
    )
    .toBe(true)
  await page.keyboard.type(text)
}

/**
 * Cutout stays on the composer and the tooltip stays opaque with its arrow on the frame.
 * `wholeComposer` matches the follow-up hole, which frames the composer element.
 */
async function promptOverlayReason(page: Page, wholeComposer: boolean): Promise<string> {
  return page.evaluate(
    ({ outset, tolerance, useComposer }) => {
      const areas = Array.from(
        document.querySelectorAll('[data-testid="comparison-input-textarea"]')
      ) as HTMLTextAreaElement[]
      const textarea = areas.find(el => {
        const rect = el.getBoundingClientRect()
        return rect.width > 2 && rect.height > 2 && el.closest('[aria-hidden="true"]') == null
      })
      const composer = textarea?.closest('.composer') as HTMLElement | null
      if (!composer) return 'composer missing'
      const parts = useComposer
        ? [composer]
        : ([
            composer.querySelector('.composer-input-wrapper'),
            composer.querySelector('.composer-toolbar'),
          ].filter(Boolean) as HTMLElement[])
      const boxes = (parts.length > 0 ? parts : [composer]).map(el => el.getBoundingClientRect())
      let top = Infinity
      let left = Infinity
      let right = -Infinity
      let bottom = -Infinity
      for (const rect of boxes) {
        top = Math.min(top, rect.top)
        left = Math.min(left, rect.left)
        right = Math.max(right, rect.right)
        bottom = Math.max(bottom, rect.bottom)
      }
      const tip = document.querySelector(
        '.mobile-tutorial-tooltip, .tutorial-tooltip'
      ) as HTMLElement | null
      if (!tip) return 'tooltip missing'
      const hidden =
        tip.classList.contains('mobile-tutorial-tooltip--transitioning') ||
        tip.classList.contains('tutorial-tooltip--transitioning') ||
        tip.classList.contains('tutorial-tooltip--settling')
      if (hidden || !(Number(getComputedStyle(tip).opacity) > 0.9)) return 'tooltip hidden'
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
    { outset: FRAME_OUTSET_PX, tolerance: ALIGN_TOLERANCE_PX, useComposer: wholeComposer }
  )
}

async function expectOverlayHolds(page: Page, wholeComposer: boolean): Promise<void> {
  const visible = (reason: string) =>
    !/tooltip hidden|tooltip missing|no cutout|composer missing|missing arrow/.test(reason)
  await expect.poll(() => promptOverlayReason(page, wholeComposer), { timeout: 5_000 }).toBe('ok')
  const started = Date.now()
  while (Date.now() - started < 500) {
    const reason = await promptOverlayReason(page, wholeComposer)
    expect(visible(reason), reason).toBe(true)
    await page.waitForTimeout(80)
  }
  await expect.poll(() => promptOverlayReason(page, wholeComposer), { timeout: 2_000 }).toBe('ok')
}

test('prompt focus keeps the cutout and tooltip', async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  const project = testInfo.project.name
  test.skip(!projectAllowed(project), 'desktop, Mobile Safari, and opted-in mobile Chromium')
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
  await expect(tutorialTooltip(page).first()).toContainText('Enter Your Prompt', {
    timeout: 20_000,
  })
  await expectOverlayHolds(page, false)

  const prompt = 'Sqrt 2?'
  await focusAndType(page, prompt)
  await expect(
    page.getByTestId('comparison-input-textarea').filter({ visible: true }).first()
  ).toHaveValue(prompt)
  await expectOverlayHolds(page, false)

  if (project === 'Mobile Chrome - Pixel 5') {
    try {
      const dir = '/opt/cursor/artifacts/tutorial-prompt-focus'
      fs.mkdirSync(dir, { recursive: true })
      await page.screenshot({ path: `${dir}/pixel5-step5-typing.png` })
    } catch {
      // The artifacts directory is for the PR image. CI does not need the file.
    }
  }

  const size = page.viewportSize()
  expect(size).not.toBeNull()
  await page.setViewportSize({ width: size!.width, height: Math.max(480, size!.height - 280) })
  await expectOverlayHolds(page, false)
  await expect(tutorialTooltip(page).first()).toContainText('Enter Your Prompt')

  if (project === 'Mobile Chrome - Pixel 5') {
    try {
      await page.screenshot({
        path: '/opt/cursor/artifacts/tutorial-prompt-focus/pixel5-step5-keyboard.png',
      })
    } catch {
      // Same as the typing shot: local PR evidence only.
    }
  }

  await page.setViewportSize({ width: size!.width, height: size!.height })
  await expectOverlayHolds(page, false)

  await completeTutorialPromptInput(page, prompt, testInfo)
  await runTutorialComparison(page, testInfo, 25_000, prompt)
  await expect(tutorialTooltip(page).first()).toContainText('Continue the Conversation', {
    timeout: 20_000,
  })
  await expectOverlayHolds(page, true)
  await focusAndType(page, 'And pi?')
  await expect(
    page.getByTestId('comparison-input-textarea').filter({ visible: true }).first()
  ).toHaveValue('And pi?')
  await expectOverlayHolds(page, true)
  await expect(tutorialTooltip(page).first()).toContainText('Continue the Conversation')
})
