import { test, expect, type Page } from '@playwright/test'

/**
 * Welcome modal behaviour on the prerendered production build.
 *
 * Regression for #68: the prerender snapshot captured the modal's portal (a direct child of
 * <body>, outside #root). createRoot() never adopts that markup, so it stayed on screen with
 * no event listeners underneath the live modal, and "Skip for Now" appeared to do nothing.
 */

const mockModel = (id: string, name: string, provider: string) => ({
  id,
  name,
  description: `${name} test model`,
  category: provider.toLowerCase(),
  provider,
  available: true,
  tier_access: 'unregistered',
})

const MOCK_MODELS = {
  Google: [
    mockModel('google/gemini-test-a', 'Gemini Test A', 'Google'),
    mockModel('google/gemini-test-b', 'Gemini Test B', 'Google'),
  ],
  OpenAI: [mockModel('openai/gpt-test', 'GPT Test', 'OpenAI')],
}

const MOCK_MODELS_RESPONSE = {
  models: Object.values(MOCK_MODELS).flat(),
  models_by_provider: MOCK_MODELS,
}

const backdrop = (page: Page) => page.locator('.tutorial-welcome-backdrop')

async function openHomeAndWaitForLiveModal(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Skip for Now' }).last()).toBeVisible()
  // Let the app settle so a stale prerendered copy (if any) would sit alongside the live one.
  await page.waitForLoadState('networkidle')
}

test.describe('Welcome modal (prerendered build)', () => {
  test('served HTML for / does not contain a prerendered welcome modal', async ({ request }) => {
    const html = await (await request.get('/')).text()
    expect(html).toContain('id="root"')
    expect(html).not.toContain('tutorial-welcome-backdrop')
  })

  test('stale cached HTML with a prerendered modal still lets "Skip for Now" close it', async ({
    page,
  }) => {
    // Simulates index.html built before the prerender fix and served from a cache.
    await page.route(
      url => url.pathname === '/',
      async route => {
        const response = await route.fetch()
        const staleModal =
          '<div class="tutorial-welcome-backdrop"><div class="tutorial-welcome-modal">' +
          '<h2 class="tutorial-welcome-title">Welcome to CompareIntel!</h2>' +
          '<button class="tutorial-welcome-button tutorial-welcome-button-secondary">Skip for Now</button>' +
          '</div></div>'
        const body = (await response.text()).replace('</body>', `${staleModal}</body>`)
        await route.fulfill({ response, body })
      }
    )

    await openHomeAndWaitForLiveModal(page)
    await expect(backdrop(page)).toHaveCount(1)

    await page.getByRole('button', { name: 'Skip for Now' }).click()
    await expect(backdrop(page)).toHaveCount(0)
  })

  test('only one welcome modal is rendered', async ({ page }) => {
    await openHomeAndWaitForLiveModal(page)
    await expect(backdrop(page)).toHaveCount(1)
  })

  test('"Skip for Now" closes the modal and it stays closed', async ({ page }) => {
    await openHomeAndWaitForLiveModal(page)

    await page.getByRole('button', { name: 'Skip for Now' }).click()

    await expect(backdrop(page)).toHaveCount(0)
    await expect(page.getByText('Welcome to CompareIntel!')).toBeHidden()

    // Interactions that re-render the page must not bring it back.
    await page.mouse.wheel(0, 400)
    await page.setViewportSize({ width: 1100, height: 800 })
    await page.waitForTimeout(3000)
    await expect(backdrop(page)).toHaveCount(0)

    // Same session (sessionStorage survives reload): still hidden.
    await page.reload()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1500)
    await expect(backdrop(page)).toHaveCount(0)
  })

  test('"Skip for Now" without "Don\'t show again" shows the modal again next session', async ({
    browser,
  }) => {
    const first = await browser.newContext()
    const page = await first.newPage()
    await openHomeAndWaitForLiveModal(page)
    await page.getByRole('button', { name: 'Skip for Now' }).click()
    await expect(backdrop(page)).toHaveCount(0)
    const storage = await first.storageState()
    await first.close()

    // New tab/session with the same localStorage but fresh sessionStorage.
    const second = await browser.newContext({ storageState: storage })
    const page2 = await second.newPage()
    await openHomeAndWaitForLiveModal(page2)
    await expect(backdrop(page2)).toHaveCount(1)
    await second.close()
  })

  test('"Don\'t show again" + "Skip for Now" keeps the modal hidden on later visits', async ({
    browser,
  }) => {
    const first = await browser.newContext()
    const page = await first.newPage()
    await openHomeAndWaitForLiveModal(page)
    await page.getByRole('checkbox', { name: "Don't show again" }).check()
    await page.getByRole('button', { name: 'Skip for Now' }).click()
    await expect(backdrop(page)).toHaveCount(0)
    const storage = await first.storageState()
    await first.close()

    const second = await browser.newContext({ storageState: storage })
    const page2 = await second.newPage()
    await page2.goto('/')
    await page2.waitForLoadState('networkidle')
    await page2.waitForTimeout(2000)
    await expect(backdrop(page2)).toHaveCount(0)
    await second.close()
  })

  test('"Start Tutorial" closes the modal and starts the tutorial', async ({ page }) => {
    // The first tutorial step points at the Google provider, so it needs a model list.
    await page.route('**/api/models', route => route.fulfill({ json: MOCK_MODELS_RESPONSE }))
    await openHomeAndWaitForLiveModal(page)

    await page.getByRole('button', { name: 'Start Tutorial' }).click()

    await expect(backdrop(page)).toHaveCount(0)
    await expect(page.locator('.tutorial-tooltip, .mobile-tutorial-tooltip').first()).toBeVisible()
  })
})
