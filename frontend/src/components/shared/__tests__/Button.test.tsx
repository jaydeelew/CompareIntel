/**
 * Tests for Button component
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'

import { Button, type ButtonProps } from '../Button'

describe('Button', () => {
  describe('Rendering', () => {
    it('should render button with children', () => {
      render(<Button>Click me</Button>)
      expect(screen.getByRole('button', { name: /click me/i })).toBeInTheDocument()
    })

    it('should render button with default variant', () => {
      const { container } = render(<Button>Test</Button>)
      const button = container.querySelector('button')
      expect(button).toHaveClass('button-primary')
    })

    it('should apply custom variant class', () => {
      const { container } = render(<Button variant="secondary">Test</Button>)
      const button = container.querySelector('button')
      expect(button).toHaveClass('button-secondary')
    })

    it('should apply custom size class', () => {
      const { container } = render(<Button size="large">Test</Button>)
      const button = container.querySelector('button')
      expect(button).toHaveClass('button-large')
    })

    it('should apply fullWidth class when fullWidth is true', () => {
      const { container } = render(<Button fullWidth>Test</Button>)
      const button = container.querySelector('button')
      expect(button).toHaveClass('button-full-width')
    })

    it('should apply custom className', () => {
      const { container } = render(<Button className="custom-class">Test</Button>)
      const button = container.querySelector('button')
      expect(button).toHaveClass('custom-class')
    })
  })

  describe('Loading State', () => {
    it('should show loading spinner when isLoading is true', () => {
      const { container } = render(<Button isLoading>Test</Button>)
      const spinner = container.querySelector('.button-spinner')
      expect(spinner).toBeInTheDocument()
    })

    it('should disable button when isLoading is true', () => {
      render(<Button isLoading>Test</Button>)
      const button = screen.getByRole('button')
      expect(button).toBeDisabled()
    })

    it('should apply loading class when isLoading is true', () => {
      const { container } = render(<Button isLoading>Test</Button>)
      const button = container.querySelector('button')
      expect(button).toHaveClass('button-loading')
    })

    it('should hide icons when loading', () => {
      const Icon = () => <span>Icon</span>
      const { container } = render(
        <Button isLoading icon={<Icon />} iconAfter={<Icon />}>
          Test
        </Button>
      )
      const icons = container.querySelectorAll('.button-icon-before, .button-icon-after')
      expect(icons.length).toBe(0)
    })
  })

  describe('Icons', () => {
    it('should render icon before text', () => {
      const Icon = () => <span data-testid="before-icon">Before</span>
      render(<Button icon={<Icon />}>Test</Button>)
      expect(screen.getByTestId('before-icon')).toBeInTheDocument()
    })

    it('should render icon after text', () => {
      const Icon = () => <span data-testid="after-icon">After</span>
      render(<Button iconAfter={<Icon />}>Test</Button>)
      expect(screen.getByTestId('after-icon')).toBeInTheDocument()
    })

    it('should render both icons', () => {
      const BeforeIcon = () => <span data-testid="before-icon">Before</span>
      const AfterIcon = () => <span data-testid="after-icon">After</span>
      render(
        <Button icon={<BeforeIcon />} iconAfter={<AfterIcon />}>
          Test
        </Button>
      )
      expect(screen.getByTestId('before-icon')).toBeInTheDocument()
      expect(screen.getByTestId('after-icon')).toBeInTheDocument()
    })
  })

  describe('User Interactions', () => {
    it('should call onClick when clicked', async () => {
      const user = userEvent.setup()
      const handleClick = vi.fn()
      render(<Button onClick={handleClick}>Click me</Button>)

      const button = screen.getByRole('button')
      await user.click(button)

      expect(handleClick).toHaveBeenCalledTimes(1)
    })

    it('should not call onClick when disabled', async () => {
      const user = userEvent.setup()
      const handleClick = vi.fn()
      render(
        <Button onClick={handleClick} disabled>
          Click me
        </Button>
      )

      const button = screen.getByRole('button')
      await user.click(button)

      expect(handleClick).not.toHaveBeenCalled()
    })

    it('should not call onClick when loading', async () => {
      const user = userEvent.setup()
      const handleClick = vi.fn()
      render(
        <Button onClick={handleClick} isLoading>
          Click me
        </Button>
      )

      const button = screen.getByRole('button')
      await user.click(button)

      expect(handleClick).not.toHaveBeenCalled()
    })
  })

  describe('Accessibility', () => {
    it('should forward ref to button element', () => {
      const ref = vi.fn()
      render(<Button ref={ref}>Test</Button>)
      expect(ref).toHaveBeenCalled()
    })

    it('should support disabled attribute', () => {
      render(<Button disabled>Test</Button>)
      const button = screen.getByRole('button')
      expect(button).toBeDisabled()
    })

    it('should support aria-label', () => {
      render(<Button aria-label="Submit form">Test</Button>)
      const button = screen.getByRole('button', { name: /submit form/i })
      expect(button).toBeInTheDocument()
    })
  })

  describe('Variants', () => {
    it.each([
      ['primary', 'button-primary'],
      ['secondary', 'button-secondary'],
      ['danger', 'button-danger'],
      ['ghost', 'button-ghost'],
    ])('should apply %s variant class', (variant, expectedClass) => {
      const { container } = render(
        <Button variant={variant as ButtonProps['variant']}>Test</Button>
      )
      const button = container.querySelector('button')
      expect(button).toHaveClass(expectedClass)
    })
  })

  describe('Sizes', () => {
    it.each([
      ['small', 'button-small'],
      ['medium', 'button-medium'],
      ['large', 'button-large'],
    ])('should apply %s size class', (size, expectedClass) => {
      const { container } = render(<Button size={size as ButtonProps['size']}>Test</Button>)
      const button = container.querySelector('button')
      expect(button).toHaveClass(expectedClass)
    })
  })
})
