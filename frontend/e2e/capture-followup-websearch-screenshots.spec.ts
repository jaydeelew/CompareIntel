/**
 * Visual capture for follow-up web search lock evidence (manual/agent run, not CI).
 * Excluded via playwright.config.ts testIgnore — run locally with preview + backend up.
 */
import { expect, test } from './fixtures'

const ARTIFACTS = '/opt/cursor/artifacts'

async function expandFirstProvider(page: import('@playwright/test').Page) {
  const providerHeaders = page.locator('.provider-header, button[class*="provider-header"]')
  if ((await providerHeaders.count()) > 0) {
    const first = providerHeaders.first()
    if ((await first.getAttribute('aria-expanded')) !== 'true') {
      await first.click()
      await page.waitForTimeout(400)
    }
  }
}

async function selectWebCapableModel(page: import('@playwright/test').Page) {
  await expandFirstProvider(page)
  const webRow = page.locator('label:has(.web-search-indicator) input.model-checkbox')
  const modelCheckboxes = page.locator(
    '[data-testid^="model-checkbox-"], input[type="checkbox"].model-checkbox'
  )
  await expect(modelCheckboxes.first()).toBeVisible({ timeout: 20000 })
  const pick = (await webRow.count()) > 0 ? webRow.first() : modelCheckboxes.first()
  if (!(await pick.isChecked())) await pick.check({ force: true })
}

async function setWebSearchToggle(page: import('@playwright/test').Page, webSearchOn: boolean) {
  const webSearchButton = page.getByTestId('web-search-button')
  await expect(webSearchButton).toBeVisible({ timeout: 15000 })
  const ariaDisabled = await webSearchButton.getAttribute('aria-disabled')
  if (ariaDisabled === 'true' && webSearchOn) {
    throw new Error('Web search button disabled before first comparison')
  }
  const initialActive = (await webSearchButton.getAttribute('class'))?.includes('active')
  if (webSearchOn && !initialActive) {
    await webSearchButton.click()
    const confirm = page.getByTestId('action-tooltip-modal-confirm')
    if (await confirm.isVisible({ timeout: 1500 }).catch(() => false)) {
      await confirm.click()
    }
  }
  if (!webSearchOn && initialActive && ariaDisabled === 'false') {
    await webSearchButton.click()
  }
}

async function submitFirstComparison(
  page: import('@playwright/test').Page,
  webSearchOn: boolean,
  label: string
) {
  await selectWebCapableModel(page)
  await setWebSearchToggle(page, webSearchOn)
  const inputField = page.getByTestId('comparison-input-textarea')
  await inputField.fill(`Follow-up web search evidence: ${label}`)
  await page.getByTestId('comparison-submit-button').click()
  await page
    .locator('.follow-up-header, h2:has-text("Start over")')
    .first()
    .waitFor({ state: 'visible', timeout: 60000 })
  const webSearchButton = page.getByTestId('web-search-button')
  await expect(webSearchButton).toHaveAttribute('aria-disabled', 'true', { timeout: 10000 })
  await expect(webSearchButton).toHaveClass(/web-search-locked/)
  await waitForGlobeIconPainted(page)
}

async function visibleWebSearchButton(page: import('@playwright/test').Page) {
  const toolbar = page.locator('.composer-toolbar').first()
  await expect(toolbar).toBeVisible({ timeout: 15000 })
  return toolbar.getByTestId('web-search-button')
}

async function waitForGlobeIconPainted(page: import('@playwright/test').Page) {
  const webSearchButton = await visibleWebSearchButton(page)
  await expect(webSearchButton).toBeVisible({ timeout: 15000 })
  const globeIcon = webSearchButton.getByTestId('web-search-globe-icon')
  await expect(globeIcon).toBeVisible({ timeout: 15000 })
  const buttonHandle = await webSearchButton.elementHandle()
  if (!buttonHandle) throw new Error('Web search button handle missing')
  await page.waitForFunction(el => {
    const path = el?.querySelector(
      '[data-testid="web-search-globe-icon"] path'
    ) as SVGPathElement | null
    if (!path) return false
    const stroke = getComputedStyle(path).stroke
    return stroke !== 'none' && stroke !== ''
  }, buttonHandle)
  await page.waitForTimeout(150)
}

async function scrollComposerToolbarIntoView(page: import('@playwright/test').Page) {
  const toolbar = page.locator('.composer-toolbar').first()
  await expect(toolbar).toBeVisible({ timeout: 15000 })
  await toolbar.scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
}

async function screenshotToolbarCrop(page: import('@playwright/test').Page, path: string) {
  await scrollComposerToolbarIntoView(page)
  const toolbar = page.locator('.composer-toolbar').first()
  await toolbar.screenshot({ path })
}

async function screenshotGlobeButtonCrop(page: import('@playwright/test').Page, path: string) {
  await scrollComposerToolbarIntoView(page)
  await waitForGlobeIconPainted(page)
  const globe = page.getByTestId('web-search-button').first()
  await globe.screenshot({ path, animations: 'disabled' })
}

async function showDesktopTooltip(page: import('@playwright/test').Page) {
  await waitForGlobeIconPainted(page)
  const globe = page.getByTestId('web-search-button').first()
  const anchor = page
    .locator('.tooltip--portal-anchor')
    .filter({ has: globe })
    .first()
  await expect(anchor).toBeVisible({ timeout: 5000 })
  await anchor.hover({ force: true })
  await page.waitForTimeout(400)
}

async function screenshotToolbarWithTooltip(page: import('@playwright/test').Page, path: string) {
  await showDesktopTooltip(page)
  const tooltip = page.locator('[role="tooltip"]').filter({ hasText: /fixed for this conversation/i })
  await expect(tooltip.first()).toBeVisible({ timeout: 5000 })
  const toolbar = page.locator('.composer-toolbar').first()
  const toolbarBox = await toolbar.boundingBox()
  const tooltipBox = await tooltip.first().boundingBox()
  if (!toolbarBox || !tooltipBox) {
    throw new Error('Could not measure toolbar or tooltip for screenshot')
  }
  const pad = 12
  const clip = {
    x: Math.max(0, Math.min(toolbarBox.x, tooltipBox.x) - pad),
    y: Math.max(0, tooltipBox.y - pad),
    width:
      Math.max(toolbarBox.x + toolbarBox.width, tooltipBox.x + tooltipBox.width) -
      Math.min(toolbarBox.x, tooltipBox.x) +
      pad * 2,
    height: toolbarBox.y + toolbarBox.height - tooltipBox.y + pad * 2,
  }
  await page.screenshot({ path, clip, animations: 'disabled' })
}

async function showLockedExplanation(page: import('@playwright/test').Page, screenshotPath: string) {
  const globe = page.getByTestId('web-search-button').first()
  await globe.scrollIntoViewIfNeeded()
  try {
    await globe.tap({ force: true })
  } catch {
    await globe.click({ force: true })
  }
  const disabledModal = page.locator('.disabled-button-info-modal, .disabled-button-info-overlay')
  const tooltipModal = page.locator('.tooltip-modal, [class*="tooltip-modal"]')
  if (await disabledModal.first().isVisible({ timeout: 2000 }).catch(() => false)) {
    await page.screenshot({ path: screenshotPath, fullPage: false, animations: 'disabled' })
    const close = page.locator('.disabled-button-info-button').first()
    if (await close.isVisible({ timeout: 2000 }).catch(() => false)) {
      await close.click()
    }
    return
  }
  if (await tooltipModal.first().isVisible({ timeout: 2000 }).catch(() => false)) {
    await page.screenshot({ path: screenshotPath, fullPage: false, animations: 'disabled' })
    const close = page.locator('button:has-text("Got it"), button:has-text("Close")').first()
    if (await close.isVisible({ timeout: 2000 }).catch(() => false)) {
      await close.click()
    }
    return
  }
  await screenshotToolbarCrop(page, screenshotPath.replace('-explanation.png', '-toolbar-fallback.png'))
}

async function screenshotAfterStartOver(
  page: import('@playwright/test').Page,
  prefix: string,
  width: number,
  height: number
) {
  await page.setViewportSize({ width, height })
  await page.getByTestId('exit-follow-up-button').first().click({ force: true })
  await page
    .locator('.follow-up-header, h2:has-text("Start over")')
    .first()
    .waitFor({ state: 'hidden', timeout: 15000 })
    .catch(() => {})
  await selectWebCapableModel(page)
  const globe = page.getByTestId('web-search-button')
  await expect(globe).toBeVisible({ timeout: 15000 })
  await expect(globe).toHaveAttribute('aria-disabled', 'false', { timeout: 15000 })
  await screenshotToolbarCrop(
    page,
    `${ARTIFACTS}/${prefix}-${width === 412 ? 'mobile-412' : 'desktop'}-start-over-toolbar.png`
  )
  await screenshotGlobeButtonCrop(
    page,
    `${ARTIFACTS}/${prefix}-${width === 412 ? 'mobile-412' : 'desktop'}-start-over-globe.png`
  )
}

test.describe('Follow-up web search screenshot capture', () => {
  test.describe('desktop', () => {
  test('composer toolbar evidence', async ({ mockedModelsAuthenticatedPage: page }) => {
    test.setTimeout(300000)
    await page.setViewportSize({ width: 1280, height: 900 })

    await test.step('Locked ON — desktop', async () => {
      await submitFirstComparison(page, true, 'locked-on')
      await screenshotToolbarCrop(
        page,
        `${ARTIFACTS}/followup-websearch-locked-on-desktop-toolbar.png`
      )
      await screenshotGlobeButtonCrop(
        page,
        `${ARTIFACTS}/followup-websearch-locked-on-desktop-globe.png`
      )
      await screenshotToolbarWithTooltip(
        page,
        `${ARTIFACTS}/followup-websearch-locked-on-desktop-tooltip.png`
      )
    })

    await test.step('Start over — desktop (globe usable)', async () => {
      await screenshotAfterStartOver(page, 'followup-websearch', 1280, 900)
    })

    await test.step('Locked OFF — desktop', async () => {
      await page.setViewportSize({ width: 1280, height: 900 })
      await submitFirstComparison(page, false, 'locked-off')
      await screenshotToolbarCrop(
        page,
        `${ARTIFACTS}/followup-websearch-locked-off-desktop-toolbar.png`
      )
      await screenshotGlobeButtonCrop(
        page,
        `${ARTIFACTS}/followup-websearch-locked-off-desktop-globe.png`
      )
      await screenshotToolbarWithTooltip(
        page,
        `${ARTIFACTS}/followup-websearch-locked-off-desktop-tooltip.png`
      )
    })

  })
  })

  test.describe('mobile 412', () => {
  test('composer toolbar evidence', { tag: '@mobile412' }, async ({ mockedModelsAuthenticatedPage: page }) => {
    test.setTimeout(300000)
    await page.setViewportSize({ width: 412, height: 900 })

    await test.step('Locked ON — mobile 412', async () => {
      await submitFirstComparison(page, true, 'locked-on-mobile')
      await screenshotToolbarCrop(
        page,
        `${ARTIFACTS}/followup-websearch-locked-on-mobile-412-toolbar.png`
      )
      await screenshotGlobeButtonCrop(
        page,
        `${ARTIFACTS}/followup-websearch-locked-on-mobile-412-globe.png`
      )
      await showLockedExplanation(
        page,
        `${ARTIFACTS}/followup-websearch-locked-on-mobile-412-explanation.png`
      )
    })

    await test.step('Locked OFF — mobile 412', async () => {
      await page.getByTestId('exit-follow-up-button').first().click({ force: true })
      await page.waitForTimeout(800)
      await submitFirstComparison(page, false, 'locked-off-mobile')
      await screenshotToolbarCrop(
        page,
        `${ARTIFACTS}/followup-websearch-locked-off-mobile-412-toolbar.png`
      )
      await screenshotGlobeButtonCrop(
        page,
        `${ARTIFACTS}/followup-websearch-locked-off-mobile-412-globe.png`
      )
      await showLockedExplanation(
        page,
        `${ARTIFACTS}/followup-websearch-locked-off-mobile-412-explanation.png`
      )
    })

    await test.step('Start over — mobile 412 (globe usable)', async () => {
      await screenshotAfterStartOver(page, 'followup-websearch', 412, 900)
    })
  })
  })
})