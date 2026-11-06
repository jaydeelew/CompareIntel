/**
 * Tests for ModelsSectionHeader component
 *
 * Verifies the hide premium models toggle works correctly on both desktop and mobile.
 */

import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ModelsSectionHeader } from '../../components/comparison/ModelsSectionHeader'
import type { ModelConversation, User } from '../../types'
import { renderWithProviders, screen, waitFor } from '../utils/test-utils'

// Create a mocked version that we can control
const mockUseResponsive = vi.fn()

// Mock useResponsive hook
vi.mock('../../hooks/useResponsive', () => ({
  useResponsive: () => mockUseResponsive(),
}))

describe('ModelsSectionHeader', () => {
  const mockUser: User = {
    id: 1,
    email: 'test@example.com',
    subscription_tier: 'free',
    stripe_customer_id: null,
    stripe_subscription_id: null,
    trial_ends_at: null,
    is_active: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  }

  const defaultProps = {
    selectedModels: [],
    maxModelsLimit: 4,
    isModelsHidden: false,
    isFollowUpMode: false,
    isAuthenticated: true,
    user: mockUser,
    isWideLayout: true,
    isMobileLayout: false,
    hidePremiumModels: false,
    openDropdowns: new Set<string>(),
    response: null,
    conversations: [] as ModelConversation[],
    onToggleModelsHidden: vi.fn(),
    onToggleHidePremiumModels: vi.fn(),
    onShowPremiumModelsModal: vi.fn(),
    onCollapseAllDropdowns: vi.fn(),
    onShowDisabledButtonInfo: vi.fn(),
    onClearAllModels: vi.fn(),
    onSetDefaultSelectionOverridden: vi.fn(),
    onClearConversations: vi.fn(),
    onClearResponse: vi.fn(),
    onExpandModelsSection: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    // Default to desktop mode
    mockUseResponsive.mockReturnValue({
      useModalForTooltips: false,
      isMobileLayout: false,
      isWideLayout: true,
    })
  })

  describe('Hide Premium Models Toggle', () => {
    it('renders hide premium button for free tier users', () => {
      renderWithProviders(<ModelsSectionHeader {...defaultProps} />)

      const button = screen.getByLabelText('Hide locked models')
      expect(button).toBeInTheDocument()
    })

    it('renders hide premium button for unregistered users', () => {
      renderWithProviders(
        <ModelsSectionHeader {...defaultProps} isAuthenticated={false} user={null} />
      )

      const button = screen.getByLabelText('Hide locked models')
      expect(button).toBeInTheDocument()
    })

    it('does not render hide premium button for paid tier users', () => {
      const paidUser = { ...mockUser, subscription_tier: 'pro' }
      renderWithProviders(<ModelsSectionHeader {...defaultProps} user={paidUser} />)

      expect(screen.queryByLabelText('Hide locked models')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Show locked models')).not.toBeInTheDocument()
    })

    it('toggles hide premium models on desktop', async () => {
      const onToggle = vi.fn()
      renderWithProviders(
        <ModelsSectionHeader {...defaultProps} onToggleHidePremiumModels={onToggle} />
      )

      const button = screen.getByLabelText('Hide locked models')
      await userEvent.click(button)

      expect(onToggle).toHaveBeenCalledTimes(1)
    })

    it('shows correct icon when premium models are hidden', () => {
      renderWithProviders(<ModelsSectionHeader {...defaultProps} hidePremiumModels={true} />)

      const button = screen.getByLabelText('Show locked models')
      expect(button).toBeInTheDocument()
    })
  })

  describe('Mobile Hide Premium Models Toggle', () => {
    beforeEach(() => {
      mockUseResponsive.mockReturnValue({
        useModalForTooltips: true,
        isMobileLayout: true,
        isWideLayout: false,
      })
    })

    it('renders hide premium button on mobile', () => {
      renderWithProviders(<ModelsSectionHeader {...defaultProps} isMobileLayout={true} />)

      const button = screen.getByLabelText('Hide locked models')
      expect(button).toBeInTheDocument()
    })

    it('toggles hide premium models on mobile tap', async () => {
      // Set the dismissed flag so it toggles directly without showing modal
      localStorage.setItem('premium-models-toggle-info-dismissed', 'true')

      const onToggle = vi.fn()
      const onShowModal = vi.fn()

      renderWithProviders(
        <ModelsSectionHeader
          {...defaultProps}
          isMobileLayout={true}
          onToggleHidePremiumModels={onToggle}
          onShowPremiumModelsModal={onShowModal}
        />
      )

      const button = screen.getByLabelText('Hide locked models')

      await userEvent.click(button)

      await waitFor(() => {
        expect(onToggle).toHaveBeenCalledTimes(1)
      })
      expect(onShowModal).not.toHaveBeenCalled()
    })

    it('shows info modal on mobile when not dismissed', async () => {
      const onToggle = vi.fn()
      const onShowModal = vi.fn()

      renderWithProviders(
        <ModelsSectionHeader
          {...defaultProps}
          isMobileLayout={true}
          onToggleHidePremiumModels={onToggle}
          onShowPremiumModelsModal={onShowModal}
        />
      )

      const button = screen.getByLabelText('Hide locked models')
      await userEvent.click(button)

      await waitFor(() => {
        expect(onShowModal).toHaveBeenCalledTimes(1)
      })
      expect(onToggle).not.toHaveBeenCalled()
    })

    it('toggles directly on mobile when info modal was dismissed', async () => {
      localStorage.setItem('premium-models-toggle-info-dismissed', 'true')

      const onToggle = vi.fn()
      const onShowModal = vi.fn()

      renderWithProviders(
        <ModelsSectionHeader
          {...defaultProps}
          isMobileLayout={true}
          onToggleHidePremiumModels={onToggle}
          onShowPremiumModelsModal={onShowModal}
        />
      )

      const button = screen.getByLabelText('Hide locked models')
      await userEvent.click(button)

      await waitFor(() => {
        expect(onToggle).toHaveBeenCalledTimes(1)
      })
      expect(onShowModal).not.toHaveBeenCalled()
    })

    it('button is not wrapped in clickable tooltip on mobile', () => {
      renderWithProviders(<ModelsSectionHeader {...defaultProps} isMobileLayout={true} />)

      const button = screen.getByLabelText('Hide locked models')

      const parentSpan = button.parentElement
      expect(parentSpan?.classList.contains('tooltip')).toBe(false)
    })
  })

  describe('Other Controls', () => {
    it('renders collapse all button', () => {
      renderWithProviders(<ModelsSectionHeader {...defaultProps} />)

      const button = screen.getByLabelText('Collapse all model providers')
      expect(button).toBeInTheDocument()
    })

    it('renders clear all button', () => {
      renderWithProviders(<ModelsSectionHeader {...defaultProps} />)

      const button = screen.getByLabelText('Clear all selections')
      expect(button).toBeInTheDocument()
    })

    it('renders model count indicator', () => {
      renderWithProviders(
        <ModelsSectionHeader {...defaultProps} selectedModels={['model1', 'model2']} />
      )

      expect(screen.getByText(/2 of 4 selected/)).toBeInTheDocument()
    })
  })
})
