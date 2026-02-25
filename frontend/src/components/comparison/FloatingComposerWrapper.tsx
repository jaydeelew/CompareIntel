/**
 * FloatingComposerWrapper - Wraps the composer when floating, adds drag support.
 * Matches hero composer size (max-width: 700px). Draggable from any part of the composer.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'

const STORAGE_KEY = 'compareintel-floating-composer-position'
const DEFAULT_BOTTOM = 16
const DRAG_THRESHOLD_PX = 5

interface FloatingComposerWrapperProps {
  children: React.ReactNode
  /** When true, ignore saved position and always start centered at bottom */
  resetPositionOnMount?: boolean
}

export function FloatingComposerWrapper({
  children,
  resetPositionOnMount = false,
}: FloatingComposerWrapperProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const dragStartRef = useRef<{
    x: number
    y: number
    left: number
    bottom: number
    hasMoved: boolean
    pointerId: number
  } | null>(null)

  const [position, setPosition] = useState<{ left: number; bottom: number } | null>(() => {
    if (resetPositionOnMount || typeof window === 'undefined') return null
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as { left: number; bottom: number }
        if (
          typeof parsed.left === 'number' &&
          typeof parsed.bottom === 'number' &&
          parsed.left >= 0 &&
          parsed.bottom >= 0
        ) {
          return parsed
        }
      }
    } catch {
      /* ignore */
    }
    return null
  })

  const savePosition = useCallback((pos: { left: number; bottom: number }) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pos))
    } catch {
      /* ignore */
    }
  }, [])

  const [isDragging, setIsDragging] = useState(false)

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!wrapperRef.current) return
      const rect = wrapperRef.current.getBoundingClientRect()
      const currentLeft = position?.left ?? rect.left
      const currentBottom = position?.bottom ?? window.innerHeight - rect.bottom
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        left: currentLeft,
        bottom: currentBottom,
        hasMoved: false,
        pointerId: e.pointerId,
      }
    },
    [position]
  )

  const handlePointerMove = useCallback((e: PointerEvent) => {
    const start = dragStartRef.current
    if (!start) return

    const deltaX = e.clientX - start.x
    const deltaY = start.y - e.clientY // Y is inverted (bottom increases upward)
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)

    if (!start.hasMoved && distance < DRAG_THRESHOLD_PX) return

    if (!start.hasMoved) {
      start.hasMoved = true
      setIsDragging(true)
      try {
        wrapperRef.current?.setPointerCapture(start.pointerId)
      } catch {
        /* ignore */
      }
    }

    const wrapper = wrapperRef.current
    const width = wrapper?.offsetWidth ?? 0
    const height = wrapper?.offsetHeight ?? 0

    let newLeft = start.left + deltaX
    let newBottom = start.bottom + deltaY

    // Constrain to viewport
    newLeft = Math.max(0, Math.min(window.innerWidth - width, newLeft))
    newBottom = Math.max(0, Math.min(window.innerHeight - height, newBottom))

    setPosition({ left: newLeft, bottom: newBottom })
  }, [])

  const handlePointerUp = useCallback(() => {
    if (dragStartRef.current) {
      dragStartRef.current = null
      setIsDragging(false)
    }
  }, [])

  // Persist position when it changes (after drag ends)
  useEffect(() => {
    if (position) {
      savePosition(position)
    }
  }, [position, savePosition])

  useEffect(() => {
    document.addEventListener('pointermove', handlePointerMove)
    document.addEventListener('pointerup', handlePointerUp)
    document.addEventListener('pointercancel', handlePointerUp)
    return () => {
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerup', handlePointerUp)
      document.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [handlePointerMove, handlePointerUp])

  const style: React.CSSProperties = position
    ? {
        left: position.left,
        bottom: position.bottom,
        right: 'auto',
        transform: 'none',
      }
    : {
        left: '50%',
        right: 'auto',
        bottom: DEFAULT_BOTTOM,
        transform: 'translateX(-50%)',
      }

  return (
    <div
      ref={wrapperRef}
      className={`composer-floating-wrapper ${isDragging ? 'composer-dragging' : ''}`}
      style={style}
      onPointerDown={handlePointerDown}
      role="application"
      aria-label="Floating composer - drag to reposition"
    >
      {children}
    </div>
  )
}
