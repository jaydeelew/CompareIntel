/**
 * Tests for ModelsSection hide premium models filtering
 *
 * Verifies that when hidePremiumModels is enabled:
 * - Unregistered users see only models with tier_access='unregistered'
 * - Free users see models with tier_access='unregistered' or 'free'
 * - Paid users see all models (but toggle is hidden for them)
 * - Providers with no available models are hidden entirely
 * - Provider counts match visible models
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ModelsSection } from '../../components/comparison/ModelsSection'
import type { Model, ModelsByProvider, User } from '../../types'
import { createModelId } from '../../types/branded'
import { renderWithProviders, screen } from '../utils/test-utils'

// Mock useResponsive hook
const mockUseResponsive = vi.fn()
vi.mock('../../hooks/useResponsive', () => ({
  useResponsive: () => mockUseResponsive(),
}))

describe('ModelsSection - Hide Premium Models Filtering', () => {
  const mockUnregisteredModels: Model[] = [
    {
      id: createModelId('gpt-3.5-turbo'),
      name: 'GPT-3.5 Turbo',
      description: 'Fast and efficient',
      category: 'gpt',
      provider: 'OpenAI',
      available: true,
      tier_access: 'unregistered',
    },
    {
      id: createModelId('gpt-4-turbo'),
      name: 'GPT-4 Turbo',
      description: 'Advanced reasoning',
      category: 'gpt',
      provider: 'OpenAI',
      available: true,
      tier_access: 'free',
    },
    {
      id: createModelId('gpt-4.5'),
      name: 'GPT-4.5',
      description: 'Premium model',
      category: 'gpt',
      provider: 'OpenAI',
      available: true,
      tier_access: 'paid',
    },
  ]

  const mockAnthropicModels: Model[] = [
    {
      id: createModelId('claude-haiku'),
      name: 'Claude Haiku 4.5',
      description: 'Fast model',
      category: 'claude',
      provider: 'Anthropic',
      available: true,
      tier_access: 'free',
    },
    {
      id: createModelId('claude-opus'),
      name: 'Claude Opus 4.6',
      description: 'Premium model',
      category: 'claude',
      provider: 'Anthropic',
      available: true,
      tier_access: 'paid',
    },
  ]

  const mockGoogleModels: Model[] = [
    {
      id: createModelId('gemini-flash'),
      name: 'Gemini Flash',
      description: 'Fast model',
      category: 'gemini',
      provider: 'Google',
      available: true,
      tier_access: 'unregistered',
    },
  ]

  const mockModelsByProvider: ModelsByProvider = {
    OpenAI: mockUnregisteredModels,
    Anthropic: mockAnthropicModels,
    Google: mockGoogleModels,
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
    openDropdowns: new Set<string>(),
    allModels: [...mockUnregisteredModels, ...mockAnthropicModels, ...mockGoogleModels],
    isLoadingModels: false,
    isFollowUpMode: false,
    maxModelsLimit: 4,
    hidePremiumModels: false,
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

  describe('Unregistered User Filtering', () => {
    it('shows all models when hidePremiumModels is false', () => {
      renderWithProviders(
        <ModelsSection
          {...defaultProps}
          isAuthenticated={false}
          user={null}
          openDropdowns={new Set(['OpenAI', 'Anthropic'])}
        />
      )

      expect(screen.getByText('GPT-3.5 Turbo')).toBeInTheDocument()
      expect(screen.getByText('GPT-4 Turbo')).toBeInTheDocument()
      expect(screen.getByText('GPT-4.5')).toBeInTheDocument()
      expect(screen.getByText('Claude Haiku 4.5')).toBeInTheDocument()
      expect(screen.getByText('Claude Opus 4.6')).toBeInTheDocument()
    })

    it('shows only tier_access=unregistered models when hidePremiumModels is true', () => {
      renderWithProviders(
        <ModelsSection
          {...defaultProps}
          isAuthenticated={false}
          user={null}
          hidePremiumModels={true}
          openDropdowns={new Set(['OpenAI', 'Google'])}
        />
      )

      // Should show unregistered models
      expect(screen.getByText('GPT-3.5 Turbo')).toBeInTheDocument()
      expect(screen.getByText('Gemini Flash')).toBeInTheDocument()

      // Should NOT show free or paid models
      expect(screen.queryByText('GPT-4 Turbo')).not.toBeInTheDocument()
      expect(screen.queryByText('GPT-4.5')).not.toBeInTheDocument()
      expect(screen.queryByText('Claude Haiku 4.5')).not.toBeInTheDocument()
      expect(screen.queryByText('Claude Opus 4.6')).not.toBeInTheDocument()
    })

    it('hides providers with no available models for unregistered users', () => {
      renderWithProviders(
        <ModelsSection
          {...defaultProps}
          isAuthenticated={false}
          user={null}
          hidePremiumModels={true}
        />
      )

      // OpenAI and Google should show (have unregistered models)
      expect(screen.getByText('OpenAI')).toBeInTheDocument()
      expect(screen.getByText('Google')).toBeInTheDocument()

      // Anthropic should be hidden (only has free and paid models)
      expect(screen.queryByText('Anthropic')).not.toBeInTheDocument()
    })

    it('updates provider counts to match visible models', () => {
      const { container } = renderWithProviders(
        <ModelsSection
          {...defaultProps}
          isAuthenticated={false}
          user={null}
          hidePremiumModels={true}
          openDropdowns={new Set(['OpenAI'])}
        />
      )

      // OpenAI should show "0 of 1 selected" (only 1 visible model: GPT-3.5 Turbo)
      const openAIHeader = container.querySelector('[data-provider-name="OpenAI"]')
      expect(openAIHeader).toBeInTheDocument()
      expect(openAIHeader?.textContent).toContain('0 of 1 selected')
    })
  })

  describe('Free User Filtering', () => {
    it('shows all models when hidePremiumModels is false', () => {
      renderWithProviders(
        <ModelsSection
          {...defaultProps}
          isAuthenticated={true}
          user={mockFreeUser}
          openDropdowns={new Set(['OpenAI', 'Anthropic'])}
        />
      )

      expect(screen.getByText('GPT-3.5 Turbo')).toBeInTheDocument()
      expect(screen.getByText('GPT-4 Turbo')).toBeInTheDocument()
      expect(screen.getByText('GPT-4.5')).toBeInTheDocument()
      expect(screen.getByText('Claude Haiku 4.5')).toBeInTheDocument()
      expect(screen.getByText('Claude Opus 4.6')).toBeInTheDocument()
    })

    it('hides only tier_access=paid models when hidePremiumModels is true', () => {
      renderWithProviders(
        <ModelsSection
          {...defaultProps}
          isAuthenticated={true}
          user={mockFreeUser}
          hidePremiumModels={true}
          openDropdowns={new Set(['OpenAI', 'Anthropic', 'Google'])}
        />
      )

      // Should show unregistered and free models
      expect(screen.getByText('GPT-3.5 Turbo')).toBeInTheDocument()
      expect(screen.getByText('GPT-4 Turbo')).toBeInTheDocument()
      expect(screen.getByText('Claude Haiku 4.5')).toBeInTheDocument()
      expect(screen.getByText('Gemini Flash')).toBeInTheDocument()

      // Should NOT show paid models
      expect(screen.queryByText('GPT-4.5')).not.toBeInTheDocument()
      expect(screen.queryByText('Claude Opus 4.6')).not.toBeInTheDocument()
    })

    it('updates provider counts correctly for free users', () => {
      const { container } = renderWithProviders(
        <ModelsSection
          {...defaultProps}
          isAuthenticated={true}
          user={mockFreeUser}
          hidePremiumModels={true}
          openDropdowns={new Set(['OpenAI', 'Anthropic'])}
        />
      )

      // OpenAI should show "0 of 2 selected" (GPT-3.5 and GPT-4 Turbo visible)
      const openAIHeader = container.querySelector('[data-provider-name="OpenAI"]')
      expect(openAIHeader?.textContent).toContain('0 of 2 selected')

      // Anthropic should show "0 of 1 selected" (only Claude Haiku visible)
      const anthropicHeader = container.querySelector('[data-provider-name="Anthropic"]')
      expect(anthropicHeader?.textContent).toContain('0 of 1 selected')
    })
  })

  describe('Paid User Behavior', () => {
    it('shows all models regardless of hidePremiumModels setting', () => {
      const paidUser: User = { ...mockFreeUser, subscription_tier: 'pro' }

      const { rerender } = renderWithProviders(
        <ModelsSection
          {...defaultProps}
          isAuthenticated={true}
          user={paidUser}
          openDropdowns={new Set(['OpenAI'])}
        />
      )

      expect(screen.getByText('GPT-3.5 Turbo')).toBeInTheDocument()
      expect(screen.getByText('GPT-4 Turbo')).toBeInTheDocument()
      expect(screen.getByText('GPT-4.5')).toBeInTheDocument()

      // Rerender with hidePremiumModels=true
      rerender(
        <ModelsSection
          {...defaultProps}
          isAuthenticated={true}
          user={paidUser}
          hidePremiumModels={true}
          openDropdowns={new Set(['OpenAI'])}
        />
      )

      // All models should still be visible
      expect(screen.getByText('GPT-3.5 Turbo')).toBeInTheDocument()
      expect(screen.getByText('GPT-4 Turbo')).toBeInTheDocument()
      expect(screen.getByText('GPT-4.5')).toBeInTheDocument()
    })
  })

  describe('Trial Unlocked Models', () => {
    it('shows trial_unlocked models even when they are paid tier', () => {
      const modelsWithTrial: ModelsByProvider = {
        OpenAI: [
          {
            id: createModelId('gpt-3.5-turbo'),
            name: 'GPT-3.5 Turbo',
            description: 'Fast model',
            category: 'gpt',
            provider: 'OpenAI',
            available: true,
            tier_access: 'unregistered',
          },
          {
            id: createModelId('gpt-4-premium'),
            name: 'GPT-4 Premium',
            description: 'Trial unlocked',
            category: 'gpt',
            provider: 'OpenAI',
            available: true,
            tier_access: 'paid',
            trial_unlocked: true,
          },
        ],
      }

      renderWithProviders(
        <ModelsSection
          {...defaultProps}
          modelsByProvider={modelsWithTrial}
          allModels={modelsWithTrial.OpenAI}
          isAuthenticated={true}
          user={mockFreeUser}
          hidePremiumModels={true}
          openDropdowns={new Set(['OpenAI'])}
        />
      )

      // Both models should be visible (unregistered + trial unlocked)
      expect(screen.getByText('GPT-3.5 Turbo')).toBeInTheDocument()
      expect(screen.getByText('GPT-4 Premium')).toBeInTheDocument()
    })
  })

  describe('Empty Provider Hiding', () => {
    it('hides all providers when unregistered user has hidePremiumModels and no unregistered models exist', () => {
      const onlyPaidModels: ModelsByProvider = {
        OpenAI: [
          {
            id: createModelId('gpt-4'),
            name: 'GPT-4',
            description: 'Premium',
            category: 'gpt',
            provider: 'OpenAI',
            available: true,
            tier_access: 'paid',
          },
        ],
        Anthropic: [
          {
            id: createModelId('claude-opus'),
            name: 'Claude Opus',
            description: 'Premium',
            category: 'claude',
            provider: 'Anthropic',
            available: true,
            tier_access: 'paid',
          },
        ],
      }

      const { container } = renderWithProviders(
        <ModelsSection
          {...defaultProps}
          modelsByProvider={onlyPaidModels}
          allModels={[...onlyPaidModels.OpenAI, ...onlyPaidModels.Anthropic]}
          isAuthenticated={false}
          user={null}
          hidePremiumModels={true}
        />
      )

      // No providers should be visible
      expect(screen.queryByText('OpenAI')).not.toBeInTheDocument()
      expect(screen.queryByText('Anthropic')).not.toBeInTheDocument()

      // Provider dropdowns container should be empty
      const providersContainer = container.querySelector('.provider-dropdowns')
      expect(providersContainer?.children.length).toBe(0)
    })
  })
})
