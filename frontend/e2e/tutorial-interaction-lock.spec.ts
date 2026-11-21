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
    (project === 'Mobile Chrome - Pixel 5' && process.env.TUTORIAL_MOBILE_CHROMIUM === '1')
  )
}

async function clickAt(page: Page, selector: string): Promise<void> {
  const locator = page.locator(selector).first()
  const point = await locator.evaluate(el => {
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    const rect = el.getBoundingClientRect()
    const candidates = [
      [rect.left + rect.width / 2, rect.top + Math.min(rect.height / 2, 12)],
      [rect.left + 4, rect.top + 4],
      [rect.right - 4, rect.top + 4],
      [rect.left + 4, rect.bottom - 4],
    ]
    for (const [x, y] of candidates) {
      if (x < 1 || y < 1 || x >= window.innerWidth - 1 || y >= window.innerHeight - 1) continue
      const hit = document.elementFromPoint(x, y)
      if (!hit) continue
      // The tutorial card sits above the header on a phone. A click there is the
      // close button, which ends the tour. Hit the shield or the control itself.
      const inTutorial = hit.closest(
        '#tutorial-portal-root, #mobile-tutorial-portal-root, .tutorial-tooltip, .mobile-tutorial-tooltip'
      )
      if (inTutorial && !hit.closest('#tutorial-interaction-shield')) continue
      return { x, y }
    }
    return null
  })
  if (!point) return
  await page.mouse.click(point.x, point.y)
}

test('non-target controls do nothing and the step target still works', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000)
  test.skip(
    !projectAllowed(testInfo.project.name),
    'desktop, Mobile Safari, and opted-in mobile Chromium'
  )
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
  await expect
    .poll(() => page.locator('.tutorial-highlight, .mobile-tutorial-highlight').count(), {
      timeout: 8_000,
    })
    .toBeGreaterThan(0)

  const first = TUTORIAL_PROVIDERS[0]!
  const title = tutorialTooltip(page).first()

  await expect
    .poll(() =>
      page.evaluate(() => {
        const about = document.querySelector('a[href="/about"]')
        const signIn = Array.from(document.querySelectorAll('button')).find(
          button => button.textContent?.trim() === 'Sign In'
        )
        return Boolean(about?.closest('[inert]') && signIn?.closest('[inert]'))
      })
    )
    .toBe(true)

  const url = page.url()
  await clickAt(page, 'a[href="/about"]')
  await expect(page).toHaveURL(url)
  await expect(title).toContainText('Expand')

  await clickAt(page, 'button:has-text("Sign In")')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(title).toContainText('Expand')

  await clickAt(page, '[data-testid="comparison-input-textarea"]')
  await expect
    .poll(() =>
      page.evaluate(
        () => document.activeElement?.getAttribute('data-testid') === 'comparison-input-textarea'
      )
    )
    .toBe(false)

  await expandTutorialProvider(page, first, testInfo)
  await expect(title).not.toContainText('Expand')

  await page.locator('.tutorial-close-button, .mobile-tutorial-close-button').first().click()
  await expect(tutorialTooltip(page)).toHaveCount(0)
  await expect
    .poll(() =>
      page.evaluate(() => document.querySelector('a[href="/about"]')?.closest('[inert]') != null)
    )
    .toBe(false)
})

test('results and history stay scrollable during their steps', async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  test.skip(
    !projectAllowed(testInfo.project.name),
    'desktop, Mobile Safari, and opted-in mobile Chromium'
  )
  if (testInfo.project.name === 'Mobile Chrome - Pixel 5') {
    await page.setViewportSize({ width: 393, height: 851 })
  } else if (!isMobileE2eProject(testInfo.project.name)) {
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
  await completeTutorialPromptInput(page, 'Hello from the interaction lock test.', testInfo)
  await runTutorialComparison(page, testInfo, 25_000, 'Hello from the interaction lock test.')
  await expect(tutorialTooltip(page).first()).toContainText('Continue the Conversation', {
    timeout: 20_000,
  })

  await page.evaluate(() => {
    const zone = document.querySelector(
      '.results-tab-content--swipe-zone, .result-card, .results-section'
    )
    const app = document.querySelector('.app') as HTMLElement | null
    const scroller =
      app && app.scrollHeight > app.clientHeight + 1
        ? app
        : (document.scrollingElement as HTMLElement | null)
    if (!zone || !scroller) return
    const rect = zone.getBoundingClientRect()
    if (rect.top < 8 || rect.bottom > window.innerHeight - 8) {
      scroller.scrollTop += rect.top - 80
    }
  })
  await page.waitForTimeout(200)
  const resultsHit = await page.evaluate(() => {
    const zone = document.querySelector(
      '.results-tab-content--swipe-zone, .result-card, .results-section'
    ) as HTMLElement | null
    if (!zone) return 'missing results'
    if (zone.closest('[inert]')) return 'results are inert'
    const next = zone.getBoundingClientRect()
    const top = Math.max(next.top + 4, 8)
    const bottom = Math.min(next.bottom - 4, window.innerHeight - 8)
    if (bottom - top < 8) {
      return `results off screen ${Math.round(next.top)}..${Math.round(next.bottom)}`
    }
    const x = Math.min(Math.max(next.left + Math.min(next.width / 2, 40), 8), window.innerWidth - 8)
    const y = top + Math.min(24, bottom - top) / 2
    const hit = document.elementFromPoint(x, y)
    if (!hit || hit.id === 'tutorial-interaction-shield') return 'shield covers results'
    return 'ok'
  })
  expect(resultsHit).toBe('ok')

  const scrolled = await page.evaluate(() => {
    const app = document.querySelector('.app') as HTMLElement | null
    const scroller =
      app && app.scrollHeight > app.clientHeight + 1
        ? app
        : (document.scrollingElement as HTMLElement)
    const before = scroller.scrollTop
    const next = before > 40 ? before - 80 : before + 80
    scroller.scrollTop = next
    return Math.abs(scroller.scrollTop - before) > 20
  })
  expect(scrolled).toBe(true)

  await runTutorialComparison(page, testInfo, 25_000, 'Follow-up for the interaction lock test.')
  await clickTutorialDoneButton(page, testInfo)
  await expect(tutorialTooltip(page).first()).toContainText('Access Your History', {
    timeout: 20_000,
  })
  await page.evaluate(() => {
    const button = (document.querySelector(
      '[data-after-results-composer-slot] .history-toggle-button'
    ) ?? document.querySelector('.history-toggle-button')) as HTMLButtonElement | null
    button?.click()
  })
  await expect.poll(() => page.locator('.history-inline-list').count()).toBeGreaterThan(0)
  await page.evaluate(() => {
    const list =
      document.querySelector('[data-after-results-composer-slot] .history-inline-list') ??
      Array.from(document.querySelectorAll('.history-inline-list')).find(
        el => !el.closest('.composer-hero-mirror')
      )
    const app = document.querySelector('.app') as HTMLElement | null
    const scroller =
      app && app.scrollHeight > app.clientHeight + 1
        ? app
        : (document.scrollingElement as HTMLElement | null)
    if (!list || !scroller) return
    const rect = list.getBoundingClientRect()
    if (rect.top < 8 || rect.top > window.innerHeight - 40) {
      scroller.scrollTop += rect.top - 120
    }
  })
  await expect
    .poll(async () => {
      return page.evaluate(() => {
        const list = (document.querySelector(
          '[data-after-results-composer-slot] .history-inline-list'
        ) ??
          Array.from(document.querySelectorAll('.history-inline-list')).find(
            el => !el.closest('.composer-hero-mirror')
          )) as HTMLElement | null
        if (!list) return 'missing history'
        if (list.closest('[inert]')) return 'history is inert'
        const rect = list.getBoundingClientRect()
        const top = Math.max(rect.top + 8, 8)
        const bottom = Math.min(rect.bottom - 4, window.innerHeight - 8)
        if (bottom - top < 8) {
          return `history off screen ${Math.round(rect.top)}..${Math.round(rect.bottom)}`
        }
        const hit = document.elementFromPoint(rect.left + rect.width / 2, top + 4)
        if (!hit || hit.closest('#tutorial-interaction-shield')) {
          const path = document.querySelector('#tutorial-interaction-shield path')
          const d = path?.getAttribute('d') ?? ''
          return `shield y=${Math.round(top)} h=${Math.round(rect.height)} d=${d.slice(0, 220)}`
        }
        return 'ok'
      })
    })
    .toBe('ok')
})
