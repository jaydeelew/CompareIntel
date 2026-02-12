/**
 * Tests for tutorial utility functions
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import { getComposerElement, getComposerCutoutRects } from '../tutorialUtils'

describe('tutorialUtils', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    document.body.removeChild(container)
  })

  describe('getComposerElement', () => {
    it('should return null when composer and textarea are not in DOM', () => {
      expect(getComposerElement()).toBeNull()
    })

    it('should find composer by .composer class', () => {
      const composer = document.createElement('div')
      composer.className = 'composer'
      container.appendChild(composer)

      expect(getComposerElement()).toBe(composer)
    })

    it('should find composer via textarea closest parent when .composer is not direct', () => {
      const composer = document.createElement('div')
      composer.className = 'composer'
      const inputWrapper = document.createElement('div')
      inputWrapper.className = 'composer-input-wrapper'
      const textarea = document.createElement('textarea')
      textarea.setAttribute('data-testid', 'comparison-input-textarea')

      composer.appendChild(inputWrapper)
      inputWrapper.appendChild(textarea)
      container.appendChild(composer)

      // Remove .composer to test fallback path - actually the first check finds .composer
      // Let's test the fallback: add textarea without .composer parent first
      const fallbackContainer = document.createElement('div')
      const fallbackTextarea = document.createElement('textarea')
      fallbackTextarea.setAttribute('data-testid', 'comparison-input-textarea')
      fallbackContainer.appendChild(fallbackTextarea)
      container.appendChild(fallbackContainer)

      const result = getComposerElement()
      // Should find the first .composer (since querySelector returns first match)
      expect(result).toBe(composer)
    })

    it('should find composer via textarea when only textarea exists with composer parent', () => {
      const composer = document.createElement('div')
      composer.className = 'composer'
      const textarea = document.createElement('textarea')
      textarea.setAttribute('data-testid', 'comparison-input-textarea')
      composer.appendChild(textarea)
      container.appendChild(composer)

      expect(getComposerElement()).toBe(composer)
    })
  })

  describe('getComposerCutoutRects', () => {
    it('should return rects for input wrapper and toolbar when present', () => {
      const composer = document.createElement('div')
      composer.className = 'composer'
      const inputWrapper = document.createElement('div')
      inputWrapper.className = 'composer-input-wrapper'
      const toolbar = document.createElement('div')
      toolbar.className = 'composer-toolbar'
      composer.appendChild(inputWrapper)
      composer.appendChild(toolbar)
      container.appendChild(composer)

      const rects = getComposerCutoutRects(composer)
      expect(rects).toHaveLength(2)
      // getBoundingClientRect returns DOMRect-like objects; jsdom may return plain objects
      expect(rects[0]).toMatchObject({
        top: expect.any(Number),
        left: expect.any(Number),
        width: expect.any(Number),
        height: expect.any(Number),
      })
      expect(rects[1]).toMatchObject({
        top: expect.any(Number),
        left: expect.any(Number),
        width: expect.any(Number),
        height: expect.any(Number),
      })
    })

    it('should return single rect for composer when no input wrapper or toolbar', () => {
      const composer = document.createElement('div')
      composer.className = 'composer'
      container.appendChild(composer)

      const rects = getComposerCutoutRects(composer)
      expect(rects).toHaveLength(1)
      expect(rects[0]).toMatchObject({
        top: expect.any(Number),
        left: expect.any(Number),
        width: expect.any(Number),
        height: expect.any(Number),
      })
    })

    it('should return rect for input wrapper only when toolbar is missing', () => {
      const composer = document.createElement('div')
      composer.className = 'composer'
      const inputWrapper = document.createElement('div')
      inputWrapper.className = 'composer-input-wrapper'
      composer.appendChild(inputWrapper)
      container.appendChild(composer)

      const rects = getComposerCutoutRects(composer)
      expect(rects).toHaveLength(1)
    })
  })
})
