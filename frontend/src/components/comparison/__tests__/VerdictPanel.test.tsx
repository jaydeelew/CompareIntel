/**
 * VerdictPanel — your pick, public rating snapshot, this-run metrics.
 */
/// <reference types="@testing-library/jest-dom" />

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import {
  createMockConversationMessage,
  createMockModelConversation,
} from '../../../__tests__/utils'
import { createModelId } from '../../../types'
import { VERDICT_METHODOLOGY_PATH } from '../../../utils/verdictCopy'
import { VerdictPanel } from '../VerdictPanel'

function renderPanel(ui: ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

describe('VerdictPanel', () => {
  it('shows your pick, the top rating-site model, and cheapest/fastest pills', async () => {
    const user = userEvent.setup()
    const gpt = createModelId('openai/gpt-5')
    const cheap = createModelId('openai/gpt-4o-mini')
    const onOpenHelpMeChoose = vi.fn()
    const onPickFavorite = vi.fn()

    renderPanel(
      <VerdictPanel
        open
        onClose={vi.fn()}
        favoriteModelName="GPT-4o mini"
        onPickFavorite={onPickFavorite}
        conversations={[
          createMockModelConversation({
            modelId: gpt,
            messages: [
              createMockConversationMessage({
                type: 'user',
                content: 'Write a Python function to parse JSON',
                timestamp: '2026-01-01T00:00:00.000Z',
              }),
              createMockConversationMessage({
                type: 'assistant',
                content: 'def parse_json(text):\n    return json.loads(text)',
                timestamp: '2026-01-01T00:00:02.000Z',
                cost_usd: 0.012,
                latency_ms: 2000,
              }),
            ],
          }),
          createMockModelConversation({
            modelId: cheap,
            messages: [
              createMockConversationMessage({
                type: 'user',
                content: 'Write a Python function to parse JSON',
                timestamp: '2026-01-01T00:00:00.000Z',
              }),
              createMockConversationMessage({
                type: 'assistant',
                content: 'def parse_json(text):\n    return json.loads(text)',
                timestamp: '2026-01-01T00:00:01.000Z',
                cost_usd: 0.001,
                latency_ms: 800,
              }),
            ],
          }),
        ]}
        allModels={[
          { id: gpt, name: 'GPT-5' },
          { id: cheap, name: 'GPT-4o mini' },
        ]}
        onOpenHelpMeChoose={onOpenHelpMeChoose}
      />
    )

    const panel = screen.getByTestId('verdict-panel')
    expect(panel).toHaveAttribute('role', 'dialog')
    expect(panel.tagName).not.toBe('ASIDE')
    expect(screen.getByRole('heading', { name: 'Verdict' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Your verdict' })).toBeInTheDocument()
    expect(screen.getByTestId('verdict-current-pick')).toHaveTextContent('GPT-4o mini')
    expect(screen.queryByTestId('verdict-pick-favorite')).not.toBeInTheDocument()

    expect(screen.getByRole('heading', { name: 'Popular rating sites' })).toBeInTheDocument()
    expect(screen.getByTestId('verdict-popular-model')).toHaveTextContent('Claude Fable 5.2')
    expect(screen.getByTestId('verdict-popular-source')).toHaveTextContent(/Code Arena/i)
    expect(screen.getByTestId('verdict-popular-source')).not.toHaveTextContent(/votes/i)
    expect(screen.getByTestId('verdict-popular-asof')).toHaveTextContent('As of 2026-11-27')
    expect(screen.queryByText(/not enough votes/i)).not.toBeInTheDocument()

    expect(screen.getByText('this run, via OpenRouter')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /response time/i })).toBeInTheDocument()
    expect(screen.getByText('Cheapest here').closest('td')).toHaveTextContent('$0.0010')
    expect(screen.getByText('Fastest here').closest('td')).toHaveTextContent('800ms')
    expect(screen.getByText('List $0.38/1M')).toBeInTheDocument()

    const docsLink = screen.getByTestId('verdict-how-this-works')
    expect(docsLink).toHaveTextContent('How this works')
    expect(docsLink).toHaveAttribute('href', VERDICT_METHODOLOGY_PATH)

    const chooseLink = screen.getByTestId('verdict-help-me-choose')
    expect(chooseLink).toHaveTextContent('Best for coding')
    await user.click(chooseLink)
    expect(onOpenHelpMeChoose).toHaveBeenCalledWith({ scrollToCategoryId: 'coding' })
  })

  it('prompts to pick a favorite and scrolls via the callback when nothing is selected', async () => {
    const user = userEvent.setup()
    const onPickFavorite = vi.fn()
    const modelId = createModelId('openai/gpt-4o-mini')

    renderPanel(
      <VerdictPanel
        open
        onClose={vi.fn()}
        favoriteModelName={null}
        onPickFavorite={onPickFavorite}
        conversations={[
          createMockModelConversation({
            modelId,
            messages: [
              createMockConversationMessage({
                type: 'user',
                content: 'hello there',
                timestamp: '2026-01-01T00:00:00.000Z',
              }),
              createMockConversationMessage({
                type: 'assistant',
                content: 'Hi!',
                cost_usd: null,
                latency_ms: null,
                timestamp: '2026-01-01T00:00:00.000Z',
              }),
            ],
          }),
        ]}
        allModels={[{ id: modelId, name: 'GPT-4o mini' }]}
      />
    )

    expect(screen.queryByTestId('verdict-current-pick')).not.toBeInTheDocument()
    await user.click(screen.getByTestId('verdict-pick-favorite'))
    expect(onPickFavorite).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('verdict-popular-rating')).toHaveTextContent(
      /does not match a Help Me Choose category/i
    )
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('List $0.38/1M')).toBeInTheDocument()
    expect(screen.queryByText('Cheapest here')).not.toBeInTheDocument()
    expect(screen.queryByText('Fastest here')).not.toBeInTheDocument()
  })

  it('uses a bottom-sheet class on mobile and closes from the close control', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const modelId = createModelId('openai/gpt-5')
    renderPanel(
      <VerdictPanel
        open
        onClose={onClose}
        variant="sheet"
        favoriteModelName={null}
        onPickFavorite={vi.fn()}
        conversations={[
          createMockModelConversation({
            modelId,
            messages: [
              createMockConversationMessage({ type: 'user', content: 'hello there' }),
              createMockConversationMessage({ type: 'assistant', content: 'Hi!' }),
            ],
          }),
        ]}
        allModels={[{ id: modelId, name: 'GPT-5' }]}
      />
    )

    expect(screen.getByTestId('verdict-panel')).toHaveClass('verdict-panel--sheet')
    expect(screen.getByTestId('verdict-panel')).toHaveClass('verdict-panel--open')
    expect(screen.getByTestId('verdict-sheet-scrim')).toBeInTheDocument()
    await user.click(screen.getByTestId('verdict-close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
