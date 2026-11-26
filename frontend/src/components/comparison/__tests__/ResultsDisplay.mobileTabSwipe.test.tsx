/**
 * Mobile model-tab swipe survives streaming DOM churn (detached touch targets).
 */
/// <reference types="@testing-library/jest-dom" />

import { fireEvent, render, screen } from '@testing-library/react'
import type React from 'react'
import { describe, expect, it, vi } from 'vitest'

import { createMockModelConversation } from '../../../__tests__/utils'
import { RESULT_TAB, createModelId } from '../../../types'
import { ResultsDisplay } from '../ResultsDisplay'

vi.mock('../ResultCard', () => ({
  ResultCard: ({ modelId, swipeHint }: { modelId: string; swipeHint?: React.ReactNode }) => (
    <div data-testid="result-card" className="result-card" data-model-id={modelId}>
      <div className="result-header">header</div>
      {swipeHint}
      <div className="conversation-content">
        <p className="mobile-swipe-touch-target">Streaming body for {modelId}</p>
        <pre className="code-block" data-testid={`code-${modelId}`}>
          <code>wide code</code>
        </pre>
      </div>
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

  it('changes model tab when streaming drops changedTouches and only touchmove remains', () => {
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
    const touchTarget = document.querySelector('.mobile-swipe-touch-target')
    const start = { clientX: 280, clientY: 300 }
    fireEvent.touchStart(touchTarget!, {
      touches: [start],
      targetTouches: [start],
      changedTouches: [start],
    })
    const moved = { clientX: 90, clientY: 304 }
    fireEvent.touchMove(window, {
      touches: [moved],
      targetTouches: [moved],
      changedTouches: [moved],
    })
    touchTarget!.remove()
    fireEvent.touchEnd(window, {
      touches: [],
      changedTouches: [],
    })

    expect(tabs[0]).toHaveAttribute('aria-selected', 'false')
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true')
  })

  it('does not switch models when the swipe starts on horizontally scrolling code', () => {
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
    const code = document.querySelector(`[data-testid="code-${gpt}"]`) as HTMLElement
    code.style.overflowX = 'auto'
    Object.defineProperty(code, 'clientWidth', { configurable: true, value: 160 })
    Object.defineProperty(code, 'scrollWidth', { configurable: true, value: 720 })

    const start = { clientX: 300, clientY: 240 }
    fireEvent.touchStart(code, {
      touches: [start],
      targetTouches: [start],
      changedTouches: [start],
    })
    const end = { clientX: 40, clientY: 244 }
    fireEvent.touchEnd(code, {
      touches: [],
      changedTouches: [end],
    })

    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false')
  })

  it('pins the tutorial swipe hint under the header and outside the response', () => {
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
        isTutorialActive
        onCloseCard={vi.fn()}
        onSwitchTab={vi.fn()}
        onBreakout={vi.fn()}
        onHideOthers={vi.fn()}
        onCopyMessage={vi.fn()}
      />
    )

    const hint = screen.getByTestId('results-tab-swipe-hint')
    expect(hint).toHaveTextContent('Swipe or tap ‹ › to switch models')
    const body = document.querySelector('.conversation-content')
    const header = document.querySelector('.result-header')
    expect(body).toBeTruthy()
    expect(header).toBeTruthy()
    expect(body!.contains(hint)).toBe(false)
    expect(header!.compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(hint.compareDocumentPosition(body!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('switches models from the bottom arrows and stops at the ends', () => {
    const gpt = createModelId('gpt-4')
    const claude = createModelId('claude-3')
    const gemini = createModelId('gemini')

    render(
      <ResultsDisplay
        conversations={[
          createMockModelConversation({ modelId: gpt, modelName: 'GPT-4' }),
          createMockModelConversation({ modelId: claude, modelName: 'Claude' }),
          createMockModelConversation({ modelId: gemini, modelName: 'Gemini' }),
        ]}
        closedCards={new Set()}
        allModels={[
          { id: gpt, name: 'GPT-4' },
          { id: claude, name: 'Claude' },
          { id: gemini, name: 'Gemini' },
        ]}
        activeResultTabs={{
          [gpt]: RESULT_TAB.FORMATTED,
          [claude]: RESULT_TAB.FORMATTED,
          [gemini]: RESULT_TAB.FORMATTED,
        }}
        onCloseCard={vi.fn()}
        onSwitchTab={vi.fn()}
        onBreakout={vi.fn()}
        onHideOthers={vi.fn()}
        onCopyMessage={vi.fn()}
      />
    )

    const previous = screen.getByRole('button', { name: 'Previous model' })
    const next = screen.getByRole('button', { name: 'Next model' })
    const pager = screen.getByTestId('results-model-pager')
    const card = screen.getByTestId('result-card')
    const shell = document.querySelector('.results-tabs-container')
    const chips = document.querySelector('.results-tabs-header')
    expect(previous).toBeDisabled()
    expect(next).toBeEnabled()
    expect(pager).toHaveTextContent('1 / 3')
    expect(card.contains(pager)).toBe(false)
    expect(shell?.contains(pager)).toBe(true)
    expect(shell?.contains(chips)).toBe(true)
    expect(shell?.contains(card)).toBe(true)
    expect(card.compareDocumentPosition(pager) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    fireEvent.click(next)
    expect(screen.getAllByRole('tab')[1]).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('results-model-pager')).toHaveTextContent('2 / 3')
    expect(screen.getByRole('button', { name: 'Previous model' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: 'Next model' }))
    expect(screen.getAllByRole('tab')[2]).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: 'Next model' })).toBeDisabled()
    expect(screen.getByTestId('results-model-pager')).toHaveTextContent('3 / 3')
  })

  it('hides the model pager when only one model is showing', () => {
    const gpt = createModelId('gpt-4')
    render(
      <ResultsDisplay
        conversations={[createMockModelConversation({ modelId: gpt, modelName: 'GPT-4' })]}
        closedCards={new Set()}
        allModels={[{ id: gpt, name: 'GPT-4' }]}
        activeResultTabs={{ [gpt]: RESULT_TAB.FORMATTED }}
        onCloseCard={vi.fn()}
        onSwitchTab={vi.fn()}
        onBreakout={vi.fn()}
        onHideOthers={vi.fn()}
        onCopyMessage={vi.fn()}
      />
    )
    expect(screen.queryByRole('button', { name: 'Previous model' })).toBeNull()
  })
})
