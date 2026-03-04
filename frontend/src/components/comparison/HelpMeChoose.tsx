/**
 * HelpMeChoose - Decision support dropdown for model selection
 *
 * Displays categories horizontally. Each category lists models ordered
 * best-to-worst with evidence tooltips. Selections apply immediately,
 * same as the main Select Models to Compare section.
 */

import { useState, useRef, useEffect, useMemo, type RefObject } from 'react'

import {
  HELP_ME_CHOOSE_CATEGORIES,
  type HelpMeChooseCategory,
} from '../../data/helpMeChooseRecommendations'
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
  /** Toggle model selection (same as main model selection - applies immediately) */
  onToggleModel: (modelId: string) => void
  /** Whether the control is disabled (e.g. during loading) */
  disabled?: boolean
  /** Models by provider (for tier restriction check) */
  modelsByProvider?: ModelsByProvider
  /** Whether user is authenticated */
  isAuthenticated?: boolean
  /** Current user (for tier) */
  user?: User | null
  /** Current models selected in the comparison */
  selectedModels?: string[]
  /** Controlled expanded state (when set, parent controls open/close) */
  isExpanded?: boolean
  /** Called when expand state should change (for mutual exclusivity with other dropdowns) */
  onExpandChange?: (expanded: boolean) => void
  /** Ref to the models section - clicks inside it should NOT close the dropdown (e.g. model card X) */
  modelsSectionRef?: RefObject<HTMLElement | null>
}

export function HelpMeChoose({
  onToggleModel,
  disabled = false,
  modelsByProvider = {},
  isAuthenticated = false,
  user = null,
  selectedModels = [],
  isExpanded: controlledExpanded,
  onExpandChange,
  modelsSectionRef,
}: HelpMeChooseProps) {
  const [internalExpanded, setInternalExpanded] = useState(false)
  const isExpanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded
  const setIsExpanded =
    onExpandChange !== undefined
      ? (v: boolean) => onExpandChange(v)
      : (v: boolean) => setInternalExpanded(v)
  const containerRef = useRef<HTMLDivElement>(null)

  const userTier = isAuthenticated ? user?.subscription_tier || 'free' : 'unregistered'
  const isPaidTier = ['starter', 'starter_plus', 'pro', 'pro_plus'].includes(userTier)
  const isRestrictedTier = userTier === 'unregistered' || userTier === 'free'

  const modelRestrictedByModelId = useMemo(() => {
    const map = new Map<string, boolean>()
    if (!isRestrictedTier || isPaidTier) return map
    for (const cat of HELP_ME_CHOOSE_CATEGORIES) {
      for (const entry of cat.models) {
        if (map.has(entry.modelId)) continue
        const model = findModelById(modelsByProvider, entry.modelId)
        map.set(
          entry.modelId,
          !model || model.available === false || isModelRestricted(model, userTier, isPaidTier)
        )
      }
    }
    return map
  }, [modelsByProvider, userTier, isPaidTier, isRestrictedTier])

  const disabledTooltip = getDisabledTooltip(userTier as 'unregistered' | 'free')

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (containerRef.current?.contains(target)) return
      // Don't close when clicking inside the models section (e.g. model card X button).
      // Closing on mousedown would collapse the dropdown before the click fires,
      // causing layout shift, scroll-to-bottom, and the close handler to miss.
      if (modelsSectionRef?.current?.contains(target)) return
      setIsExpanded(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [modelsSectionRef])

  const handleModelToggle = (modelId: string) => {
    if (modelRestrictedByModelId.get(modelId)) return
    onToggleModel(modelId)
  }

  const getModelDisplayName = (modelId: string): string => {
    const model = findModelById(modelsByProvider, modelId)
    return model?.name ?? modelId.split('/').pop() ?? modelId
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
            <span className="help-me-choose-ordering-hint">
              <span className="help-me-choose-ordering-label">Best at top ↓</span>
              <span
                className="help-me-choose-ordering-info"
                title="Models are ordered from best (top) to least recommended (bottom) based on published benchmarks. Hover over a model for evidence."
                aria-label="Ordering info"
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
                  aria-hidden
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4" />
                  <path d="M12 8h.01" />
                </svg>
              </span>
            </span>
            Select models below — changes apply immediately, same as the main model selection.
          </p>
          <div className="help-me-choose-categories">
            {HELP_ME_CHOOSE_CATEGORIES.map((cat: HelpMeChooseCategory) => (
              <div key={cat.id} className="help-me-choose-category">
                <h3 className="help-me-choose-category-header">{cat.label}</h3>
                <p className="help-me-choose-category-desc">{cat.description}</p>
                <ul className="help-me-choose-models-list" role="none">
                  {cat.models.map((entry, idx) => {
                    const modelRestricted = modelRestrictedByModelId.get(entry.modelId) ?? false
                    const isSelected = selectedModels.includes(entry.modelId)
                    const displayName = getModelDisplayName(entry.modelId)
                    return (
                      <li key={`${cat.id}-${entry.modelId}-${idx}`} role="none">
                        <label
                          className={`help-me-choose-model-entry ${modelRestricted ? 'restricted' : ''} ${isSelected ? 'selected' : ''}`}
                          title={modelRestricted ? disabledTooltip : entry.evidence}
                        >
                          <input
                            type="checkbox"
                            className="help-me-choose-checkbox"
                            disabled={modelRestricted}
                            checked={isSelected}
                            onChange={() => handleModelToggle(entry.modelId)}
                            aria-label={`Select ${displayName}`}
                            aria-disabled={modelRestricted}
                          />
                          <span className="help-me-choose-model-name">{displayName}</span>
                          {modelRestricted && (
                            <span className="help-me-choose-model-lock" aria-hidden>
                              <svg
                                width="10"
                                height="10"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <rect x="5" y="11" width="14" height="10" rx="2" ry="2" />
                                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                              </svg>
                            </span>
                          )}
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
