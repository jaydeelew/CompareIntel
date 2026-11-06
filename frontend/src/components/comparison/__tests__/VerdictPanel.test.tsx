/**
 * VerdictPanel — honest labels, agreement empty state, collapse, docs link.
 */
/// <reference types="@testing-library/jest-dom" />

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createMockConversationMessage,
  createMockModelConversation,
} from '../../../__tests__/utils'
import { createModelId } from '../../../types'
import { AGREEMENT_NEEDS_MODELS_TEXT, VERDICT_METHODOLOGY_PATH } from '../../../utils/verdictCopy'
import { VERDICT_PANEL_EXPANDED_KEY } from '../../../utils/verdictPanelCollapse'
import { VerdictPanel } from '../VerdictPanel'

function renderPanel(ui: ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

describe('VerdictPanel', () => {
  beforeEach(() => {
    localStorage.clear()
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 1280,
    })
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('highlights cheapest/fastest here and links to methodology', async () => {
    const user = userEvent.setup()
    const gpt = createModelId('openai/gpt-5')
    const cheap = createModelId('openai/gpt-4o-mini')
    const onOpenHelpMeChoose = vi.fn()

    renderPanel(
      <VerdictPanel
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

    expect(screen.getByTestId('verdict-panel')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Verdict' })).toBeInTheDocument()
    expect(screen.getByTestId('verdict-agreement')).toHaveTextContent('Agree')
    expect(screen.getByText(/automatic heuristic/i)).toBeInTheDocument()
    expect(screen.getByText('this run, via OpenRouter')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /response time/i })).toBeInTheDocument()
    expect(screen.getByText('Cheapest here').closest('td')).toHaveTextContent('$0.0010')
    expect(screen.getByText('Fastest here').closest('td')).toHaveTextContent('800ms')
    expect(screen.getByText('List $0.38/1M')).toBeInTheDocument()
    expect(screen.queryByText('Cheapest')).not.toBeInTheDocument()
    expect(screen.queryByText('Fastest')).not.toBeInTheDocument()

    const docsLink = screen.getByTestId('verdict-how-this-works')
    expect(docsLink).toHaveTextContent('How this works')
    expect(docsLink).toHaveAttribute('href', VERDICT_METHODOLOGY_PATH)

    const chooseLink = screen.getByTestId('verdict-help-me-choose')
    expect(chooseLink).toHaveTextContent('Best for coding')
    await user.click(chooseLink)
    expect(onOpenHelpMeChoose).toHaveBeenCalledWith({ scrollToCategoryId: 'coding' })
  })

  it('shows Needs 2+ models and explains a dash cost with list price', () => {
    const modelId = createModelId('openai/gpt-4o-mini')
    renderPanel(
      <VerdictPanel
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

    expect(screen.getByTestId('verdict-agreement')).toHaveTextContent(AGREEMENT_NEEDS_MODELS_TEXT)
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('List $0.38/1M')).toBeInTheDocument()
    expect(screen.getByTitle(/did not report a cost/i)).toHaveTextContent('—')
    expect(screen.getByTestId('verdict-help-me-choose')).toHaveTextContent('Help Me Choose')
    expect(screen.queryByText('Cheapest here')).not.toBeInTheDocument()
    expect(screen.queryByText('Fastest here')).not.toBeInTheDocument()
  })

  it('toggles collapse with aria-expanded and remembers the choice', async () => {
    const user = userEvent.setup()
    const modelId = createModelId('openai/gpt-5')
    renderPanel(
      <VerdictPanel
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

    const toggle = screen.getByTestId('verdict-toggle')
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('verdict-how-this-works')).toBeVisible()

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(localStorage.getItem(VERDICT_PANEL_EXPANDED_KEY)).toBe('false')
    expect(screen.queryByTestId('verdict-how-this-works')).not.toBeVisible()

    toggle.focus()
    await user.keyboard('{Enter}')
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(localStorage.getItem(VERDICT_PANEL_EXPANDED_KEY)).toBe('true')
  })

  it('defaults to collapsed on mobile when nothing is stored', () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 375,
    })
    const modelId = createModelId('openai/gpt-5')
    renderPanel(
      <VerdictPanel
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

    expect(screen.getByTestId('verdict-toggle')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByTestId('verdict-agreement')).toBeVisible()
    expect(screen.queryByTestId('verdict-how-this-works')).not.toBeVisible()
  })
})
