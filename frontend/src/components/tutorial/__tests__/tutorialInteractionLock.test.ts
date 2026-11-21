import { afterEach, describe, expect, it } from 'vitest'

import { syncTutorialInteractionLock } from '../tutorialInteractionLock'

function rect(top: number, left: number, width: number, height: number): DOMRect {
  return {
    top,
    left,
    right: left + width,
    bottom: top + height,
    width,
    height,
    x: left,
    y: top,
    toJSON() {
      return {}
    },
  } as DOMRect
}

describe('tutorial interaction lock', () => {
  afterEach(() => {
    document.getElementById('tutorial-interaction-shield')?.remove()
    document.body.replaceChildren()
  })

  it('blocks controls outside the highlight and restores them', async () => {
    const app = document.createElement('div')
    app.className = 'app'
    const about = document.createElement('a')
    about.href = '/about'
    about.textContent = 'About'
    const provider = document.createElement('button')
    provider.className = 'provider tutorial-highlight'
    provider.textContent = 'Anthropic'
    provider.getBoundingClientRect = () => rect(80, 16, 300, 64)
    app.append(about, provider)
    const portal = document.createElement('div')
    portal.id = 'tutorial-portal-root'
    const close = document.createElement('button')
    close.className = 'tutorial-close-button'
    close.textContent = 'Close'
    portal.append(close)
    document.body.append(app, portal)

    const stop = syncTutorialInteractionLock()
    expect(about.closest('[inert]')).toBe(about)
    expect(provider.closest('[inert]')).toBeNull()
    expect(close.closest('[inert]')).toBeNull()
    const shield = document.getElementById('tutorial-interaction-shield')
    expect(shield?.querySelector('path')?.getAttribute('fill-rule')).toBe('evenodd')
    expect(shield?.querySelector('path')?.getAttribute('d')).toContain('M')

    const extra = document.createElement('button')
    extra.textContent = 'Save'
    app.append(extra)
    await new Promise(r => setTimeout(r, 60))
    expect(extra.closest('[inert]')).toBe(extra)
    expect(provider.closest('[inert]')).toBeNull()

    stop()
    expect(about.inert).toBe(false)
    expect(extra.inert).toBe(false)
    expect(document.getElementById('tutorial-interaction-shield')).toBeNull()
  })
})
