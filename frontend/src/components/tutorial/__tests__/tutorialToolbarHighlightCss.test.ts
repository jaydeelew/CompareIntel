import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const tutorialDir = join(here, '..')

describe('tutorial toolbar highlight CSS (steps 7–8)', () => {
  it('reveals overflow on saved-selections container when the bookmark button is highlighted', () => {
    const mobileCss = readFileSync(join(tutorialDir, 'MobileTutorialOverlay.css'), 'utf8')
    const desktopCss = readFileSync(join(tutorialDir, 'TutorialOverlay.css'), 'utf8')

    expect(mobileCss).toMatch(
      /\.saved-selections-container:has\(\.saved-selections-button\.mobile-tutorial-highlight\)/
    )
    expect(mobileCss).toMatch(/overflow:\s*visible/)
    expect(desktopCss).toMatch(
      /\.saved-selections-container:has\(\.saved-selections-button\.tutorial-highlight\)/
    )
    expect(desktopCss).toMatch(/overflow:\s*visible/)
  })

  it('styles history and saved-selections toolbar buttons with the same highlight rules', () => {
    const mobileCss = readFileSync(join(tutorialDir, 'MobileTutorialOverlay.css'), 'utf8')
    const desktopCss = readFileSync(join(tutorialDir, 'TutorialOverlay.css'), 'utf8')

    const desktopRule = desktopCss.match(
      /\.history-toggle-button\.tutorial-highlight,\s*\n\.saved-selections-button\.tutorial-highlight\s*\{[^}]*\}/
    )?.[0]
    expect(desktopRule).toBeTruthy()
    expect(desktopRule).toMatch(/0 0 0 3px var\(--accent-color\)/)
    expect(desktopRule).toMatch(/animation:\s*mobile-tutorial-pulse/)
    expect(desktopRule).not.toMatch(/animation:\s*none/)
    expect(mobileCss).not.toMatch(
      /\.saved-selections-button\.mobile-tutorial-highlight\s*\{[^}]*box-shadow[^}]*\}/
    )
  })

  it('does not give the page footer its own veil, fill, or fixed position', () => {
    const mobileCss = readFileSync(join(tutorialDir, 'MobileTutorialOverlay.css'), 'utf8')
    expect(mobileCss).not.toMatch(/footer::after/)
    expect(mobileCss).not.toMatch(/footer\s*\{[^}]*position:\s*(relative|fixed|sticky)/)
    expect(mobileCss).not.toMatch(/footer\s*\{[^}]*background/)
    expect(mobileCss).not.toMatch(/#0f172a/)
    expect(mobileCss).toMatch(/body:has\(#tutorial-portal-root\) \.app/)
    expect(mobileCss).toMatch(/overflow:\s*visible/)
  })
})
