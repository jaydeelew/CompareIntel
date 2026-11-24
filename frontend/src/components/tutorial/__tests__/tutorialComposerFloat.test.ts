import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

describe('tutorial composer entrance', () => {
  it('keeps composer-float-in off while the tutorial is placing the composer', () => {
    const css = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../MobileTutorialOverlay.css'),
      'utf8'
    )
    const rule = css.slice(
      css.indexOf('html[data-onboarding-tutorial-active] .composer.composer-floating')
    )
    expect(
      rule.startsWith('html[data-onboarding-tutorial-active] .composer.composer-floating')
    ).toBe(true)
    expect(rule.slice(0, 500)).toMatch(/animation:\s*none !important/)
    expect(rule.slice(0, 500)).not.toMatch(/composer-float-in/)
  })
})
