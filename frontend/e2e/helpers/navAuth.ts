import type { Page } from '@playwright/test'

import { dismissTutorialOverlay, ensureUnfoldedNavbar } from '../fixtures'

function isRecoverableClickError(message: string): boolean {
  return (
    message.includes('intercepts pointer events') ||
    message.includes('outside of the viewport') ||
    message.includes('outside viewport')
  )
}

/**
 * Opens the sign-up auth modal from the navbar. Uses a DOM click when Playwright
 * cannot hit the button (common in Firefox when the hero layer affects viewport checks).
 */
export async function clickNavSignUpButton(
  page: Page,
  options?: { browserName?: string }
): Promise<void> {
  await dismissTutorialOverlay(page)
  await ensureUnfoldedNavbar(page)
  await page.evaluate(() =>
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior })
  )

  const signUpBtn = page.getByTestId('nav-sign-up-button')
  await signUpBtn.scrollIntoViewIfNeeded().catch(() => {})

  const domClick = async () => {
    await signUpBtn.evaluate((el: HTMLElement) => {
      el.click()
    })
  }

  const clickWithDomFallback = async () => {
    try {
      await signUpBtn.click({ timeout: 10000 })
    } catch (error) {
      const msg = error instanceof Error ? error.message : ''
      if (!isRecoverableClickError(msg)) throw error
      await dismissTutorialOverlay(page)
      await ensureUnfoldedNavbar(page)
      await domClick()
    }
  }

  // Firefox often rejects Playwright clicks as "outside viewport" on the hero nav.
  if (options?.browserName === 'firefox') {
    await domClick()
  } else {
    await clickWithDomFallback()
  }

  const authModal = page.getByTestId('auth-modal')
  if (!(await authModal.isVisible({ timeout: 2000 }).catch(() => false))) {
    await signUpBtn.evaluate((el: HTMLElement) => {
      el.click()
    })
  }
  await authModal.waitFor({ state: 'visible', timeout: 15000 })
}
