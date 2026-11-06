/**
 * Tests for ModelsSection default state and toggle restoration behavior
 *
 * Verifies that:
 * - Default state shows ALL models (hidePremiumModels=false)
 * - Enabling the toggle filters models
 * - Disabling the toggle restores ALL models
 * - This behavior is consistent across all user tiers
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ModelsSection } from '../../components/comparison/ModelsSection'
import type { Model, ModelsByProvider, User } from '../../types'
import { createModelId } from '../../types/branded'
import { renderWithProviders, screen } from '../utils/test-utils'

const mockUseResponsive = vi.fn()
vi.mock('../../hooks/useResponsive', () => ({
  useResponsive: () => mockUseResponsive(),
}))

describe('ModelsSection - Default State and Toggle Restoration', () => {
  const mockModels: Model[] = [
    {
      id: createModelId('gpt-3.5-turbo'),
      name: 'GPT-3.5 Turbo',
      description: 'Unregistered tier model',
      category: 'gpt',
      provider: 'OpenAI',
      available: true,
      tier_access: 'unregistered',
    },
    {
      id: createModelId('gpt-4-turbo'),
      name: 'GPT-4 Turbo',
      description: 'Free tier model',
      category: 'gpt',
      provider: 'OpenAI',
      available: true,
      tier_access: 'free',
    },
    {
      id: createModelId('gpt-4.5'),
      name: 'GPT-4.5',
      description: 'Paid tier model',
      category: 'gpt',
      provider: 'OpenAI',
      available: true,
      tier_access: 'paid',
    },
  ]

  const mockModelsByProvider: ModelsByProvider = {
    OpenAI: mockModels,
  }

  const mockFreeUser: User = {
    id: 1,
    email: 'free@example.com',
    subscription_tier: 'free',
    stripe_customer_id: null,
    stripe_subscription_id: null,
    trial_ends_at: null,
    is_active: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  }

  const defaultProps = {
    modelsByProvider: mockModelsByProvider,
    selectedModels: [],
    originalSelectedModels: [],
    openDropdowns: new Set(['OpenAI']),
    allModels: mockModels,
    isLoadingModels: false,
    isFollowUpMode: false,
    maxModelsLimit: 4,
    isAuthenticated: false,
    user: null,
    onToggleDropdown: vi.fn(),
    onToggleModel: vi.fn(),
    onToggleAllForProvider: vi.fn(),
    onError: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseResponsive.mockReturnValue({
      useModalForTooltips: false,
      isMobileLayout: false,
      isWideLayout: true,
    })
  })

  describe('Default State (Toggle OFF)', () => {
    it('shows ALL models by default for unregistered users (hidePremiumModels=false)', () => {
      renderWithProviders(
        <ModelsSection {...defaultProps} hidePremiumModels={false} isAuthenticated={false} />
      )

      // All three tier levels should be visible
      expect(screen.getByText('GPT-3.5 Turbo')).toBeInTheDocument()
      expect(screen.getByText('GPT-4 Turbo')).toBeInTheDocument()
      expect(screen.getByText('GPT-4.5')).toBeInTheDocument()
    })

    it('shows ALL models by default for free users (hidePremiumModels=false)', () => {
      renderWithProviders(
        <ModelsSection
          {...defaultProps}
          hidePremiumModels={false}
          isAuthenticated={true}
          user={mockFreeUser}
        />
      )

      // All three tier levels should be visible
      expect(screen.getByText('GPT-3.5 Turbo')).toBeInTheDocument()
      expect(screen.getByText('GPT-4 Turbo')).toBeInTheDocument()
      expect(screen.getByText('GPT-4.5')).toBeInTheDocument()
    })

    it('shows ALL models by default for paid users (hidePremiumModels=false)', () => {
      const paidUser: User = { ...mockFreeUser, subscription_tier: 'pro' }

      renderWithProviders(
        <ModelsSection
          {...defaultProps}
          hidePremiumModels={false}
          isAuthenticated={true}
          user={paidUser}
        />
      )

      // All three tier levels should be visible
      expect(screen.getByText('GPT-3.5 Turbo')).toBeInTheDocument()
      expect(screen.getByText('GPT-4 Turbo')).toBeInTheDocument()
      expect(screen.getByText('GPT-4.5')).toBeInTheDocument()
    })
  })

  describe('Toggle ON → OFF Restoration', () => {
    it('restores ALL models when toggle is turned OFF for unregistered users', () => {
      const { rerender } = renderWithProviders(
        <ModelsSection {...defaultProps} hidePremiumModels={true} isAuthenticated={false} />
      )

      // With toggle ON, only unregistered tier visible
      expect(screen.getByText('GPT-3.5 Turbo')).toBeInTheDocument()
      expect(screen.queryByText('GPT-4 Turbo')).not.toBeInTheDocument()
      expect(screen.queryByText('GPT-4.5')).not.toBeInTheDocument()

      // Turn toggle OFF - all models should restore
      rerender(<ModelsSection {...defaultProps} hidePremiumModels={false} isAuthenticated={false} />)

      expect(screen.getByText('GPT-3.5 Turbo')).toBeInTheDocument()
      expect(screen.getByText('GPT-4 Turbo')).toBeInTheDocument()
      expect(screen.getByText('GPT-4.5')).toBeInTheDocument()
    })

    it('restores ALL models when toggle is turned OFF for free users', () => {
      const { rerender } = renderWithProviders(
        <ModelsSection
          {...defaultProps}
          hidePremiumModels={true}
          isAuthenticated={true}
          user={mockFreeUser}
        />
      )

      // With toggle ON, paid tier hidden
      expect(screen.getByText('GPT-3.5 Turbo')).toBeInTheDocument()
      expect(screen.getByText('GPT-4 Turbo')).toBeInTheDocument()
      expect(screen.queryByText('GPT-4.5')).not.toBeInTheDocument()

      // Turn toggle OFF - all models should restore
      rerender(
        <ModelsSection
          {...defaultProps}
          hidePremiumModels={false}
          isAuthenticated={true}
          user={mockFreeUser}
        />
      )

      expect(screen.getByText('GPT-3.5 Turbo')).toBeInTheDocument()
      expect(screen.getByText('GPT-4 Turbo')).toBeInTheDocument()
      expect(screen.getByText('GPT-4.5')).toBeInTheDocument()
    })

    it('maintains all models visible when toggle changes for paid users', () => {
      const paidUser: User = { ...mockFreeUser, subscription_tier: 'pro' }

      const { rerender } = renderWithProviders(
        <ModelsSection
          {...defaultProps}
          hidePremiumModels={true}
          isAuthenticated={true}
          user={paidUser}
        />
      )

      // Paid users see everything even with toggle ON
      expect(screen.getByText('GPT-3.5 Turbo')).toBeInTheDocument()
      expect(screen.getByText('GPT-4 Turbo')).toBeInTheDocument()
      expect(screen.getByText('GPT-4.5')).toBeInTheDocument()

      // Turn toggle OFF - still see everything
      rerender(
        <ModelsSection
          {...defaultProps}
          hidePremiumModels={false}
          isAuthenticated={true}
          user={paidUser}
        />
      )

      expect(screen.getByText('GPT-3.5 Turbo')).toBeInTheDocument()
      expect(screen.getByText('GPT-4 Turbo')).toBeInTheDocument()
      expect(screen.getByText('GPT-4.5')).toBeInTheDocument()
    })
  })

  describe('Toggle OFF → ON → OFF Cycle', () => {
    it('correctly cycles through states for unregistered users', () => {
      const { rerender } = renderWithProviders(
        <ModelsSection {...defaultProps} hidePremiumModels={false} isAuthenticated={false} />
      )

      // Initial: all visible
      expect(screen.getByText('GPT-3.5 Turbo')).toBeInTheDocument()
      expect(screen.getByText('GPT-4 Turbo')).toBeInTheDocument()
      expect(screen.getByText('GPT-4.5')).toBeInTheDocument()

      // Turn ON: filtered
      rerender(<ModelsSection {...defaultProps} hidePremiumModels={true} isAuthenticated={false} />)
      expect(screen.getByText('GPT-3.5 Turbo')).toBeInTheDocument()
      expect(screen.queryByText('GPT-4 Turbo')).not.toBeInTheDocument()
      expect(screen.queryByText('GPT-4.5')).not.toBeInTheDocument()

      // Turn OFF again: all restored
      rerender(<ModelsSection {...defaultProps} hidePremiumModels={false} isAuthenticated={false} />)
      expect(screen.getByText('GPT-3.5 Turbo')).toBeInTheDocument()
      expect(screen.getByText('GPT-4 Turbo')).toBeInTheDocument()
      expect(screen.getByText('GPT-4.5')).toBeInTheDocument()
    })
  })
})
