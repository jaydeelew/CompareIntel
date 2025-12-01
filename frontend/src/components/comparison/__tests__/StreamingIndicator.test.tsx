/**
 * Tests for StreamingIndicator component
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'

import { StreamingIndicator } from '../StreamingIndicator'

describe('StreamingIndicator', () => {
  describe('Rendering', () => {
    it('should not render when isLoading is false', () => {
      const { container } = render(<StreamingIndicator modelCount={3} isLoading={false} />)
      expect(container.firstChild).toBeNull()
    })

    it('should render when isLoading is true', () => {
      render(<StreamingIndicator modelCount={3} isLoading={true} />)
      expect(screen.getByText(/processing responses/i)).toBeInTheDocument()
    })

    it('should display singular message for 1 model', () => {
      render(<StreamingIndicator modelCount={1} isLoading={true} />)
      expect(screen.getByText(/processing response from 1 ai model/i)).toBeInTheDocument()
    })

    it('should display plural message for multiple models', () => {
      render(<StreamingIndicator modelCount={3} isLoading={true} />)
      expect(screen.getByText(/processing responses from 3 ai models/i)).toBeInTheDocument()
    })

    it('should render loading spinner', () => {
      const { container } = render(<StreamingIndicator modelCount={2} isLoading={true} />)
      const spinner = container.querySelector('[role="status"]')
      expect(spinner).toBeInTheDocument()
    })
  })

  describe('Cancel Button', () => {
    it('should render cancel button when onCancel is provided', () => {
      render(<StreamingIndicator modelCount={2} isLoading={true} onCancel={vi.fn()} />)
      expect(screen.getByRole('button', { name: /stop comparison/i })).toBeInTheDocument()
    })

    it('should not render cancel button when onCancel is not provided', () => {
      render(<StreamingIndicator modelCount={2} isLoading={true} />)
      expect(screen.queryByRole('button', { name: /stop comparison/i })).not.toBeInTheDocument()
    })

    it('should call onCancel when cancel button is clicked', async () => {
      const user = userEvent.setup()
      const handleCancel = vi.fn()
      render(<StreamingIndicator modelCount={2} isLoading={true} onCancel={handleCancel} />)

      const cancelButton = screen.getByRole('button', { name: /stop comparison/i })
      await user.click(cancelButton)

      expect(handleCancel).toHaveBeenCalledTimes(1)
    })

    it('should display cancel text', () => {
      render(<StreamingIndicator modelCount={2} isLoading={true} onCancel={vi.fn()} />)
      expect(screen.getByText(/cancel/i)).toBeInTheDocument()
    })
  })

  describe('Custom className', () => {
    it('should apply custom className', () => {
      const { container } = render(
        <StreamingIndicator modelCount={2} isLoading={true} className="custom-class" />
      )
      const indicator = container.querySelector('.loading-section')
      expect(indicator).toHaveClass('custom-class')
    })
  })

  describe('Edge Cases', () => {
    it('should handle zero model count', () => {
      render(<StreamingIndicator modelCount={0} isLoading={true} />)
      expect(screen.getByText(/processing responses from 0 ai models/i)).toBeInTheDocument()
    })

    it('should handle large model count', () => {
      render(<StreamingIndicator modelCount={100} isLoading={true} />)
      expect(screen.getByText(/processing responses from 100 ai models/i)).toBeInTheDocument()
    })
  })
})
