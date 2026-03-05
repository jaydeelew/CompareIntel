/**
 * HelpMeChoose - Decision support dropdown for model selection
 *
 * Displays categories horizontally. Each category lists models ordered
 * best-to-worst with evidence tooltips. Selections apply immediately,
 * same as the main Select Models to Compare section.
 *
 * Goal 10: Visually indicates which recommendations match the user's current
 * selection via stronger styling, category-level summary, and scroll-to-match.
 */

import { useState, useRef, useEffect, useMemo, useCallback, type RefObject } from 'react'

import {
  HELP_ME_CHOOSE_CATEGORIES,
  type HelpMeChooseCategory,
} from '../../data/helpMeChooseRecommendations'
import type { ModelsByProvider, User } from '../../types'

import { BestAtTopInfoModal } from './BestAtTopInfoModal'

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

/** Number of models to select when using "Select top N" preset */
export const HELP_ME_CHOOSE_PRESET_COUNT = 3

export interface HelpMeChooseProps {
  /** Toggle model selection (same as main model selection - applies immediately) */
  onToggleModel: (modelId: string) => void
  /** Apply a preset selection (e.g. top N models from a category). Replaces current selection. */
  onApplyCategoryPreset?: (modelIds: string[]) => void
  /** Whether the control is disabled (e.g. during loading) */
  disabled?: boolean
  /** Whether in follow-up mode (preset button disabled) */
  isFollowUpMode?: boolean
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
  onApplyCategoryPreset,
  disabled = false,
  isFollowUpMode = false,
  modelsByProvider = {},
  isAuthenticated = false,
  user = null,
  selectedModels = [],
  isExpanded: controlledExpanded,
  onExpandChange,
  modelsSectionRef,
}: HelpMeChooseProps) {
  const [internalExpanded, setInternalExpanded] = useState(false)
  const [showBestAtTopModal, setShowBestAtTopModal] = useState(false)
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

  /** Categories that contain at least one selected model (for Goal 10: match summary) */
  const matchingCategories = useMemo(() => {
    if (selectedModels.length === 0) return []
    const selectedSet = new Set(selectedModels)
    return HELP_ME_CHOOSE_CATEGORIES.filter(cat =>
      cat.models.some(entry => selectedSet.has(entry.modelId))
    )
  }, [selectedModels])

  const contentRef = useRef<HTMLDivElement>(null)
  const firstSelectedRef = useRef<HTMLLIElement | null>(null)
  const categoriesRef = useRef<HTMLDivElement>(null)
  const scrollbarTrackRef = useRef<HTMLDivElement>(null)
  const scrollbarThumbRef = useRef<HTMLDivElement>(null)
  const isDraggingRef = useRef(false)
  const dragStartXRef = useRef(0)
  const dragStartScrollLeftRef = useRef(0)
  /** When dragging the thumb: offset from thumb's left edge to the click point (in track pixels). Keeps cursor locked to thumb. */
  const dragOffsetWithinThumbRef = useRef<number | null>(null)

  const [hasHorizontalOverflow, setHasHorizontalOverflow] = useState(false)

  /** Scrollbar at top: sync thumb with categories scroll, handle drag */
  const updateScrollbarThumb = useCallback(() => {
    const el = categoriesRef.current
    const track = scrollbarTrackRef.current
    const thumb = scrollbarThumbRef.current
    if (!el || !track || !thumb) return
    const scrollWidth = el.scrollWidth
    const clientWidth = el.clientWidth
    const overflow = scrollWidth > clientWidth
    setHasHorizontalOverflow(overflow)
    if (!overflow) return
    const scrollLeft = el.scrollLeft
    const trackWidth = track.clientWidth
    const thumbWidth = Math.max(40, (clientWidth / scrollWidth) * trackWidth)
    const maxThumbLeft = trackWidth - thumbWidth
    const thumbLeft = (scrollLeft / (scrollWidth - clientWidth)) * maxThumbLeft
    thumb.style.width = `${thumbWidth}px`
    thumb.style.transform = `translateX(${thumbLeft}px)`
  }, [])

  useEffect(() => {
    const el = categoriesRef.current
    if (!el) return
    updateScrollbarThumb()
    const ro = new ResizeObserver(updateScrollbarThumb)
    ro.observe(el)
    el.addEventListener('scroll', updateScrollbarThumb)
    return () => {
      ro.disconnect()
      el.removeEventListener('scroll', updateScrollbarThumb)
    }
  }, [isExpanded, updateScrollbarThumb])

  const handleScrollbarPointerDown = useCallback((clientX: number, target: EventTarget) => {
    const el = categoriesRef.current
    const track = scrollbarTrackRef.current
    const thumb = scrollbarThumbRef.current
    if (!el || !track || !thumb) return
    const rect = track.getBoundingClientRect()
    const x = clientX - rect.left
    const scrollWidth = el.scrollWidth
    const clientWidth = el.clientWidth
    const maxScroll = scrollWidth - clientWidth
    const isOnThumb = thumb.contains(target as Node)
    if (!isOnThumb && maxScroll > 0 && rect.width > 0) {
      const pct = x / rect.width
      el.scrollLeft = pct * maxScroll
    }
    isDraggingRef.current = true
    dragStartXRef.current = clientX
    dragStartScrollLeftRef.current = el.scrollLeft
    // Store offset within thumb so cursor stays locked to the click point during drag
    if (maxScroll > 0 && rect.width > 0) {
      const trackWidth = track.clientWidth
      const thumbWidth = Math.max(40, (clientWidth / scrollWidth) * trackWidth)
      const maxThumbLeft = trackWidth - thumbWidth
      const thumbLeft = (el.scrollLeft / maxScroll) * maxThumbLeft
      dragOffsetWithinThumbRef.current = x - thumbLeft
    } else {
      dragOffsetWithinThumbRef.current = null
    }
  }, [])

  const handleScrollbarMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      handleScrollbarPointerDown(e.clientX, e.target)
    },
    [handleScrollbarPointerDown]
  )

  const handleScrollbarTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 0) return
      e.preventDefault()
      handleScrollbarPointerDown(e.touches[0].clientX, e.target)
    },
    [handleScrollbarPointerDown]
  )

  useEffect(() => {
    if (!isExpanded) return
    const applyScrollFromClientX = (clientX: number) => {
      if (!isDraggingRef.current || !categoriesRef.current) return
      const el = categoriesRef.current
      const track = scrollbarTrackRef.current
      if (!track) return
      const rect = track.getBoundingClientRect()
      const scrollWidth = el.scrollWidth
      const clientWidth = el.clientWidth
      const maxScroll = scrollWidth - clientWidth
      if (maxScroll <= 0) return
      const trackWidth = track.clientWidth
      const thumbWidth = Math.max(40, (clientWidth / scrollWidth) * trackWidth)
      const maxThumbLeft = trackWidth - thumbWidth
      if (maxThumbLeft <= 0) return
      const offset = dragOffsetWithinThumbRef.current
      if (offset !== null) {
        // Cursor-locked: thumb follows cursor so the click point stays under it
        const x = clientX - rect.left
        const desiredThumbLeft = Math.max(0, Math.min(maxThumbLeft, x - offset))
        el.scrollLeft = (desiredThumbLeft / maxThumbLeft) * maxScroll
      } else {
        // Fallback: delta-based (e.g. if offset wasn't set)
        const dx = clientX - dragStartXRef.current
        const scale = trackWidth > 0 ? maxScroll / trackWidth : 0
        el.scrollLeft = Math.max(
          0,
          Math.min(maxScroll, dragStartScrollLeftRef.current + dx * scale)
        )
      }
    }
    const onMouseMove = (e: MouseEvent) => {
      applyScrollFromClientX(e.clientX)
    }
    const onTouchMove = (e: TouchEvent) => {
      if (!isDraggingRef.current || e.touches.length === 0) return
      e.preventDefault()
      applyScrollFromClientX(e.touches[0].clientX)
    }
    const onPointerUp = () => {
      isDraggingRef.current = false
      dragOffsetWithinThumbRef.current = null
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onPointerUp)
    document.addEventListener('touchmove', onTouchMove, { passive: false })
    document.addEventListener('touchend', onPointerUp)
    document.addEventListener('touchcancel', onPointerUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onPointerUp)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onPointerUp)
      document.removeEventListener('touchcancel', onPointerUp)
    }
  }, [isExpanded])

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

  /** Scroll to first selected model when dropdown opens (Goal 10) */
  useEffect(() => {
    if (!isExpanded || selectedModels.length === 0) return
    const el = firstSelectedRef.current
    const container = contentRef.current
    if (!el || !container) return
    const timer = requestAnimationFrame(() => {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    })
    return () => cancelAnimationFrame(timer)
  }, [isExpanded, selectedModels])

  const handleModelToggle = (modelId: string) => {
    if (modelRestrictedByModelId.get(modelId)) return
    onToggleModel(modelId)
  }

  const handleApplyPreset = (cat: HelpMeChooseCategory) => {
    if (!onApplyCategoryPreset || isFollowUpMode) return
    const available = cat.models
      .filter(entry => !modelRestrictedByModelId.get(entry.modelId))
      .slice(0, HELP_ME_CHOOSE_PRESET_COUNT)
      .map(entry => entry.modelId)
    if (available.length > 0) {
      onApplyCategoryPreset(available)
    }
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
        <div
          id="help-me-choose-content"
          ref={contentRef}
          className="help-me-choose-content"
          role="menu"
        >
          <p className="help-me-choose-intro">
            <span className="help-me-choose-ordering-hint">
              <span className="help-me-choose-ordering-label">Best at top</span>
              <button
                type="button"
                className="help-me-choose-ordering-info"
                onClick={() => setShowBestAtTopModal(true)}
                title="Models are ordered from best (top) to least recommended (bottom) based on published benchmarks. Hover over a model for evidence."
                aria-label="Ordering info — tap for details"
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
              </button>
            </span>
          </p>
          <div
            className={`help-me-choose-categories-wrapper${hasHorizontalOverflow ? '' : ' help-me-choose-scrollbar-hidden'}`}
          >
            <div
              ref={scrollbarTrackRef}
              className="help-me-choose-scrollbar-top"
              role="scrollbar"
              aria-orientation="horizontal"
              aria-label="Scroll categories horizontally"
              onMouseDown={handleScrollbarMouseDown}
              onTouchStart={handleScrollbarTouchStart}
            >
              <div ref={scrollbarThumbRef} className="help-me-choose-scrollbar-thumb" />
            </div>
            <div ref={categoriesRef} className="help-me-choose-categories">
              {(() => {
                let foundFirstSelected = false
                return HELP_ME_CHOOSE_CATEGORIES.map((cat: HelpMeChooseCategory) => {
                  const hasMatch = matchingCategories.some(m => m.id === cat.id)
                  return (
                    <div
                      key={cat.id}
                      className={`help-me-choose-category ${hasMatch ? 'has-match' : ''}`}
                    >
                      <div className="help-me-choose-category-header-row">
                        <h3 className="help-me-choose-category-header">{cat.label}</h3>
                        {onApplyCategoryPreset &&
                          !isRestrictedTier &&
                          cat.models.some(e => !modelRestrictedByModelId.get(e.modelId)) && (
                            <button
                              type="button"
                              className="help-me-choose-preset-btn"
                              onClick={() => handleApplyPreset(cat)}
                              disabled={disabled || isFollowUpMode}
                              title={
                                isFollowUpMode
                                  ? 'Cannot change models during follow-up'
                                  : `Select top ${HELP_ME_CHOOSE_PRESET_COUNT} from this category`
                              }
                            >
                              Select top {HELP_ME_CHOOSE_PRESET_COUNT}
                            </button>
                          )}
                      </div>
                      <p className="help-me-choose-category-desc">{cat.description}</p>
                      <ul className="help-me-choose-models-list" role="none">
                        {cat.models.map((entry, idx) => {
                          const modelRestricted =
                            modelRestrictedByModelId.get(entry.modelId) ?? false
                          const isSelected = selectedModels.includes(entry.modelId)
                          const displayName = getModelDisplayName(entry.modelId)
                          const isFirstSelectedInDom = isSelected && !foundFirstSelected
                          if (isSelected) foundFirstSelected = true
                          return (
                            <li
                              key={`${cat.id}-${entry.modelId}-${idx}`}
                              role="none"
                              ref={isFirstSelectedInDom ? firstSelectedRef : undefined}
                            >
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
                  )
                })
              })()}
            </div>
          </div>
        </div>
      )}

      <BestAtTopInfoModal
        isOpen={showBestAtTopModal}
        onClose={() => setShowBestAtTopModal(false)}
      />
    </div>
  )
}
