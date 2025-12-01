/**
 * Tests for MessageBubble component
 */

import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

import { createMockConversationMessage } from '../../../__tests__/utils/test-factories'
import { RESULT_TAB } from '../../../types'
import { MessageBubble } from '../MessageBubble'

describe('MessageBubble', () => {
  const mockUserMessage = createMockConversationMessage({
    type: 'user',
    content: 'Hello, how are you?',
    timestamp: new Date('2024-01-01T12:00:00Z'),
  })

  const mockAssistantMessage = createMockConversationMessage({
    type: 'assistant',
    content: 'I am doing well, thank you!',
    timestamp: new Date('2024-01-01T12:00:01Z'),
  })

  describe('Rendering', () => {
    it('should render user message', () => {
      render(
        <MessageBubble
          id={String(mockUserMessage.id)}
          type={mockUserMessage.type}
          content={mockUserMessage.content}
          timestamp={mockUserMessage.timestamp}
        />
      )
      expect(screen.getByText(/hello, how are you/i)).toBeInTheDocument()
    })

    it('should render assistant message', () => {
      render(
        <MessageBubble
          id={String(mockAssistantMessage.id)}
          type={mockAssistantMessage.type}
          content={mockAssistantMessage.content}
          timestamp={mockAssistantMessage.timestamp}
        />
      )
      expect(screen.getByText(/i am doing well/i)).toBeInTheDocument()
    })

    it('should display "You" label for user messages', () => {
      const { container } = render(
        <MessageBubble
          id={String(mockUserMessage.id)}
          type="user"
          content={mockUserMessage.content}
          timestamp={mockUserMessage.timestamp}
        />
      )
      // Find the message-type span that contains "You"
      const messageType = container.querySelector('.message-type')
      expect(messageType).toBeInTheDocument()
      expect(messageType?.textContent).toContain('You')
    })

    it('should display "AI" label for assistant messages', () => {
      render(
        <MessageBubble
          id={String(mockAssistantMessage.id)}
          type="assistant"
          content={mockAssistantMessage.content}
          timestamp={mockAssistantMessage.timestamp}
        />
      )
      expect(screen.getByText(/ai/i)).toBeInTheDocument()
    })

    it('should display timestamp', () => {
      render(
        <MessageBubble
          id={String(mockUserMessage.id)}
          type="user"
          content={mockUserMessage.content}
          timestamp={mockUserMessage.timestamp}
        />
      )
      // formatTime should format the timestamp
      expect(screen.getByText(/\d{1,2}:\d{2}/)).toBeInTheDocument()
    })
  })

  describe('Formatted vs Raw View', () => {
    it('should render formatted view by default', () => {
      const { container } = render(
        <MessageBubble
          id={String(mockAssistantMessage.id)}
          type="assistant"
          content="Test **bold** text"
          timestamp={mockAssistantMessage.timestamp}
        />
      )
      // Should use LatexRenderer for formatted view
      const latexRenderer = container.querySelector('.result-output')
      expect(latexRenderer).toBeInTheDocument()
    })

    it('should render formatted view when activeTab is FORMATTED', () => {
      const { container } = render(
        <MessageBubble
          id={String(mockAssistantMessage.id)}
          type="assistant"
          content="Test content"
          timestamp={mockAssistantMessage.timestamp}
          activeTab={RESULT_TAB.FORMATTED}
        />
      )
      const latexRenderer = container.querySelector('.result-output')
      expect(latexRenderer).toBeInTheDocument()
    })

    it('should render raw view when activeTab is RAW', () => {
      const { container } = render(
        <MessageBubble
          id={String(mockAssistantMessage.id)}
          type="assistant"
          content="Test content"
          timestamp={mockAssistantMessage.timestamp}
          activeTab={RESULT_TAB.RAW}
        />
      )
      const rawOutput = container.querySelector('.raw-output')
      expect(rawOutput).toBeInTheDocument()
      expect(rawOutput?.tagName).toBe('PRE')
    })
  })

  describe('Message Types', () => {
    it('should apply user class for user messages', () => {
      const { container } = render(
        <MessageBubble id="msg-1" type="user" content="Test" timestamp={new Date()} />
      )
      const message = container.querySelector('.conversation-message')
      expect(message).toHaveClass('user')
    })

    it('should apply assistant class for assistant messages', () => {
      const { container } = render(
        <MessageBubble id="msg-1" type="assistant" content="Test" timestamp={new Date()} />
      )
      const message = container.querySelector('.conversation-message')
      expect(message).toHaveClass('assistant')
    })
  })

  describe('Timestamp Handling', () => {
    it('should handle string timestamp', () => {
      render(
        <MessageBubble id="msg-1" type="user" content="Test" timestamp="2024-01-01T12:00:00Z" />
      )
      expect(screen.getByText(/\d{1,2}:\d{2}/)).toBeInTheDocument()
    })

    it('should handle Date timestamp', () => {
      render(
        <MessageBubble
          id="msg-1"
          type="user"
          content="Test"
          timestamp={new Date('2024-01-01T12:00:00Z')}
        />
      )
      expect(screen.getByText(/\d{1,2}:\d{2}/)).toBeInTheDocument()
    })
  })

  describe('Custom className', () => {
    it('should apply custom className', () => {
      const { container } = render(
        <MessageBubble
          id="msg-1"
          type="user"
          content="Test"
          timestamp={new Date()}
          className="custom-class"
        />
      )
      const message = container.querySelector('.conversation-message')
      expect(message).toHaveClass('custom-class')
    })
  })
})
