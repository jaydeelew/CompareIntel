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
    await header.tap({ timeout: 10000 }).catch(() => header.click({ timeout: 10000 }))
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

async function readTutorialHeaderText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const mobile = document.querySelector('.mobile-tutorial-tooltip-header')?.textContent ?? ''
    const desktop = document.querySelector('.tutorial-tooltip-header')?.textContent ?? ''
    return mobile || desktop
  })
}

function splitFlowAdvancedPastFirstModel(header: string, step: string | null): boolean {
  if (step === 'expand-starter-provider-2' || step === 'select-starter-model-2') {
    return true
  }
  return /Step (3|[4-9]|10) of/.test(header)
}

async function readTutorialCurrentStep(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const w = window as Window & { __TUTORIAL_CURRENT_STEP__?: string | null }
    return w.__TUTORIAL_CURRENT_STEP__ ?? null
  })
}

async function countSelectedModelCards(page: Page): Promise<number> {
  return page.locator('.selected-model-card').count()
}

async function isModelCheckedInDom(page: Page, modelId: string): Promise<boolean> {
  return page.evaluate(id => {
    const el = document.querySelector(
      `[data-testid="model-checkbox-${id}"]`
    ) as HTMLInputElement | null
    return el?.checked === true
  }, modelId)
}

async function clickModelInDom(page: Page, modelId: string): Promise<void> {
  await page.evaluate(id => {
    const el = document.querySelector(
      `[data-testid="model-checkbox-${id}"]`
    ) as HTMLInputElement | null
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

  const pollTimeout = isMobileE2eProject(testInfo.project.name) ? 45_000 : 12_000

  if (isMobileE2eProject(testInfo.project.name)) {
    await expectTutorialTooltipDoesNotOverlapCheckbox(page, modelId).catch(() => {})
    await page.waitForTimeout(600)
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

        const header = await readTutorialHeaderText(page)
        const step = await readTutorialCurrentStep(page)
        if (splitFlowAdvancedPastFirstModel(header, step)) {
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
              const headerText =
                document.querySelector('.mobile-tutorial-tooltip-header')?.textContent ??
                document.querySelector('.tutorial-tooltip-header')?.textContent ??
                ''
              const currentStep = (window as Window & { __TUTORIAL_CURRENT_STEP__?: string | null })
                .__TUTORIAL_CURRENT_STEP__
              if (
                currentStep === 'expand-starter-provider-2' ||
                currentStep === 'select-starter-model-2' ||
                /Step (3|[4-9]|10) of/.test(headerText)
              ) {
                return true
              }
              return !selected && next !== null
            },
            { selectedId: modelId, nextId: partnerId }
          )
        }

        const minSelected = options?.requireMinSelected
        if (minSelected) {
          const railCount = await countSelectedModelCards(page)
          const checkedCount = await page.evaluate(
            () => document.querySelectorAll<HTMLInputElement>('input.model-checkbox:checked').length
          )
          if (Math.max(railCount, checkedCount) >= minSelected) {
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

export async function expectTutorialTooltipStaysVisible(page: Page, idleMs = 3500): Promise<void> {
  await page.waitForTimeout(idleMs)
  await expect(tutorialTooltip(page).first()).toBeVisible()
}

/** After model select advances the tour, the dimmed backdrop must not drop out briefly. */
export async function expectTutorialBackdropContinuous(
  page: Page,
  sampleCount = 10,
  sampleIntervalMs = 120
): Promise<void> {
  for (let i = 0; i < sampleCount; i++) {
    const dimmed = await page.evaluate(() => {
      const cutout = document.querySelector(
        '.mobile-tutorial-backdrop-cutout, .tutorial-backdrop-cutout'
      ) as HTMLElement | null
      if (cutout) {
        const opacity = Number.parseFloat(window.getComputedStyle(cutout).opacity || '1')
        return opacity > 0.05
      }
      return (
        document.querySelector('.mobile-tutorial-backdrop') != null ||
        document.querySelector('.tutorial-backdrop') != null
      )
    })
    expect(dimmed).toBe(true)
    if (i < sampleCount - 1) {
      await page.waitForTimeout(sampleIntervalMs)
    }
  }
}

/** Mobile/desktop: tutorial card must not cover the model checkbox the step describes. */
/** Spotlight/cutout should frame the full provider card (header + models), not a single row. */
export async function expectTutorialTargetProviderInViewport(
  page: Page,
  providerName: string
): Promise<void> {
  await expect
    .poll(
      async () => {
        return page.evaluate(name => {
          const provider = document.querySelector(
            `.provider-dropdown[data-provider-name="${name}"]`
          ) as HTMLElement | null
          if (!provider) return false
          const r = provider.getBoundingClientRect()
          const vh = window.innerHeight
          const header = provider.querySelector('.provider-header') as HTMLElement | null
          const headerRect = header?.getBoundingClientRect()
          if (!headerRect) return false
          return headerRect.bottom > 32 && headerRect.top < vh - 32 && r.bottom > 0 && r.top < vh
        }, providerName)
      },
      { timeout: 35_000, message: `provider ${providerName} should be in viewport with tutorial` }
    )
    .toBe(true)
}

export async function expectTutorialCutoutHasBlueFrame(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        return page.evaluate(() => {
          const cutout = document.querySelector(
            '.mobile-tutorial-backdrop-cutout, .tutorial-backdrop-cutout'
          ) as HTMLElement | null
          if (!cutout) return false
          const shadow = window.getComputedStyle(cutout).boxShadow
          return shadow.includes('inset')
        })
      },
      { timeout: 20_000, message: 'tutorial cutout should show inset blue accent frame' }
    )
    .toBe(true)
}

export async function expectTutorialHighlightCoversProviderSection(
  page: Page,
  providerName: string
): Promise<void> {
  await expect
    .poll(
      async () => {
        return page.evaluate(name => {
          const provider = document.querySelector(
            `.provider-dropdown[data-provider-name="${name}"]`
          ) as HTMLElement | null
          if (!provider) return false
          const header = provider.querySelector('.provider-header')
          const models = provider.querySelector('.provider-models')
          if (!header || !models) return false

          const cutout = (document.querySelector(
            '.mobile-tutorial-backdrop-cutout, .tutorial-backdrop-cutout'
          ) ?? null) as HTMLElement | null

          const providerRect = provider.getBoundingClientRect()
          const headerRect = header.getBoundingClientRect()
          const highlighted =
            provider.classList.contains('mobile-tutorial-highlight') ||
            provider.classList.contains('tutorial-highlight')

          if (cutout) {
            const cutoutRect = cutout.getBoundingClientRect()
            const heightOk = cutoutRect.height >= providerRect.height * 0.82
            const topOk = Math.abs(cutoutRect.top - providerRect.top) < 12
            const frameOk = window.getComputedStyle(cutout).boxShadow.includes('inset')
            return heightOk && topOk && frameOk
          }

          return highlighted && headerRect.height > 0 && providerRect.height > headerRect.height + 8
        }, providerName)
      },
      { timeout: 20_000, message: `tutorial highlight should cover full ${providerName} section` }
    )
    .toBe(true)
}

export async function expectTutorialTooltipDoesNotOverlapCheckbox(
  page: Page,
  modelId: string
): Promise<void> {
  await expect
    .poll(
      async () => {
        return page.evaluate(id => {
          const tip = document.querySelector('.mobile-tutorial-tooltip, .tutorial-tooltip')
          const cb = document.querySelector(
            `[data-testid="model-checkbox-${id}"]`
          ) as HTMLElement | null
          if (!tip || !cb) return false
          const t = tip.getBoundingClientRect()
          const c = cb.getBoundingClientRect()
          const overlap =
            t.left < c.right && t.right > c.left && t.top < c.bottom && t.bottom > c.top
          return !overlap
        }, modelId)
      },
      { timeout: 20_000, message: 'tutorial tooltip overlapping model checkbox' }
    )
    .toBe(true)
}

export async function expectTutorialStepNumber(
  page: Page,
  step: number,
  total = 10,
  timeout = 20_000
): Promise<void> {
  const needle = `Step ${step} of ${total}`
  await expect
    .poll(
      async () => {
        const inTooltip = await tutorialTooltip(page)
          .first()
          .textContent()
          .catch(() => '')
        if (inTooltip?.includes(needle)) return true
        return page.evaluate(expected => {
          const header =
            document.querySelector('.mobile-tutorial-tooltip-header')?.textContent ?? ''
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
export async function expectTutorialEnterPromptStep(
  page: Page,
  testInfo?: TestInfo,
  timeout?: number
): Promise<void> {
  const pollTimeout =
    timeout ?? (testInfo && isMobileE2eProject(testInfo.project.name) ? 45_000 : 30_000)

  await expect
    .poll(
      async () => {
        const step = await readTutorialCurrentStep(page)
        if (step === 'enter-prompt') {
          return true
        }
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
        if (tooltipText?.includes('Done with input')) {
          return true
        }
        const header = await page.evaluate(() => {
          return document.querySelector('.mobile-tutorial-tooltip-header')?.textContent ?? ''
        })
        if (header.includes('Step 4 of')) {
          return true
        }
        return page.evaluate(() => {
          const composer = document.querySelector('.composer.mobile-tutorial-highlight')
          const enterPromptBtn = document.querySelector(
            '.mobile-tutorial-tooltip button.mobile-tutorial-button-primary'
          )
          return Boolean(composer && enterPromptBtn?.textContent?.includes('Done with input'))
        })
      },
      { timeout: pollTimeout, message: 'tutorial enter-prompt step' }
    )
    .toBe(true)

  await expect
    .poll(
      async () =>
        Math.max(
          await countSelectedModelCards(page),
          await page.evaluate(
            () => document.querySelectorAll<HTMLInputElement>('input.model-checkbox:checked').length
          )
        ),
      { timeout: 15_000 }
    )
    .toBeGreaterThanOrEqual(2)

  await expectTutorialCutoutHasBlueFrame(page)
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

/** DOM click on the tutorial-highlighted submit (Firefox/WebKit pointer clicks can miss overlays). */
async function clickTutorialCompareSubmitButton(page: Page, testInfo: TestInfo): Promise<void> {
  const clicked = await page.evaluate(() => {
    const buttons = Array.from(
      document.querySelectorAll<HTMLButtonElement>('[data-testid="comparison-submit-button"]')
    )
    const tryClick = (button: HTMLButtonElement) => {
      if (button.disabled || button.getAttribute('aria-disabled') === 'true') return false
      const cs = window.getComputedStyle(button)
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) {
        return false
      }
      const rect = button.getBoundingClientRect()
      if (rect.width < 1 || rect.height < 1) return false
      if (typeof button.checkVisibility === 'function' && !button.checkVisibility()) return false
      button.scrollIntoView({ block: 'center', inline: 'nearest' })
      button.click()
      return true
    }
    for (const button of buttons) {
      if (
        button.classList.contains('mobile-tutorial-highlight') ||
        button.classList.contains('tutorial-highlight')
      ) {
        if (tryClick(button)) return true
      }
    }
    for (const button of buttons) {
      if (tryClick(button)) return true
    }
    return false
  })
  if (clicked) return
  const submit = page.getByTestId('comparison-submit-button').filter({ visible: true }).first()
  if (isMobileE2eProject(testInfo.project.name)) {
    await submit.tap({ force: true })
  } else {
    await submit.click({ force: true })
  }
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
    const current = await textarea.inputValue().catch(() => '')
    if (current !== promptText) {
      await textarea.fill(promptText)
      await textarea.blur()
    }
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
    await clickTutorialCompareSubmitButton(page, testInfo)
  }

  await Promise.all([page.waitForResponse(matchesStream, { timeout: timeoutMs }), fireSubmit()])

  await page
    .locator('.result-card.conversation-card, .results-section [data-testid^="result-card-"]')
    .first()
    .waitFor({ state: 'visible', timeout: timeoutMs })
}

export async function waitForCompareSubmitTutorialStep(
  page: Page,
  timeout = 30_000
): Promise<void> {
  await expect
    .poll(
      async () => {
        const title = await readTutorialTitle(page)
        if (title.includes('Run Your Comparison')) return true
        const step = await readTutorialCurrentStep(page)
        if (step === 'submit-comparison' || step === 'submit-comparison-2') return true
        return page.evaluate(() => {
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
          const tooltip = document.querySelector(
            '.mobile-tutorial-tooltip-title, .tutorial-tooltip-title'
          )
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
      const splitStarterStep = title.startsWith('Select ') && !title.includes('Select Models')
      return splitStarterStep || title.includes('Select Models')
    })
    .toBe(true)

  const title = await readTutorialTitle(page)
  const splitStarterStep = title.startsWith('Select ') && !title.includes('Select Models')
  return splitStarterStep ? 'split' : 'combined'
}
