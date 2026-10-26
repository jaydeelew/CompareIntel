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
  // Reasoning models stream much slower; only use them if nothing else is available.
  candidates.sort((a, b) => Number(a.thinking) - Number(b.thinking))
  expect(
    candidates.length,
    `${catalog.user_tier} tier has fewer than ${count} selectable text models`
  ).toBeGreaterThanOrEqual(count)

  const selected: string[] = []
  for (const { provider, id } of candidates.slice(0, count)) {
    const dropdown = page.locator(`.provider-dropdown[data-provider-name="${provider}"]`)
    const header = dropdown.locator('.provider-header')
    if ((await header.getAttribute('aria-expanded')) !== 'true') {
      await header.scrollIntoViewIfNeeded().catch(() => {})
      await header.click({ timeout: 10000 })
      await expect(header).toHaveAttribute('aria-expanded', 'true')
    }
    const checkbox = page.getByTestId(`model-checkbox-${id}`)
    await expect(checkbox).toBeEnabled({ timeout: 10000 })
    await toggleModelCheckbox(checkbox, projectName)
    await expect(checkbox).toBeChecked()
    selected.push(id)
  }
  return selected
}
