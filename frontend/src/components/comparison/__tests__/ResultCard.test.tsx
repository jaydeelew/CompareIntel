/**
 * Tests for ResultCard component
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'

import { createMockConversationMessage } from '../../../__tests__/utils/test-factories'
import { RESULT_TAB, createModelId } from '../../../types'
import { ResultCard } from '../ResultCard'

describe('ResultCard', () => {
  const mockModel = {
    id: createModelId('gpt-4'),
    name: 'GPT-4',
    description: 'OpenAI GPT-4',
  }

  const mockMessages = [
    createMockConversationMessage({ type: 'user', content: 'Hello' }),
    createMockConversationMessage({ type: 'assistant', content: 'Hi there!' }),
  ]

  describe('Rendering', () => {
    it('should render result card with model name', () => {
      render(<ResultCard modelId={mockModel.id} model={mockModel} messages={mockMessages} />)
      expect(screen.getByText(/gpt-4/i)).toBeInTheDocument()
    })

    it('should render with modelId when model is not provided', () => {
      render(<ResultCard modelId={createModelId('claude-3')} messages={mockMessages} />)
      expect(screen.getByText(/claude-3/i)).toBeInTheDocument()
    })

    it('should display message count', () => {
      render(<ResultCard modelId={mockModel.id} model={mockModel} messages={mockMessages} />)
      // Should show character count from latest message
      expect(screen.getByText(/\d+ chars/i)).toBeInTheDocument()
    })

    it('should display success status by default', () => {
      render(<ResultCard modelId={mockModel.id} model={mockModel} messages={mockMessages} />)
      expect(screen.getByText(/success/i)).toBeInTheDocument()
    })

    it('should display error status when isError is true', () => {
      render(
        <ResultCard
          modelId={mockModel.id}
          model={mockModel}
          messages={mockMessages}
          isError={true}
        />
      )
      expect(screen.getByText(/failed/i)).toBeInTheDocument()
    })

    it('should render conversation messages', () => {
      render(<ResultCard modelId={mockModel.id} model={mockModel} messages={mockMessages} />)
      expect(screen.getByText(/hello/i)).toBeInTheDocument()
      expect(screen.getByText(/hi there/i)).toBeInTheDocument()
    })
  })

  describe('Tabs', () => {
    it('should render Formatted and Raw tabs', () => {
      render(<ResultCard modelId={mockModel.id} model={mockModel} messages={mockMessages} />)
      expect(screen.getByRole('button', { name: /formatted/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /raw/i })).toBeInTheDocument()
    })

    it('should highlight Formatted tab by default', () => {
      render(<ResultCard modelId={mockModel.id} model={mockModel} messages={mockMessages} />)
      const formattedTab = screen.getByRole('button', { name: /formatted/i })
      expect(formattedTab).toHaveClass('active')
    })

    it('should highlight active tab', () => {
      render(
        <ResultCard
          modelId={mockModel.id}
          model={mockModel}
          messages={mockMessages}
          activeTab={RESULT_TAB.RAW}
        />
      )
      const rawTab = screen.getByRole('button', { name: /raw/i })
      expect(rawTab).toHaveClass('active')
    })

    it('should call onSwitchTab when tab is clicked', async () => {
      const user = userEvent.setup()
      const handleSwitchTab = vi.fn()
      render(
        <ResultCard
          modelId={mockModel.id}
          model={mockModel}
          messages={mockMessages}
          onSwitchTab={handleSwitchTab}
        />
      )

      const rawTab = screen.getByRole('button', { name: /raw/i })
      await user.click(rawTab)

      expect(handleSwitchTab).toHaveBeenCalledWith(mockModel.id, RESULT_TAB.RAW)
    })
  })

  describe('Action Buttons', () => {
    it('should render screenshot button when onScreenshot is provided', () => {
      render(
        <ResultCard
          modelId={mockModel.id}
          model={mockModel}
          messages={mockMessages}
          onScreenshot={vi.fn()}
        />
      )
      const screenshotButton = screen.getByLabelText(/copy formatted chat history/i)
      expect(screenshotButton).toBeInTheDocument()
    })

    it('should call onScreenshot when screenshot button is clicked', async () => {
      const user = userEvent.setup()
      const handleScreenshot = vi.fn()
      render(
        <ResultCard
          modelId={mockModel.id}
          model={mockModel}
          messages={mockMessages}
          onScreenshot={handleScreenshot}
        />
      )

      const screenshotButton = screen.getByLabelText(/copy formatted chat history/i)
      await user.click(screenshotButton)

      expect(handleScreenshot).toHaveBeenCalledWith(mockModel.id)
    })

    it('should render copy button when onCopyResponse is provided', () => {
      render(
        <ResultCard
          modelId={mockModel.id}
          model={mockModel}
          messages={mockMessages}
          onCopyResponse={vi.fn()}
        />
      )
      const copyButton = screen.getByLabelText(/copy raw chat history/i)
      expect(copyButton).toBeInTheDocument()
    })

    it('should call onCopyResponse when copy button is clicked', async () => {
      const user = userEvent.setup()
      const handleCopy = vi.fn()
      render(
        <ResultCard
          modelId={mockModel.id}
          model={mockModel}
          messages={mockMessages}
          onCopyResponse={handleCopy}
        />
      )

      const copyButton = screen.getByLabelText(/copy raw chat history/i)
      await user.click(copyButton)

      expect(handleCopy).toHaveBeenCalledWith(mockModel.id)
    })

    it('should render close button when onClose is provided', () => {
      render(
        <ResultCard
          modelId={mockModel.id}
          model={mockModel}
          messages={mockMessages}
          onClose={vi.fn()}
        />
      )
      const closeButton = screen.getByLabelText(/hide result/i)
      expect(closeButton).toBeInTheDocument()
    })

    it('should call onClose when close button is clicked', async () => {
      const user = userEvent.setup()
      const handleClose = vi.fn()
      render(
        <ResultCard
          modelId={mockModel.id}
          model={mockModel}
          messages={mockMessages}
          onClose={handleClose}
        />
      )

      const closeButton = screen.getByLabelText(/hide result/i)
      await user.click(closeButton)

      expect(handleClose).toHaveBeenCalledWith(mockModel.id)
    })

    it('should not render action buttons when callbacks are not provided', () => {
      render(<ResultCard modelId={mockModel.id} model={mockModel} messages={mockMessages} />)
      expect(screen.queryByLabelText(/copy formatted/i)).not.toBeInTheDocument()
      expect(screen.queryByLabelText(/copy raw/i)).not.toBeInTheDocument()
      expect(screen.queryByLabelText(/hide result/i)).not.toBeInTheDocument()
    })
  })

  describe('Empty States', () => {
    it('should handle empty messages array', () => {
      render(<ResultCard modelId={mockModel.id} model={mockModel} messages={[]} />)
      expect(screen.getByText(/0 chars/i)).toBeInTheDocument()
    })

    it('should display character count from latest message', () => {
      const messagesWithLongContent = [
        createMockConversationMessage({
          type: 'assistant',
          content: 'A'.repeat(500),
        }),
      ]
      render(
        <ResultCard modelId={mockModel.id} model={mockModel} messages={messagesWithLongContent} />
      )
      expect(screen.getByText(/500 chars/i)).toBeInTheDocument()
    })
  })

  describe('Custom className', () => {
    it('should apply custom className', () => {
      const { container } = render(
        <ResultCard
          modelId={mockModel.id}
          model={mockModel}
          messages={mockMessages}
          className="custom-class"
        />
      )
      const card = container.querySelector('.result-card')
      expect(card).toHaveClass('custom-class')
    })
  })
})
