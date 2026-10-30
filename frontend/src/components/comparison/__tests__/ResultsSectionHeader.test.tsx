/**
 * Results header Share action.
 */
/// <reference types="@testing-library/jest-dom" />

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { ResultsSectionHeader } from '../ResultsSectionHeader'

describe('ResultsSectionHeader share action', () => {
  it('calls onShare when Share is clicked on a completed comparison', async () => {
    const user = userEvent.setup()
    const onShare = vi.fn()

    render(
      <ResultsSectionHeader
        conversationsCount={1}
        isScrollLocked={false}
        onToggleScrollLock={vi.fn()}
        showExportMenu={false}
        onToggleExportMenu={vi.fn()}
        exportMenuRef={createRef<HTMLDivElement>()}
        onExport={vi.fn()}
        closedCardsCount={0}
        onShowAllResults={vi.fn()}
        isMobileLayout={false}
        onShare={onShare}
        canShare={true}
      />
    )

    await user.click(screen.getByTestId('share-comparison-button'))
    expect(onShare).toHaveBeenCalledTimes(1)
  })

  it('does not call onShare when the comparison is still running', async () => {
    const user = userEvent.setup()
    const onShare = vi.fn()

    render(
      <ResultsSectionHeader
        conversationsCount={1}
        isScrollLocked={false}
        onToggleScrollLock={vi.fn()}
        showExportMenu={false}
        onToggleExportMenu={vi.fn()}
        exportMenuRef={createRef<HTMLDivElement>()}
        onExport={vi.fn()}
        closedCardsCount={0}
        onShowAllResults={vi.fn()}
        isMobileLayout={false}
        onShare={onShare}
        canShare={false}
      />
    )

    await user.click(screen.getByTestId('share-comparison-button'))
    expect(onShare).not.toHaveBeenCalled()
  })
})
