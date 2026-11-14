/**
 * Mobile model-tab swipe survives streaming DOM churn (detached touch targets).
 */
/// <reference types="@testing-library/jest-dom" />

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { createMockModelConversation } from '../../../__tests__/utils'
import { RESULT_TAB, createModelId } from '../../../types'
import { ResultsDisplay } from '../ResultsDisplay'

vi.mock('../ResultCard', () => ({
  ResultCard: ({ modelId }: { modelId: string }) => (
    <div data-testid="result-card" data-model-id={modelId}>
      <p className="mobile-swipe-touch-target">Streaming body for {modelId}</p>
    </div>
  ),
}))

vi.mock('../../../hooks', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../hooks')>()
  return {
    ...actual,
    useResponsive: () => ({
      isSmallLayout: true,
      isMobileLayout: true,
      isTabletLayout: false,
      isCapabilityIconRowLayout: false,
      isWideLayout: false,
      viewportWidth: 390,
      useModalForTooltips: true,
      isTouchDevice: true,
      prefersFinePointerHover: false,
    }),
  }
})

describe('ResultsDisplay mobile tab swipe', () => {
  it('changes model tab when touchend fires after the touch target node was removed', () => {
    const gpt = createModelId('gpt-4')
    const claude = createModelId('claude-3')

    render(
      <ResultsDisplay
        conversations={[
          createMockModelConversation({ modelId: gpt, modelName: 'GPT-4' }),
          createMockModelConversation({ modelId: claude, modelName: 'Claude' }),
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
        onCloseCard={vi.fn()}
        onSwitchTab={vi.fn()}
        onBreakout={vi.fn()}
        onHideOthers={vi.fn()}
        onCopyMessage={vi.fn()}
      />
    )

    const tabs = screen.getAllByRole('tab')
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')

    const zone = document.querySelector('.results-tab-content--swipe-zone')
    expect(zone).toBeTruthy()
    const touchTarget = document.querySelector('.mobile-swipe-touch-target')
    expect(touchTarget).toBeTruthy()

    const startX = 220
    const endX = 80
    const y = 300
    const touchPoint = { clientX: startX, clientY: y }
    fireEvent.touchStart(touchTarget!, {
      touches: [touchPoint],
      targetTouches: [touchPoint],
      changedTouches: [touchPoint],
    })
    touchTarget!.remove()

    const endPoint = { clientX: endX, clientY: y }
    fireEvent.touchEnd(window, {
      touches: [],
      changedTouches: [endPoint],
    })

    expect(tabs[0]).toHaveAttribute('aria-selected', 'false')
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true')
  })
})
