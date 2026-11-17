/// <reference types="@testing-library/jest-dom" />

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SelectionProps } from '../ComparisonFormTypes'
import { SavedSelectionsDropdown } from '../SavedSelectionsDropdown'

const mockUseResponsive = vi.fn()

vi.mock('../../../hooks', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../hooks')>()
  return {
    ...actual,
    useResponsive: () => mockUseResponsive(),
  }
})

const baseSelection: SelectionProps = {
  savedModelSelections: [],
  onSaveModelSelection: () => ({ success: true }),
  onLoadModelSelection: vi.fn(),
  onDeleteModelSelection: vi.fn(),
  onSetDefaultSelection: vi.fn(),
  getDefaultSelectionId: () => 'sel-1',
  getDefaultSelection: () => ({
    id: 'sel-1',
    name: 'Starter Selection',
    modelIds: ['model-a', 'model-b'],
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
  }),
  defaultSelectionOverridden: false,
  canSaveMoreSelections: true,
  maxSavedSelections: 5,
}

describe('SavedSelectionsDropdown default selection label tooltip', () => {
  beforeEach(() => {
    mockUseResponsive.mockReturnValue({
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
  })

  it('uses StyledTooltip for the default selection name instead of a native title', () => {
    const { container } = render(
      <SavedSelectionsDropdown
        selectionProps={baseSelection}
        selectedModels={['model-a']}
        modelsByProvider={{
          OpenAI: [
            { id: 'model-a', name: 'Model Alpha' } as never,
            { id: 'model-b', name: 'Model Beta' } as never,
          ],
        }}
        isFollowUpMode={false}
      />
    )

    const label = screen.getByText('Starter Selection')
    expect(label).toHaveClass('default-selection-name')
    expect(label).not.toHaveAttribute('title')
    expect(label).toHaveAttribute('aria-label', 'Model Alpha, Model Beta')

    const tooltipWrapper = container.querySelector('.default-selection-name-tooltip')
    expect(tooltipWrapper).toBeInTheDocument()
    expect(tooltipWrapper?.querySelector('.tooltip-content')).toHaveTextContent(
      'Model Alpha, Model Beta'
    )
  })

  it('omits StyledTooltip wrapper when composer tooltips are hidden', () => {
    const { container } = render(
      <SavedSelectionsDropdown
        selectionProps={baseSelection}
        selectedModels={['model-a']}
        modelsByProvider={{}}
        isFollowUpMode={false}
        hideTooltip
      />
    )

    expect(screen.getByText('Starter Selection')).toHaveAttribute('aria-label')
    expect(container.querySelector('.default-selection-name-tooltip')).toBeNull()
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })
})
