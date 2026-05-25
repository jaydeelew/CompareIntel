/**
 * ResultsDisplay — RTL smoke: renders result cards grid; metadata; empty state.
 */
/// <reference types="@testing-library/jest-dom" />

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { createMockModelConversation } from '../../../__tests__/utils'
import { RESULT_TAB, createModelId } from '../../../types'
import { ResultsDisplay } from '../ResultsDisplay'

const desktopResponsive = () => ({
  isSmallLayout: false,
  isMobileLayout: false,
  isTabletLayout: false,
  isCapabilityIconRowLayout: false,
  isWideLayout: true,
  viewportWidth: 1200,
  useModalForTooltips: false,
  isTouchDevice: false,
  prefersFinePointerHover: true,
})

vi.mock('../ResultCard', () => ({
  ResultCard: ({ modelId }: { modelId: string }) => (
    <div data-testid="result-card" data-model-id={modelId} />
  ),
}))

vi.mock('../../../hooks', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../hooks')>()
  return {
    ...actual,
    useResponsive: () => desktopResponsive(),
  }
})

describe('ResultsDisplay', () => {
  it('renders one ResultCard per visible conversation on desktop grid', () => {
    const gpt = createModelId('gpt-4')
    const claude = createModelId('claude-3')
    render(
      <ResultsDisplay
        conversations={[
          createMockModelConversation({ modelId: gpt }),
          createMockModelConversation({ modelId: claude }),
        ]}
        closedCards={new Set()}
        allModels={[
          { id: gpt, name: 'GPT-4' },
          { id: claude, name: 'Claude' },
        ]}
        activeResultTabs={{
          [gpt]: RESULT_TAB.FORMATTED,
          [claude]: RESULT_TAB.FORMATTED,
        }}
        onScreenshot={vi.fn()}
        onCopyResponse={vi.fn()}
        onCloseCard={vi.fn()}
        onSwitchTab={vi.fn()}
        onBreakout={vi.fn()}
        onHideOthers={vi.fn()}
        onCopyMessage={vi.fn()}
      />
    )

    expect(document.querySelector('.results-section')).toBeInTheDocument()
    expect(document.querySelector('.results-grid')).toBeInTheDocument()
    const cards = screen.getAllByTestId('result-card')
    expect(cards).toHaveLength(2)
    expect(cards.map(c => c.getAttribute('data-model-id')).sort()).toEqual([claude, gpt].sort())
  })

  it('shows metadata summary when metadata and processingTime are provided', () => {
    render(
      <ResultsDisplay
        conversations={[createMockModelConversation()]}
        closedCards={new Set()}
        allModels={[{ id: createModelId('gpt-4'), name: 'GPT-4' }]}
        activeResultTabs={{ [createModelId('gpt-4')]: RESULT_TAB.FORMATTED }}
        metadata={{ models_completed: 2, models_failed: 1, total_tokens_used: 100 }}
        processingTime={500}
        onCloseCard={vi.fn()}
        onSwitchTab={vi.fn()}
        onBreakout={vi.fn()}
        onHideOthers={vi.fn()}
        onCopyMessage={vi.fn()}
      />
    )

    expect(screen.getByText('Models Completed:')).toBeInTheDocument()
    expect(screen.getByText('Models Failed:')).toBeInTheDocument()
    expect(screen.getByText('500ms')).toBeInTheDocument()
  })

  it('renders nothing when there are no visible conversations', () => {
    const { container } = render(
      <ResultsDisplay
        conversations={[]}
        closedCards={new Set()}
        allModels={[]}
        activeResultTabs={{}}
        onCloseCard={vi.fn()}
        onSwitchTab={vi.fn()}
        onBreakout={vi.fn()}
        onHideOthers={vi.fn()}
        onCopyMessage={vi.fn()}
      />
    )
    expect(container.firstChild).toBeNull()
  })
})
