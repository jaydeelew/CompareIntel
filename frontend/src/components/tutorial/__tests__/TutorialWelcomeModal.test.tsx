import { render, screen, fireEvent } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { describe, it, expect, vi } from 'vitest'

import { TutorialWelcomeModal } from '../TutorialWelcomeModal'

describe('TutorialWelcomeModal', () => {
  const renderModal = (props = {}) => {
    const defaultProps = {
      onStart: vi.fn(),
      onSkip: vi.fn(),
      onDontShowAgain: vi.fn(),
      showDontShowAgain: false,
    }

    return render(
      <BrowserRouter>
        <TutorialWelcomeModal {...defaultProps} {...props} />
      </BrowserRouter>
    )
  }

  it('renders the welcome modal with all elements', () => {
    renderModal()

    expect(screen.getByText('Welcome to CompareIntel!')).toBeInTheDocument()
    expect(
      screen.getByText(/Take a quick tour to learn how to compare AI models/)
    ).toBeInTheDocument()
    expect(screen.getByText('Start Tutorial')).toBeInTheDocument()
    expect(screen.getByText('Skip for Now')).toBeInTheDocument()
  })

  it('calls onStart when "Start Tutorial" button is clicked', () => {
    const onStart = vi.fn()
    renderModal({ onStart })

    fireEvent.click(screen.getByText('Start Tutorial'))

    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it('calls onSkip when "Skip for Now" button is clicked', () => {
    const onSkip = vi.fn()
    renderModal({ onSkip })

    fireEvent.click(screen.getByText('Skip for Now'))

    expect(onSkip).toHaveBeenCalledTimes(1)
  })

  it('shows "Don\'t show again" checkbox when showDontShowAgain is true', () => {
    renderModal({ showDontShowAgain: true })

    expect(screen.getByText("Don't show again")).toBeInTheDocument()
    expect(screen.getByRole('checkbox')).toBeInTheDocument()
  })

  it('does not show "Don\'t show again" checkbox when showDontShowAgain is false', () => {
    renderModal({ showDontShowAgain: false })

    expect(screen.queryByText("Don't show again")).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('calls onDontShowAgain when "Don\'t show again" is checked and Start is clicked', () => {
    const onStart = vi.fn()
    const onDontShowAgain = vi.fn()
    renderModal({ showDontShowAgain: true, onStart, onDontShowAgain })

    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)

    fireEvent.click(screen.getByText('Start Tutorial'))

    expect(onDontShowAgain).toHaveBeenCalledTimes(1)
    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it('calls onDontShowAgain when "Don\'t show again" is checked and Skip is clicked', () => {
    const onSkip = vi.fn()
    const onDontShowAgain = vi.fn()
    renderModal({ showDontShowAgain: true, onSkip, onDontShowAgain })

    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)

    fireEvent.click(screen.getByText('Skip for Now'))

    expect(onDontShowAgain).toHaveBeenCalledTimes(1)
    expect(onSkip).toHaveBeenCalledTimes(1)
  })

  it('does not call onDontShowAgain when checkbox is not checked', () => {
    const onSkip = vi.fn()
    const onDontShowAgain = vi.fn()
    renderModal({ showDontShowAgain: true, onSkip, onDontShowAgain })

    fireEvent.click(screen.getByText('Skip for Now'))

    expect(onDontShowAgain).not.toHaveBeenCalled()
    expect(onSkip).toHaveBeenCalledTimes(1)
  })

  it('renders with proper accessibility structure', () => {
    renderModal()

    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(2)
    expect(buttons[0]).toHaveTextContent('Start Tutorial')
    expect(buttons[1]).toHaveTextContent('Skip for Now')
  })
})
