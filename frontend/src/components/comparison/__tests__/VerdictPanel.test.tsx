/**
 * VerdictPanel — cost/latency highlights, agreement, Help Me Choose link.
 */
/// <reference types="@testing-library/jest-dom" />

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import {
  createMockConversationMessage,
  createMockModelConversation,
} from '../../../__tests__/utils'
import { createModelId } from '../../../types'
import { VerdictPanel } from '../VerdictPanel'

describe('VerdictPanel', () => {
  it('highlights cheapest and fastest models and shows dashes for missing values', async () => {
    const user = userEvent.setup()
    const gpt = createModelId('openai/gpt-5')
    const cheap = createModelId('openai/gpt-4o-mini')
    const onOpenHelpMeChoose = vi.fn()

    render(
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
    expect(screen.getByText('Cheapest').closest('td')).toHaveTextContent('$0.0010')
    expect(screen.getByText('Fastest').closest('td')).toHaveTextContent('800ms')

    const chooseLink = screen.getByTestId('verdict-help-me-choose')
    expect(chooseLink).toHaveTextContent('Best for coding')
    await user.click(chooseLink)
    expect(onOpenHelpMeChoose).toHaveBeenCalledWith({ scrollToCategoryId: 'coding' })
  })

  it('shows a dash when cost is missing and uses the generic Help Me Choose fallback', () => {
    const modelId = createModelId('openai/gpt-5')
    render(
      <VerdictPanel
        conversations={[
          createMockModelConversation({
            modelId,
            messages: [
              createMockConversationMessage({ type: 'user', content: 'hello there' }),
              createMockConversationMessage({
                type: 'assistant',
                content: 'Hi!',
                cost_usd: null,
                latency_ms: null,
              }),
            ],
          }),
        ]}
        allModels={[{ id: modelId, name: 'GPT-5' }]}
      />
    )

    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByTestId('verdict-agreement')).toHaveTextContent('—')
    expect(screen.getByTestId('verdict-help-me-choose')).toHaveTextContent('Help Me Choose')
    expect(screen.queryByText('Cheapest')).not.toBeInTheDocument()
    expect(screen.queryByText('Fastest')).not.toBeInTheDocument()
  })
})
