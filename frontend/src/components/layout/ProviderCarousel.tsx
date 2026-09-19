/**
 * ProviderCarousel - 3D-look rotating carousel of AI provider icons
 *
 * Shown over the CompareIntel watermark when capability cards are hidden.
 * Items orbit a central point with simulated depth: front items grow large,
 * back items shrink and fade. Uses 2D transforms (translate + scale) for
 * reliable pointer hit-testing — CSS preserve-3d makes buttons un-clickable
 * in many browsers.
 *
 * Supports mouse drag (desktop) and touch swipe.
 * Click navigates to the provider's model dropdown; hover shows the name.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { useResponsive } from '../../hooks'
import '../../styles/providerCarousel.css'
import { ProviderIcon } from './ProviderIcon'

export { ProviderIcon }

/* ──────────────────────────────── types ──────────────────────────────── */

interface ProviderCarouselProps {
  providers: string[]
  onProviderClick: (provider: string) => void
}

/* ──────────────────────────────── layout math ──────────────────────────────── */

const AUTO_ROTATE_SPEED = 0.15
const DRAG_SENSITIVITY = 0.4
const MOMENTUM_DECAY = 0.94
const MOMENTUM_MIN = 0.05
const DRAG_THRESHOLD_MOUSE = 3
const DRAG_THRESHOLD_TOUCH = 12
const DEPTH_THRESHOLD = 0.5

interface LayoutParams {
  radius: number
  tiltY: number
  scaleFront: number
  scaleBack: number
}

const LAYOUT_DESKTOP: LayoutParams = { radius: 280, tiltY: 50, scaleFront: 2.0, scaleBack: 0.2 }
const LAYOUT_TABLET: LayoutParams = { radius: 200, tiltY: 38, scaleFront: 1.6, scaleBack: 0.2 }
/** 769–1024px: larger orbit + icons than narrow-desktop tablet band */
const LAYOUT_TABLET_LARGE: LayoutParams = {
  radius: 268,
  tiltY: 48,
  scaleFront: 2.0,
  scaleBack: 0.2,
}
const LAYOUT_MOBILE: LayoutParams = { radius: 180, tiltY: 30, scaleFront: 2.0, scaleBack: 0.1 }

function useResponsiveLayout(): LayoutParams {
  const [params, setParams] = useState<LayoutParams>(LAYOUT_DESKTOP)

  useEffect(() => {
    const mobile = window.matchMedia('(max-width: 768px)')
    const tabletSquarish = window.matchMedia('(min-width: 769px) and (max-width: 1024px)')
    const tablet = window.matchMedia('(max-width: 1100px)')

    const update = () => {
      if (mobile.matches) setParams(LAYOUT_MOBILE)
      else if (tabletSquarish.matches) setParams(LAYOUT_TABLET_LARGE)
      else if (tablet.matches) setParams(LAYOUT_TABLET)
      else setParams(LAYOUT_DESKTOP)
    }

    update()
    mobile.addEventListener('change', update)
    tabletSquarish.addEventListener('change', update)
    tablet.addEventListener('change', update)
    return () => {
      mobile.removeEventListener('change', update)
      tabletSquarish.removeEventListener('change', update)
      tablet.removeEventListener('change', update)
    }
  }, [])

  return params
}

/**
 * Compute 2D x, y, scale, opacities, zIndex, isFront for one carousel item.
 * Back-layer items paint under the watermark (z-index); opacityBack tapers to
 * 0 at the far back (under the hub) and rises toward the sides so icons can
 * emerge from behind near the rim. Front-layer uses opacityFront for depth.
 */
function itemLayout(
  itemAngleDeg: number,
  rotationDeg: number,
  { radius, tiltY, scaleFront, scaleBack }: LayoutParams
) {
  const theta = ((itemAngleDeg + rotationDeg) % 360) * (Math.PI / 180)
  const x = Math.sin(theta) * radius
  const z = Math.cos(theta) * radius

  const depth = (z + radius) / (2 * radius)

  const y = (z / radius) * tiltY
  const scale = scaleBack + (scaleFront - scaleBack) * depth

  const opacityFront = 0.18 + 0.82 * Math.pow(depth, 0.42)
  // Back hemisphere only (depth ≤ 0.5): 0 at center-back, ~1 near the left/right “open” parts of the ring
  const backT = Math.min(1, Math.max(0, depth / DEPTH_THRESHOLD))
  const opacityBack = Math.pow(backT, 2.4)

  const zIndex = Math.round(z + radius)
  const isFront = depth > DEPTH_THRESHOLD
  return { x, y, scale, opacityFront, opacityBack, zIndex, isFront }
}

/* ──────────────────────────────── component ──────────────────────────────── */

export function ProviderCarousel({ providers, onProviderClick }: ProviderCarouselProps) {
  const layoutParams = useResponsiveLayout()
  const { useModalForTooltips } = useResponsive()
  const [rotation, setRotation] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [isCoarsePointer, setIsCoarsePointer] = useState(false)
  const [tooltipProvider, setTooltipProvider] = useState<string | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)

  const sceneRef = useRef<HTMLDivElement>(null)
  const animRef = useRef<number>(0)
  const rotRef = useRef(0)
  const draggingRef = useRef(false)
  const hoveredRef = useRef(false)
  const velRef = useRef(0)
  const startXRef = useRef(0)
  const startYRef = useRef(0)
  const startRotRef = useRef(0)
  const lastXRef = useRef(0)
  const lastTimeRef = useRef(0)
  const didDragRef = useRef(false)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressFiredRef = useRef(false)

  const [touchTooltipProvider, setTouchTooltipProvider] = useState<string | null>(null)

  const count = providers.length
  const angleStep = 360 / count
  const baseAngles = useMemo(() => providers.map((_, i) => i * angleStep), [providers, angleStep])

  // Sync ref
  useEffect(() => {
    rotRef.current = rotation
  }, [rotation])

  useEffect(() => {
    const coarse = window.matchMedia('(pointer: coarse), (any-pointer: coarse)')
    const update = () => setIsCoarsePointer(coarse.matches)
    update()
    coarse.addEventListener('change', update)
    return () => coarse.removeEventListener('change', update)
  }, [])

  // Auto-rotate + momentum loop
  useEffect(() => {
    let live = true
    const tick = () => {
      if (!live) return
      if (!draggingRef.current) {
        if (Math.abs(velRef.current) > MOMENTUM_MIN) {
          rotRef.current += velRef.current
          velRef.current *= MOMENTUM_DECAY
          setRotation(rotRef.current)
        } else if (!hoveredRef.current) {
          velRef.current = 0
          rotRef.current += AUTO_ROTATE_SPEED
          setRotation(rotRef.current)
        }
      }
      animRef.current = requestAnimationFrame(tick)
    }
    animRef.current = requestAnimationFrame(tick)
    return () => {
      live = false
      cancelAnimationFrame(animRef.current)
    }
  }, [])

  // --- Pointer drag via native document listeners ---
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current) return
      const dx = e.clientX - startXRef.current
      const dy = e.clientY - startYRef.current
      const moved = Math.hypot(dx, dy)
      const dragThreshold = e.pointerType === 'touch' ? DRAG_THRESHOLD_TOUCH : DRAG_THRESHOLD_MOUSE
      if (moved > dragThreshold) {
        didDragRef.current = true
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current)
          longPressTimerRef.current = null
        }
      }
      if (!didDragRef.current) return
      const now = performance.now()
      const dt = now - lastTimeRef.current
      if (dt > 0) velRef.current = ((e.clientX - lastXRef.current) / dt) * 10
      lastXRef.current = e.clientX
      lastTimeRef.current = now
      rotRef.current = startRotRef.current + dx * DRAG_SENSITIVITY
      setRotation(rotRef.current)
    }
    const onUp = () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current)
        longPressTimerRef.current = null
      }
      setTouchTooltipProvider(null)
      hoveredRef.current = false
      if (!draggingRef.current) return
      draggingRef.current = false
      setIsDragging(false)
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onUp)
    return () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current)
    }
  }, [])

  const onScenePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    e.preventDefault()
    draggingRef.current = true
    setIsDragging(true)
    didDragRef.current = false
    velRef.current = 0
    startXRef.current = e.clientX
    startYRef.current = e.clientY
    startRotRef.current = rotRef.current
    lastXRef.current = e.clientX
    lastTimeRef.current = performance.now()
  }, [])

  // --- Item handlers ---
  const onItemPointerDown = useCallback((provider: string, e: React.PointerEvent) => {
    if (e.pointerType !== 'touch') return
    longPressFiredRef.current = false
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current)
    longPressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true
      longPressTimerRef.current = null
      setTouchTooltipProvider(provider)
      if (navigator.vibrate) navigator.vibrate(10)
    }, 500)
  }, [])

  const onItemClick = useCallback(
    (provider: string, e: React.MouseEvent) => {
      if (didDragRef.current || longPressFiredRef.current) {
        e.preventDefault()
        e.stopPropagation()
        longPressFiredRef.current = false
        return
      }
      onProviderClick(provider)
    },
    [onProviderClick]
  )

  const onItemEnter = useCallback(
    (provider: string, e: React.PointerEvent) => {
      if (e.pointerType === 'touch' || useModalForTooltips) return
      hoveredRef.current = true
      setTooltipProvider(provider)
    },
    [useModalForTooltips]
  )

  const onItemPointerMove = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return
    setTooltipPos({ x: e.clientX, y: e.clientY })
  }, [])

  const onItemLeave = useCallback(() => {
    hoveredRef.current = false
    setTooltipProvider(null)
    setTooltipPos(null)
  }, [])

  const layouts = providers.map((_, i) => itemLayout(baseAngles[i], rotation, layoutParams))

  const renderItem = (provider: string, i: number, interactive: boolean) => {
    const { x, y, scale, opacityFront, opacityBack, zIndex } = layouts[i]
    const opacity = interactive ? opacityFront : opacityBack
    return (
      <button
        key={provider}
        type="button"
        className={`provider-carousel-item${isCoarsePointer ? ' provider-carousel-item--touch-mode' : ''}`}
        style={{
          transform: `translate(${x}px, ${y}px) scale(${scale})`,
          opacity,
          visibility: opacity < 0.008 ? 'hidden' : undefined,
          zIndex,
        }}
        onClick={interactive ? e => onItemClick(provider, e) : undefined}
        onPointerDown={interactive ? e => onItemPointerDown(provider, e) : undefined}
        onPointerEnter={interactive ? e => onItemEnter(provider, e) : undefined}
        onPointerMove={interactive ? onItemPointerMove : undefined}
        onPointerLeave={interactive ? onItemLeave : undefined}
        onContextMenu={interactive ? e => e.preventDefault() : undefined}
        aria-label={`View ${provider} models`}
        tabIndex={interactive ? 0 : -1}
      >
        <span className="provider-carousel-item-inner">
          <ProviderIcon provider={provider} />
        </span>
      </button>
    )
  }

  return (
    <>
      {/* Back layer — behind the watermark logo */}
      <div className="provider-carousel-wrapper provider-carousel-back" aria-hidden="true">
        <div className="provider-carousel-scene">
          {providers.map((provider, i) =>
            layouts[i].isFront ? null : renderItem(provider, i, false)
          )}
        </div>
      </div>

      {/* Front layer — in front of the watermark logo */}
      <div
        className="provider-carousel-wrapper provider-carousel-front"
        aria-label="AI model providers"
      >
        <div
          ref={sceneRef}
          className={`provider-carousel-scene${isDragging ? ' provider-carousel-scene--dragging' : ''}${isCoarsePointer ? ' provider-carousel-scene--touch' : ''}`}
          onPointerDown={onScenePointerDown}
        >
          {providers.map((provider, i) =>
            layouts[i].isFront ? renderItem(provider, i, true) : null
          )}
        </div>
      </div>

      {tooltipProvider &&
        tooltipPos &&
        createPortal(
          <div
            className="provider-carousel-tooltip"
            style={{ left: tooltipPos.x, top: tooltipPos.y }}
          >
            {tooltipProvider}
          </div>,
          document.body
        )}

      {touchTooltipProvider &&
        createPortal(
          <div
            className="provider-carousel-touch-tooltip"
            style={{
              left: '50%',
              top: 'calc(env(safe-area-inset-top, 0px) + var(--navbar-height, 64px) + 1rem)',
              transform: 'translateX(-50%)',
            }}
          >
            {touchTooltipProvider}
          </div>,
          document.body
        )}
    </>
  )
}
