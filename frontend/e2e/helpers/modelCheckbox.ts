import type { Locator } from '@playwright/test'

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
