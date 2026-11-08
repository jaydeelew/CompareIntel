import { expect, type Locator, type Page } from '@playwright/test'

/** True for Playwright mobile device projects (narrow viewport / touch). */
export function isMobileE2eProject(projectName: string): boolean {
  return (
    projectName.includes('Mobile') ||
    projectName.includes('iPhone') ||
    projectName.includes('iPad') ||
    projectName.includes('Pixel') ||
    projectName.includes('Galaxy')
  )
}

/** Firefox/WebKit/mobile: model checkbox uses onMouseDown preventDefault — click matches real users. */
function prefersCheckboxPointerClick(projectName: string): boolean {
  if (projectName === 'firefox' || projectName === 'webkit') return true
  return isMobileE2eProject(projectName)
}

/** Install banner and the "Done Selecting?" card cover headers on short mobile viewports. */
export async function dismissMobileBlockers(page: Page): Promise<void> {
  const install = page.getByRole('button', { name: 'Dismiss install prompt' })
  if (await install.isVisible().catch(() => false)) {
    await install.click({ timeout: 2000 }).catch(() => {})
  }
  const doneCard = page.getByRole('button', { name: 'Close done selecting card' })
  if (await doneCard.isVisible().catch(() => false)) {
    await doneCard.click({ timeout: 2000 }).catch(() => {})
  }
}

export async function toggleModelCheckbox(checkbox: Locator, projectName: string): Promise<void> {
  if (prefersCheckboxPointerClick(projectName)) {
    await checkbox.click({ timeout: 10000 })
  } else {
    await checkbox.check({ timeout: 10000 })
  }
}

interface CatalogModel {
  id: string
  tier_access?: string
  available?: boolean
  trial_unlocked?: boolean
  supports_image_generation?: boolean
  is_thinking_model?: boolean
}

interface ModelsResponse {
  models_by_provider: Record<string, CatalogModel[]>
  user_tier: string
}

function isSelectableForTier(model: CatalogModel, userTier: string): boolean {
  if (model.available === false) return false
  if (model.trial_unlocked) return true
  if (userTier === 'unregistered') return model.tier_access === 'unregistered'
  if (userTier === 'free') return model.tier_access !== 'paid'
  return true
}

/**
 * Selects `count` text models the current user's tier can use, expanding whichever provider
 * dropdowns hold them. The first provider alone is not enough: in the real catalog it is
 * Anthropic, which has a single non-paid model.
 */
export async function selectSelectableTextModels(
  page: Page,
  count: number,
  projectName: string
): Promise<string[]> {
  const response = await page.request.get('/api/models')
  expect(response.ok(), `/api/models returned ${response.status()}`).toBeTruthy()
  const catalog = (await response.json()) as ModelsResponse

  const candidates: Array<{ provider: string; id: string; thinking: boolean }> = []
  for (const [provider, models] of Object.entries(catalog.models_by_provider)) {
    for (const model of models) {
      if (model.supports_image_generation) continue
      if (!isSelectableForTier(model, catalog.user_tier)) continue
      candidates.push({ provider, id: model.id, thinking: model.is_thinking_model === true })
    }
  }
  // Prefer compact/cheap models so live-API suites are less likely to 402 on
  // max_tokens reservation (CI Cross-Browser jobs share one OpenRouter key).
  // Reasoning models stream much slower; only use them if nothing else is available.
  const cheapScore = (id: string): number => {
    const s = id.toLowerCase()
    if (/(mini|nano|haiku|flash|small|3\.5)/.test(s)) return 0
    if (/(27b|70b|405b|opus|sonnet)/.test(s)) return 2
    return 1
  }
  candidates.sort(
    (a, b) => cheapScore(a.id) - cheapScore(b.id) || Number(a.thinking) - Number(b.thinking)
  )
  expect(
    candidates.length,
    `${catalog.user_tier} tier has fewer than ${count} selectable text models`
  ).toBeGreaterThanOrEqual(count)

  await dismissMobileBlockers(page)

  const selected: string[] = []
  for (const { provider, id } of candidates.slice(0, count)) {
    const dropdown = page.locator(`.provider-dropdown[data-provider-name="${provider}"]`)
    const header = dropdown.locator('.provider-header')
    const checkbox = page.getByTestId(`model-checkbox-${id}`)

    // The picker re-flows right after a click (selected count, expanding dropdown, "Done
    // Selecting?" card). Playwright's actionability check passes before that, so on Firefox the
    // pointer can land on the surrounding `.provider-dropdowns` container instead of the header
    // or checkbox, which is a silent no-op. Each step is idempotent and retried as a unit so a
    // missed click is repeated, while an already-applied one is never toggled back.
    await expect(async () => {
      if ((await header.getAttribute('aria-expanded')) !== 'true') {
        // Center the header so a fixed install banner cannot intercept the click.
        await header.evaluate((el: HTMLElement) => {
          el.scrollIntoView({ block: 'center', inline: 'nearest' })
        })
        await header.click({ timeout: 5000 })
      }
      await expect(header).toHaveAttribute('aria-expanded', 'true', { timeout: 2000 })
    }, `expand ${provider} provider dropdown`).toPass({ timeout: 20000 })

    await expect(checkbox).toBeEnabled({ timeout: 10000 })
    await expect(async () => {
      if (!(await checkbox.isChecked())) {
        await toggleModelCheckbox(checkbox, projectName)
      }
      await expect(checkbox).toBeChecked({ timeout: 2000 })
    }, `select model ${id}`).toPass({ timeout: 20000 })
    selected.push(id)
  }
  return selected
}
