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
    delete (window as Window & { __TUTORIAL_CURRENT_STEP__?: string }).__TUTORIAL_CURRENT_STEP__
    document.documentElement.removeAttribute('data-tutorial-step')
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

  it('keeps the prompt field live when the highlight is the submit button', () => {
    const app = document.createElement('div')
    app.className = 'app'
    const nav = document.createElement('a')
    nav.href = '/about'
    nav.textContent = 'About'
    const composer = document.createElement('div')
    composer.className = 'composer'
    const textarea = document.createElement('textarea')
    const submit = document.createElement('button')
    submit.className = 'tutorial-highlight'
    submit.textContent = 'Submit'
    submit.getBoundingClientRect = () => rect(200, 16, 48, 48)
    composer.append(textarea, submit)
    app.append(nav, composer)
    document.body.append(app)

    const stop = syncTutorialInteractionLock()
    expect(nav.closest('[inert]')).toBe(nav)
    expect(composer.closest('[inert]')).toBeNull()
    expect(textarea.closest('[inert]')).toBeNull()
    expect(submit.closest('[inert]')).toBeNull()
    stop()
  })

  it('cuts one hole when the submit button is inside the composer highlight', () => {
    const app = document.createElement('div')
    app.className = 'app'
    const composer = document.createElement('div')
    composer.className = 'composer mobile-tutorial-highlight'
    composer.getBoundingClientRect = () => rect(180, 8, 360, 120)
    const submit = document.createElement('button')
    submit.className = 'submit-button mobile-tutorial-highlight'
    submit.getBoundingClientRect = () => rect(240, 300, 48, 48)
    composer.append(submit)
    app.append(composer)
    document.body.append(app)

    const stop = syncTutorialInteractionLock()
    const d = document
      .getElementById('tutorial-interaction-shield')
      ?.querySelector('path')
      ?.getAttribute('d')
    const holes = d?.match(/M/g)?.length ?? 0
    expect(holes).toBe(2)
    stop()
  })

  it('merges a history list that only overlaps the composer hole', () => {
    const app = document.createElement('div')
    app.className = 'app'
    const composer = document.createElement('div')
    composer.className = 'composer tutorial-highlight'
    composer.getBoundingClientRect = () => rect(200, 16, 320, 80)
    const list = document.createElement('div')
    list.className = 'history-inline-list tutorial-highlight'
    list.getBoundingClientRect = () => rect(270, 16, 320, 160)
    composer.append(list)
    app.append(composer)
    document.body.append(app)

    const stop = syncTutorialInteractionLock()
    const d = document
      .getElementById('tutorial-interaction-shield')
      ?.querySelector('path')
      ?.getAttribute('d')
    expect(d?.match(/M/g)?.length ?? 0).toBe(2)
    stop()
  })

  it('keeps the portaled composer live while results are highlighted', () => {
    const app = document.createElement('div')
    app.className = 'app'
    const results = document.createElement('section')
    results.className = 'results-section tutorial-highlight'
    results.getBoundingClientRect = () => rect(80, 16, 300, 200)
    const slot = document.createElement('div')
    slot.setAttribute('data-after-results-composer-slot', '')
    const composer = document.createElement('div')
    composer.className = 'composer'
    const textarea = document.createElement('textarea')
    composer.append(textarea)
    slot.append(composer)
    const portal = document.createElement('div')
    portal.id = 'tutorial-portal-root'
    portal.textContent = 'Continue the Conversation'
    app.append(results, slot)
    document.body.append(app, portal)

    const stop = syncTutorialInteractionLock()
    expect(textarea.closest('[inert]')).toBeNull()
    stop()
  })

  it('locks composer toolbar buttons the current step does not use', async () => {
    const w = window as Window & { __TUTORIAL_CURRENT_STEP__?: string }
    w.__TUTORIAL_CURRENT_STEP__ = 'enter-prompt'
    const composer = document.createElement('div')
    composer.className = 'composer tutorial-highlight'
    composer.getBoundingClientRect = () => rect(180, 8, 360, 140)
    const toolbar = document.createElement('div')
    toolbar.className = 'composer-toolbar'
    const file = document.createElement('button')
    file.className = 'file-upload-button'
    file.textContent = 'Add File'
    const voice = document.createElement('button')
    voice.className = 'voice-button'
    const submit = document.createElement('button')
    submit.className = 'submit-button'
    submit.setAttribute('data-testid', 'comparison-submit-button')
    const textarea = document.createElement('textarea')
    toolbar.append(file, voice, submit)
    composer.append(textarea, toolbar)
    document.body.append(composer)

    const stop = syncTutorialInteractionLock()
    expect(file.inert).toBe(true)
    expect(voice.inert).toBe(true)
    expect(submit.inert).toBe(true)
    expect(file.getAttribute('data-tutorial-toolbar-locked')).toBe('')
    expect(textarea.closest('[inert]')).toBeNull()

    w.__TUTORIAL_CURRENT_STEP__ = 'submit-comparison'
    document.body.append(document.createElement('span'))
    await new Promise(r => setTimeout(r, 80))
    expect(submit.inert).toBe(false)
    expect(file.inert).toBe(true)
    stop()
    expect(file.inert).toBe(false)
    expect(submit.inert).toBe(false)
  })

  it('keeps submit on the follow-up step and history on the history step', () => {
    const w = window as Window & { __TUTORIAL_CURRENT_STEP__?: string }
    w.__TUTORIAL_CURRENT_STEP__ = 'follow-up'
    const composer = document.createElement('div')
    composer.className = 'composer mobile-tutorial-highlight'
    composer.getBoundingClientRect = () => rect(200, 8, 340, 120)
    const toolbar = document.createElement('div')
    toolbar.className = 'composer-toolbar'
    const file = document.createElement('button')
    file.className = 'file-upload-button'
    const submit = document.createElement('button')
    submit.className = 'submit-button'
    const history = document.createElement('button')
    history.className = 'history-toggle-button'
    toolbar.append(history, file, submit)
    composer.append(toolbar)
    document.body.append(composer)

    const stop = syncTutorialInteractionLock()
    expect(submit.hasAttribute('inert')).toBe(false)
    expect(file.inert).toBe(true)
    expect(history.inert).toBe(true)
    stop()

    w.__TUTORIAL_CURRENT_STEP__ = 'history-dropdown'
    const stopHistory = syncTutorialInteractionLock()
    expect(history.hasAttribute('inert')).toBe(false)
    expect(file.inert).toBe(true)
    expect(submit.inert).toBe(true)
    stopHistory()
  })

  it('leaves an open modal dismissable', () => {
    const composer = document.createElement('div')
    composer.className = 'composer tutorial-highlight'
    composer.getBoundingClientRect = () => rect(400, 8, 200, 60)
    document.body.append(composer)
    const modal = document.createElement('div')
    modal.className = 'disabled-button-info-overlay'
    modal.setAttribute('role', 'dialog')
    modal.getBoundingClientRect = () => rect(40, 20, 100, 80)
    const close = document.createElement('button')
    close.textContent = 'Got it'
    modal.append(close)
    document.body.append(modal)

    const stop = syncTutorialInteractionLock()
    expect(modal.closest('[inert]')).toBeNull()
    expect(close.closest('[inert]')).toBeNull()
    const d = document
      .getElementById('tutorial-interaction-shield')
      ?.querySelector('path')
      ?.getAttribute('d')
    expect(d).toContain('M12,32')
    stop()
  })
})
