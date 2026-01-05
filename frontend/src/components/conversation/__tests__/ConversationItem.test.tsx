/**
 * Tests for ConversationItem component
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'

import { createMockConversationSummary } from '../../../__tests__/utils/test-factories'
import { createModelId } from '../../../types'
import { ConversationItem } from '../ConversationItem'

describe('ConversationItem', () => {
  const mockConversation = createMockConversationSummary({
    input_data: 'What is React?',
    models_used: [createModelId('gpt-4'), createModelId('claude-3')],
    created_at: '2024-01-01T12:00:00Z',
    message_count: 4,
  })

  describe('Rendering', () => {
    it('should render conversation item', () => {
      render(<ConversationItem conversation={mockConversation} />)
      expect(screen.getByText(/what is react/i)).toBeInTheDocument()
    })

    it('should display truncated prompt', () => {
      const longPrompt = 'A'.repeat(200)
      const conversation = createMockConversationSummary({
        input_data: longPrompt,
      })
      render(<ConversationItem conversation={conversation} />)
      // Should truncate to 100 characters
      const prompt = screen.getByText(/a+/i)
      expect(prompt.textContent?.length).toBeLessThanOrEqual(103) // 100 + "..."
    })

    it('should display date', () => {
      render(<ConversationItem conversation={mockConversation} />)
      // formatDate returns relative dates (e.g., "Just now", "5m ago", "Yesterday", "Jan 15")
      // or absolute dates for older dates
      const dateElement = screen.getByText(
        /just now|ago|yesterday|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i
      )
      expect(dateElement).toBeInTheDocument()
    })

    it('should display model count', () => {
      render(<ConversationItem conversation={mockConversation} />)
      expect(screen.getByText(/2 models/i)).toBeInTheDocument()
    })

    it('should display singular model count', () => {
      const singleModelConversation = createMockConversationSummary({
        models_used: [createModelId('gpt-4')],
      })
      render(<ConversationItem conversation={singleModelConversation} />)
      // For single model, ConversationItem displays the model name instead of "1 models"
      expect(screen.getByText('gpt-4')).toBeInTheDocument()
    })
  })

  describe('Active State', () => {
    it('should apply active class when isActive is true', () => {
      const { container } = render(
        <ConversationItem conversation={mockConversation} isActive={true} />
      )
      const item = container.querySelector('.conversation-item')
      expect(item).toHaveClass('active-comparison')
    })

    it('should not apply active class when isActive is false', () => {
      const { container } = render(
        <ConversationItem conversation={mockConversation} isActive={false} />
      )
      const item = container.querySelector('.conversation-item')
      expect(item).not.toHaveClass('active-comparison')
    })

    it('should not apply active class by default', () => {
      const { container } = render(<ConversationItem conversation={mockConversation} />)
      const item = container.querySelector('.conversation-item')
      expect(item).not.toHaveClass('active-comparison')
    })
  })

  describe('User Interactions', () => {
    it('should call onClick when clicked', async () => {
      const user = userEvent.setup()
      const handleClick = vi.fn()
      render(<ConversationItem conversation={mockConversation} onClick={handleClick} />)

      const item = screen.getByRole('button')
      await user.click(item)

      expect(handleClick).toHaveBeenCalledWith(String(mockConversation.id))
    })

    it('should call onClick when Enter key is pressed', async () => {
      const user = userEvent.setup()
      const handleClick = vi.fn()
      render(<ConversationItem conversation={mockConversation} onClick={handleClick} />)

      const item = screen.getByRole('button')
      await user.type(item, '{Enter}')

      expect(handleClick).toHaveBeenCalledWith(String(mockConversation.id))
    })

    it('should call onClick when Space key is pressed', async () => {
      const user = userEvent.setup()
      const handleClick = vi.fn()
      render(<ConversationItem conversation={mockConversation} onClick={handleClick} />)

      const item = screen.getByRole('button')
      await user.type(item, ' ')

      expect(handleClick).toHaveBeenCalledWith(String(mockConversation.id))
    })

    it('should not call onClick when onClick is not provided', async () => {
      const user = userEvent.setup()
      render(<ConversationItem conversation={mockConversation} />)

      const item = screen.getByRole('button')
      await user.click(item)

      // Should not throw error
      expect(item).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('should have button role', () => {
      render(<ConversationItem conversation={mockConversation} />)
      expect(screen.getByRole('button')).toBeInTheDocument()
    })

    it('should be keyboard accessible', () => {
      render(<ConversationItem conversation={mockConversation} />)
      const item = screen.getByRole('button')
      expect(item).toHaveAttribute('tabIndex', '0')
    })
  })

  describe('Custom className', () => {
    it('should apply custom className', () => {
      const { container } = render(
        <ConversationItem conversation={mockConversation} className="custom-class" />
      )
      const item = container.querySelector('.conversation-item')
      expect(item).toHaveClass('custom-class')
    })
  })
})
