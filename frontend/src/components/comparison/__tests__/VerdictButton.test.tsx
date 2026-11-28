/// <reference types="@testing-library/jest-dom" />

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { useExpandFromOrigin, usePrefersReducedMotion } from '../../../hooks/useExpandFromOrigin'
import { VerdictButton } from '../VerdictButton'

function ExpandProbe({ active }: { active: boolean }) {
  const reducedMotion = usePrefersReducedMotion()
  const { stackElevated } = useExpandFromOrigin(active)
  return (
    <div
      data-testid="expand-probe"
      data-elevated={stackElevated ? 'true' : 'false'}
      data-reduced={reducedMotion ? 'true' : 'false'}
    />
  )
}

function mockMotion(reduced: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(query => ({
    matches: reduced && query === '(prefers-reduced-motion: reduce)',
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

describe('VerdictButton expand', () => {
  it('scales from the button and elevates while the shared transition runs', async () => {
    mockMotion(false)
    const user = userEvent.setup()
    const onToggle = vi.fn()
    const { rerender } = render(<VerdictButton open={false} onToggle={onToggle} />)

    const button = screen.getByTestId('verdict-button')
    expect(button).not.toHaveClass('verdict-logo-button--expanded')
    expect(button).not.toHaveClass('verdict-logo-button--instant')
    expect(button.querySelector('img')).toHaveAttribute('src', '/brand/logo.svg')

    await user.click(button)
    expect(onToggle).toHaveBeenCalledTimes(1)

    rerender(<VerdictButton open onToggle={onToggle} />)
    expect(button).toHaveClass('verdict-logo-button--expanded')
    expect(button).toHaveClass('verdict-logo-button--elevated')
    expect(button).not.toHaveClass('verdict-logo-button--instant')
    expect(button).toHaveAttribute('aria-expanded', 'true')
  })

  it('marks reduced motion as instant', () => {
    mockMotion(true)
    render(<VerdictButton open onToggle={vi.fn()} />)
    const button = screen.getByTestId('verdict-button')
    expect(button).toHaveClass('verdict-logo-button--instant')
    expect(button).toHaveClass('verdict-logo-button--expanded')
  })

  it('elevates on the same flip the hero tile uses', () => {
    mockMotion(false)
    const { rerender } = render(<ExpandProbe active={false} />)
    expect(screen.getByTestId('expand-probe')).toHaveAttribute('data-elevated', 'false')
    rerender(<ExpandProbe active />)
    expect(screen.getByTestId('expand-probe')).toHaveAttribute('data-elevated', 'true')
    expect(screen.getByTestId('expand-probe')).toHaveAttribute('data-reduced', 'false')
  })
})
