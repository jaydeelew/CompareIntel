import { expect, type Locator, type Page } from '@playwright/test'

import { test } from './fixtures'
import { submitAndAwaitCompareStream } from './helpers/comparisonStream'
import { isMobileChromeProject, touchSwipe } from './helpers/harnessTouchScroll'
import { buildMockComparisonStream } from './helpers/mockModels'
import { dismissMobileBlockers, toggleModelCheckbox } from './helpers/modelCheckbox'

const FOLLOW_UP_PROMPT = 'FOLLOW-UP PROMPT MARKER'
const FIRST_ANSWER = Array.from(
  { length: 28 },
  (_, index) =>
    `Opening answer block ${index} fills the card so the next prompt starts below the fold.`
).join(' ')

async function installLongComparisonStream(page: Page): Promise<void> {
  await page.route('**/api/compare-stream', async route => {
    let models: string[] = []
    let input = ''
    try {
      const body = route.request().postDataJSON() as { models?: string[]; input_data?: string }
      models = body.models ?? []
      input = body.input_data ?? ''
    } catch {
      models = []
    }
    const responseText = input.includes(FOLLOW_UP_PROMPT)
      ? 'Follow-up answer stays under the prompt.'
      : FIRST_ANSWER
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      headers: { 'Cache-Control': 'no-cache' },
      body: buildMockComparisonStream(models, responseText),
    })
  })
}

async function readPromptAlign(card: Locator) {
  return card.evaluate(node => {
    const content = node.querySelector('.conversation-content')
    if (!(content instanceof HTMLElement)) return { error: 'no-content' }
    const prompts = Array.from(content.querySelectorAll('.conversation-message.user'))
    const first = prompts[0]
    const last = prompts[prompts.length - 1]
    if (!(first instanceof HTMLElement) || !(last instanceof HTMLElement)) {
      return { error: 'no-prompts' }
    }
    const contentTop = content.getBoundingClientRect().top
    return {
      error: '',
      count: prompts.length,
      firstDelta: Math.round(first.getBoundingClientRect().top - contentTop),
      lastDelta: Math.round(last.getBoundingClientRect().top - contentTop),
      lastText: last.textContent ?? '',
      maxScroll: Math.round(content.scrollHeight - content.clientHeight),
      scrollTop: Math.round(content.scrollTop),
    }
  })
}

function promptIsPinned(align: Awaited<ReturnType<typeof readPromptAlign>>): boolean {
  return (
    align.error === '' &&
    align.count === 2 &&
    (align.lastText ?? '').includes(FOLLOW_UP_PROMPT) &&
    (align.maxScroll ?? 0) > 40 &&
    (align.scrollTop ?? 0) > 40 &&
    (align.lastDelta ?? 999) >= -4 &&
    (align.lastDelta ?? 999) <= 36 &&
    (align.firstDelta ?? 0) < -40
  )
}

/** The signed-in comparison page, with the guided tutorial closed. */
async function expectTutorialClosed(page: Page): Promise<void> {
  const state = await page.evaluate(() => ({
    active: document.documentElement.hasAttribute('data-onboarding-tutorial-active'),
    overlay: Boolean(
      document.querySelector(
        '.tutorial-backdrop, .mobile-tutorial-backdrop, .tutorial-welcome-backdrop, .tutorial-tooltip, .mobile-tutorial-tooltip'
      )
    ),
  }))
  expect(state.active, 'per-model scroll is checked outside the tutorial').toBe(false)
  expect(state.overlay, 'per-model scroll is checked outside the tutorial').toBe(false)
}

/** Sideways swipe with the vertical drift that used to mark the card as hand-scrolled. */
async function swipeToNextModel(page: Page): Promise<void> {
  const zone = page.locator('.results-tab-content--swipe-zone')
  await zone.scrollIntoViewIfNeeded()
  const box = await zone.boundingBox()
  if (!box) throw new Error('results tab swipe zone has no box')
  const midY = box.y + box.height * 0.45
  await touchSwipe(page, box.x + box.width * 0.8, midY, box.x + box.width * 0.12, midY + 28)
}

test.describe('Normal app follow-up cards keep their own scroll', () => {
  test.describe.configure({ timeout: 120000 })

  test('switching away and back restores that model, with the tutorial closed', async ({
    mockedModelsAuthenticatedPage: page,
  }, testInfo) => {
    await page.evaluate(() => localStorage.setItem('compareintel_tutorial_completed', 'true'))
    await installLongComparisonStream(page)
    await dismissMobileBlockers(page)
    await expectTutorialClosed(page)

    const providerHeader = page.locator('.provider-header').first()
    if ((await providerHeader.getAttribute('aria-expanded')) !== 'true') {
      await providerHeader.click()
    }
    for (const modelId of ['openai/gpt-5', 'openai/gpt-4.1']) {
      const checkbox = page.getByTestId(`model-checkbox-${modelId}`)
      await expect(checkbox).toBeVisible({ timeout: 15000 })
      await toggleModelCheckbox(checkbox, testInfo.project.name)
    }

    const input = page.getByTestId('comparison-input-textarea').filter({ visible: true }).first()
    await input.fill('First question that should scroll out of the card')
    await submitAndAwaitCompareStream(page)
    await expect(page.getByText('Opening answer block 0', { exact: false }).first()).toBeVisible({
      timeout: 20000,
    })

    await input.fill(FOLLOW_UP_PROMPT)
    await submitAndAwaitCompareStream(page)
    await expect(page.getByText(FOLLOW_UP_PROMPT).first()).toBeVisible({ timeout: 20000 })
    await expect(page.getByText('Follow-up answer stays under the prompt.').first()).toBeVisible({
      timeout: 20000,
    })
    await expectTutorialClosed(page)

    const tabs = page.locator('.results-tab-button')
    const tabbed = (await tabs.count()) >= 2
    if (testInfo.project.name === 'Mobile Chrome - Pixel 5') {
      await page.setViewportSize({ width: 360, height: 800 })
    }
    if (tabbed) {
      await tabs.nth(1).click()
      await expect(tabs.nth(1)).toHaveClass(/active/)
    }

    const card = page.locator('.result-card.conversation-card').last()
    await card.scrollIntoViewIfNeeded()

    await expect
      .poll(async () => {
        const align = await readPromptAlign(card)
        return promptIsPinned(align) ? 'aligned' : JSON.stringify(align)
      })
      .toBe('aligned')

    if (!tabbed) {
      await page.screenshot({
        path: '/opt/cursor/artifacts/follow-up-scroll-restore/desktop/both-models.png',
        fullPage: false,
      })
      return
    }

    const firstOpen = await readPromptAlign(card)
    await tabs.nth(0).click()
    await expect(tabs.nth(0)).toHaveClass(/active/)
    if (isMobileChromeProject(testInfo.project.name)) {
      await swipeToNextModel(page)
    } else {
      await tabs.nth(1).click()
    }
    await expect(tabs.nth(1)).toHaveClass(/active/)

    await expect
      .poll(async () => {
        const align = await readPromptAlign(card)
        const kept =
          promptIsPinned(align) &&
          Math.abs((align.scrollTop ?? 0) - (firstOpen.scrollTop ?? 0)) <= 24
        return kept ? 'kept' : JSON.stringify({ firstOpen, align })
      })
      .toBe('kept')
    await expectTutorialClosed(page)

    await dismissMobileBlockers(page)
    const shotDir = testInfo.project.name.includes('iPhone')
      ? '/opt/cursor/artifacts/follow-up-scroll-restore/iphone'
      : '/opt/cursor/artifacts/follow-up-scroll-restore/android360'
    if (
      testInfo.project.name === 'Mobile Safari - iPhone 12' ||
      testInfo.project.name === 'Mobile Chrome - Pixel 5'
    ) {
      await page.screenshot({
        path: `${shotDir}/return-visit.png`,
        fullPage: false,
      })
    }

    const nudged = await card.locator('.conversation-content').evaluate(node => {
      if (!(node instanceof HTMLElement)) return 0
      node.dispatchEvent(new WheelEvent('wheel', { deltaY: -160, bubbles: true }))
      node.scrollTop = Math.max(0, node.scrollTop - 140)
      return Math.round(node.scrollTop)
    })
    expect(nudged).toBeGreaterThan(40)
    expect(nudged).toBeLessThan((firstOpen.scrollTop ?? 0) - 40)

    await tabs.nth(0).click()
    await expect(tabs.nth(0)).toHaveClass(/active/)
    await tabs.nth(1).click()
    await expect(tabs.nth(1)).toHaveClass(/active/)

    await expect
      .poll(async () => {
        const align = await readPromptAlign(card)
        const kept = align.error === '' && Math.abs((align.scrollTop ?? 0) - nudged) <= 24
        return kept ? 'kept-scroll' : JSON.stringify({ nudged, align })
      })
      .toBe('kept-scroll')
  })
})
