import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { isVerdictPanelEnabled } from '../../../config/featureFlags'
import type { ResultsAreaProps } from '../ResultsArea'
import { ResultsArea } from '../ResultsArea'

vi.mock('../../../config/featureFlags', () => ({
  isVerdictPanelEnabled: vi.fn(),
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
  })
})
