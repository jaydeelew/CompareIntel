import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { useResponsive } from '../../hooks'
import type { Model, ModelsByProvider, User } from '../../types'
import { isThinkingModel } from '../../utils/thinkingModels'
import { filterToVisionModels } from '../../utils/visionModels'
import { ProviderIcon } from '../layout/ProviderCarousel'
import { StyledTooltip } from '../shared'

import { ModelDetailsInfoModal } from './ModelDetailsInfoModal'
import { ModelInfoPanelContent } from './ModelInfoPanelContent'
import { SelectAllInfoModal } from './SelectAllInfoModal'
import { ThinkingModelInfoModal } from './ThinkingModelInfoModal'
import { getTooltipModalSuppressed } from './tooltipModalStorage'
import { WebSearchInfoModal } from './WebSearchInfoModal'

/** Main page scrolls in `.app`; keep window in sync for focus/scroll-into-view quirks. */
function captureProviderModelToggleScroll(): { app: number; win: number } {
  const appEl = document.querySelector('.app') as HTMLElement | null
  const win = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0
  return {
    app: appEl?.scrollTop ?? 0,
    win,
  }
}

function restoreProviderModelToggleScroll(pos: { app: number; win: number }): void {
  const appEl = document.querySelector('.app') as HTMLElement | null
  if (appEl) appEl.scrollTop = pos.app
  window.scrollTo({ top: pos.win, left: 0, behavior: 'auto' })
  const doc = document.documentElement
  const body = document.body
  if (doc && Math.abs(doc.scrollTop - pos.win) > 0.5) doc.scrollTop = pos.win
  if (body && Math.abs(body.scrollTop - pos.win) > 0.5) body.scrollTop = pos.win
}

/** Gate restore/resize handling after a provider-row pointerdown (focus + flex/selected-column layout). */
const PROVIDER_TOGGLE_SCROLL_MAX_AGE_MS = 650

/**
 * With "hide locked models" on, tier filtering can drop every model for a provider (e.g. unregistered
 * users + image models only marked `free`). Fall back to the full provider list so dropdowns never
 * disappear while the API still returned models; restricted styling still applies per row.
 */
function getVisibleModelsAfterTierFilter(
  models: Model[],
  hidePremiumModels: boolean,
  isPaidTier: boolean,
  userTier: string
): { visibleModels: Model[]; usedTierFilterFallback: boolean } {
  if (!hidePremiumModels) {
    return { visibleModels: models, usedTierFilterFallback: false }
  }
  const filtered = models.filter(model => {
    if (isPaidTier) return true
    if (model.trial_unlocked) return true
    if (userTier === 'unregistered') return model.tier_access === 'unregistered'
    return model.tier_access !== 'paid'
  })
  const usedTierFilterFallback = !isPaidTier && models.length > 0 && filtered.length === 0
  return {
    visibleModels: usedTierFilterFallback ? models : filtered,
    usedTierFilterFallback,
  }
}

function scheduleScrollRestores(pos: { app: number; win: number }): void {
  const apply = () => restoreProviderModelToggleScroll(pos)
  apply()
  queueMicrotask(apply)
  requestAnimationFrame(() => {
    apply()
    requestAnimationFrame(() => {
      apply()
      requestAnimationFrame(apply)
    })
  })
  for (const ms of [0, 16, 32, 48, 100, 200, 320, 400, 520, 650]) {
    window.setTimeout(apply, ms)
  }
}

/** 14px-wide info icon at end of `.model-name-tooltip-wrapper`; caret targets its horizontal center. */
const MODEL_INFO_ICON_CSS_PX = 14

/** Georgia “T” for thinking models (matches requested typography) */
function ThinkingModelIcon({ className = '' }: { className?: string }) {
  return (
    <span className={className} aria-hidden>
      T
    </span>
  )
}

function ModelNameWithInfoTooltip({
  model,
  modelsByProvider,
  hideTooltip = false,
  isMobileLayout = false,
  onOpenThinkingModelInfoModal,
  onOpenModelDetailsModal,
}: {
  model: Model
  modelsByProvider: ModelsByProvider
  hideTooltip?: boolean
  isMobileLayout?: boolean
  onOpenThinkingModelInfoModal?: () => void
  onOpenModelDetailsModal?: () => void
}) {
  const wrapRef = useRef<HTMLSpanElement>(null)
  const tipRef = useRef<HTMLSpanElement>(null)
  const isImageGen = !!model.supports_image_generation

  const isThinking = isThinkingModel(model)

  const placeTooltipArrow = useCallback(() => {
    const wrap = wrapRef.current
    const tip = tipRef.current
    if (!wrap || !tip) return
    const wrapR = wrap.getBoundingClientRect()
    const tipR = tip.getBoundingClientRect()
    // Point at the (i) icon: last icon before thinking indicator when present
    const iconsAfterInfo = isThinking ? MODEL_INFO_ICON_CSS_PX + 4 : MODEL_INFO_ICON_CSS_PX / 2
    const iconCenterX = wrapR.right - iconsAfterInfo
    const px = iconCenterX - tipR.left
    tip.style.setProperty('--model-tooltip-arrow-left', `${px}px`)
  }, [isThinking])

  useLayoutEffect(() => {
    if (isMobileLayout) return
    placeTooltipArrow()
  }, [
    placeTooltipArrow,
    isMobileLayout,
    model.id,
    model.name,
    model.supports_image_generation,
    isThinking,
  ])

  const knowledgeIconSvg = (
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
  )

  if (isMobileLayout) {
    return (
      <span
        className={`model-name-tooltip-wrapper model-name-tooltip-wrapper--mobile ${hideTooltip ? 'model-info-tooltip-disabled' : ''}`}
      >
        <span className="model-name-text">{model.name}</span>
        {!hideTooltip && (
          <button
            type="button"
            className="model-knowledge-info-btn"
            onClick={e => {
              e.preventDefault()
              e.stopPropagation()
              onOpenModelDetailsModal?.()
            }}
            aria-label="Model details — tap for info"
          >
            {knowledgeIconSvg}
          </button>
        )}
        {isThinking && (
          <button
            type="button"
            className="thinking-model-icon-btn"
            onClick={e => {
              e.preventDefault()
              e.stopPropagation()
              onOpenThinkingModelInfoModal?.()
            }}
            aria-label="Thinking model — tap for info"
          >
            <ThinkingModelIcon className="thinking-model-icon" />
          </button>
        )}
      </span>
    )
  }

  return (
    <span
      ref={wrapRef}
      className={`model-name-tooltip-wrapper ${hideTooltip ? 'model-info-tooltip-disabled' : ''}`}
    >
      <span className="model-info-tooltip-trigger" onMouseEnter={placeTooltipArrow}>
        <span className="model-name-text">{model.name}</span>
        {knowledgeIconSvg}
      </span>
      {isThinking && (
        <StyledTooltip usePortal text="Thinking model">
          <span className="thinking-model-icon-wrap" aria-hidden>
            <ThinkingModelIcon className="thinking-model-icon" />
          </span>
        </StyledTooltip>
      )}
      <span
        ref={tipRef}
        className={`model-info-tooltip ${isImageGen ? 'model-info-tooltip--image' : ''}`}
      >
        <ModelInfoPanelContent model={model} modelsByProvider={modelsByProvider} />
      </span>
    </span>
  )
}

/**
 * Props for the ModelsSection component
 */
export interface ModelsSectionProps {
  /** When true, only vision-capable models are shown and a notice is displayed */
  hasAttachedImages?: boolean
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
  /** Callback to retry loading models (e.g. when connection fails) */
  onRetryModels?: () => void
  /** Callback when a disabled/restricted model is clicked (for unregistered/free tiers) */
  onShowDisabledModelModal?: (info: {
    userTier: 'unregistered' | 'free'
    modelTierAccess: 'free' | 'paid'
    modelName?: string
    imageMode?: boolean
  }) => void
  /** When true, all models are disabled and show sign-up modal (unregistered + image mode) */
  imageModelsDisabledForUnregistered?: boolean
  /** When true, disable info tooltips on model names */
  hideModelInfoTooltips?: boolean
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
  hasAttachedImages = false,
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
  hideModelInfoTooltips = false,
  onToggleDropdown,
  onToggleModel,
  onToggleAllForProvider,
  onError,
  onRetryModels,
  onShowDisabledModelModal,
  imageModelsDisabledForUnregistered = false,
}) => {
  const { isMobileLayout } = useResponsive()
  const [showWebSearchInfoModal, setShowWebSearchInfoModal] = useState(false)
  const [showThinkingModelInfoModal, setShowThinkingModelInfoModal] = useState(false)
  const [modelDetailsModalModel, setModelDetailsModalModel] = useState<Model | null>(null)
  const [selectAllModalProvider, setSelectAllModalProvider] = useState<string | null>(null)

  const openThinkingModelInfoModal = useCallback(() => {
    if (isMobileLayout && getTooltipModalSuppressed('thinking-model')) {
      return
    }
    setShowThinkingModelInfoModal(true)
  }, [isMobileLayout])

  /** Scroll snapshot from pointerdown on a provider model row (before focus + layout). */
  const providerToggleScrollSnapRef = useRef<{ app: number; win: number } | null>(null)
  const providerTogglePointerTsRef = useRef(0)
  const providerToggleSnapClearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const modelsSelectionLayoutRef = useRef<HTMLDivElement>(null)
  const resizeRestoreRafRef = useRef<number | null>(null)

  const selectedModelsSignature = selectedModels.join('\0')

  useEffect(() => {
    return () => {
      if (providerToggleSnapClearTimeoutRef.current) {
        clearTimeout(providerToggleSnapClearTimeoutRef.current)
      }
      if (resizeRestoreRafRef.current) {
        cancelAnimationFrame(resizeRestoreRafRef.current)
      }
    }
  }, [])

  const modelsListReady = !isLoadingModels && Object.keys(modelsByProvider).length > 0

  // Selected-models column height / flex stretch often updates after the first layout pass
  // (and again after async credit refresh). Keep snapshot and re-apply on resize.
  useEffect(() => {
    if (!modelsListReady) return
    const el = modelsSelectionLayoutRef.current
    if (!el) return

    const ro = new ResizeObserver(() => {
      if (Date.now() - providerTogglePointerTsRef.current > PROVIDER_TOGGLE_SCROLL_MAX_AGE_MS) {
        return
      }
      const snap = providerToggleScrollSnapRef.current
      if (!snap) return
      if (resizeRestoreRafRef.current) {
        cancelAnimationFrame(resizeRestoreRafRef.current)
      }
      resizeRestoreRafRef.current = requestAnimationFrame(() => {
        resizeRestoreRafRef.current = null
        restoreProviderModelToggleScroll(snap)
      })
    })

    ro.observe(el)
    return () => {
      ro.disconnect()
      if (resizeRestoreRafRef.current) {
        cancelAnimationFrame(resizeRestoreRafRef.current)
        resizeRestoreRafRef.current = null
      }
    }
  }, [modelsListReady])

  // After React commits the new selection (extra card in the grid, flex height, etc.),
  // the scroll container can move again — restore using the pre-click snapshot.
  useLayoutEffect(() => {
    if (Date.now() - providerTogglePointerTsRef.current > PROVIDER_TOGGLE_SCROLL_MAX_AGE_MS) {
      return
    }
    const snap = providerToggleScrollSnapRef.current
    if (!snap) return
    scheduleScrollRestores(snap)
  }, [selectedModelsSignature])

  const handleModelOptionPointerDownCapture = (e: React.PointerEvent<HTMLLabelElement>) => {
    if ((e.target as HTMLElement).closest('button')) return
    if (providerToggleSnapClearTimeoutRef.current) {
      clearTimeout(providerToggleSnapClearTimeoutRef.current)
      providerToggleSnapClearTimeoutRef.current = null
    }
    providerToggleScrollSnapRef.current = captureProviderModelToggleScroll()
    providerTogglePointerTsRef.current = Date.now()
    providerToggleSnapClearTimeoutRef.current = setTimeout(() => {
      providerToggleScrollSnapRef.current = null
      providerToggleSnapClearTimeoutRef.current = null
    }, 800)
  }

  const handleModelCheckboxFocus = () => {
    const saved = providerToggleScrollSnapRef.current
    if (!saved) return
    // Do not cancel the pointerdown timeout here: if selection does not change,
    // useLayoutEffect will not run and we still need the timeout to clear the snap.
    scheduleScrollRestores(saved)
  }

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

        {onRetryModels && (
          <button
            type="button"
            className="retry-models-btn"
            onClick={onRetryModels}
            aria-label="Retry loading models"
          >
            Retry
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="models-selection-layout" ref={modelsSelectionLayoutRef}>
      <div className="provider-dropdowns">
        {Object.entries(modelsByProvider).map(([provider, models]) => {
          const { visibleModels: tierVisible, usedTierFilterFallback } =
            getVisibleModelsAfterTierFilter(models, hidePremiumModels, isPaidTier, userTier)
          let visibleModels = tierVisible

          // When image is attached, limit to vision-capable models only
          if (hasAttachedImages) {
            visibleModels = filterToVisionModels(visibleModels, modelsByProvider)
          }

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
                type="button"
                className="provider-header"
                onClick={() => onToggleDropdown(provider)}
                onMouseDown={e => e.preventDefault()}
                aria-expanded={openDropdowns.has(provider)}
              >
                <div className="provider-left">
                  <span className="provider-dropdown-icon">
                    <ProviderIcon provider={provider} />
                  </span>
                  <span className="provider-name">{provider}</span>
                </div>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}
                >
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
                    // Filter to selectable models only (matches useModelManagement logic).
                    // For unregistered/free tiers with disabled models visible, we must exclude
                    // restricted models so allProviderModelsSelected can be true when the user
                    // has selected all selectable models (icon turns orange).
                    // When imageModelsDisabledForUnregistered, no models are selectable.
                    const selectableProviderModels = imageModelsDisabledForUnregistered
                      ? []
                      : visibleModels.filter(model => {
                          if (model.available === false) return false
                          if (isPaidTier) return true
                          if (model.trial_unlocked) return true
                          if (userTier === 'unregistered')
                            return model.tier_access === 'unregistered'
                          if (userTier === 'free') return model.tier_access !== 'paid'
                          return true
                        })
                    const providerModelIds = selectableProviderModels.map(model => model.id)
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

                    const tooltipText = isDisabled
                      ? isFollowUpMode
                        ? 'Cannot add new models during follow-up'
                        : `Cannot select more models (max ${maxModelsLimit} for your tier)`
                      : allProviderModelsSelected
                        ? 'Deselect All'
                        : isAnonymousOrFreeTier
                          ? 'Select all available'
                          : 'Select All'

                    const selectAllButton = (
                      <div
                        className={`provider-select-all ${isDisabled ? 'disabled' : ''} ${allProviderModelsSelected ? 'all-selected' : ''}`}
                        onMouseDown={e => e.preventDefault()}
                        onClick={e => {
                          e.stopPropagation()
                          if (isMobileLayout) {
                            if (getTooltipModalSuppressed('select-all')) {
                              if (!isDisabled) onToggleAllForProvider(provider)
                            } else {
                              setSelectAllModalProvider(provider)
                            }
                          } else if (!isDisabled) {
                            onToggleAllForProvider(provider)
                          }
                        }}
                      >
                        ✱
                      </div>
                    )

                    return isMobileLayout ? (
                      selectAllButton
                    ) : (
                      <StyledTooltip text={tooltipText}>{selectAllButton}</StyledTooltip>
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
                    // When hidePremiumModels is true, restricted models are usually filtered out;
                    // usedTierFilterFallback shows the full list so tier checks apply here again.
                    // imageModelsDisabledForUnregistered: unregistered users cannot select image models
                    let isRestricted = false
                    if (imageModelsDisabledForUnregistered) {
                      isRestricted = true
                    } else if (!hidePremiumModels || usedTierFilterFallback) {
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
                        if (hideModelInfoTooltips) {
                          return
                        }
                        // Show modal for unregistered/free tiers, or fallback to error message
                        if (onShowDisabledModelModal) {
                          onShowDisabledModelModal({
                            userTier: userTier as 'unregistered' | 'free',
                            modelTierAccess: model.tier_access === 'paid' ? 'paid' : 'free',
                            modelName: model.name,
                            imageMode: imageModelsDisabledForUnregistered,
                          })
                        } else {
                          onError(
                            `${model.name} is a premium model. Use Account → Upgrade plan when billing is enabled.`
                          )
                        }
                        return
                      }
                      if (!isDisabled) {
                        onToggleModel(model.id)
                      }
                    }

                    const checkboxId = `model-checkbox-${model.id}`
                    return (
                      <label
                        key={model.id}
                        htmlFor={checkboxId}
                        className={`model-option ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''} ${isRestricted ? 'restricted' : ''}`}
                        onPointerDownCapture={handleModelOptionPointerDownCapture}
                        onMouseDown={e => e.preventDefault()}
                        onClick={e => {
                          // When restricted, clicking anywhere on the label should show the modal
                          // (checkbox onChange doesn't fire when disabled)
                          if (isRestricted && requiresUpgrade) {
                            e.preventDefault()
                            handleModelClick()
                          }
                        }}
                      >
                        <div className="model-info">
                          <h4>
                            <ModelNameWithInfoTooltip
                              model={model}
                              modelsByProvider={modelsByProvider}
                              hideTooltip={hideModelInfoTooltips}
                              isMobileLayout={isMobileLayout}
                              onOpenThinkingModelInfoModal={openThinkingModelInfoModal}
                              onOpenModelDetailsModal={() => setModelDetailsModalModel(model)}
                            />
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
                                    : 'Premium model — subscribe from Account → Upgrade plan'
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
                          className={`model-option-controls ${isMobileLayout ? 'model-option-controls-mobile' : ''}`}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: isMobileLayout ? '0.75rem' : '0.375rem',
                            flexShrink: 0,
                          }}
                        >
                          {model.supports_web_search &&
                            (() => {
                              const indicator = (
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
                                    color: isSelected
                                      ? 'var(--primary-color, #007bff)'
                                      : 'var(--text-secondary, #666)',
                                    display: 'block',
                                  }}
                                >
                                  <circle cx="12" cy="12" r="10" />
                                  <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                                </svg>
                              )
                              const commonStyle = {
                                display: 'inline-flex' as const,
                                alignItems: 'center' as const,
                                justifyContent: 'center' as const,
                                width: '16px',
                                height: '16px',
                                opacity: isSelected ? 1 : 0.6,
                                transition: 'opacity 0.2s',
                                margin: 0,
                                flexShrink: 0,
                              }
                              return isMobileLayout ? (
                                <button
                                  type="button"
                                  className="web-search-indicator indicator-tappable"
                                  style={commonStyle}
                                  onClick={e => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    setShowWebSearchInfoModal(true)
                                  }}
                                  aria-label="Internet access"
                                >
                                  {indicator}
                                </button>
                              ) : (
                                <StyledTooltip usePortal text="This model can access the Internet">
                                  <span className="web-search-indicator" style={commonStyle}>
                                    {indicator}
                                  </span>
                                </StyledTooltip>
                              )
                            })()}
                          <input
                            type="checkbox"
                            id={checkboxId}
                            checked={isSelected}
                            disabled={isDisabled}
                            onChange={handleModelClick}
                            onFocus={handleModelCheckboxFocus}
                            onMouseDown={e => e.preventDefault()}
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
                    <h4>
                      <ModelNameWithInfoTooltip
                        model={model}
                        modelsByProvider={modelsByProvider}
                        hideTooltip={hideModelInfoTooltips}
                        isMobileLayout={isMobileLayout}
                        onOpenThinkingModelInfoModal={openThinkingModelInfoModal}
                        onOpenModelDetailsModal={() => setModelDetailsModalModel(model)}
                      />
                    </h4>
                    <div className="selected-model-actions">
                      {model.supports_web_search &&
                        (isMobileLayout ? (
                          <button
                            type="button"
                            className="web-search-indicator indicator-tappable"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              opacity: 1,
                              background: 'none',
                              border: 'none',
                              padding: 0,
                              cursor: 'pointer',
                            }}
                            onClick={e => {
                              e.preventDefault()
                              e.stopPropagation()
                              setShowWebSearchInfoModal(true)
                            }}
                            aria-label="Internet access"
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
                              style={{ color: 'white', display: 'block' }}
                            >
                              <circle cx="12" cy="12" r="10" />
                              <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                            </svg>
                          </button>
                        ) : (
                          <StyledTooltip usePortal text="This model can access the Internet">
                            <span
                              className="web-search-indicator"
                              style={{ display: 'inline-flex', alignItems: 'center', opacity: 1 }}
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
                                style={{ color: 'white', display: 'block' }}
                              >
                                <circle cx="12" cy="12" r="10" />
                                <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                              </svg>
                            </span>
                          </StyledTooltip>
                        ))}
                      <button
                        type="button"
                        className="remove-model-btn"
                        onClick={() => onToggleModel(modelId)}
                        onMouseDown={e => e.preventDefault()}
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

      <WebSearchInfoModal
        isOpen={showWebSearchInfoModal}
        onClose={() => setShowWebSearchInfoModal(false)}
      />

      <ThinkingModelInfoModal
        isOpen={showThinkingModelInfoModal}
        onClose={() => setShowThinkingModelInfoModal(false)}
      />

      <ModelDetailsInfoModal
        isOpen={modelDetailsModalModel !== null}
        model={modelDetailsModalModel}
        modelsByProvider={modelsByProvider}
        onClose={() => setModelDetailsModalModel(null)}
      />

      {selectAllModalProvider &&
        (() => {
          const models = modelsByProvider[selectAllModalProvider] || []
          const { visibleModels: tierVisible } = getVisibleModelsAfterTierFilter(
            models,
            hidePremiumModels,
            isPaidTier,
            userTier
          )
          let visibleModels = tierVisible
          if (hasAttachedImages) {
            visibleModels = filterToVisionModels(visibleModels, modelsByProvider)
          }
          const selectableProviderModels = visibleModels.filter(model => {
            if (model.available === false) return false
            if (isPaidTier) return true
            if (model.trial_unlocked) return true
            if (userTier === 'unregistered') return model.tier_access === 'unregistered'
            if (userTier === 'free') return model.tier_access !== 'paid'
            return true
          })
          const providerModelIds = selectableProviderModels.map(model => model.id)
          const allProviderModelsSelected =
            providerModelIds.every(id => selectedModels.includes(id)) && providerModelIds.length > 0
          const hasAnySelected = providerModelIds.some(id => selectedModels.includes(id))
          const hasAnyOriginallySelected = providerModelIds.some(id =>
            originalSelectedModels.includes(id)
          )
          const isDisabled =
            (selectedModels.length >= maxModelsLimit && !hasAnySelected) ||
            (isFollowUpMode && !hasAnySelected && !hasAnyOriginallySelected)
          const isAnonymousOrFreeTier = !isPaidTier

          const tooltipText = isDisabled
            ? isFollowUpMode
              ? 'Cannot add new models during follow-up'
              : `Cannot select more models (max ${maxModelsLimit} for your tier)`
            : allProviderModelsSelected
              ? 'Deselect All'
              : isAnonymousOrFreeTier
                ? 'Select all available'
                : 'Select All'

          const modalTitle = isDisabled ? 'Select All' : tooltipText
          const modalMessage = isDisabled
            ? tooltipText
            : allProviderModelsSelected
              ? 'Deselect all models for this provider.'
              : isAnonymousOrFreeTier
                ? 'Select all available models for this provider.'
                : 'Select all models for this provider.'

          return (
            <SelectAllInfoModal
              isOpen={true}
              onClose={() => setSelectAllModalProvider(null)}
              onConfirm={() => onToggleAllForProvider(selectAllModalProvider)}
              title={modalTitle}
              message={modalMessage}
              isDisabled={isDisabled}
            />
          )
        })()}
    </div>
  )
}

export default ModelsSection
