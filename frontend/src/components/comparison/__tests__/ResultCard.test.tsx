/**
 * Tests for ResultCard component
 */
/// <reference types="@testing-library/jest-dom" />

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'

import { createMockConversationMessage } from '../../../__tests__/utils/test-factories'
import { RESULT_TAB, createModelId } from '../../../types'
import * as alignLatestUserPrompt from '../../../utils/alignLatestUserPrompt'
import { ResultCard } from '../ResultCard'

// Mock useResponsive hook
vi.mock('../../../hooks', () => ({
  useResponsive: () => ({
    isSmallLayout: false,
    isMobileLayout: false,
    isTabletLayout: false,
    isCapabilityIconRowLayout: false,
    isWideLayout: true,
    viewportWidth: 1200,
    useModalForTooltips: false,
    isTouchDevice: false,
    prefersFinePointerHover: true,
  }),
}))

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
      expect(screen.getByRole('heading', { name: /gpt-4/i })).toBeInTheDocument()
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

    it('marks a removed model as retired without hiding its messages', async () => {
      render(
        <ResultCard
          modelId={createModelId('mistralai/mistral-medium-3.1')}
          messages={mockMessages}
          retired
        />
      )
      expect(screen.getByRole('heading', { name: 'Mistral Medium 3.1' })).toBeInTheDocument()
      expect(
        screen.queryByRole('heading', { name: 'mistralai/mistral-medium-3.1' })
      ).not.toBeInTheDocument()
      expect(screen.getByText('Retired')).toBeInTheDocument()
      expect(await screen.findByText(/hi there/i, {}, { timeout: 15_000 })).toBeInTheDocument()
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

    it('should render conversation messages', async () => {
      render(<ResultCard modelId={mockModel.id} model={mockModel} messages={mockMessages} />)
      // Formatted tab uses LatexRenderer (heavy); allow render under parallel CI.
      const lazyWait = { timeout: 15_000 }
      expect(await screen.findByText(/hello/i, {}, lazyWait)).toBeInTheDocument()
      expect(await screen.findByText(/hi there/i, {}, lazyWait)).toBeInTheDocument()
    })
  })

  describe('Tabs', () => {
    it('should render Formatted and Raw tabs', () => {
      render(<ResultCard modelId={mockModel.id} model={mockModel} messages={mockMessages} />)
      expect(screen.getByRole('button', { name: /formatted/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /raw/i })).toBeInTheDocument()
    })

    it('places the swipe hint under the header and outside the response body', () => {
      render(
        <ResultCard
          modelId={mockModel.id}
          model={mockModel}
          messages={mockMessages}
          swipeHint={
            <div data-testid="results-tab-swipe-hint">Swipe or tap ‹ › to switch models</div>
          }
        />
      )
      const hint = screen.getByTestId('results-tab-swipe-hint')
      const header = document.querySelector('.result-header')
      const body = document.querySelector('.conversation-content')
      expect(header).toBeTruthy()
      expect(body).toBeTruthy()
      expect(header!.contains(hint)).toBe(false)
      expect(body!.contains(hint)).toBe(false)
      expect(header!.compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(hint.compareDocumentPosition(body!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('keeps the swipe hint out of the response body', () => {
      render(
        <ResultCard
          modelId={mockModel.id}
          model={mockModel}
          messages={mockMessages}
          swipeHint={<div data-testid="results-tab-swipe-hint">hint</div>}
        />
      )
      const hint = screen.getByTestId('results-tab-swipe-hint')
      const card = document.querySelector('.result-card')
      const body = document.querySelector('.conversation-content')
      expect(card).toBeTruthy()
      expect(body).toBeTruthy()
      expect(card!.contains(hint)).toBe(true)
      expect(body!.contains(hint)).toBe(false)
      expect(hint.compareDocumentPosition(body!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
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

  describe('follow-up prompt alignment', () => {
    const followUpMessages = [
      createMockConversationMessage({ type: 'user', content: 'First question' }),
      createMockConversationMessage({ type: 'assistant', content: 'A'.repeat(500) }),
      createMockConversationMessage({ type: 'user', content: 'Latest question' }),
      createMockConversationMessage({ type: 'assistant', content: 'Second answer' }),
    ]

    it('aligns a follow-up card and leaves it after a manual scroll', () => {
      const spy = vi
        .spyOn(alignLatestUserPrompt, 'scrollContentToLatestUserPrompt')
        .mockReturnValue(true)
      const { rerender, container } = render(
        <ResultCard modelId={mockModel.id} model={mockModel} messages={followUpMessages} />
      )
      expect(spy).toHaveBeenCalled()

      const content = container.querySelector('.conversation-content')
      expect(content).toBeTruthy()
      content?.dispatchEvent(new WheelEvent('wheel', { deltaY: 30, bubbles: true }))
      spy.mockClear()

      rerender(
        <ResultCard
          modelId={mockModel.id}
          model={mockModel}
          messages={[
            ...followUpMessages,
            createMockConversationMessage({ type: 'assistant', content: 'Still the same round' }),
          ]}
        />
      )
      expect(spy).not.toHaveBeenCalled()
      spy.mockRestore()
      alignLatestUserPrompt.clearManualCardScroll(mockModel.id)
    })

    it('restores the saved scroll instead of jumping again when the card remounts', () => {
      const spy = vi
        .spyOn(alignLatestUserPrompt, 'scrollContentToLatestUserPrompt')
        .mockReturnValue(true)
      const first = render(
        <ResultCard modelId={mockModel.id} model={mockModel} messages={followUpMessages} />
      )
      expect(spy).toHaveBeenCalled()
      const content = first.container.querySelector('.conversation-content')
      expect(content).toBeTruthy()
      if (content instanceof HTMLElement) {
        content.scrollTop = 180
        content.dispatchEvent(new Event('scroll'))
      }
      first.unmount()
      spy.mockClear()

      const second = render(
        <ResultCard modelId={mockModel.id} model={mockModel} messages={followUpMessages} />
      )
      expect(spy).not.toHaveBeenCalled()
      expect(alignLatestUserPrompt.readCardScrollSnapshot(mockModel.id, 2)).toMatchObject({
        opened: true,
        scrollTop: 180,
      })
      second.unmount()
      spy.mockRestore()
      alignLatestUserPrompt.clearManualCardScroll(mockModel.id)
    })

    it('does not align the first comparison', () => {
      const spy = vi
        .spyOn(alignLatestUserPrompt, 'scrollContentToLatestUserPrompt')
        .mockReturnValue(true)
      render(<ResultCard modelId={mockModel.id} model={mockModel} messages={mockMessages} />)
      expect(spy).not.toHaveBeenCalled()
      spy.mockRestore()
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
