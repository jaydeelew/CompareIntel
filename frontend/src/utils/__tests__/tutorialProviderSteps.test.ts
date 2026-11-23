import { describe, expect, it } from 'vitest'

import { getTutorialProviderStepLayout, getUnionClientRect } from '../tutorialPositioning'

function mockProviderDropdown(top: number, height: number, providerName: string): HTMLElement {
  const el = document.createElement('div')
  el.className = 'provider-dropdown'
  el.setAttribute('data-provider-name', providerName)
  el.getBoundingClientRect = () => new DOMRect(0, top, 320, height) as DOMRect
  const header = document.createElement('button')
  header.className = 'provider-header'
  el.appendChild(header)
  return el
}

describe('tutorial provider steps (step 2)', () => {
  it('select-models layout unions all tutorial provider dropdowns', () => {
    const google = mockProviderDropdown(100, 120, 'Google')
    const deepseek = mockProviderDropdown(240, 100, 'DeepSeek')
    const originalQuery = document.querySelector.bind(document)
    document.querySelector = ((selector: string) => {
      if (selector.includes('Google')) return google
      if (selector.includes('DeepSeek')) return deepseek
      return originalQuery(selector)
    }) as typeof document.querySelector

    try {
      const layout = getTutorialProviderStepLayout('select-models', ['Google', 'DeepSeek'])
      expect(layout.highlights).toHaveLength(2)
      expect(layout.layoutRect?.height).toBe(240)
      expect(layout.layoutRect?.top).toBe(100)
    } finally {
      document.querySelector = originalQuery
    }
  })

  it('frames only the tutorial model when the provider lists others', () => {
    document.documentElement.setAttribute('data-tutorial-target-models', 'openai/gpt-5.2')
    const dropdown = mockProviderDropdown(80, 400, 'OpenAI')
    const extra = document.createElement('label')
    extra.className = 'model-option'
    extra.getBoundingClientRect = () => new DOMRect(0, 100, 300, 48)
    const target = document.createElement('label')
    target.className = 'model-option'
    target.getBoundingClientRect = () => new DOMRect(0, 160, 300, 48)
    const box = document.createElement('input')
    box.id = 'model-checkbox-openai/gpt-5.2'
    target.appendChild(box)
    dropdown.appendChild(extra)
    dropdown.appendChild(target)
    document.body.appendChild(dropdown)

    try {
      const layout = getTutorialProviderStepLayout('select-starter-model-1', ['OpenAI'])
      expect(layout.highlights).toEqual([target])
      expect(layout.layoutRect?.top).toBe(160)
      expect(layout.layoutRect?.height).toBe(48)
    } finally {
      dropdown.remove()
      document.documentElement.removeAttribute('data-tutorial-target-models')
    }
  })

  it('getUnionClientRect spans multiple provider cards', () => {
    const a = mockProviderDropdown(50, 80, 'A')
    const b = mockProviderDropdown(200, 60, 'B')
    const union = getUnionClientRect([a, b])
    expect(union?.top).toBe(50)
    expect(union?.height).toBe(210)
  })
})
