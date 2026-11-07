import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import * as useResponsiveModule from '../../../hooks/useResponsive'
import { StyledTooltip } from '../StyledTooltip'

const mockUseResponsive = vi.spyOn(useResponsiveModule, 'useResponsive')

describe('StyledTooltip', () => {
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

  describe('Desktop (hover tooltip) behavior', () => {
    it('renders children and tooltip content', () => {
      render(
        <StyledTooltip text="Test tooltip">
          <button type="button">Trigger</button>
        </StyledTooltip>
      )

      expect(screen.getByRole('button', { name: 'Trigger' })).toBeInTheDocument()
      // Tooltip content exists in DOM but is visually hidden via CSS
      expect(screen.getByRole('tooltip')).toBeInTheDocument()
      expect(screen.getByText('Test tooltip')).toBeInTheDocument()
    })

    it('tooltip is wrapped in a span with tooltip class', () => {
      const { container } = render(
        <StyledTooltip text="Test tooltip">
          <button type="button">Trigger</button>
        </StyledTooltip>
      )

      const tooltipWrapper = container.querySelector('.tooltip')
      expect(tooltipWrapper).toBeInTheDocument()
      const tooltipContent = container.querySelector('.tooltip-content')
      expect(tooltipContent).toBeInTheDocument()
    })
  })

  describe('Mobile/tablet (modal) behavior', () => {
    beforeEach(() => {
      mockUseResponsive.mockReturnValue({
        isSmallLayout: false,
        isMobileLayout: true,
        isTabletLayout: false,
        isCapabilityIconRowLayout: false,
        isWideLayout: false,
        viewportWidth: 375,
        useModalForTooltips: true,
        isTouchDevice: true,
        prefersFinePointerHover: false,
      })
    })

    it('does NOT render tooltip role element when useModalForTooltips is true', () => {
      render(
        <StyledTooltip text="Test tooltip">
          <button type="button">Trigger</button>
        </StyledTooltip>
      )

      // The trigger button should exist
      expect(screen.getByRole('button', { name: 'Trigger' })).toBeInTheDocument()
      // The tooltip content with role="tooltip" should NOT exist in DOM
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
      // The text should also not be in the document (not rendered)
      expect(screen.queryByText('Test tooltip')).not.toBeInTheDocument()
    })

    it('shows modal when trigger is clicked', async () => {
      const user = userEvent.setup()

      render(
        <StyledTooltip text="Test tooltip content">
          <button type="button">Info</button>
        </StyledTooltip>
      )

      const trigger = screen.getByRole('button', { name: 'Info' })
      await user.click(trigger)

      // Modal should appear
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
        expect(screen.getByText('Test tooltip content')).toBeInTheDocument()
      })
    })

    it('closes modal when close button is clicked', async () => {
      const user = userEvent.setup()

      render(
        <StyledTooltip text="Test tooltip content">
          <button type="button">Info</button>
        </StyledTooltip>
      )

      // Open modal
      await user.click(screen.getByRole('button', { name: 'Info' }))
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })

      // Close modal
      const closeButton = screen.getByRole('button', { name: 'Close' })
      await user.click(closeButton)

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })
    })

    it('closes modal when Got it button is clicked', async () => {
      const user = userEvent.setup()

      render(
        <StyledTooltip text="Test tooltip content">
          <button type="button">Info</button>
        </StyledTooltip>
      )

      // Open modal
      await user.click(screen.getByRole('button', { name: 'Info' }))
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })

      // Click "Got it" button
      const gotItButton = screen.getByRole('button', { name: 'Got it' })
      await user.click(gotItButton)

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })
    })

    it('closes modal when Escape key is pressed', async () => {
      const user = userEvent.setup()

      render(
        <StyledTooltip text="Test tooltip content">
          <button type="button">Info</button>
        </StyledTooltip>
      )

      // Open modal
      await user.click(screen.getByRole('button', { name: 'Info' }))
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })

      // Press Escape
      await user.keyboard('{Escape}')

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })
    })
  })

  describe('Portaled tooltip behavior', () => {
    it('renders portal tooltip on hover when usePortal is true', () => {
      const { container } = render(
        <StyledTooltip text="Portal tooltip" usePortal={true}>
          <button type="button">Trigger</button>
        </StyledTooltip>
      )

      // Portal anchor should exist
      const anchor = container.querySelector('.tooltip--portal-anchor')
      expect(anchor).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('preserves aria-label on wrapped button', () => {
      render(
        <StyledTooltip text="Tooltip text">
          <button type="button" aria-label="Custom label">
            Icon
          </button>
        </StyledTooltip>
      )

      expect(screen.getByRole('button', { name: 'Custom label' })).toBeInTheDocument()
    })

    it('modal has proper ARIA attributes', async () => {
      const user = userEvent.setup()

      mockUseResponsive.mockReturnValue({
        isSmallLayout: false,
        isMobileLayout: true,
        isTabletLayout: false,
        isCapabilityIconRowLayout: false,
        isWideLayout: false,
        viewportWidth: 375,
        useModalForTooltips: true,
        isTouchDevice: true,
        prefersFinePointerHover: false,
      })

      render(
        <StyledTooltip text="Test content">
          <button type="button">Info</button>
        </StyledTooltip>
      )

      await user.click(screen.getByRole('button', { name: 'Info' }))

      await waitFor(() => {
        const dialog = screen.getByRole('dialog')
        expect(dialog).toHaveAttribute('aria-modal', 'true')
      })
    })
  })

  describe('Regression: no floating tooltip on mobile alongside modal', () => {
    it('ensures tooltip span with role="tooltip" is not rendered when useModalForTooltips is true', () => {
      mockUseResponsive.mockReturnValue({
        isSmallLayout: false,
        isMobileLayout: true,
        isTabletLayout: false,
        isCapabilityIconRowLayout: false,
        isWideLayout: false,
        viewportWidth: 768,
        useModalForTooltips: true,
        isTouchDevice: true,
        prefersFinePointerHover: false,
      })

      const { container } = render(
        <StyledTooltip text="Should not appear as tooltip">
          <button type="button" aria-label="Info icon">
            i
          </button>
        </StyledTooltip>
      )

      // Verify no tooltip content in DOM
      const tooltipContent = container.querySelectorAll('[role="tooltip"]')
      expect(tooltipContent).toHaveLength(0)

      // Verify no tooltip-content class
      const tooltipByClass = container.querySelector('.tooltip-content')
      expect(tooltipByClass).not.toBeInTheDocument()
    })
  })
})
