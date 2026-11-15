import { expect, type Page, type Response, type TestInfo } from '@playwright/test'

import { dismissMobileBlockers, isMobileE2eProject, toggleModelCheckbox } from './modelCheckbox'

const TUTORIAL_TITLE_SELECTOR = '.mobile-tutorial-tooltip-title, .tutorial-tooltip-title'

async function dismissBlockingModals(page: Page): Promise<void> {
  const overlay = page.locator('.disabled-button-info-overlay')
  if (await overlay.isVisible({ timeout: 500 }).catch(() => false)) {
    const close = overlay.getByRole('button', { name: 'Close' })
    if (await close.isVisible().catch(() => false)) {
      await close.tap().catch(() => close.click())
    } else {
      await page.keyboard.press('Escape')
    }
    await overlay.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
  }
}

export async function expandTutorialProvider(
  page: Page,
  providerName: string,
  testInfo?: TestInfo
): Promise<void> {
  const header = page
    .locator(`.provider-dropdown[data-provider-name="${providerName}"] .provider-header`)
    .first()
  await header.scrollIntoViewIfNeeded()
  await dismissMobileBlockers(page)
  if (testInfo && isMobileE2eProject(testInfo.project.name)) {
    await header.tap({ timeout: 10000 })
  } else {
    await header.click({ timeout: 10000 })
  }
  await expect(header).toHaveAttribute('aria-expanded', 'true')
}

async function readTutorialTitle(page: Page): Promise<string> {
  return page.evaluate(selector => {
    return document.querySelector(selector)?.textContent?.trim() ?? ''
  }, TUTORIAL_TITLE_SELECTOR)
}

async function isModelCheckedInDom(page: Page, modelId: string): Promise<boolean> {
  return page.evaluate(id => {
    const el = document.querySelector(`[data-testid="model-checkbox-${id}"]`) as HTMLInputElement | null
    return el?.checked === true
  }, modelId)
}

async function clickModelInDom(page: Page, modelId: string): Promise<void> {
  await page.evaluate(id => {
    const el = document.querySelector(`[data-testid="model-checkbox-${id}"]`) as HTMLInputElement | null
    el?.click()
  }, modelId)
}

/**
 * Toggle a tutorial model checkbox. On split steps, selecting the first model
 * advances the tour and filters that row out of the list.
 */
export async function selectTutorialModelCheckbox(
  page: Page,
  modelId: string,
  provider: string,
  testInfo: TestInfo,
  options?: { afterSelectPartnerModelId?: string; requireMinSelected?: number }
): Promise<void> {
  const header = page
    .locator(`.provider-dropdown[data-provider-name="${provider}"] .provider-header`)
    .first()
  if ((await header.getAttribute('aria-expanded')) !== 'true') {
    await expandTutorialProvider(page, provider, testInfo)
  }

  const checkbox = page.getByTestId(`model-checkbox-${modelId}`)
  await expect(checkbox).toBeEnabled({ timeout: 15000 })
  await checkbox.scrollIntoViewIfNeeded()
  await dismissMobileBlockers(page)
  await dismissBlockingModals(page)

  const pollTimeout = isMobileE2eProject(testInfo.project.name) ? 30_000 : 12_000

  if (isMobileE2eProject(testInfo.project.name)) {
    const label = page.locator(`label:has([data-testid="model-checkbox-${modelId}"])`).first()
    await label.tap({ force: true, timeout: 10_000 }).catch(() => {})
    await toggleModelCheckbox(checkbox, testInfo.project.name).catch(() => {})
    if (!(await isModelCheckedInDom(page, modelId))) {
      await clickModelInDom(page, modelId)
    }
  } else {
    const label = page.locator(`label:has([data-testid="model-checkbox-${modelId}"])`).first()
    await label.click({ timeout: 10000 })
  }

  await expect
    .poll(
      async () => {
        if (await isModelCheckedInDom(page, modelId)) {
          return true
        }

        const title = await readTutorialTitle(page)
        if (title.startsWith('Now select') || title === 'Enter Your Prompt') {
          return true
        }

        const header = await page.evaluate(() => {
          return document.querySelector('.mobile-tutorial-tooltip-header')?.textContent ?? ''
        })
        if (header.includes('Step 3 of') || header.includes('Step 4 of')) {
          return true
        }

        const partnerId = options?.afterSelectPartnerModelId
        if (partnerId) {
          return page.evaluate(
            ({ selectedId, nextId }) => {
              const selected = document.querySelector(
                `[data-testid="model-checkbox-${selectedId}"]`
              ) as HTMLInputElement | null
              const next = document.querySelector(`[data-testid="model-checkbox-${nextId}"]`)
              if (selected?.checked) return true
              return !selected && next !== null
            },
            { selectedId: modelId, nextId: partnerId }
          )
        }

        const minSelected = options?.requireMinSelected
        if (minSelected) {
          const count = await page.evaluate(
            () => document.querySelectorAll<HTMLInputElement>('input.model-checkbox:checked').length
          )
          if (count >= minSelected) {
            return true
          }
        }

        return false
      },
      { timeout: pollTimeout, message: `expected ${modelId} to be selected or step to advance` }
    )
    .toBe(true)
}

export function tutorialTooltip(page: Page) {
  return page.locator('.tutorial-tooltip, .mobile-tutorial-tooltip')
}

export async function expectTutorialStepNumber(
  page: Page,
  step: number,
  total = 9,
  timeout = 20_000
): Promise<void> {
  const needle = `Step ${step} of ${total}`
  await expect
    .poll(
      async () => {
        const inTooltip = await tutorialTooltip(page).first().textContent().catch(() => '')
        if (inTooltip?.includes(needle)) return true
        return page.evaluate(expected => {
          const header = document.querySelector('.mobile-tutorial-tooltip-header')?.textContent ?? ''
          return header.includes(expected)
        }, needle)
      },
      { timeout, message: needle }
    )
    .toBe(true)
}

export function tutorialStepTitle(page: Page) {
  return page.locator(TUTORIAL_TITLE_SELECTOR)
}

/** Mobile tooltips often omit heading roles; match title text in the live DOM. */
export async function expectTutorialEnterPromptStep(page: Page, timeout = 30_000): Promise<void> {
  await expect
    .poll(
      async () => {
        const title = await readTutorialTitle(page)
        if (title.includes('Enter Your Prompt')) {
          return true
        }
        const tooltipText = await tutorialTooltip(page)
          .first()
          .textContent()
          .catch(() => '')
        if (tooltipText?.includes('Enter Your Prompt')) {
          return true
        }
        const header = await page.evaluate(() => {
          return document.querySelector('.mobile-tutorial-tooltip-header')?.textContent ?? ''
        })
        return header.includes('Step 4 of')
      },
      { timeout, message: 'tutorial enter-prompt step' }
    )
    .toBe(true)

  await expect
    .poll(
      async () =>
        page.evaluate(
          () => document.querySelectorAll<HTMLInputElement>('input.model-checkbox:checked').length
        ),
      { timeout: 10_000 }
    )
    .toBeGreaterThanOrEqual(2)
}

export async function expectTutorialStepTitle(
  page: Page,
  title: string | RegExp,
  timeout = 15000
): Promise<void> {
  const needle = typeof title === 'string' ? title : title.source
  const mobileTimeout = Math.max(timeout, 30_000)

  await expect
    .poll(
      async () => {
        const tooltipText = await tutorialTooltip(page)
          .first()
          .textContent()
          .catch(() => '')
        if (tooltipText?.includes(needle)) {
          return true
        }
        const current = await readTutorialTitle(page)
        return current.includes(needle)
      },
      { timeout: mobileTimeout, message: `tutorial step title: ${String(title)}` }
    )
    .toBe(true)
}

/** Avoid DOM `checkVisibility()` (breaks on mobile fixed composer); use Playwright tap on last submit. */
export async function runTutorialComparison(
  page: Page,
  testInfo: TestInfo,
  timeoutMs: number,
  promptText?: string
): Promise<void> {
  await dismissBlockingModals(page)
  if (promptText) {
    const textarea = page.getByTestId('comparison-input-textarea').filter({ visible: true }).first()
    await textarea.fill(promptText)
    await textarea.blur()
  }
  const doneSelecting = page.getByRole('button', { name: 'Done selecting models' })
  if (await doneSelecting.isVisible().catch(() => false)) {
    await doneSelecting.tap({ force: true }).catch(() => doneSelecting.click())
    await expect(doneSelecting).toBeHidden({ timeout: 15_000 })
  }
  const submit = page.getByTestId('comparison-submit-button').filter({ visible: true }).first()
  await expect(submit).toBeEnabled({ timeout: 20_000 })
  await submit.scrollIntoViewIfNeeded().catch(() => {})
  const matchesStream = (res: Response) =>
    res.url().includes('compare-stream') && res.request().method() === 'POST'

  const fireSubmit = async () => {
    if (isMobileE2eProject(testInfo.project.name)) {
      const clicked = await page.evaluate(() => {
        const buttons = document.querySelectorAll<HTMLButtonElement>(
          '[data-testid="comparison-submit-button"]'
        )
        for (const button of buttons) {
          const highlighted =
            button.classList.contains('mobile-tutorial-highlight') ||
            button.classList.contains('tutorial-highlight')
          if (!highlighted && buttons.length > 1) continue
          if (button.disabled || button.getAttribute('aria-disabled') === 'true') continue
          button.click()
          return true
        }
        return false
      })
      if (!clicked) {
        await submit.tap({ force: true })
      }
    } else {
      await submit.click({ force: true })
    }
  }

  await Promise.all([page.waitForResponse(matchesStream, { timeout: timeoutMs }), fireSubmit()])

  await page
    .locator('.result-card.conversation-card, .results-section [data-testid^="result-card-"]')
    .first()
    .waitFor({ state: 'visible', timeout: timeoutMs })
}

export async function waitForCompareSubmitTutorialStep(page: Page, timeout = 30_000): Promise<void> {
  await expect
    .poll(
      async () => {
        return page.evaluate(() => {
          const title = document.querySelector('.mobile-tutorial-tooltip-title')?.textContent ?? ''
          if (title.includes('Run Your Comparison')) return true
          const buttons = document.querySelectorAll<HTMLButtonElement>(
            '[data-testid="comparison-submit-button"]'
          )
          for (const button of buttons) {
            const highlighted =
              button.classList.contains('mobile-tutorial-highlight') ||
              button.classList.contains('tutorial-highlight')
            if (!highlighted) continue
            return button.disabled === false && button.getAttribute('aria-disabled') !== 'true'
          }
          return false
        })
      },
      { timeout }
    )
    .toBe(true)
}

export async function completeTutorialPromptInput(
  page: Page,
  text: string,
  testInfo: TestInfo
): Promise<void> {
  await dismissBlockingModals(page)
  const textarea = page.getByTestId('comparison-input-textarea').filter({ visible: true }).first()
  await textarea.fill(text)
  const doneButton = page
    .locator(
      '.mobile-tutorial-tooltip button:has-text("Done with input"), .tutorial-tooltip button:has-text("Done with input")'
    )
    .first()
  await expect(doneButton).toBeEnabled({ timeout: 20_000 })
  await dismissBlockingModals(page)
  if (isMobileE2eProject(testInfo.project.name)) {
    await doneButton.tap({ force: true }).catch(() => {})
    await page
      .evaluate(() => {
        const btn = document.querySelector(
          '.mobile-tutorial-tooltip button.mobile-tutorial-button-primary'
        ) as HTMLButtonElement | null
        btn?.click()
      })
      .catch(() => {})
  } else {
    await doneButton.click()
  }

  await expect
    .poll(
      async () => {
        const title = await readTutorialTitle(page)
        if (title.includes('Run Your Comparison')) return true
        return page.evaluate(() => {
          for (const button of document.querySelectorAll<HTMLButtonElement>(
            '[data-testid="comparison-submit-button"]'
          )) {
            if (
              button.classList.contains('mobile-tutorial-highlight') ||
              button.classList.contains('tutorial-highlight')
            ) {
              return true
            }
          }
          const tooltip = document.querySelector('.mobile-tutorial-tooltip-title, .tutorial-tooltip-title')
          return (tooltip?.textContent ?? '').includes('Run Your Comparison')
        })
      },
      { timeout: 20_000, message: 'tutorial should advance to compare submit step' }
    )
    .toBe(true)
}

export async function clickTutorialDoneButton(page: Page, testInfo: TestInfo): Promise<void> {
  await dismissBlockingModals(page)
  const doneButton = page
    .locator('.mobile-tutorial-tooltip button, .tutorial-tooltip button')
    .filter({ hasText: /^Done$/ })
    .first()
  await expect(doneButton).toBeEnabled({ timeout: 20_000 })
  if (isMobileE2eProject(testInfo.project.name)) {
    await doneButton.tap({ force: true })
  } else {
    await doneButton.click()
  }
}

export async function expectSplitOrCombinedModelStep(page: Page): Promise<'split' | 'combined'> {
  await expect
    .poll(async () => {
      const title = await readTutorialTitle(page)
      return title.includes('Select Gemini 2.5 Flash') || title.includes('Select Models')
    })
    .toBe(true)

  const title = await readTutorialTitle(page)
  return title.includes('Select Gemini 2.5 Flash') ? 'split' : 'combined'
}