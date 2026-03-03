/**
 * HelpMeChoose - Decision support dropdown for model selection
 *
 * Offers curated model recommendations by use case (coding, writing,
 * reasoning, etc.). Selecting a recommendation auto-selects the
 * appropriate models. Designed to evolve into a full decision-support
 * feature competitive with top AI comparison sites.
 */

import { useState, useRef, useEffect, useMemo } from 'react'

import { HELP_ME_CHOOSE_RECOMMENDATIONS } from '../../data/helpMeChooseRecommendations'
import type { ModelsByProvider, User } from '../../types'

function findModelById(modelsByProvider: ModelsByProvider, modelId: string) {
  for (const providerModels of Object.values(modelsByProvider)) {
    const model = providerModels.find(m => m.id === modelId)
    if (model) return model
  }
  return null
}

function isModelRestricted(
  model: { tier_access?: string; trial_unlocked?: boolean },
  userTier: string,
  isPaidTier: boolean
): boolean {
  if (isPaidTier) return false
  if (model.trial_unlocked) return false
  if (userTier === 'unregistered') return model.tier_access !== 'unregistered'
  if (userTier === 'free') return model.tier_access === 'paid'
  return false
}

function getDisabledTooltip(userTier: 'unregistered' | 'free'): string {
  if (userTier === 'unregistered') {
    return 'Sign up for a free account to unlock more models and get a 7-day trial of all premium models.'
  }
  return 'Paid tiers are coming soon — stay tuned to access all models.'
}

export interface HelpMeChooseProps {
  /** Apply selected recommendation (model IDs) */
  onApplyRecommendation: (modelIds: string[]) => void
  /** Whether the control is disabled (e.g. during loading) */
  disabled?: boolean
  /** Models by provider (for tier restriction check) */
  modelsByProvider?: ModelsByProvider
  /** Whether user is authenticated */
  isAuthenticated?: boolean
  /** Current user (for tier) */
  user?: User | null
}

export function HelpMeChoose({
  onApplyRecommendation,
  disabled = false,
  modelsByProvider = {},
  isAuthenticated = false,
  user = null,
}: HelpMeChooseProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const userTier = isAuthenticated ? user?.subscription_tier || 'free' : 'unregistered'
  const isPaidTier = ['starter', 'starter_plus', 'pro', 'pro_plus'].includes(userTier)
  const isRestrictedTier = userTier === 'unregistered' || userTier === 'free'

  const restrictedRecIds = useMemo(() => {
    if (!isRestrictedTier || isPaidTier) return new Set<string>()
    const hasAnyModels = Object.keys(modelsByProvider).length > 0
    if (!hasAnyModels) return new Set<string>() // Can't determine without model data
    const restricted = new Set<string>()
    for (const rec of HELP_ME_CHOOSE_RECOMMENDATIONS) {
      const hasAccessibleModel = rec.modelIds.some(modelId => {
        const model = findModelById(modelsByProvider, modelId)
        if (!model || model.available === false) return false
        return !isModelRestricted(model, userTier, isPaidTier)
      })
      if (!hasAccessibleModel) restricted.add(rec.id)
    }
    return restricted
  }, [modelsByProvider, userTier, isPaidTier, isRestrictedTier])

  const disabledTooltip = getDisabledTooltip(userTier as 'unregistered' | 'free')

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (!containerRef.current?.contains(target)) {
        // Don't close when clicking sibling toggles (e.g. Advanced) so both can stay open
        if ((target as Element).closest?.('.advanced-settings')) return
        setIsExpanded(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleRecommendationChange = (modelIds: string[], recId: string, checked: boolean) => {
    if (restrictedRecIds.has(recId)) return
    if (checked) {
      onApplyRecommendation(modelIds)
      setIsExpanded(false)
    }
  }

  return (
    <div
      ref={containerRef}
      className={`help-me-choose${isExpanded ? ' help-me-choose-expanded' : ''}`}
    >
      <button
        type="button"
        className="help-me-choose-toggle"
        onClick={() => setIsExpanded(!isExpanded)}
        disabled={disabled}
        aria-expanded={isExpanded}
        aria-haspopup="true"
        aria-controls="help-me-choose-content"
        title="Get model recommendations by use case"
      >
        <span className="help-me-choose-toggle-text">Help me choose</span>
        <svg
          className={`help-me-choose-chevron ${isExpanded ? 'expanded' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          <path
            d="M7 10l5 5 5-5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {isExpanded && (
        <div id="help-me-choose-content" className="help-me-choose-content" role="menu">
          <p className="help-me-choose-intro">
            Select a use case to auto-select recommended models:
          </p>
          <ul className="help-me-choose-list" role="none">
            {HELP_ME_CHOOSE_RECOMMENDATIONS.map(rec => {
              const isRestricted = restrictedRecIds.has(rec.id)
              return (
                <li key={rec.id} role="none">
                  <label
                    className={`help-me-choose-item ${isRestricted ? 'disabled restricted' : ''}`}
                    title={isRestricted ? disabledTooltip : undefined}
                  >
                    <input
                      type="checkbox"
                      className="help-me-choose-checkbox"
                      disabled={isRestricted}
                      onChange={e =>
                        handleRecommendationChange(rec.modelIds, rec.id, e.target.checked)
                      }
                      aria-label={`Apply recommendation: ${rec.label}`}
                      aria-disabled={isRestricted}
                    />
                    <span className="help-me-choose-item-text">
                      <span className="help-me-choose-item-label">
                        {rec.label}
                        {isRestricted && (
                          <span className="model-badge premium help-me-choose-premium-badge">
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden
                            >
                              <rect x="5" y="11" width="14" height="10" rx="2" ry="2" />
                              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                            Premium
                          </span>
                        )}
                      </span>
                      <span className="help-me-choose-item-desc">{rec.description}</span>
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
