import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'

export interface ReasoningCollapsibleProps {
  text: string
  isProcessing: boolean
  answerStarted: boolean
}

const BODY_BOTTOM_THRESHOLD_PX = 8

function isBodyScrolledToBottom(el: HTMLElement): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= BODY_BOTTOM_THRESHOLD_PX
}

/**
 * Ephemeral streaming "reasoning / thinking" panel. Open while reasoning streams;
 * collapses when answer content starts; stays available (collapsed by default) after
 * streaming ends until cleared by a new comparison, refresh, or login. Not persisted.
 *
 * The body auto-scrolls to follow streaming text unless the user scrolls away (same
 * idea as the main conversation auto-scroll).
 */
export const ReasoningCollapsible: React.FC<ReasoningCollapsibleProps> = ({
  text,
  isProcessing,
  answerStarted,
}) => {
  const [open, setOpen] = useState(true)
  const bodyRef = useRef<HTMLPreElement>(null)
  const autoScrollPausedRef = useRef(false)
  const lastBodyScrollTopRef = useRef(0)

  useEffect(() => {
    if (answerStarted) {
      setOpen(false)
    } else if (isProcessing && text.trim().length > 0) {
      setOpen(true)
    }
  }, [answerStarted, isProcessing, text])

  useLayoutEffect(() => {
    const el = bodyRef.current
    if (!el || !text.trim()) return
    if (autoScrollPausedRef.current) return
    el.scrollTop = el.scrollHeight
    lastBodyScrollTopRef.current = el.scrollTop
  }, [text])

  useEffect(() => {
    const el = bodyRef.current
    if (!el) return

    const handleScroll = () => {
      const cur = el.scrollTop
      if (cur < lastBodyScrollTopRef.current - 1) {
        autoScrollPausedRef.current = true
      } else if (isBodyScrolledToBottom(el)) {
        autoScrollPausedRef.current = false
      }
      lastBodyScrollTopRef.current = cur
    }

    const pauseIfUserLeftBottom = () => {
      if (!isBodyScrolledToBottom(el)) {
        autoScrollPausedRef.current = true
      }
    }

    el.addEventListener('scroll', handleScroll, { passive: true })
    el.addEventListener('wheel', pauseIfUserLeftBottom, { passive: true })
    el.addEventListener('touchstart', pauseIfUserLeftBottom, { passive: true })
    el.addEventListener('mousedown', pauseIfUserLeftBottom, { passive: true })

    return () => {
      el.removeEventListener('scroll', handleScroll)
      el.removeEventListener('wheel', pauseIfUserLeftBottom)
      el.removeEventListener('touchstart', pauseIfUserLeftBottom)
      el.removeEventListener('mousedown', pauseIfUserLeftBottom)
    }
  }, [text])

  if (!text.trim()) {
    return null
  }

  return (
    <details
      className="reasoning-collapsible"
      open={open}
      onToggle={e => setOpen(e.currentTarget.open)}
    >
      <summary className="reasoning-collapsible-summary">Reasoning</summary>
      <pre
        ref={bodyRef}
        className="reasoning-collapsible-body"
        role="region"
        aria-label="Model reasoning"
      >
        {text}
      </pre>
    </details>
  )
}

ReasoningCollapsible.displayName = 'ReasoningCollapsible'
