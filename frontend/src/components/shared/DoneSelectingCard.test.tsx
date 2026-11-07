import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

import { DoneSelectingCard } from './DoneSelectingCard'

describe('DoneSelectingCard', () => {
  it('renders the card with title', () => {
    const onDone = vi.fn()
    const onClose = vi.fn()
    
    render(<DoneSelectingCard onDone={onDone} onClose={onClose} />)
    
    expect(screen.getByText('Done Selecting?')).toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', () => {
    const onDone = vi.fn()
    const onClose = vi.fn()
    
    render(<DoneSelectingCard onDone={onDone} onClose={onClose} />)
    
    const closeButton = screen.getByRole('button', { name: /close done selecting card/i })
    fireEvent.click(closeButton)
    
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onDone).not.toHaveBeenCalled()
  })

  it('calls onDone when done button is clicked', () => {
    const onDone = vi.fn()
    const onClose = vi.fn()
    
    render(<DoneSelectingCard onDone={onDone} onClose={onClose} />)
    
    const doneButton = screen.getByRole('button', { name: /done selecting models/i })
    fireEvent.click(doneButton)
    
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('has accessible names for both buttons', () => {
    const onDone = vi.fn()
    const onClose = vi.fn()
    
    render(<DoneSelectingCard onDone={onDone} onClose={onClose} />)
    
    expect(screen.getByRole('button', { name: /close done selecting card/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /done selecting models/i })).toBeInTheDocument()
  })

  it('close button has minimum touch target size class applied', () => {
    const onDone = vi.fn()
    const onClose = vi.fn()
    
    render(<DoneSelectingCard onDone={onDone} onClose={onClose} />)
    
    const closeButton = screen.getByRole('button', { name: /close done selecting card/i })
    
    // Verify the button has the done-selecting-close-button class
    // which in CSS applies min-width: 48px and min-height: 48px
    // to meet WCAG 2.5.5 Level AAA touch target size recommendations
    expect(closeButton).toHaveClass('done-selecting-close-button')
  })

  it('close button is keyboard focusable', () => {
    const onDone = vi.fn()
    const onClose = vi.fn()
    
    render(<DoneSelectingCard onDone={onDone} onClose={onClose} />)
    
    const closeButton = screen.getByRole('button', { name: /close done selecting card/i })
    
    // Button should be focusable (native button behavior)
    closeButton.focus()
    expect(closeButton).toHaveFocus()
  })

  it('done button is keyboard focusable', () => {
    const onDone = vi.fn()
    const onClose = vi.fn()
    
    render(<DoneSelectingCard onDone={onDone} onClose={onClose} />)
    
    const doneButton = screen.getByRole('button', { name: /done selecting models/i })
    
    // Button should be focusable (native button behavior)
    doneButton.focus()
    expect(doneButton).toHaveFocus()
  })

  it('close button contains an SVG icon', () => {
    const onDone = vi.fn()
    const onClose = vi.fn()
    
    render(<DoneSelectingCard onDone={onDone} onClose={onClose} />)
    
    const closeButton = screen.getByRole('button', { name: /close done selecting card/i })
    const svg = closeButton.querySelector('svg')
    
    expect(svg).toBeInTheDocument()
    expect(svg).toHaveAttribute('aria-hidden', 'true')
  })

  it('done button contains a checkmark SVG icon', () => {
    const onDone = vi.fn()
    const onClose = vi.fn()
    
    render(<DoneSelectingCard onDone={onDone} onClose={onClose} />)
    
    const doneButton = screen.getByRole('button', { name: /done selecting models/i })
    const svg = doneButton.querySelector('svg')
    
    expect(svg).toBeInTheDocument()
  })
})
