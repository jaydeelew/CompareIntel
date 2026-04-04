import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const PORTAL_HIDE_DELAY_MS = 140

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
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancelHide = useCallback(() => {
    if (hideTimerRef.current != null) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }, [])

  const syncPosition = useCallback(() => {
    const el = anchorRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setPos({
      x: rect.left + rect.width / 2,
      y: rect.top,
    })
  }, [])

  const show = useCallback(() => {
    cancelHide()
    syncPosition()
    setOpen(true)
  }, [cancelHide, syncPosition])

  const hideSoon = useCallback(() => {
    cancelHide()
    hideTimerRef.current = setTimeout(() => setOpen(false), PORTAL_HIDE_DELAY_MS)
  }, [cancelHide])

  useLayoutEffect(() => {
    if (!usePortal || !open) return
    syncPosition()
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

  useEffect(() => () => cancelHide(), [cancelHide])

  useEffect(() => {
    if (!usePortal) return
    const root = anchorRef.current
    if (!root) return

    const onFocusIn = () => {
      if (hideTimerRef.current != null) {
        clearTimeout(hideTimerRef.current)
        hideTimerRef.current = null
      }
      const el = anchorRef.current
      if (el) {
        const rect = el.getBoundingClientRect()
        setPos({
          x: rect.left + rect.width / 2,
          y: rect.top,
        })
      }
      setOpen(true)
    }

    const onFocusOut = (e: FocusEvent) => {
      const next = e.relatedTarget as Node | null
      if (next && root.contains(next)) return
      if (hideTimerRef.current != null) {
        clearTimeout(hideTimerRef.current)
        hideTimerRef.current = null
      }
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
        onMouseLeave={hideSoon}
      >
        {children}
      </span>
      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <span
            className="tooltip-content tooltip-content--portaled"
            role="tooltip"
            style={{ left: pos.x, top: pos.y }}
            onMouseEnter={cancelHide}
            onMouseLeave={hideSoon}
          >
            {text}
          </span>,
          document.body
        )}
    </>
  )
}
