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

  it('keeps a focused prompt editable when the composer ring is missing', () => {
    const w = window as Window & { __TUTORIAL_CURRENT_STEP__?: string }
    w.__TUTORIAL_CURRENT_STEP__ = 'enter-prompt'
    const composer = document.createElement('div')
    composer.className = 'composer'
    const textarea = document.createElement('textarea')
    textarea.setAttribute('data-testid', 'comparison-input-textarea')
    const toolbar = document.createElement('div')
    toolbar.className = 'composer-toolbar'
    const file = document.createElement('button')
    file.className = 'file-upload-button'
    toolbar.append(file)
    composer.append(textarea, toolbar)
    composer.getBoundingClientRect = () => rect(180, 8, 360, 140)
    document.body.append(composer)
    textarea.focus()

    const stop = syncTutorialInteractionLock()
    expect(textarea.closest('[inert]')).toBeNull()
    expect(file.inert).toBe(true)
    stop()
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

  it('locks dropdown items on the history and save steps and restores them', async () => {
    const w = window as Window & { __TUTORIAL_CURRENT_STEP__?: string }
    w.__TUTORIAL_CURRENT_STEP__ = 'history-dropdown'
    const composer = document.createElement('div')
    composer.className = 'composer tutorial-highlight'
    const historyToggle = document.createElement('button')
    historyToggle.className = 'history-toggle-button'
    const saveToggle = document.createElement('button')
    saveToggle.className = 'saved-selections-button'
    const history = document.createElement('div')
    history.className = 'history-inline-list'
    const historyItem = document.createElement('div')
    historyItem.className = 'history-item'
    const historySave = document.createElement('input')
    historySave.type = 'checkbox'
    historyItem.append(historySave)
    history.append(historyItem)
    const saved = document.createElement('div')
    saved.className = 'saved-selections-dropdown'
    const savedInfo = document.createElement('button')
    savedInfo.className = 'saved-selections-header-info'
    const savedItem = document.createElement('div')
    savedItem.className = 'saved-selection-item'
    saved.append(savedInfo, savedItem)
    composer.append(historyToggle, saveToggle, history, saved)

    const help = document.createElement('div')
    help.className = 'help-me-choose'
    const helpWrap = document.createElement('div')
    helpWrap.className = 'help-me-choose-toggle-wrap'
    const helpToggle = document.createElement('button')
    helpToggle.className = 'help-me-choose-toggle'
    helpWrap.append(helpToggle)
    const helpContent = document.createElement('div')
    helpContent.className = 'help-me-choose-content'
    const preset = document.createElement('button')
    preset.className = 'help-me-choose-preset-btn'
    const entry = document.createElement('label')
    entry.className = 'help-me-choose-model-entry'
    const entryBox = document.createElement('input')
    entryBox.type = 'checkbox'
    entry.append(entryBox)
    helpContent.append(preset, entry)
    help.append(helpWrap, helpContent)

    const advanced = document.createElement('div')
    advanced.className = 'advanced-settings'
    const advancedToggle = document.createElement('button')
    advancedToggle.className = 'advanced-settings-toggle'
    const advancedContent = document.createElement('div')
    advancedContent.className = 'advanced-settings-content'
    const slider = document.createElement('input')
    slider.type = 'range'
    slider.id = 'temperature-slider'
    slider.value = '1'
    advancedContent.append(slider)
    advanced.append(advancedToggle, advancedContent)

    const provider = document.createElement('div')
    provider.className = 'provider-dropdown'
    const providerHeader = document.createElement('button')
    providerHeader.className = 'provider-header'
    const model = document.createElement('label')
    model.className = 'model-option'
    const modelBox = document.createElement('input')
    modelBox.type = 'checkbox'
    model.append(modelBox)
    provider.append(providerHeader, model)

    const search = document.createElement('div')
    search.className = 'model-search'
    const searchInput = document.createElement('input')
    searchInput.className = 'model-search-input'
    const suggestions = document.createElement('ul')
    suggestions.className = 'model-search-suggestions'
    const suggestion = document.createElement('button')
    suggestion.className = 'model-search-suggestion'
    suggestion.setAttribute('role', 'option')
    suggestions.append(suggestion)
    search.append(searchInput, suggestions)

    const close = document.createElement('button')
    close.className = 'tutorial-close-button'
    document.body.append(composer, help, advanced, provider, search, close)

    let historyClicks = 0
    let toggleClicks = 0
    let closeClicks = 0
    let presetClicks = 0
    let sliderChanges = 0
    let advancedClicks = 0
    let savedClicks = 0
    historyItem.addEventListener('click', () => {
      historyClicks += 1
    })
    savedItem.addEventListener('click', () => {
      savedClicks += 1
    })
    historyToggle.addEventListener('click', () => {
      toggleClicks += 1
    })
    close.addEventListener('click', () => {
      closeClicks += 1
    })
    preset.addEventListener('click', () => {
      presetClicks += 1
    })
    advancedToggle.addEventListener('click', () => {
      advancedClicks += 1
    })
    slider.addEventListener('change', () => {
      sliderChanges += 1
    })

    const stop = syncTutorialInteractionLock()
    expect(history.getAttribute('data-tutorial-dropdown-host')).toBe('')
    expect(saved.getAttribute('data-tutorial-dropdown-host')).toBe('')
    expect(helpWrap.getAttribute('data-tutorial-dropdown-host')).toBe('')
    expect(helpContent.getAttribute('data-tutorial-dropdown-host')).toBe('')
    expect(advancedToggle.getAttribute('data-tutorial-dropdown-host')).toBe('')
    expect(advancedContent.getAttribute('data-tutorial-dropdown-host')).toBe('')
    expect(provider.getAttribute('data-tutorial-dropdown-host')).toBe('')
    expect(search.getAttribute('data-tutorial-dropdown-host')).toBe('')
    expect(suggestions.getAttribute('data-tutorial-dropdown-host')).toBe('')

    for (const locked of [
      historyItem,
      savedInfo,
      savedItem,
      helpToggle,
      preset,
      entry,
      advancedToggle,
      slider,
      providerHeader,
      model,
      searchInput,
      suggestion,
    ]) {
      expect(locked.getAttribute('data-tutorial-dropdown-locked')).toBe('')
      expect(locked.getAttribute('aria-disabled')).toBe('true')
    }
    expect(historyItem.hasAttribute('inert')).toBe(true)
    expect(helpToggle.hasAttribute('inert')).toBe(true)
    expect(providerHeader.hasAttribute('inert')).toBe(true)
    expect(suggestion.hasAttribute('inert')).toBe(true)
    expect(modelBox.closest('[inert]')).toBe(model)
    // The step targets and the tutorial close control stay live.
    expect(historyToggle.hasAttribute('data-tutorial-dropdown-locked')).toBe(false)
    expect(historyToggle.hasAttribute('inert')).toBe(false)
    expect(saveToggle.hasAttribute('data-tutorial-dropdown-locked')).toBe(false)
    expect(close.hasAttribute('data-tutorial-dropdown-locked')).toBe(false)
    // A host that is itself the toggle stays hittable so the click can be dropped.
    expect(advancedToggle.hasAttribute('inert')).toBe(false)

    const click = (el: HTMLElement) =>
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    click(historyItem)
    click(preset)
    click(advancedToggle)
    click(historyToggle)
    click(close)
    slider.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }))
    searchInput.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    )
    suggestion.dispatchEvent(
      new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
    )
    expect(historyClicks).toBe(0)
    expect(presetClicks).toBe(0)
    expect(advancedClicks).toBe(0)
    expect(sliderChanges).toBe(0)
    expect(toggleClicks).toBe(1)
    expect(closeClicks).toBe(1)

    w.__TUTORIAL_CURRENT_STEP__ = 'save-selection'
    document.body.append(document.createElement('i'))
    await new Promise(resolve => setTimeout(resolve, 80))
    expect(savedItem.getAttribute('data-tutorial-dropdown-locked')).toBe('')
    expect(historyToggle.hasAttribute('data-tutorial-dropdown-locked')).toBe(false)
    click(savedItem)
    expect(savedClicks).toBe(0)

    w.__TUTORIAL_CURRENT_STEP__ = 'enter-prompt'
    document.body.append(document.createElement('span'))
    await new Promise(resolve => setTimeout(resolve, 80))
    expect(historyItem.hasAttribute('data-tutorial-dropdown-locked')).toBe(false)
    expect(historyItem.hasAttribute('inert')).toBe(false)
    expect(model.hasAttribute('data-tutorial-dropdown-locked')).toBe(false)
    expect(history.hasAttribute('data-tutorial-dropdown-host')).toBe(false)
    click(historyItem)
    expect(historyClicks).toBe(1)
    // Ending or skipping the tutorial runs this cleanup.
    stop()
    expect(document.querySelector('[data-tutorial-dropdown-locked]')).toBeNull()
    expect(document.querySelector('[data-tutorial-dropdown-host]')).toBeNull()
    click(preset)
    expect(presetClicks).toBe(1)
  })
})
