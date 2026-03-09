/**
 * HelpMeChoose - Decision support dropdown for model selection
 *
 * Displays categories horizontally. Each category lists models ordered
 * ranked by benchmark score with evidence tooltips. Selections apply immediately,
 * same as the main Select Models to Compare section.
 *
 * Goal 10: Visually indicates which recommendations match the user's current
 * selection via stronger styling, category-level summary, and scroll-to-match.
 */

import { useState, useRef, useEffect, useMemo, useCallback, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'

import {
  HELP_ME_CHOOSE_CATEGORIES,
  type HelpMeChooseCategory,
} from '../../data/helpMeChooseRecommendations'
import type { ModelsByProvider, User } from '../../types'

import { BestAtTopInfoModal } from './BestAtTopInfoModal'
import { HelpMeChooseScopeInfoModal } from './HelpMeChooseScopeInfoModal'

function InfoIcon() {
  return (
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
  )
}

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

function EvidenceInfoModal({
  modelName,
  evidence,
  onClose,
}: {
  modelName: string
  evidence: string
  onClose: () => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEscape)
    closeRef.current?.focus()
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div
      className="disabled-button-info-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="evidence-modal-title"
      aria-describedby="evidence-modal-message"
    >
      <div
        className="disabled-button-info-modal"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => {
          if (e.key === 'Escape') onClose()
        }}
      >
        <div className="disabled-button-info-header">
          <h3 id="evidence-modal-title">{modelName}</h3>
          <button
            ref={closeRef}
            className="disabled-button-info-close"
            onClick={onClose}
            aria-label="Close"
            type="button"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="disabled-button-info-content">
          <p id="evidence-modal-message">{evidence}</p>
          <p className="best-at-top-methodology-link">
            <Link to="/help-me-choose-methodology" onClick={onClose}>
              Help Me Choose Methodology
            </Link>
          </p>
        </div>
        <div className="disabled-button-info-footer">
          <button className="disabled-button-info-button" onClick={onClose} type="button" autoFocus>
            Got it
          </button>
        </div>
      </div>
    </div>
  )
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
  /** When true, layout adjusts for mobile/touchscreen */
  isMobileLayout?: boolean
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
  isMobileLayout = false,
}: HelpMeChooseProps) {
  const [internalExpanded, setInternalExpanded] = useState(false)
  const [showBestAtTopModal, setShowBestAtTopModal] = useState(false)
  const [showScopeInfoModal, setShowScopeInfoModal] = useState(false)
  const [evidenceModal, setEvidenceModal] = useState<{
    modelName: string
    evidence: string
  } | null>(null)
  /** Portal tooltip for category info (desktop only) - avoids overflow clipping from scroll container */
  const [categoryTooltip, setCategoryTooltip] = useState<{
    content: string
    centerX: number
    bottomY: number
  } | null>(null)
  /** Portal tooltip for model evidence (desktop only) - avoids overflow clipping from scroll container */
  const [modelEvidenceTooltip, setModelEvidenceTooltip] = useState<{
    content: string
    centerX: number
    bottomY: number
  } | null>(null)
  const isExpanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded
  const setIsExpanded = useCallback(
    (v: boolean) => {
      if (onExpandChange !== undefined) {
        onExpandChange(v)
      } else {
        setInternalExpanded(v)
      }
    },
    [onExpandChange]
  )
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
    const track = scrollbarTrackRef.current
    if (!el || !track) return
    updateScrollbarThumb()
    // Re-measure after layout settles when dropdown first opens (thumb otherwise
    // appears short until user scrolls)
    let raf2: number
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(updateScrollbarThumb)
    })
    const ro = new ResizeObserver(updateScrollbarThumb)
    ro.observe(el)
    ro.observe(track)
    el.addEventListener('scroll', updateScrollbarThumb)
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
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

  useEffect(() => {
    if (!isExpanded) return
    const track = scrollbarTrackRef.current
    if (!track) return
    const handler = (e: TouchEvent) => {
      if (e.touches.length === 0) return
      e.preventDefault()
      handleScrollbarPointerDown(e.touches[0].clientX, e.target as EventTarget)
    }
    track.addEventListener('touchstart', handler, { passive: false })
    return () => track.removeEventListener('touchstart', handler)
  }, [isExpanded, handleScrollbarPointerDown])

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
  }, [modelsSectionRef, setIsExpanded])

  /** Clear portal tooltips when categories scroll or dropdown closes */
  useEffect(() => {
    if (!isExpanded || (!categoryTooltip && !modelEvidenceTooltip)) return
    const el = categoriesRef.current
    const onScroll = () => {
      setCategoryTooltip(null)
      setModelEvidenceTooltip(null)
    }
    el?.addEventListener('scroll', onScroll)
    return () => {
      el?.removeEventListener('scroll', onScroll)
      setCategoryTooltip(null)
      setModelEvidenceTooltip(null)
    }
  }, [isExpanded, categoryTooltip, modelEvidenceTooltip])

  /** Scroll to first selected model when dropdown opens only—not on selection changes (Goal 10) */
  const prevExpandedRef = useRef(false)
  useEffect(() => {
    const justOpened = isExpanded && !prevExpandedRef.current
    prevExpandedRef.current = isExpanded
    if (!justOpened || selectedModels.length === 0) return
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
    if (isFollowUpMode) return
    const available = cat.models
      .filter(entry => !modelRestrictedByModelId.get(entry.modelId))
      .slice(0, HELP_ME_CHOOSE_PRESET_COUNT)
      .map(entry => entry.modelId)
    if (available.length === 0) return

    const selectedSet = new Set(selectedModels)
    const allTopSelected = available.every(id => selectedSet.has(id))

    if (allTopSelected) {
      available.forEach(id => onToggleModel(id))
    } else if (onApplyCategoryPreset) {
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
      <div className="help-me-choose-toggle-wrap">
        <button
          type="button"
          className="help-me-choose-toggle"
          onClick={() => setIsExpanded(!isExpanded)}
          disabled={disabled}
          aria-expanded={isExpanded}
          aria-haspopup="true"
          aria-controls="help-me-choose-content"
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
        <button
          type="button"
          className="help-me-choose-toggle-info help-me-choose-toggle-info-trigger"
          onClick={e => {
            e.preventDefault()
            e.stopPropagation()
            setShowScopeInfoModal(true)
          }}
          aria-label="Learn about which models appear in Help me choose"
          aria-describedby={isMobileLayout ? undefined : 'hmc-toggle-scope-tooltip'}
        >
          {!isMobileLayout && (
            <span
              id="hmc-toggle-scope-tooltip"
              className="help-me-choose-toggle-info-tooltip"
              role="tooltip"
            >
              The models in this dropdown only include those with a trustworthy benchmarking source
              or other reliable means to determine their status. Newer releases may not appear here
              until they have sufficient benchmark data. For the full catalog—including the latest
              models—use the Select Models to Compare section below.
            </span>
          )}
          <InfoIcon />
        </button>
      </div>

      {isExpanded && (
        <div
          id="help-me-choose-content"
          ref={contentRef}
          className="help-me-choose-content"
          role="menu"
        >
          <p className="help-me-choose-intro">
            <span className="help-me-choose-ordering-hint">
              <span className="help-me-choose-ordering-label">Ranked by score</span>
              <button
                type="button"
                className="help-me-choose-ordering-info"
                onClick={() => setShowBestAtTopModal(true)}
                aria-label="How models are ranked — tap for details"
                aria-describedby={isMobileLayout ? undefined : 'hmc-ordering-tooltip'}
              >
                {!isMobileLayout && (
                  <span
                    id="hmc-ordering-tooltip"
                    className="help-me-choose-ordering-tooltip"
                    role="tooltip"
                  >
                    Models are ordered by benchmark score (highest first). Every model shown is
                    strong in its category. Tap the info icon next to a model for evidence.
                  </span>
                )}
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
            >
              <div ref={scrollbarThumbRef} className="help-me-choose-scrollbar-thumb" />
            </div>
            <div ref={categoriesRef} className="help-me-choose-categories">
              {(() => {
                let foundFirstSelected = false
                return HELP_ME_CHOOSE_CATEGORIES.map((cat: HelpMeChooseCategory) => {
                  const hasMatch = matchingCategories.some(m => m.id === cat.id)
                  const topIds = cat.models
                    .filter(e => !modelRestrictedByModelId.get(e.modelId))
                    .slice(0, HELP_ME_CHOOSE_PRESET_COUNT)
                    .map(e => e.modelId)
                  const allTopSelected =
                    topIds.length > 0 && topIds.every(id => selectedModels.includes(id))
                  return (
                    <div
                      key={cat.id}
                      className={`help-me-choose-category ${hasMatch ? 'has-match' : ''}`}
                    >
                      <div className="help-me-choose-category-header-row">
                        <h3 className="help-me-choose-category-header">
                          {cat.label}
                          {cat.categoryInfoTooltip && (
                            <button
                              type="button"
                              className="help-me-choose-category-info-trigger"
                              onClick={() =>
                                setEvidenceModal({
                                  modelName: cat.label,
                                  evidence: cat.categoryInfoTooltip!,
                                })
                              }
                              onMouseEnter={
                                !isMobileLayout
                                  ? e => {
                                      const rect = (
                                        e.currentTarget as HTMLButtonElement
                                      ).getBoundingClientRect()
                                      setCategoryTooltip({
                                        content: cat.categoryInfoTooltip!,
                                        centerX: rect.left + rect.width / 2,
                                        bottomY: window.innerHeight - rect.top + 10,
                                      })
                                    }
                                  : undefined
                              }
                              onMouseLeave={
                                !isMobileLayout ? () => setCategoryTooltip(null) : undefined
                              }
                              aria-label={`${cat.label} — how this category is ranked`}
                              aria-describedby={
                                isMobileLayout ? undefined : `hmc-category-info-${cat.id}`
                              }
                            >
                              {!isMobileLayout && (
                                <span
                                  id={`hmc-category-info-${cat.id}`}
                                  className="sr-only"
                                  role="tooltip"
                                >
                                  {cat.categoryInfoTooltip}
                                </span>
                              )}
                              <InfoIcon />
                            </button>
                          )}
                        </h3>
                        {onApplyCategoryPreset && !isRestrictedTier && topIds.length > 0 && (
                          <button
                            type="button"
                            className="help-me-choose-preset-btn"
                            onClick={() => handleApplyPreset(cat)}
                            disabled={disabled || isFollowUpMode}
                            title={
                              isFollowUpMode
                                ? 'Cannot change models during follow-up'
                                : allTopSelected
                                  ? `Deselect top ${HELP_ME_CHOOSE_PRESET_COUNT} from this category`
                                  : `Select top ${HELP_ME_CHOOSE_PRESET_COUNT} from this category`
                            }
                          >
                            {allTopSelected
                              ? `Deselect top ${HELP_ME_CHOOSE_PRESET_COUNT}`
                              : `Select top ${HELP_ME_CHOOSE_PRESET_COUNT}`}
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
                                onMouseDown={e => e.preventDefault()}
                              >
                                <input
                                  type="checkbox"
                                  className="help-me-choose-checkbox"
                                  disabled={modelRestricted}
                                  checked={isSelected}
                                  onChange={() => handleModelToggle(entry.modelId)}
                                  onMouseDown={e => e.preventDefault()}
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
                                <button
                                  type="button"
                                  className="help-me-choose-model-evidence-btn help-me-choose-model-evidence-trigger"
                                  onClick={e => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    setEvidenceModal({
                                      modelName: displayName,
                                      evidence: modelRestricted ? disabledTooltip : entry.evidence,
                                    })
                                  }}
                                  onMouseEnter={
                                    !isMobileLayout
                                      ? e => {
                                          const rect = (
                                            e.currentTarget as HTMLButtonElement
                                          ).getBoundingClientRect()
                                          setModelEvidenceTooltip({
                                            content: modelRestricted
                                              ? disabledTooltip
                                              : entry.evidence,
                                            centerX: rect.left + rect.width / 2,
                                            bottomY: window.innerHeight - rect.top + 10,
                                          })
                                        }
                                      : undefined
                                  }
                                  onMouseLeave={
                                    !isMobileLayout
                                      ? () => setModelEvidenceTooltip(null)
                                      : undefined
                                  }
                                  aria-label={`Benchmark evidence for ${displayName}`}
                                  aria-describedby={
                                    isMobileLayout
                                      ? undefined
                                      : `hmc-evidence-tooltip-${cat.id}-${entry.modelId}-${idx}`
                                  }
                                >
                                  {!isMobileLayout && (
                                    <span
                                      id={`hmc-evidence-tooltip-${cat.id}-${entry.modelId}-${idx}`}
                                      className="sr-only"
                                      role="tooltip"
                                    >
                                      {modelRestricted ? disabledTooltip : entry.evidence}
                                    </span>
                                  )}
                                  <InfoIcon />
                                </button>
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

      {evidenceModal && (
        <EvidenceInfoModal
          modelName={evidenceModal.modelName}
          evidence={evidenceModal.evidence}
          onClose={() => setEvidenceModal(null)}
        />
      )}

      {!isMobileLayout &&
        categoryTooltip &&
        createPortal(
          <div
            className="help-me-choose-category-info-tooltip help-me-choose-category-info-tooltip-portal"
            role="tooltip"
            style={{
              left: categoryTooltip.centerX,
              bottom: categoryTooltip.bottomY,
              transform: 'translateX(-50%)',
            }}
          >
            {categoryTooltip.content}
          </div>,
          document.body
        )}

      {!isMobileLayout &&
        modelEvidenceTooltip &&
        createPortal(
          <div
            className="help-me-choose-model-evidence-tooltip help-me-choose-category-info-tooltip-portal"
            role="tooltip"
            style={{
              left: modelEvidenceTooltip.centerX,
              bottom: modelEvidenceTooltip.bottomY,
              transform: 'translateX(-50%)',
            }}
          >
            {modelEvidenceTooltip.content}
          </div>,
          document.body
        )}

      <BestAtTopInfoModal
        isOpen={showBestAtTopModal}
        onClose={() => setShowBestAtTopModal(false)}
      />

      <HelpMeChooseScopeInfoModal
        isOpen={showScopeInfoModal}
        onClose={() => setShowScopeInfoModal(false)}
      />
    </div>
  )
}
