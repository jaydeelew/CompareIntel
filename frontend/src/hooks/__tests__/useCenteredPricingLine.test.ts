import { renderHook } from '@testing-library/react'
import { type RefObject } from 'react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import { useCenteredPricingLine } from '../useCenteredPricingLine'

describe('useCenteredPricingLine', () => {
  let mockElement: HTMLDivElement
  let mockHeroSection: HTMLDivElement
  let mockContainer: HTMLDivElement
  let mockCredits: HTMLDivElement

  beforeEach(() => {
    mockElement = document.createElement('div')
    mockHeroSection = document.createElement('div')
    mockContainer = document.createElement('div')
    mockCredits = document.createElement('div')

    mockHeroSection.className = 'hero-section'
    mockCredits.className = 'credits-remaining-wrapper'
    mockContainer.appendChild(mockCredits)
    mockContainer.appendChild(mockElement)
    mockHeroSection.appendChild(mockContainer)
    document.body.appendChild(mockHeroSection)

    // Mock getBoundingClientRect
    vi.spyOn(mockElement, 'getBoundingClientRect').mockReturnValue({
      top: 100,
      bottom: 120,
      left: 0,
      right: 100,
      width: 100,
      height: 20,
      x: 0,
      y: 100,
      toJSON: () => {},
    })
    vi.spyOn(mockHeroSection, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      bottom: 500,
      left: 0,
      right: 100,
      width: 100,
      height: 500,
      x: 0,
      y: 0,
      toJSON: () => {},
    })
    vi.spyOn(mockContainer, 'getBoundingClientRect').mockReturnValue({
      top: 50,
      bottom: 400,
      left: 0,
      right: 100,
      width: 100,
      height: 350,
      x: 0,
      y: 50,
      toJSON: () => {},
    })
    vi.spyOn(mockCredits, 'getBoundingClientRect').mockReturnValue({
      top: 80,
      bottom: 100,
      left: 0,
      right: 100,
      width: 100,
      height: 20,
      x: 0,
      y: 80,
      toJSON: () => {},
    })

    // Mock offsetParent
    Object.defineProperty(mockElement, 'offsetParent', {
      get: () => mockContainer,
      configurable: true,
    })

    // Mock closest
    mockElement.closest = vi.fn((selector: string) => {
      if (selector === '.hero-section') return mockHeroSection
      return null
    })
  })

  afterEach(() => {
    document.body.removeChild(mockHeroSection)
    vi.restoreAllMocks()
  })

  it('should set top position when enabled', () => {
    const ref: RefObject<HTMLDivElement> = { current: mockElement }

    renderHook(() => useCenteredPricingLine(ref, true))

    // Allow requestAnimationFrame to execute
    return new Promise<void>(resolve => {
      setTimeout(() => {
        expect(mockElement.style.top).toBeTruthy()
        expect(mockElement.style.bottom).toBe('auto')
        resolve()
      }, 50)
    })
  })

  it('should not position when disabled', () => {
    const ref: RefObject<HTMLDivElement> = { current: mockElement }

    renderHook(() => useCenteredPricingLine(ref, false))

    return new Promise<void>(resolve => {
      setTimeout(() => {
        expect(mockElement.style.top).toBe('')
        resolve()
      }, 50)
    })
  })

  it('should not position when element is null', () => {
    const ref: RefObject<HTMLDivElement> = { current: null }

    expect(() => {
      renderHook(() => useCenteredPricingLine(ref, true))
    }).not.toThrow()
  })

  it('should calculate centered position between credits and hero bottom', () => {
    const ref: RefObject<HTMLDivElement> = { current: mockElement }

    renderHook(() => useCenteredPricingLine(ref, true))

    return new Promise<void>(resolve => {
      setTimeout(() => {
        // Credits bottom: 100px
        // Hero bottom: 500px
        // Line height: 20px
        // Available space: 500 - 100 = 400px
        // Center position: 100 + (400 - 20) / 2 = 100 + 190 = 290px
        // Relative to container (top 50): 290 - 50 = 240px
        expect(mockElement.style.top).toBe('240px')
        expect(mockElement.style.bottom).toBe('auto')
        resolve()
      }, 50)
    })
  })
})
