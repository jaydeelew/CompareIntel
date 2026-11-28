/**
 * Favorite controls on successful result cards.
 */
/// <reference types="@testing-library/jest-dom" />

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import {
  createMockConversationMessage,
  createMockModelConversation,
} from '../../../__tests__/utils'
import { createModelId } from '../../../types'
import {
  successfulVerdictModelIds,
  toggleFavorite,
  verdictControlsVisible,
} from '../../../utils/verdictSession'
import { ResultCard } from '../ResultCard'

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

const alpha = createModelId('openai/alpha')
const beta = createModelId('openai/beta')
const failed = createModelId('openai/failed')

function cards() {
  return [
    createMockModelConversation({
      modelId: alpha,
      messages: [
        createMockConversationMessage({ type: 'user', content: 'Write python' }),
        createMockConversationMessage({ type: 'assistant', content: 'Alpha answer' }),
      ],
    }),
    createMockModelConversation({
      modelId: beta,
      messages: [
        createMockConversationMessage({ type: 'user', content: 'Write python' }),
        createMockConversationMessage({ type: 'assistant', content: 'Beta answer' }),
      ],
    }),
    createMockModelConversation({
      modelId: failed,
      messages: [
        createMockConversationMessage({ type: 'user', content: 'Write python' }),
        createMockConversationMessage({ type: 'assistant', content: 'Error: Model not available' }),
      ],
    }),
  ]
}

function FavoriteCards({
  tutorial = false,
  successCount,
}: {
  tutorial?: boolean
  successCount?: number
}) {
  const conversations = cards()
  const errorStates = { [failed]: true }
  const successes = successfulVerdictModelIds(conversations, errorStates)
  const show = verdictControlsVisible({
    enabled: true,
    tutorialActive: tutorial,
    finished: true,
    successCount: successCount ?? successes.length,
  })
  const visible = new Set(show ? successes : [])
  const [favorite, setFavorite] = useState<string | null>(null)

  return (
    <div>
      {conversations.map(conversation => (
        <ResultCard
          key={conversation.modelId}
          modelId={conversation.modelId}
          model={{ id: conversation.modelId, name: conversation.modelId }}
          messages={conversation.messages}
          isError={errorStates[conversation.modelId] === true}
          isTutorialActive={tutorial}
          showFavorite={visible.has(conversation.modelId)}
          favoriteSelected={favorite === conversation.modelId}
          onToggleFavorite={() =>
            setFavorite(current => toggleFavorite(current, conversation.modelId))
          }
          onCopyResponse={vi.fn()}
        />
      ))}
    </div>
  )
}

describe('favorite buttons', () => {
  it('shows a single-select control only on successful cards when two succeeded', async () => {
    const user = userEvent.setup()
    render(<FavoriteCards />)

    const buttons = screen.getAllByTestId('favorite-button')
    expect(buttons).toHaveLength(2)
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'false')

    await user.click(buttons[0])
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'true')
    expect(buttons[1]).toHaveAttribute('aria-pressed', 'false')

    await user.click(buttons[1])
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'false')
    expect(buttons[1]).toHaveAttribute('aria-pressed', 'true')

    await user.click(buttons[1])
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'false')
    expect(buttons[1]).toHaveAttribute('aria-pressed', 'false')
  })

  it('hides favorites when fewer than two models succeeded or the tutorial is active', () => {
    const { rerender } = render(<FavoriteCards successCount={1} />)
    expect(screen.queryByTestId('favorite-button')).not.toBeInTheDocument()

    rerender(<FavoriteCards tutorial />)
    expect(screen.queryByTestId('favorite-button')).not.toBeInTheDocument()
  })
})
