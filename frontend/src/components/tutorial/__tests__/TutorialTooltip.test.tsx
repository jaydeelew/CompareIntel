/**
 * Tests for TutorialTooltip component
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'

import type { StepConfig } from '../../../data/tutorialSteps'
import { TutorialTooltip } from '../TutorialTooltip'

const mockConfig: StepConfig = {
  step: 'expand-provider',
  targetSelector: '.provider-dropdown .provider-header',
  title: 'Expand a Provider',
  description: 'Click the Google dropdown to see available AI models.',
  position: 'top',
}

describe('TutorialTooltip', () => {
  const defaultProps = {
    step: 'expand-provider' as const,
    config: mockConfig,
    stepIndex: 1,
    totalSteps: 11,
    onComplete: vi.fn(),
    onSkip: vi.fn(),
    isStepCompleted: false,
    saveSelectionDropdownOpened: false,
    isHistoryDropdownOpened: false,
    overlayRef: { current: null },
    overlayPosition: { top: 100, left: 200 },
    effectivePosition: null as 'top' | 'bottom' | null,
    positionStabilized: false,
  }

  it('should render step title and description', () => {
    render(<TutorialTooltip {...defaultProps} />)
    expect(screen.getByText('Expand a Provider')).toBeInTheDocument()
    expect(
      screen.getByText('Click the Google dropdown to see available AI models.')
    ).toBeInTheDocument()
  })

  it('should render step indicator', () => {
    render(<TutorialTooltip {...defaultProps} />)
    expect(screen.getByText('Step 1 of 11')).toBeInTheDocument()
  })

  it('should render skip button with aria-label', () => {
    render(<TutorialTooltip {...defaultProps} />)
    const skipButton = screen.getByRole('button', { name: /skip tutorial/i })
    expect(skipButton).toBeInTheDocument()
  })

  it('should call onSkip when skip button is clicked', async () => {
    const user = userEvent.setup()
    const onSkip = vi.fn()
    render(<TutorialTooltip {...defaultProps} onSkip={onSkip} />)
    await user.click(screen.getByRole('button', { name: /skip tutorial/i }))
    expect(onSkip).toHaveBeenCalledTimes(1)
  })

  it('should render Done with input button for enter-prompt step', () => {
    render(
      <TutorialTooltip
        {...defaultProps}
        step="enter-prompt"
        config={{
          ...mockConfig,
          step: 'enter-prompt',
          targetSelector: '.composer',
          title: 'Enter Your Prompt',
          description: 'Type your question or prompt in the text area below.',
          position: 'bottom',
        }}
      />
    )
    expect(screen.getByRole('button', { name: /done with input/i })).toBeInTheDocument()
  })

  it('should disable Done with input when isStepCompleted is false', () => {
    render(
      <TutorialTooltip
        {...defaultProps}
        step="enter-prompt"
        config={{
          ...mockConfig,
          step: 'enter-prompt',
          targetSelector: '.composer',
          title: 'Enter Your Prompt',
          description: 'Type your question.',
          position: 'bottom',
        }}
        isStepCompleted={false}
      />
    )
    const button = screen.getByRole('button', { name: /done with input/i })
    expect(button).toBeDisabled()
  })

  it('should enable Done with input when isStepCompleted is true', () => {
    render(
      <TutorialTooltip
        {...defaultProps}
        step="enter-prompt"
        config={{
          ...mockConfig,
          step: 'enter-prompt',
          targetSelector: '.composer',
          title: 'Enter Your Prompt',
          description: 'Type your question.',
          position: 'bottom',
        }}
        isStepCompleted={true}
      />
    )
    const button = screen.getByRole('button', { name: /done with input/i })
    expect(button).not.toBeDisabled()
  })

  it('should render Done button for view-follow-up-results step', () => {
    render(
      <TutorialTooltip
        {...defaultProps}
        step="view-follow-up-results"
        config={{
          ...mockConfig,
          step: 'view-follow-up-results',
          targetSelector: '.results-section',
          title: 'View Follow-Up Results',
          description: 'Compare the follow-up responses.',
          position: 'top',
        }}
      />
    )
    expect(screen.getByRole('button', { name: /^done$/i })).toBeInTheDocument()
  })

  it('should call onComplete when Done button clicked on view-follow-up-results', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()
    render(
      <TutorialTooltip
        {...defaultProps}
        step="view-follow-up-results"
        config={{
          ...mockConfig,
          step: 'view-follow-up-results',
          targetSelector: '.results-section',
          title: 'View Follow-Up Results',
          description: 'Compare the follow-up responses.',
          position: 'top',
        }}
        onComplete={onComplete}
      />
    )
    await user.click(screen.getByRole('button', { name: /^done$/i }))
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('should render Done button disabled for history-dropdown when dropdown not opened', () => {
    render(
      <TutorialTooltip
        {...defaultProps}
        step="history-dropdown"
        config={{
          ...mockConfig,
          step: 'history-dropdown',
          targetSelector: '.history-toggle-button',
          title: 'Access Your History',
          description: 'Click this button.',
          position: 'top',
        }}
        isHistoryDropdownOpened={false}
      />
    )
    const button = screen.getByRole('button', { name: /^done$/i })
    expect(button).toBeDisabled()
  })

  it('should render Done button for save-selection disabled when dropdown not opened', () => {
    render(
      <TutorialTooltip
        {...defaultProps}
        step="save-selection"
        config={{
          ...mockConfig,
          step: 'save-selection',
          targetSelector: '.saved-selections-button',
          title: 'Save Model Selections',
          description: 'Save your favorite model combinations.',
          position: 'top',
        }}
        saveSelectionDropdownOpened={false}
      />
    )
    const button = screen.getByRole('button', { name: /^done$/i })
    expect(button).toBeDisabled()
  })

  it('should apply position class from effectivePosition when step has dynamic position', () => {
    const { container } = render(<TutorialTooltip {...defaultProps} effectivePosition="bottom" />)
    const tooltip = container.querySelector('.tutorial-tooltip')
    expect(tooltip).toHaveClass('tutorial-tooltip-bottom')
  })
})
