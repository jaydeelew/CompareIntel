import { render } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import { useTutorialCleanup } from '../useTutorialCleanup'

function TestComponent() {
  useTutorialCleanup()
  return null
}

describe('useTutorialCleanup', () => {
  let hero: HTMLDivElement

  beforeEach(() => {
    hero = document.createElement('div')
    hero.className = 'hero-section tutorial-height-locked'
    document.body.appendChild(hero)
  })

  afterEach(() => {
    hero.remove()
  })

  it('removes tutorial classes from hero on unmount', () => {
    const { unmount } = render(<TestComponent />)
    expect(hero?.classList.contains('tutorial-height-locked')).toBe(true)

    unmount()
    expect(hero?.classList.contains('tutorial-height-locked')).toBe(false)
  })
})
