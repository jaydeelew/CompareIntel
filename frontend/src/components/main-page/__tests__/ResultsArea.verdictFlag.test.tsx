import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { createMockConversationMessage } from '../../../__tests__/utils'
import { isVerdictPanelEnabled } from '../../../config/featureFlags'
import { createModelId } from '../../../types'
import type { ResultsAreaProps } from '../ResultsArea'
import { ResultsArea } from '../ResultsArea'

vi.mock('../../../config/featureFlags', () => ({
  isVerdictPanelEnabled: vi.fn(),
}))

vi.mock('../../comparison/ResultsDisplay', () => ({
  ResultsDisplay: () => <div data-testid="results-display-stub" />,
}))

const baseProps: ResultsAreaProps = {
  conversations: [
    {
      modelId: 'openai/gpt-4o',
      modelName: 'GPT-4o',
      messages: [
        {
          id: 'm1',
          role: 'user',
          content: 'Hello',
          timestamp: new Date().toISOString(),
        },
        {
          id: 'm2',
          role: 'assistant',
          content: 'Hi there',
          timestamp: new Date().toISOString(),
        },
      ],
    },
  ],
  closedCards: new Set(),
  allModels: [{ id: 'openai/gpt-4o', name: 'GPT-4o' }],
  activeResultTabs: {},
  modelProcessingStates: {},
  modelErrorStates: {},
  breakoutPhase: 'idle',
  isScrollLocked: false,
  showExportMenu: false,
  isMobileLayout: false,
  exportMenuRef: { current: null },
  onToggleScrollLock: vi.fn(),
  onToggleExportMenu: vi.fn(),
  onExport: vi.fn(),
  onShowAllResults: vi.fn(),
  onScreenshot: vi.fn(),
  onCopyResponse: vi.fn(),
  onCloseCard: vi.fn(),
  onSwitchTab: vi.fn(),
  onBreakout: vi.fn(),
  onHideOthers: vi.fn(),
  onCopyMessage: vi.fn(),
}

describe('ResultsArea verdict feature flag', () => {
  it('does not render the verdict panel when the flag is off', () => {
    vi.mocked(isVerdictPanelEnabled).mockReturnValue(false)

    render(<ResultsArea {...baseProps} />)

    expect(screen.queryByTestId('verdict-panel')).not.toBeInTheDocument()
    expect(screen.queryByTestId('verdict-button')).not.toBeInTheDocument()
  })

  it('shows the logo button only after two models succeed and hides it in the tutorial', async () => {
    vi.mocked(isVerdictPanelEnabled).mockReturnValue(true)
    const user = userEvent.setup()
    const alpha = createModelId('openai/alpha')
    const beta = createModelId('openai/beta')
    const ready: ResultsAreaProps = {
      ...baseProps,
      allModels: [
        { id: alpha, name: 'Alpha' },
        { id: beta, name: 'Beta' },
      ],
      conversations: [alpha, beta].map(modelId => ({
        modelId,
        messages: [
          createMockConversationMessage({ type: 'user', content: 'Hello' }),
          createMockConversationMessage({ type: 'assistant', content: `${modelId} reply` }),
        ],
      })),
    }

    const view = render(
      <MemoryRouter>
        <ResultsArea {...ready} />
      </MemoryRouter>
    )
    expect(screen.getByTestId('verdict-button')).toBeInTheDocument()
    expect(screen.getByTestId('verdict-panel')).not.toHaveClass('verdict-panel--open')

    await user.click(screen.getByTestId('verdict-button'))
    expect(screen.getByTestId('verdict-panel')).toHaveClass('verdict-panel--open')

    view.rerender(
      <MemoryRouter>
        <ResultsArea {...ready} isTutorialActive />
      </MemoryRouter>
    )
    expect(screen.queryByTestId('verdict-button')).not.toBeInTheDocument()
    expect(screen.queryByTestId('verdict-panel')).not.toBeInTheDocument()
  })

  it('keeps the button hidden while a model is still running or only one succeeded', () => {
    vi.mocked(isVerdictPanelEnabled).mockReturnValue(true)
    const alpha = createModelId('openai/alpha')
    const one = {
      ...baseProps,
      conversations: [
        {
          modelId: alpha,
          messages: [
            createMockConversationMessage({ type: 'user', content: 'Hello' }),
            createMockConversationMessage({ type: 'assistant', content: 'Only one' }),
          ],
        },
      ],
    }
    const { rerender } = render(
      <MemoryRouter>
        <ResultsArea {...one} />
      </MemoryRouter>
    )
    expect(screen.queryByTestId('verdict-button')).not.toBeInTheDocument()

    rerender(
      <MemoryRouter>
        <ResultsArea
          {...one}
          isComparisonLoading
          conversations={[
            one.conversations[0],
            {
              modelId: createModelId('openai/beta'),
              messages: [
                createMockConversationMessage({ type: 'user', content: 'Hello' }),
                createMockConversationMessage({ type: 'assistant', content: 'Second' }),
              ],
            },
          ]}
        />
      </MemoryRouter>
    )
    expect(screen.queryByTestId('verdict-button')).not.toBeInTheDocument()
  })
})
