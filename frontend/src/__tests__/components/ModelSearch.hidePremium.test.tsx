/**
 * Tests for ModelSearch hide premium models filtering
 *
 * Verifies that search results respect the hidePremiumModels filter:
 * - Unregistered users see only tier_access='unregistered' models in search
 * - Free users see tier_access='unregistered' or 'free' models in search
 * - Paid users see all models in search
 */

import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ModelSearch } from '../../components/comparison/ModelSearch'
import type { Model, ModelsByProvider, User } from '../../types'
import { createModelId } from '../../types/branded'
import { renderWithProviders, screen, waitFor } from '../utils/test-utils'

describe('ModelSearch - Hide Premium Models Filtering', () => {
  const mockModels: Model[] = [
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
      id: createModelId('gpt-4-turbo'),
      name: 'GPT-4 Turbo',
      description: 'Advanced model',
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
    {
      id: createModelId('claude-haiku'),
      name: 'Claude Haiku',
      description: 'Fast model',
      category: 'claude',
      provider: 'Anthropic',
      available: true,
      tier_access: 'free',
    },
    {
      id: createModelId('claude-opus'),
      name: 'Claude Opus',
      description: 'Premium model',
      category: 'claude',
      provider: 'Anthropic',
      available: true,
      tier_access: 'paid',
    },
  ]

  const mockModelsByProvider: ModelsByProvider = {
    OpenAI: mockModels.filter(m => m.provider === 'OpenAI'),
    Anthropic: mockModels.filter(m => m.provider === 'Anthropic'),
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
    onToggleModel: vi.fn(),
    isAuthenticated: false,
    user: null,
    maxModelsLimit: 4,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Unregistered User Search Filtering', () => {
    it('shows all matching models when hidePremiumModels is false', async () => {
      renderWithProviders(<ModelSearch {...defaultProps} hidePremiumModels={false} />)

      const input = screen.getByPlaceholderText(/Search by name or provider/i)
      await userEvent.type(input, 'GPT')

      await waitFor(() => {
        expect(screen.getByText('GPT-3.5 Turbo')).toBeInTheDocument()
        expect(screen.getByText('GPT-4 Turbo')).toBeInTheDocument()
        expect(screen.getByText('GPT-4.5')).toBeInTheDocument()
      })
    })

    it('shows only tier_access=unregistered models when hidePremiumModels is true', async () => {
      renderWithProviders(<ModelSearch {...defaultProps} hidePremiumModels={true} />)

      const input = screen.getByPlaceholderText(/Search by name or provider/i)
      await userEvent.type(input, 'GPT')

      await waitFor(() => {
        expect(screen.getByText('GPT-3.5 Turbo')).toBeInTheDocument()
      })

      expect(screen.queryByText('GPT-4 Turbo')).not.toBeInTheDocument()
      expect(screen.queryByText('GPT-4.5')).not.toBeInTheDocument()
    })

    it('filters Claude models for unregistered users', async () => {
      renderWithProviders(<ModelSearch {...defaultProps} hidePremiumModels={true} />)

      const input = screen.getByPlaceholderText(/Search by name or provider/i)
      await userEvent.type(input, 'Claude')

      // No Claude models should appear (all are free or paid tier)
      await waitFor(() => {
        const emptyMessage = screen.getByRole('status')
        expect(emptyMessage).toHaveTextContent(/No models match that search/i)
      })
    })
  })

  describe('Free User Search Filtering', () => {
    it('shows unregistered and free models when hidePremiumModels is true', async () => {
      renderWithProviders(
        <ModelSearch
          {...defaultProps}
          isAuthenticated={true}
          user={mockFreeUser}
          hidePremiumModels={true}
        />
      )

      const input = screen.getByPlaceholderText(/Search by name or provider/i)
      await userEvent.type(input, 'GPT')

      await waitFor(() => {
        expect(screen.getByText('GPT-3.5 Turbo')).toBeInTheDocument()
        expect(screen.getByText('GPT-4 Turbo')).toBeInTheDocument()
      })

      expect(screen.queryByText('GPT-4.5')).not.toBeInTheDocument()
    })

    it('shows Claude Haiku but not Claude Opus for free users', async () => {
      renderWithProviders(
        <ModelSearch
          {...defaultProps}
          isAuthenticated={true}
          user={mockFreeUser}
          hidePremiumModels={true}
        />
      )

      const input = screen.getByPlaceholderText(/Search by name or provider/i)
      await userEvent.type(input, 'Claude')

      await waitFor(() => {
        expect(screen.getByText('Claude Haiku')).toBeInTheDocument()
      })

      expect(screen.queryByText('Claude Opus')).not.toBeInTheDocument()
    })
  })

  describe('Paid User Search Filtering', () => {
    it('shows all models when hidePremiumModels is true', async () => {
      const paidUser: User = { ...mockFreeUser, subscription_tier: 'pro' }

      renderWithProviders(
        <ModelSearch
          {...defaultProps}
          isAuthenticated={true}
          user={paidUser}
          hidePremiumModels={true}
        />
      )

      const input = screen.getByPlaceholderText(/Search by name or provider/i)
      await userEvent.type(input, 'GPT')

      await waitFor(() => {
        expect(screen.getByText('GPT-3.5 Turbo')).toBeInTheDocument()
        expect(screen.getByText('GPT-4 Turbo')).toBeInTheDocument()
        expect(screen.getByText('GPT-4.5')).toBeInTheDocument()
      })
    })
  })

  describe('Trial Unlocked Models in Search', () => {
    it('shows trial_unlocked paid models even with hidePremiumModels', async () => {
      const modelsWithTrial: ModelsByProvider = {
        OpenAI: [
          {
            id: createModelId('gpt-3.5'),
            name: 'GPT-3.5',
            description: 'Basic',
            category: 'gpt',
            provider: 'OpenAI',
            available: true,
            tier_access: 'unregistered',
          },
          {
            id: createModelId('gpt-4-trial'),
            name: 'GPT-4 Trial',
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
        <ModelSearch
          {...defaultProps}
          modelsByProvider={modelsWithTrial}
          isAuthenticated={true}
          user={mockFreeUser}
          hidePremiumModels={true}
        />
      )

      const input = screen.getByPlaceholderText(/Search by name or provider/i)
      await userEvent.type(input, 'GPT')

      await waitFor(() => {
        expect(screen.getByText('GPT-3.5')).toBeInTheDocument()
        expect(screen.getByText('GPT-4 Trial')).toBeInTheDocument()
      })
    })
  })

  describe('Provider-based Search Filtering', () => {
    it('filters results by provider when searching by provider name', async () => {
      renderWithProviders(
        <ModelSearch
          {...defaultProps}
          isAuthenticated={true}
          user={mockFreeUser}
          hidePremiumModels={true}
        />
      )

      const input = screen.getByPlaceholderText(/Search by name or provider/i)
      await userEvent.type(input, 'Anthropic')

      await waitFor(() => {
        expect(screen.getByText('Claude Haiku')).toBeInTheDocument()
      })

      // Should not show paid Anthropic models
      expect(screen.queryByText('Claude Opus')).not.toBeInTheDocument()
      // Should not show OpenAI models
      expect(screen.queryByText('GPT-3.5 Turbo')).not.toBeInTheDocument()
    })
  })
})
