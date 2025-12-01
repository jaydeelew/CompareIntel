/**
 * Tests for Input and Textarea components
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'

import { Input, Textarea } from '../Input'

describe('Input', () => {
  describe('Rendering', () => {
    it('should render input element', () => {
      render(<Input />)
      const input = screen.getByRole('textbox')
      expect(input).toBeInTheDocument()
    })

    it('should render with label', () => {
      render(<Input label="Email" />)
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    })

    it('should render with helper text', () => {
      render(<Input helperText="Enter your email address" />)
      expect(screen.getByText(/enter your email address/i)).toBeInTheDocument()
    })

    it('should render with error message', () => {
      render(<Input error="Email is required" />)
      expect(screen.getByText(/email is required/i)).toBeInTheDocument()
      expect(screen.getByText(/email is required/i)).toHaveAttribute('role', 'alert')
    })

    it('should apply error class when error is present', () => {
      const { container } = render(<Input error="Error" />)
      const input = container.querySelector('input')
      expect(input).toHaveClass('input-error')
    })

    it('should set aria-invalid when error is present', () => {
      render(<Input error="Error" />)
      const input = screen.getByRole('textbox')
      expect(input).toHaveAttribute('aria-invalid', 'true')
    })

    it('should set aria-describedby for error', () => {
      render(<Input id="test-input" error="Error" />)
      const input = screen.getByRole('textbox')
      expect(input).toHaveAttribute('aria-describedby', 'test-input-error')
    })

    it('should set aria-describedby for helper text', () => {
      render(<Input id="test-input" helperText="Helper" />)
      const input = screen.getByRole('textbox')
      expect(input).toHaveAttribute('aria-describedby', 'test-input-helper')
    })

    it('should prioritize error over helper text', () => {
      render(<Input error="Error" helperText="Helper" />)
      expect(screen.getByText(/error/i)).toBeInTheDocument()
      expect(screen.queryByText(/helper/i)).not.toBeInTheDocument()
    })
  })

  describe('Icons', () => {
    it('should render icon before input', () => {
      const Icon = () => <span data-testid="before-icon">Icon</span>
      const { container } = render(<Input icon={<Icon />} />)
      const icon = container.querySelector('.input-icon-before')
      expect(icon).toBeInTheDocument()
    })

    it('should render icon after input', () => {
      const Icon = () => <span data-testid="after-icon">Icon</span>
      const { container } = render(<Input iconAfter={<Icon />} />)
      const icon = container.querySelector('.input-icon-after')
      expect(icon).toBeInTheDocument()
    })

    it('should apply icon classes when icons are present', () => {
      const Icon = () => <span>Icon</span>
      const { container } = render(<Input icon={<Icon />} iconAfter={<Icon />} />)
      const input = container.querySelector('input')
      expect(input).toHaveClass('input-with-icon-before')
      expect(input).toHaveClass('input-with-icon-after')
    })
  })

  describe('User Interactions', () => {
    it('should handle input changes', async () => {
      const user = userEvent.setup()
      render(<Input />)

      const input = screen.getByRole('textbox')
      await user.type(input, 'test@example.com')

      expect(input).toHaveValue('test@example.com')
    })

    it('should call onChange when value changes', async () => {
      const user = userEvent.setup()
      const handleChange = vi.fn()
      render(<Input onChange={handleChange} />)

      const input = screen.getByRole('textbox')
      await user.type(input, 'test')

      expect(handleChange).toHaveBeenCalled()
    })

    it('should support controlled input', () => {
      const { rerender } = render(<Input value="initial" onChange={vi.fn()} />)
      const input = screen.getByRole('textbox')
      expect(input).toHaveValue('initial')

      rerender(<Input value="updated" onChange={vi.fn()} />)
      expect(input).toHaveValue('updated')
    })
  })

  describe('Full Width', () => {
    it('should apply full width class when fullWidth is true', () => {
      const { container } = render(<Input fullWidth />)
      const containerDiv = container.querySelector('.input-container')
      expect(containerDiv).toHaveClass('input-container-full-width')
    })
  })

  describe('Accessibility', () => {
    it('should generate unique id when not provided', () => {
      render(<Input label="Test" />)
      const input = screen.getByLabelText(/test/i)
      expect(input).toHaveAttribute('id')
    })

    it('should use provided id', () => {
      render(<Input id="custom-id" label="Test" />)
      const input = screen.getByLabelText(/test/i)
      expect(input).toHaveAttribute('id', 'custom-id')
    })

    it('should forward ref to input element', () => {
      const ref = vi.fn()
      render(<Input ref={ref} />)
      expect(ref).toHaveBeenCalled()
    })
  })

  describe('Input Types', () => {
    it('should support different input types', () => {
      const { rerender, container } = render(<Input type="email" />)
      let input = screen.getByRole('textbox')
      expect(input).toHaveAttribute('type', 'email')

      rerender(<Input type="password" />)
      // Password inputs don't have role="textbox", use container query instead
      input = container.querySelector('input[type="password"]') as HTMLInputElement
      expect(input).toHaveAttribute('type', 'password')
    })
  })
})

describe('Textarea', () => {
  describe('Rendering', () => {
    it('should render textarea element', () => {
      render(<Textarea />)
      const textarea = screen.getByRole('textbox')
      expect(textarea).toBeInTheDocument()
      expect(textarea.tagName).toBe('TEXTAREA')
    })

    it('should render with label', () => {
      render(<Textarea label="Message" />)
      expect(screen.getByLabelText(/message/i)).toBeInTheDocument()
    })

    it('should render with error message', () => {
      render(<Textarea error="Message is required" />)
      expect(screen.getByText(/message is required/i)).toBeInTheDocument()
    })

    it('should render with helper text', () => {
      render(<Textarea helperText="Enter your message" />)
      expect(screen.getByText(/enter your message/i)).toBeInTheDocument()
    })

    it('should apply error class when error is present', () => {
      const { container } = render(<Textarea error="Error" />)
      const textarea = container.querySelector('textarea')
      expect(textarea).toHaveClass('textarea-error')
    })
  })

  describe('User Interactions', () => {
    it('should handle textarea changes', async () => {
      const user = userEvent.setup()
      render(<Textarea />)

      const textarea = screen.getByRole('textbox')
      await user.type(textarea, 'Hello, world!')

      expect(textarea).toHaveValue('Hello, world!')
    })

    it('should call onChange when value changes', async () => {
      const user = userEvent.setup()
      const handleChange = vi.fn()
      render(<Textarea onChange={handleChange} />)

      const textarea = screen.getByRole('textbox')
      await user.type(textarea, 'test')

      expect(handleChange).toHaveBeenCalled()
    })
  })

  describe('Full Width', () => {
    it('should apply full width class when fullWidth is true', () => {
      const { container } = render(<Textarea fullWidth />)
      const containerDiv = container.querySelector('.textarea-container')
      expect(containerDiv).toHaveClass('textarea-container-full-width')
    })
  })

  describe('Accessibility', () => {
    it('should generate unique id when not provided', () => {
      render(<Textarea label="Test" />)
      const textarea = screen.getByLabelText(/test/i)
      expect(textarea).toHaveAttribute('id')
    })

    it('should forward ref to textarea element', () => {
      const ref = vi.fn()
      render(<Textarea ref={ref} />)
      expect(ref).toHaveBeenCalled()
    })
  })
})
