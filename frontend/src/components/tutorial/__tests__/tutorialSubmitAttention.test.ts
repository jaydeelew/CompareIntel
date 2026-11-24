import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  TUTORIAL_SUBMIT_ATTENTION_CLASS,
  syncTutorialSubmitAttention,
} from '../tutorialSubmitAttention'

describe('tutorial submit attention', () => {
  it('toggles the class without removing it when already active', () => {
    document.body.innerHTML =
      '<button data-testid="comparison-submit-button" class="submit-button" type="button"></button>'
    const button = document.querySelector('button') as HTMLButtonElement
    syncTutorialSubmitAttention(true)
    expect(button.classList.contains(TUTORIAL_SUBMIT_ATTENTION_CLASS)).toBe(true)
    syncTutorialSubmitAttention(true)
    expect(button.classList.contains(TUTORIAL_SUBMIT_ATTENTION_CLASS)).toBe(true)
    syncTutorialSubmitAttention(false)
    expect(button.classList.contains(TUTORIAL_SUBMIT_ATTENTION_CLASS)).toBe(false)
    document.body.innerHTML = ''
  })

  it('pulses with box-shadow only and holds a static ring when motion is reduced', () => {
    const css = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../MobileTutorialOverlay.css'),
      'utf8'
    )
    const rule = css.slice(css.indexOf('.submit-button.tutorial-submit-attention'))
    expect(rule).toMatch(/animation:\s*tutorial-submit-attention 1\.75s ease-out infinite/)
    expect(rule).toMatch(/@keyframes tutorial-submit-attention/)
    expect(rule).not.toMatch(/@keyframes tutorial-submit-attention[\s\S]*transform:/)
    expect(rule).toMatch(/prefers-reduced-motion:\s*reduce/)
    expect(rule).toMatch(/animation:\s*none !important/)
  })
})
