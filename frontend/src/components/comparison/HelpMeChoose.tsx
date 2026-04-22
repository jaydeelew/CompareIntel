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

import { useState, useRef, useEffect, useMemo, useCallback, useId, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'

import {
  HELP_ME_CHOOSE_CATEGORIES,
  HELP_ME_CHOOSE_CATEGORY_IMAGE_GENERATION_ID,
  type HelpMeChooseCategory,
} from '../../data/helpMeChooseRecommendations'
import type { Model, ModelsByProvider, User } from '../../types'
import { getUserTierInfo, isModelRestrictedForUser } from '../../utils/modelTierAccess'
import { modelSupportsVision } from '../../utils/visionModels'
import { StyledTooltip } from '../shared'

import { HelpMeChooseScopeInfoModal } from './HelpMeChooseScopeInfoModal'
import { WebSearchInfoModal } from './WebSearchInfoModal'

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

/** Decorative accent for the toggle — unique gradient id per mount */
function HelpMeChooseToggleIcon() {
  const uid = useId().replace(/:/g, '')
  const gradId = `hmc-tg-${uid}`
  return (
    <span className="help-me-choose-toggle-icon" aria-hidden>
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id={gradId} x1="3" y1="2" x2="21" y2="22" gradientUnits="userSpaceOnUse">
            <stop stopColor="var(--primary-light)" />
            <stop offset="0.5" stopColor="var(--primary-color)" />
            <stop offset="1" stopColor="var(--secondary-light)" />
          </linearGradient>
        </defs>
        <path
          fill={`url(#${gradId})`}
          d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.847a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.847.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z"
        />
      </svg>
    </span>
  )
}

function findModelById(modelsByProvider: ModelsByProvider, modelId: string) {
  for (const providerModels of Object.values(modelsByProvider)) {
    const model = providerModels.find(m => m.id === modelId)
    if (model) return model
  }
  return null
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
  /** Models by provider (for tier restriction check). Use allModelsByProvider when provided for lookups so text/image models are not greyed out when filtered by mode. */
  modelsByProvider?: ModelsByProvider
  /** Full models list for lookups (avoids greying out models not in current mode filter) */
  allModelsByProvider?: ModelsByProvider
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
  /** When true, only vision-capable models are shown (for image attachments) */
  hasAttachedImages?: boolean
  /** When true, omit tier-locked models from lists (matches provider dropdown hide control) */
  hidePremiumModels?: boolean
  /**
   * Text mode: hide "Best for image generation" (T2I). Image mode: show only that category.
   * Matches the Text models / Image generation models toggle.
   */
  modelMode?: 'text' | 'image'
  /**
   * When the dropdown opens, scroll this category column into view horizontally
   * (e.g. `HELP_ME_CHOOSE_CATEGORY_IMAGES_ID` when opening from "Pick a vision model").
   */
  scrollCategoryIdIntoView?: string | null
  /** Called after attempting to scroll so the parent can clear `scrollCategoryIdIntoView`. */
  onScrollCategoryIntoViewDone?: () => void
}

export function HelpMeChoose({
  onToggleModel,
  onApplyCategoryPreset,
  disabled = false,
  isFollowUpMode = false,
  modelsByProvider = {},
  allModelsByProvider,
  isAuthenticated = false,
  user = null,
  selectedModels = [],
  isExpanded: controlledExpanded,
  onExpandChange,
  modelsSectionRef,
  isMobileLayout = false,
  hasAttachedImages = false,
  hidePremiumModels = false,
  modelMode = 'text',
  scrollCategoryIdIntoView = null,
  onScrollCategoryIntoViewDone,
}: HelpMeChooseProps) {
  const [internalExpanded, setInternalExpanded] = useState(false)
  const [showScopeInfoModal, setShowScopeInfoModal] = useState(false)
  const [showWebSearchInfoModal, setShowWebSearchInfoModal] = useState(false)
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

  const { userTier, isPaidTier } = getUserTierInfo(isAuthenticated, user)
  const isRestrictedTier = userTier === 'unregistered' || userTier === 'free'

  const lookupModels = allModelsByProvider ?? modelsByProvider

  /** Mode filter (text vs T2I), vision filter (text mode + attachments), tier filter */
  const displayedCategories = useMemo(() => {
    let cats: typeof HELP_ME_CHOOSE_CATEGORIES = HELP_ME_CHOOSE_CATEGORIES.filter(cat =>
      modelMode === 'image'
        ? cat.id === HELP_ME_CHOOSE_CATEGORY_IMAGE_GENERATION_ID
        : cat.id !== HELP_ME_CHOOSE_CATEGORY_IMAGE_GENERATION_ID
    )
    if (hasAttachedImages && modelMode === 'text') {
      cats = cats
        .map(cat => ({
          ...cat,
          models: cat.models.filter(entry => modelSupportsVision(entry.modelId, lookupModels)),
        }))
        .filter(cat => cat.models.length > 0)
    }
    if (hidePremiumModels && !isPaidTier) {
      cats = cats
        .map(cat => ({
          ...cat,
          models: cat.models.filter(entry => {
            const model = findModelById(lookupModels, entry.modelId)
            if (!model) return true
            return !isModelRestrictedForUser(model as Model, userTier, isPaidTier)
          }),
        }))
        .filter(cat => cat.models.length > 0)
    }
    return cats
  }, [modelMode, hasAttachedImages, lookupModels, hidePremiumModels, isPaidTier, userTier])

  const modelRestrictedByModelId = useMemo(() => {
    const map = new Map<string, boolean>()
    if (!isRestrictedTier || isPaidTier) return map
    for (const cat of displayedCategories) {
      for (const entry of cat.models) {
        if (map.has(entry.modelId)) continue
        const model = findModelById(lookupModels, entry.modelId)
        if (!model) {
          map.set(entry.modelId, false)
          continue
        }
        map.set(
          entry.modelId,
          model.available === false || isModelRestrictedForUser(model, userTier, isPaidTier)
        )
      }
    }
    return map
  }, [displayedCategories, lookupModels, userTier, isPaidTier, isRestrictedTier])

  const disabledTooltip = getDisabledTooltip(userTier as 'unregistered' | 'free')

  /** Categories that contain at least one selected model (for Goal 10: match summary) */
  const matchingCategories = useMemo(() => {
    if (selectedModels.length === 0) return []
    const selectedSet = new Set(selectedModels)
    return displayedCategories.filter(cat =>
      cat.models.some(entry => selectedSet.has(entry.modelId))
    )
  }, [selectedModels, displayedCategories])

  const contentRef = useRef<HTMLDivElement>(null)
  const firstSelectedRef = useRef<HTMLLIElement | null>(null)
  const categoriesRef = useRef<HTMLDivElement>(null)
  const scrollbarTrackRef = useRef<HTMLDivElement>(null)
  const scrollbarThumbRef = useRef<HTMLDivElement>(null)
  const isDraggingRef = useRef(false)
  const dragStartXRef = useRef(0)
  const dragStartScrollLeftRef = useRef(0)
  /** Desktop: click-and-drag on categories area to scroll horizontally */
  const isCategoriesArmedRef = useRef(false)
  const isCategoriesDragRef = useRef(false)
  const categoriesJustFinishedDragRef = useRef(false)
  const categoriesDragStartXRef = useRef(0)
  const categoriesDragStartScrollLeftRef = useRef(0)

  const CATEGORIES_DRAG_THRESHOLD_PX = 5
  /** When dragging the thumb: offset from thumb's left edge to the click point (in track pixels). Keeps cursor locked to thumb. */
  const dragOffsetWithinThumbRef = useRef<number | null>(null)

  const [hasHorizontalOverflow, setHasHorizontalOverflow] = useState(false)
  const [isCategoriesDragging, setIsCategoriesDragging] = useState(false)

  /** Mobile: inner track that mirrors horizontal scroll of category columns */
  const stickyHeadTrackRef = useRef<HTMLDivElement>(null)
  /** Mobile: cropped viewport over the header row — touch-drag pans the shared categories scroller */
  const stickyHeadClipRef = useRef<HTMLDivElement>(null)

  /** Per-category row props (shared by sticky header strip + columns) */
  const helpMeChooseCategoryRows = useMemo(() => {
    return displayedCategories.map(cat => {
      const hasMatch = matchingCategories.some(m => m.id === cat.id)
      const topIds = cat.models
        .filter(e => !modelRestrictedByModelId.get(e.modelId))
        .slice(0, HELP_ME_CHOOSE_PRESET_COUNT)
        .map(e => e.modelId)
      const allTopSelected = topIds.length > 0 && topIds.every(id => selectedModels.includes(id))
      return { cat, hasMatch, topIds, allTopSelected }
    })
  }, [displayedCategories, matchingCategories, modelRestrictedByModelId, selectedModels])

  const syncStickyHeadTransform = useCallback(() => {
    const el = categoriesRef.current
    const tr = stickyHeadTrackRef.current
    if (!el || !tr || !isMobileLayout) return
    tr.style.transform = `translate3d(${-el.scrollLeft}px,0,0)`
  }, [isMobileLayout])

  /** Scrollbar at top: sync thumb with categories scroll, handle drag */
  const updateScrollbarThumb = useCallback(() => {
    syncStickyHeadTransform()
    const el = categoriesRef.current
    const track = scrollbarTrackRef.current
    const thumb = scrollbarThumbRef.current
    if (!el || !track || !thumb) return
    const scrollWidth = el.scrollWidth
    const clientWidth = el.clientWidth
    const overflow = scrollWidth > clientWidth
    setHasHorizontalOverflow(overflow)
    const trackWidth = track.clientWidth
    if (!overflow) {
      /* Show a full-width thumb when everything fits — track stays visible */
      const w = Math.max(40, trackWidth - 4)
      thumb.style.width = `${w}px`
      thumb.style.transform = 'translateX(2px)'
      return
    }
    const scrollLeft = el.scrollLeft
    const thumbWidth = Math.max(40, (clientWidth / scrollWidth) * trackWidth)
    const maxThumbLeft = trackWidth - thumbWidth
    const thumbLeft = (scrollLeft / (scrollWidth - clientWidth)) * maxThumbLeft
    thumb.style.width = `${thumbWidth}px`
    thumb.style.transform = `translateX(${thumbLeft}px)`
  }, [syncStickyHeadTransform])

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

  /** Desktop: suppress click when user just finished a drag-to-scroll (prevents unintended model selection) */
  const handleCategoriesClickCapture = useCallback((e: React.MouseEvent) => {
    if (categoriesJustFinishedDragRef.current) {
      categoriesJustFinishedDragRef.current = false
      e.preventDefault()
      e.stopPropagation()
    }
  }, [])

  /**
   * Mousedown arms horizontal drag anywhere in the categories area (including model rows).
   * Skip links and icon/action buttons only. Checkbox/label use the move threshold + click
   * capture so a simple click still toggles; a drag suppresses the click.
   */
  const handleCategoriesMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!hasHorizontalOverflow || !categoriesRef.current) return
      if ((e.target as HTMLElement).closest('button, a, .help-me-choose-scrollbar-top')) return
      isCategoriesArmedRef.current = true
      categoriesDragStartXRef.current = e.clientX
      categoriesDragStartScrollLeftRef.current = categoriesRef.current.scrollLeft
    },
    [hasHorizontalOverflow]
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

  /** Desktop: click-and-drag on categories area to scroll horizontally */
  useEffect(() => {
    if (!isExpanded) return
    const onMouseMove = (e: MouseEvent) => {
      if (!isCategoriesArmedRef.current || !categoriesRef.current) return
      const el = categoriesRef.current
      const dx = e.clientX - categoriesDragStartXRef.current
      if (!isCategoriesDragRef.current) {
        if (Math.abs(dx) >= CATEGORIES_DRAG_THRESHOLD_PX) {
          isCategoriesDragRef.current = true
          setIsCategoriesDragging(true)
          categoriesDragStartXRef.current = e.clientX
          categoriesDragStartScrollLeftRef.current = el.scrollLeft
        } else {
          return
        }
      }
      e.preventDefault()
      el.scrollLeft = Math.max(
        0,
        Math.min(el.scrollWidth - el.clientWidth, categoriesDragStartScrollLeftRef.current - dx)
      )
      categoriesDragStartXRef.current = e.clientX
      categoriesDragStartScrollLeftRef.current = el.scrollLeft
    }
    const onMouseUp = () => {
      if (isCategoriesArmedRef.current || isCategoriesDragRef.current) {
        const hadDrag = isCategoriesDragRef.current
        isCategoriesArmedRef.current = false
        isCategoriesDragRef.current = false
        setIsCategoriesDragging(false)
        if (hadDrag) categoriesJustFinishedDragRef.current = true
      }
    }
    document.addEventListener('mousemove', onMouseMove, { passive: false })
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [isExpanded])

  /** Mobile: horizontal drag on the category header strip scrolls the same axis as the model lists */
  useEffect(() => {
    if (!isExpanded || !isMobileLayout || !hasHorizontalOverflow) return
    const el = categoriesRef.current
    const clip = stickyHeadClipRef.current
    if (!el || !clip) return

    const shouldIgnoreTarget = (target: EventTarget | null) => {
      const t = target as HTMLElement | null
      return Boolean(t?.closest?.('button, a, input, label'))
    }

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      if (shouldIgnoreTarget(e.target)) return
      isCategoriesArmedRef.current = true
      categoriesDragStartXRef.current = e.touches[0].clientX
      categoriesDragStartScrollLeftRef.current = el.scrollLeft
    }

    const onTouchMove = (e: TouchEvent) => {
      if (!isCategoriesArmedRef.current || e.touches.length === 0) return
      const clientX = e.touches[0].clientX
      const dx = clientX - categoriesDragStartXRef.current
      if (!isCategoriesDragRef.current) {
        if (Math.abs(dx) >= CATEGORIES_DRAG_THRESHOLD_PX) {
          isCategoriesDragRef.current = true
          setIsCategoriesDragging(true)
          categoriesDragStartXRef.current = clientX
          categoriesDragStartScrollLeftRef.current = el.scrollLeft
        } else {
          return
        }
      }
      e.preventDefault()
      el.scrollLeft = Math.max(
        0,
        Math.min(el.scrollWidth - el.clientWidth, categoriesDragStartScrollLeftRef.current - dx)
      )
      categoriesDragStartXRef.current = clientX
      categoriesDragStartScrollLeftRef.current = el.scrollLeft
    }

    const onTouchEnd = () => {
      if (isCategoriesArmedRef.current || isCategoriesDragRef.current) {
        const hadDrag = isCategoriesDragRef.current
        isCategoriesArmedRef.current = false
        isCategoriesDragRef.current = false
        setIsCategoriesDragging(false)
        if (hadDrag) categoriesJustFinishedDragRef.current = true
      }
    }

    clip.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchmove', onTouchMove, { passive: false })
    document.addEventListener('touchend', onTouchEnd)
    document.addEventListener('touchcancel', onTouchEnd)

    return () => {
      clip.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onTouchEnd)
      document.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [isExpanded, isMobileLayout, hasHorizontalOverflow])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (containerRef.current?.contains(target)) return
      // Don't close when clicking inside the models section (e.g. model card X button).
      // Closing on mousedown would collapse the dropdown before the click fires,
      // causing layout shift, scroll-to-bottom, and the close handler to miss.
      if (modelsSectionRef?.current?.contains(target)) return
      // Don't close when clicking a modal overlay (e.g. conflict modal, disabled model modal).
      // Closing would collapse Help me choose and cause unwanted scroll.
      const el = target as Element
      if (el.closest?.('.disabled-model-info-overlay, .disabled-button-info-overlay')) return
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

  /** When the dropdown opens, scroll so the expanded card sits at the top of the page
   *  (toggle / search / advanced row scrolls out of view above it). Accounts for the
   *  sticky app header height so the card isn't hidden underneath it. */
  const prevExpandedForPageScrollRef = useRef(false)
  useEffect(() => {
    const justOpened = isExpanded && !prevExpandedForPageScrollRef.current
    prevExpandedForPageScrollRef.current = isExpanded
    if (!justOpened) return
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const card = contentRef.current
        if (!card) return
        const header = document.querySelector<HTMLElement>('.app-header-shell')
        const headerOffset = header?.getBoundingClientRect().height ?? 0
        const cardTop = card.getBoundingClientRect().top + window.scrollY
        window.scrollTo({ top: cardTop - headerOffset, behavior: 'smooth' })
      })
    })
    return () => {
      cancelAnimationFrame(raf1)
      if (raf2) cancelAnimationFrame(raf2)
    }
  }, [isExpanded])

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

  /** Horizontal scroll to a category column when opening from e.g. "Pick a vision model" */
  useEffect(() => {
    if (!isExpanded || !scrollCategoryIdIntoView) return undefined
    const id = scrollCategoryIdIntoView
    let cancelled = false
    const timer = window.setTimeout(() => {
      if (cancelled) return
      const container = categoriesRef.current
      const target = container?.querySelector<HTMLElement>(
        `[data-help-me-choose-category="${CSS.escape(id)}"]`
      )
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' })
      }
      onScrollCategoryIntoViewDone?.()
    }, 100)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [isExpanded, scrollCategoryIdIntoView, onScrollCategoryIntoViewDone])

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
    const model = findModelById(lookupModels, modelId)
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
          <HelpMeChooseToggleIcon />
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
          <div
            className="help-me-choose-content-inner"
            onMouseDown={handleCategoriesMouseDown}
            onClickCapture={handleCategoriesClickCapture}
          >
            <header className="help-me-choose-panel-head">
              <p className="help-me-choose-panel-eyebrow">Benchmark-guided</p>
              <p className="help-me-choose-panel-tagline">
                Pick models by use case — scroll sideways to browse categories.
              </p>
            </header>
            <div className="help-me-choose-categories-wrapper">
              {isMobileLayout ? (
                <div
                  className="help-me-choose-mobile-hscroll-head"
                  role="region"
                  aria-label="Category descriptions"
                >
                  <div
                    ref={scrollbarTrackRef}
                    className="help-me-choose-scrollbar-top help-me-choose-scrollbar-top--over-category-headers"
                    role="scrollbar"
                    aria-orientation="horizontal"
                    aria-label="Scroll categories horizontally"
                    onMouseDown={handleScrollbarMouseDown}
                  >
                    <div ref={scrollbarThumbRef} className="help-me-choose-scrollbar-thumb" />
                  </div>
                  <div
                    ref={stickyHeadClipRef}
                    className={`help-me-choose-sticky-head-clip${hasHorizontalOverflow ? ' help-me-choose-sticky-head-clip-drag' : ''}${isCategoriesDragging ? ' help-me-choose-sticky-head-clip-dragging' : ''}`}
                  >
                    <div ref={stickyHeadTrackRef} className="help-me-choose-sticky-head-track">
                      {helpMeChooseCategoryRows.map(({ cat, hasMatch, topIds, allTopSelected }) => (
                        <div
                          key={`sticky-${cat.id}`}
                          className={`help-me-choose-sticky-head-cell ${hasMatch ? 'has-match' : ''}`}
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
                                  aria-label={`${cat.label} — how this category is ranked`}
                                >
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
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  ref={scrollbarTrackRef}
                  className="help-me-choose-scrollbar-top help-me-choose-scrollbar-top--over-category-headers"
                  role="scrollbar"
                  aria-orientation="horizontal"
                  aria-label="Scroll categories horizontally"
                  onMouseDown={handleScrollbarMouseDown}
                >
                  <div ref={scrollbarThumbRef} className="help-me-choose-scrollbar-thumb" />
                </div>
              )}
              <div
                ref={categoriesRef}
                className={`help-me-choose-categories${hasHorizontalOverflow ? ' help-me-choose-categories-drag-scroll' : ''}${isCategoriesDragging ? ' help-me-choose-categories-dragging' : ''}`}
              >
                {(() => {
                  let foundFirstSelected = false
                  return helpMeChooseCategoryRows.map(
                    ({ cat, hasMatch, topIds, allTopSelected }) => (
                      <div
                        key={cat.id}
                        data-help-me-choose-category={cat.id}
                        className={`help-me-choose-category${isMobileLayout ? ' help-me-choose-category--lists-only' : ''} ${hasMatch ? 'has-match' : ''}`}
                      >
                        {!isMobileLayout && (
                          <>
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
                                    onMouseEnter={e => {
                                      const rect = (
                                        e.currentTarget as HTMLButtonElement
                                      ).getBoundingClientRect()
                                      setCategoryTooltip({
                                        content: cat.categoryInfoTooltip!,
                                        centerX: rect.left + rect.width / 2,
                                        bottomY: window.innerHeight - rect.top + 10,
                                      })
                                    }}
                                    onMouseLeave={() => setCategoryTooltip(null)}
                                    aria-label={`${cat.label} — how this category is ranked`}
                                    aria-describedby={`hmc-category-info-${cat.id}`}
                                  >
                                    <span
                                      id={`hmc-category-info-${cat.id}`}
                                      className="sr-only"
                                      role="tooltip"
                                    >
                                      {cat.categoryInfoTooltip}
                                    </span>
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
                          </>
                        )}
                        <ul className="help-me-choose-models-list" role="none">
                          {cat.models.map((entry, idx) => {
                            const modelRestricted =
                              modelRestrictedByModelId.get(entry.modelId) ?? false
                            const isSelected = selectedModels.includes(entry.modelId)
                            const displayName = getModelDisplayName(entry.modelId)
                            const model = findModelById(lookupModels, entry.modelId)
                            const supportsWebSearch = model?.supports_web_search ?? false
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
                                  <span className="help-me-choose-model-meta-icons">
                                    {modelRestricted && (
                                      <span className="help-me-choose-model-lock" aria-hidden>
                                        <svg
                                          width="12"
                                          height="12"
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
                                    {supportsWebSearch &&
                                      (isMobileLayout ? (
                                        <button
                                          type="button"
                                          className="web-search-indicator indicator-tappable"
                                          style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            width: '14px',
                                            height: '14px',
                                            opacity: isSelected ? 1 : 0.6,
                                            flexShrink: 0,
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
                                            width="14"
                                            height="14"
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
                                            aria-hidden
                                          >
                                            <circle cx="12" cy="12" r="10" />
                                            <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                                          </svg>
                                        </button>
                                      ) : (
                                        <StyledTooltip
                                          usePortal
                                          text="This model can access the Internet"
                                        >
                                          <span
                                            className="web-search-indicator"
                                            style={{
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              justifyContent: 'center',
                                              width: '14px',
                                              height: '14px',
                                              opacity: isSelected ? 1 : 0.6,
                                              flexShrink: 0,
                                            }}
                                            aria-hidden
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
                                        </StyledTooltip>
                                      ))}
                                    <button
                                      type="button"
                                      className="help-me-choose-model-evidence-btn help-me-choose-model-evidence-trigger"
                                      onClick={e => {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        setEvidenceModal({
                                          modelName: displayName,
                                          evidence: modelRestricted
                                            ? disabledTooltip
                                            : entry.evidence,
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
                                  </span>
                                </label>
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    )
                  )
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {evidenceModal &&
        typeof document !== 'undefined' &&
        createPortal(
          <EvidenceInfoModal
            modelName={evidenceModal.modelName}
            evidence={evidenceModal.evidence}
            onClose={() => setEvidenceModal(null)}
          />,
          document.body
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

      <HelpMeChooseScopeInfoModal
        isOpen={showScopeInfoModal}
        onClose={() => setShowScopeInfoModal(false)}
      />

      <WebSearchInfoModal
        isOpen={showWebSearchInfoModal}
        onClose={() => setShowWebSearchInfoModal(false)}
      />
    </div>
  )
}
