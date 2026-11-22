import { test, expect } from '@playwright/test'

/**
 * Install prompt must not cover onboarding / guided tutorial.
 * Uses base Playwright (not test-setup) so the welcome modal can appear.
 */

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

const installPrompt = (page: import('@playwright/test').Page) =>
  page.locator('.install-prompt-banner, .install-prompt-overlay')

test.describe('Install prompt during onboarding tutorial', () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      localStorage.removeItem('compareintel_tutorial_completed')
      localStorage.removeItem('compareintel_welcome_dont_show_again')
      localStorage.removeItem('pwa-install-dismissed')
    })
  })

  test('stays hidden while welcome modal is visible', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Skip for Now' })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('data-onboarding-tutorial-active', '')

    await page.evaluate(() => {
      window.dispatchEvent(new Event('scroll'))
      window.dispatchEvent(new Event('scroll'))
    })
    await expect(installPrompt(page)).toHaveCount(0)
  })

  test('stays hidden after starting guided tutorial', async ({ page }) => {
    await page.route('**/api/models', route => route.fulfill({ json: MOCK_MODELS_RESPONSE }))
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('button', { name: 'Start Tutorial' })).toBeVisible()

    await page.evaluate(() => {
      window.dispatchEvent(new Event('scroll'))
      window.dispatchEvent(new Event('scroll'))
    })

    await page.getByRole('button', { name: 'Start Tutorial' }).click()
    await expect(page.locator('.tutorial-welcome-backdrop')).toHaveCount(0)
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const html = document.documentElement
          return (
            html.hasAttribute('data-onboarding-tutorial-active') ||
            html.hasAttribute('data-tutorial-step')
          )
        })
      )
      .toBe(true)
    await expect(
      page.locator('.tutorial-tooltip, .mobile-tutorial-tooltip, .tutorial-backdrop').first()
    ).toBeVisible({ timeout: 15_000 })
    await expect(installPrompt(page)).toHaveCount(0)
  })

  test('on iOS may appear again after tutorial is skipped', async ({ page }) => {
    const isIosProject = /iPhone|iPad/i.test(test.info().project.name)
    test.skip(!isIosProject, 'iOS user agent required for engagement-only install banner')

    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Skip for Now' })).toBeVisible()
    await page.evaluate(() => {
      window.dispatchEvent(new Event('scroll'))
      window.dispatchEvent(new Event('scroll'))
    })
    await expect(installPrompt(page)).toHaveCount(0)

    await page.getByRole('button', { name: 'Skip for Now' }).click()
    await expect(page.locator('html')).not.toHaveAttribute('data-onboarding-tutorial-active', '')
    await expect(installPrompt(page)).toBeVisible({ timeout: 5_000 })
  })
})
