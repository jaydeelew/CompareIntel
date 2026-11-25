import { expect, type Locator, type Page } from '@playwright/test'

import { test } from './fixtures'
import { submitAndAwaitCompareStream } from './helpers/comparisonStream'
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
    }
  })
}

test.describe('Follow-up cards open on the latest prompt', () => {
  test.describe.configure({ timeout: 120000 })

  test('switching to the other model shows its latest prompt at the top of the card', async ({
    mockedModelsAuthenticatedPage: page,
  }, testInfo) => {
    await installLongComparisonStream(page)
    await dismissMobileBlockers(page)

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

    const tabs = page.locator('.results-tab-button')
    if ((await tabs.count()) >= 2) {
      await tabs.nth(1).click()
      await expect(tabs.nth(1)).toHaveClass(/active/)
    }

    const card = page.locator('.result-card.conversation-card').last()
    await card.scrollIntoViewIfNeeded()

    await expect
      .poll(async () => {
        const align = await readPromptAlign(card)
        const ok =
          align.error === '' &&
          align.count === 2 &&
          (align.lastText ?? '').includes(FOLLOW_UP_PROMPT) &&
          (align.maxScroll ?? 0) > 40 &&
          (align.lastDelta ?? 999) >= -4 &&
          (align.lastDelta ?? 999) <= 36 &&
          (align.firstDelta ?? 0) < -40
        return ok ? 'aligned' : JSON.stringify(align)
      })
      .toBe('aligned')

    if (
      testInfo.project.name === 'Mobile Safari - iPhone 12' ||
      testInfo.project.name === 'Mobile Chrome - Pixel 5'
    ) {
      await dismissMobileBlockers(page)
      const slug = testInfo.project.name.includes('iPhone') ? 'iphone' : 'pixel'
      await page.screenshot({
        path: `/opt/cursor/artifacts/follow-up-prompt-align/${slug}/second-model.png`,
        fullPage: false,
      })
    }
  })
})
