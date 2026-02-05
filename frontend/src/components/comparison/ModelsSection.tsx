import React from 'react'

import { useResponsive } from '../../hooks'
import type { Model, ModelsByProvider, User } from '../../types'
import { formatTokenCount } from '../../utils/format'

/**
 * Props for the ModelsSection component
 */
export interface ModelsSectionProps {
  /** Models organized by provider */
  modelsByProvider: ModelsByProvider
  /** Currently selected model IDs */
  selectedModels: string[]
  /** Originally selected models (for follow-up mode) */
  originalSelectedModels: string[]
  /** Set of provider names with open dropdowns */
  openDropdowns: Set<string>
  /** All models in a flat array */
  allModels: Model[]
  /** Whether models are currently loading */
  isLoadingModels: boolean
  /** Whether in follow-up mode */
  isFollowUpMode: boolean
  /** Maximum number of models that can be selected */
  maxModelsLimit: number
  /** Whether to hide premium models */
  hidePremiumModels: boolean
  /** Whether user is authenticated */
  isAuthenticated: boolean
  /** Current user (for tier access) */
  user: User | null
  /** Ref for selected models grid */
  selectedModelsGridRef?: React.RefObject<HTMLDivElement>
  /** Callback when a provider dropdown is toggled */
  onToggleDropdown: (provider: string) => void
  /** Callback when a model is toggled */
  onToggleModel: (modelId: string) => void
  /** Callback when all models for a provider are toggled */
  onToggleAllForProvider: (provider: string) => void
  /** Callback to show an error message */
  onError: (message: string) => void
}

/**
 * ModelsSection component - renders the provider dropdowns and selected models grid
 *
 * This component handles the display and interaction of:
 * - Provider dropdown accordions with model lists
 * - Model checkboxes with tier access badges
 * - Selected models grid with remove buttons
 */
export const ModelsSection: React.FC<ModelsSectionProps> = ({
  modelsByProvider,
  selectedModels,
  originalSelectedModels,
  openDropdowns,
  allModels,
  isLoadingModels,
  isFollowUpMode,
  maxModelsLimit,
  hidePremiumModels,
  isAuthenticated,
  user,
  selectedModelsGridRef,
  onToggleDropdown,
  onToggleModel,
  onToggleAllForProvider,
  onError,
}) => {
  const { isMobileLayout: _isMobileLayout } = useResponsive()

  // Determine user tier
  const userTier = isAuthenticated ? user?.subscription_tier || 'free' : 'unregistered'
  const isPaidTier = ['starter', 'starter_plus', 'pro', 'pro_plus'].includes(userTier)

  if (isLoadingModels) {
    return <div className="loading-message">Loading available models...</div>
  }

  if (Object.keys(modelsByProvider).length === 0) {
    return (
      <div className="error-message">
        <p>No models available. Please check the server connection.</p>
      </div>
    )
  }

  return (
    <div className="models-selection-layout">
      <div className="provider-dropdowns">
        {Object.entries(modelsByProvider).map(([provider, models]) => {
          // Filter models based on hidePremiumModels toggle
          // When toggle is active, hide models that are restricted for the user's tier
          // Note: trial_unlocked models are available during the 7-day trial period
          const visibleModels = hidePremiumModels
            ? models.filter(model => {
                if (isPaidTier) return true // Paid tiers see all
                if (model.trial_unlocked) return true // Trial users see trial-unlocked models
                if (userTier === 'unregistered') {
                  return model.tier_access === 'unregistered'
                }
                // Free tier
                return model.tier_access !== 'paid'
              })
            : models

          // Skip this provider if no visible models after filtering
          if (visibleModels.length === 0) {
            return null
          }

          const hasSelectedModels = visibleModels.some(model => selectedModels.includes(model.id))

          return (
            <div
              key={provider}
              className={`provider-dropdown ${hasSelectedModels ? 'has-selected-models' : ''}`}
              data-provider-name={provider}
            >
              <button
                className="provider-header"
                onClick={() => onToggleDropdown(provider)}
                aria-expanded={openDropdowns.has(provider)}
              >
                <div className="provider-left">
                  <span className="provider-name">{provider}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {(() => {
                    const selectedCount = visibleModels.filter(model =>
                      selectedModels.includes(model.id)
                    ).length
                    return (
                      <span
                        className={`provider-count ${selectedCount > 0 ? 'has-selected' : 'empty'}`}
                      >
                        {selectedCount} of {visibleModels.length} selected
                      </span>
                    )
                  })()}
                  {(() => {
                    // Filter out unavailable models (where available === false)
                    const availableProviderModels = visibleModels.filter(
                      model => model.available !== false
                    )
                    const providerModelIds = availableProviderModels.map(model => model.id)
                    const allProviderModelsSelected =
                      providerModelIds.every(id => selectedModels.includes(id)) &&
                      providerModelIds.length > 0
                    const hasAnySelected = providerModelIds.some(id => selectedModels.includes(id))
                    const hasAnyOriginallySelected = providerModelIds.some(id =>
                      originalSelectedModels.includes(id)
                    )
                    const isDisabled =
                      (selectedModels.length >= maxModelsLimit && !hasAnySelected) ||
                      (isFollowUpMode && !hasAnySelected && !hasAnyOriginallySelected)

                    const isAnonymousOrFreeTier = !isPaidTier

                    return (
                      <div
                        className={`provider-select-all ${isDisabled ? 'disabled' : ''} ${allProviderModelsSelected ? 'all-selected' : ''}`}
                        onClick={e => {
                          e.stopPropagation()
                          if (!isDisabled) {
                            onToggleAllForProvider(provider)
                          }
                        }}
                        title={
                          isDisabled
                            ? isFollowUpMode
                              ? 'Cannot add new models during follow-up'
                              : `Cannot select more models (max ${maxModelsLimit} for your tier)`
                            : allProviderModelsSelected
                              ? `Deselect All`
                              : isAnonymousOrFreeTier
                                ? `Select all Available`
                                : `Select All`
                        }
                      >
                        ✱
                      </div>
                    )
                  })()}
                  <span className={`dropdown-arrow ${openDropdowns.has(provider) ? 'open' : ''}`}>
                    ▼
                  </span>
                </div>
              </button>

              {openDropdowns.has(provider) && (
                <div className="provider-models">
                  {visibleModels.map(model => {
                    const isSelected = selectedModels.includes(model.id)
                    const wasOriginallySelected = originalSelectedModels.includes(model.id)
                    const isUnavailable = model.available === false

                    // Determine if model is restricted based on user tier
                    // When hidePremiumModels is true, restricted models are already filtered out
                    // trial_unlocked models are available during 7-day trial period
                    let isRestricted = false
                    if (!hidePremiumModels) {
                      if (isPaidTier) {
                        // Paid tiers have access to all models
                        isRestricted = false
                      } else if (model.trial_unlocked) {
                        // Model is unlocked during trial period
                        isRestricted = false
                      } else if (userTier === 'unregistered') {
                        // Unregistered tier only has access to unregistered-tier models
                        isRestricted = model.tier_access !== 'unregistered'
                      } else if (userTier === 'free') {
                        // Free tier has access to unregistered and free-tier models
                        isRestricted = model.tier_access === 'paid'
                      }
                    }

                    const requiresUpgrade =
                      isRestricted && (userTier === 'unregistered' || userTier === 'free')

                    const isDisabled =
                      isUnavailable ||
                      isRestricted ||
                      (selectedModels.length >= maxModelsLimit && !isSelected) ||
                      (isFollowUpMode && !isSelected && !wasOriginallySelected)

                    const handleModelClick = () => {
                      if (isRestricted && requiresUpgrade) {
                        // Open upgrade modal or show upgrade message
                        onError(
                          `${model.name} is a premium model. Paid subscriptions are coming soon — stay tuned!`
                        )
                        window.scrollTo({ top: 0, behavior: 'smooth' })
                        return
                      }
                      if (!isDisabled) {
                        onToggleModel(model.id)
                      }
                    }

                    return (
                      <label
                        key={model.id}
                        className={`model-option ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''} ${isRestricted ? 'restricted' : ''}`}
                      >
                        <div className="model-info">
                          <h4>
                            <span className="model-name-tooltip-wrapper">
                              <span className="model-name-text">{model.name}</span>
                              <svg
                                className="knowledge-cutoff-icon"
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <circle cx="12" cy="12" r="10" />
                                <path d="M12 16v-4" />
                                <path d="M12 8h.01" />
                              </svg>
                              <span className="model-info-tooltip">
                                <span className="tooltip-section">
                                  <span className="tooltip-row">
                                    <span className="tooltip-label">Context window:</span>
                                    <span className="tooltip-value context-window">
                                      {formatTokenCount(model.max_input_tokens)} tokens
                                    </span>
                                  </span>
                                  <span className="tooltip-explanation">
                                    How much text this model can process at once
                                  </span>
                                </span>
                                <span className="tooltip-section">
                                  <span className="tooltip-row">
                                    <span className="tooltip-label">Knowledge cutoff:</span>
                                    {model.knowledge_cutoff ? (
                                      <span className="tooltip-value cutoff-date">
                                        {model.knowledge_cutoff}
                                      </span>
                                    ) : (
                                      <span className="tooltip-value cutoff-pending">
                                        Date pending
                                      </span>
                                    )}
                                  </span>
                                  <span className="tooltip-explanation">
                                    Latest date of this model's training data
                                  </span>
                                </span>
                              </span>
                            </span>
                            {model.trial_unlocked && (
                              <span
                                className="model-badge trial-unlocked"
                                title="Premium model unlocked during your 7-day trial!"
                              >
                                ⭐ Trial
                              </span>
                            )}
                            {isRestricted && (
                              <span
                                className="model-badge premium"
                                title={
                                  userTier === 'unregistered' && model.tier_access === 'free'
                                    ? "Click 'Sign Up' above"
                                    : 'Premium model - upgrade after registration'
                                }
                              >
                                <svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  style={{
                                    display: 'inline-block',
                                    verticalAlign: 'middle',
                                    marginRight: '0.25rem',
                                  }}
                                >
                                  <rect x="5" y="11" width="14" height="10" rx="2" ry="2" />
                                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                </svg>
                                {userTier === 'unregistered' && model.tier_access === 'free'
                                  ? 'With free registration'
                                  : 'Premium'}
                              </span>
                            )}
                            {isFollowUpMode && !isSelected && !wasOriginallySelected && (
                              <span className="model-badge not-in-conversation">
                                Not in conversation
                              </span>
                            )}
                            {isUnavailable && (
                              <span className="model-badge coming-soon">Coming Soon</span>
                            )}
                          </h4>
                          <p>{model.description}</p>
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.375rem',
                            flexShrink: 0,
                          }}
                        >
                          {model.supports_web_search && (
                            <span
                              className="web-search-indicator"
                              title="This model can access the Internet"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '16px',
                                height: '16px',
                                opacity: isSelected ? 1 : 0.6,
                                transition: 'opacity 0.2s',
                                margin: 0,
                                flexShrink: 0,
                              }}
                            >
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke={isSelected ? 'currentColor' : 'currentColor'}
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                style={{
                                  color: isSelected
                                    ? 'var(--primary-color, #007bff)'
                                    : 'var(--text-secondary, #666)',
                                  display: 'block',
                                }}
                              >
                                <circle cx="12" cy="12" r="10" />
                                <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                              </svg>
                            </span>
                          )}
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={isDisabled}
                            onChange={handleModelClick}
                            className={`model-checkbox ${isFollowUpMode && !isSelected && wasOriginallySelected ? 'follow-up-deselected' : ''}`}
                            data-testid={`model-checkbox-${model.id}`}
                            style={{
                              margin: 0,
                              width: '16px',
                              height: '16px',
                            }}
                          />
                        </div>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Selected Models Cards */}
      {selectedModels.length > 0 && (
        <div className="selected-models-section">
          <div ref={selectedModelsGridRef} className="selected-models-grid">
            {selectedModels.map(modelId => {
              const model = allModels.find(m => m.id === modelId)
              if (!model) return null

              return (
                <div key={modelId} className="selected-model-card">
                  <div className="selected-model-header">
                    <h4>{model.name}</h4>
                    <div className="selected-model-actions">
                      {model.supports_web_search && (
                        <span
                          className="web-search-indicator"
                          title="This model can access the Internet"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            opacity: 1,
                          }}
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{
                              color: 'var(--primary-color, #007bff)',
                            }}
                          >
                            <circle cx="12" cy="12" r="10" />
                            <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                          </svg>
                        </span>
                      )}
                      <button
                        className="remove-model-btn"
                        onClick={() => onToggleModel(modelId)}
                        aria-label={`Remove ${model.name}`}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  <p className="selected-model-description">{model.description}</p>
                </div>
              )
            })}
            {/* Spacer to push cards to bottom when they don't fill the space */}
            <div className="selected-models-spacer"></div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ModelsSection
