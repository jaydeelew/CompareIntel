import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const tutorialDir = join(here, '..')

function modelRowRule(css: string, highlightClass: string): string {
  const match = css.match(
    new RegExp(
      `\\.model-option\\.${highlightClass},[\\s\\S]*?\\.model-option\\.selected\\.${highlightClass}:hover\\s*\\{[^}]*\\}`
    )
  )
  return match?.[0] ?? ''
}

describe('tutorial model-row highlight CSS', () => {
  it('gives model rows the same single frame as provider cards on desktop and mobile', () => {
    const desktop = readFileSync(join(tutorialDir, 'TutorialOverlay.css'), 'utf8')
    const mobile = readFileSync(join(tutorialDir, 'MobileTutorialOverlay.css'), 'utf8')
    const desktopProvider = desktop.match(
      /\.provider-dropdown\.tutorial-highlight\s*\{[^}]*\}/
    )?.[0]
    const mobileProvider = mobile.match(
      /\.provider-dropdown\.mobile-tutorial-highlight\s*\{[^}]*\}/
    )?.[0]
    const desktopRow = modelRowRule(desktop, 'tutorial-highlight')
    const mobileRow = modelRowRule(mobile, 'mobile-tutorial-highlight')

    for (const rule of [desktopProvider, mobileProvider, desktopRow, mobileRow]) {
      expect(rule).toBeTruthy()
      expect(rule).toContain('border-color: var(--accent-color)')
      expect(rule).toContain('0 0 20px rgba(6, 182, 212, 0.08)')
      expect(rule).toContain('animation: none')
      expect(rule).not.toContain('0 0 0 3px')
    }

    expect(desktopRow).toContain('border-radius: var(--radius-lg)')
    expect(mobileRow).toContain('border-radius: var(--radius-lg)')
    expect(desktopProvider).toContain('border-radius: var(--radius-xl)')
    expect(mobileProvider).toContain('border-radius: var(--radius-xl)')
  })
})
