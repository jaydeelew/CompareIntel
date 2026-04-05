import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

const VIEWPORT_MARGIN_PX = 8

/** Keep tooltip bubble fully inside the viewport; when impossible, center horizontally. */
function clampTooltipCenterX(anchorCenterX: number, tooltipWidth: number): number {
  const half = tooltipWidth / 2
  const vw = window.innerWidth
  const minCenter = VIEWPORT_MARGIN_PX + half
  const maxCenter = vw - VIEWPORT_MARGIN_PX - half
  if (minCenter > maxCenter) {
    return vw / 2
  }
  return Math.max(minCenter, Math.min(maxCenter, anchorCenterX))
}

interface StyledTooltipProps {
  /** Tooltip text shown on hover */
  text: string
  /** Child element(s) to wrap - receives the tooltip on hover */
  children: ReactNode
  /** Optional className for the wrapper */
  className?: string
  /**
   * When true, the tooltip is rendered in `document.body` with fixed positioning so it is not
   * clipped by ancestors with `overflow: hidden` (e.g. the main composer card).
   */
  usePortal?: boolean
}

export function StyledTooltip({
  text,
  children,
  className = '',
  usePortal = false,
}: StyledTooltipProps) {
  const anchorRef = useRef<HTMLSpanElement>(null)
  const tooltipRef = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ x: number; y: number; arrowLeftPx?: number }>({ x: 0, y: 0 })

  const syncPosition = useCallback(() => {
    const el = anchorRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const anchorCenterX = rect.left + rect.width / 2
    let centerX = anchorCenterX
    let arrowLeftPx: number | undefined

    const tooltipEl = tooltipRef.current
    if (tooltipEl) {
      const w = tooltipEl.offsetWidth
      if (w > 0) {
        centerX = clampTooltipCenterX(anchorCenterX, w)
        arrowLeftPx = anchorCenterX - centerX + w / 2
      }
    }

    setPos({ x: centerX, y: rect.top, arrowLeftPx })
  }, [])

  const show = useCallback(() => {
    syncPosition()
    setOpen(true)
  }, [syncPosition])

  const hide = useCallback(() => {
    setOpen(false)
  }, [])

  useLayoutEffect(() => {
    if (!usePortal || !open) return
    syncPosition()
    const id = requestAnimationFrame(() => syncPosition())
    return () => cancelAnimationFrame(id)
  }, [usePortal, open, syncPosition, text])

  useEffect(() => {
    if (!usePortal || !open) return
    const onViewportChange = () => syncPosition()
    window.addEventListener('scroll', onViewportChange, true)
    window.addEventListener('resize', onViewportChange)
    return () => {
      window.removeEventListener('scroll', onViewportChange, true)
      window.removeEventListener('resize', onViewportChange)
    }
  }, [usePortal, open, syncPosition])

  useEffect(() => {
    if (!usePortal) return
    const root = anchorRef.current
    if (!root) return

    const onFocusIn = () => {
      setOpen(true)
    }

    const onFocusOut = (e: FocusEvent) => {
      const next = e.relatedTarget as Node | null
      if (next && root.contains(next)) return
      setOpen(false)
    }

    root.addEventListener('focusin', onFocusIn)
    root.addEventListener('focusout', onFocusOut)
    return () => {
      root.removeEventListener('focusin', onFocusIn)
      root.removeEventListener('focusout', onFocusOut)
    }
  }, [usePortal])

  if (!usePortal) {
    return (
      <span className={`tooltip ${className}`.trim()}>
        {children}
        <span className="tooltip-content" role="tooltip">
          {text}
        </span>
      </span>
    )
  }

  return (
    <>
      <span
        ref={anchorRef}
        className={`tooltip tooltip--portal-anchor ${className}`.trim()}
        onMouseEnter={show}
        onMouseLeave={hide}
      >
        {children}
      </span>
      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <span
            ref={tooltipRef}
            className="tooltip-content tooltip-content--portaled"
            role="tooltip"
            style={
              {
                left: pos.x,
                top: pos.y,
                ...(pos.arrowLeftPx != null
                  ? { '--tooltip-arrow-left': `${pos.arrowLeftPx}px` }
                  : {}),
              } as CSSProperties
            }
            onMouseLeave={hide}
          >
            {text}
          </span>,
          document.body
        )}
    </>
  )
}
