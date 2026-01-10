/* eslint-disable react-hooks/rules-of-hooks */
// This file uses Playwright's fixture pattern with 'use' parameter,
// which is not related to React hooks. Disabling react-hooks rule for entire file.

/**
 * Global test setup - runs before each test
 * Injects script to mark Playwright test environment (disables reCAPTCHA)
 */

import { test as base } from '@playwright/test'

// Extend the base test to inject test environment flags
export const test = base.extend({
  page: async ({ page, context }, use) => {
    // Inject script to mark this as a test environment (disables reCAPTCHA)
    // This runs for every test, ensuring reCAPTCHA is disabled
    await context.addInitScript(() => {
      window.__TEST_ENV__ = true
      window.__PLAYWRIGHT__ = true
      window.__PW_INTERNAL__ = true
    })
    await use(page)
  },
})

// Re-export everything else from Playwright
export { expect } from '@playwright/test'
