/**
 * Integration tests for TutorialOverlay component
 *
 * Verifies the refactored overlay renders correctly and maintains behavior.
 * More comprehensive E2E coverage exists in e2e/02-registration-onboarding.spec.ts
 * and other e2e specs that use dismissTutorialOverlay.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { TutorialOverlay } from '../TutorialOverlay'

describe('TutorialOverlay', () => {
  const defaultProps = {
    step: null as 'expand-provider' | null,
    onComplete: vi.fn(),
    onSkip: vi.fn(),
    isStepCompleted: false,
    isLoading: false,
  }

  beforeEach(() => {
    // Ensure no leftover portal root from previous tests
    const existing = document.getElementById('tutorial-portal-root')
    if (existing) existing.remove()
  })

  it('should return null when step is null', () => {
    const { container } = render(<TutorialOverlay {...defaultProps} step={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('should render overlay when step is provided', () => {
    render(<TutorialOverlay {...defaultProps} step="expand-provider" />)

    // Overlay may render to portal - check for backdrop or tooltip classes
    // The component renders conditionally; with no target elements it may show tooltip at default position
    expect(
      document.body.querySelector(
        '.tutorial-backdrop, .tutorial-tooltip, .tutorial-backdrop-cutout'
      )
    ).toBeTruthy()
  })

  it('should call onSkip when skip button is clicked', async () => {
    const user = userEvent.setup()
    const onSkip = vi.fn()
    render(<TutorialOverlay {...defaultProps} step="expand-provider" onSkip={onSkip} />)

    // Wait for overlay to render (it uses setTimeout/effects for element finding)
    await vi.waitFor(
      () => {
        const skipButton = document.querySelector('.tutorial-close-button')
        expect(skipButton).toBeInTheDocument()
      },
      { timeout: 2000 }
    )

    const skipButton = document.querySelector('.tutorial-close-button')
    if (skipButton) {
      await user.click(skipButton as HTMLElement)
      expect(onSkip).toHaveBeenCalledTimes(1)
    }
  })

  it('should render step content for expand-provider', async () => {
    render(<TutorialOverlay {...defaultProps} step="expand-provider" />)

    await vi.waitFor(
      () => {
        expect(screen.getByText('Expand a Provider')).toBeInTheDocument()
      },
      { timeout: 3000 }
    )
  })
})
