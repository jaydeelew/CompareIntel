import React, { memo, useEffect, useMemo, useRef } from 'react'

import { splitStreamingRender } from '../utils/latex/streamingSplit'
import { getPrism } from '../utils/prismLoader'

const LATEX_STYLE: React.CSSProperties = {
  whiteSpace: 'normal',
  fontFamily: 'inherit',
  lineHeight: 'inherit',
  wordWrap: 'break-word',
  overflowWrap: 'break-word',
  maxWidth: '100%',
}

interface StreamBlockProps {
  source: string
  blockKey: string
  renderLatex: (text: string) => string
  prismLoaded: boolean
}

const StreamBlock = memo(
  function StreamBlock({ source, blockKey, renderLatex, prismLoaded }: StreamBlockProps) {
    const ref = useRef<HTMLDivElement>(null)
    const html = useMemo(() => renderLatex(source), [renderLatex, source])

    useEffect(() => {
      const node = ref.current
      if (!node) return
      let cancelled = false
      let inner = 0
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => {
          if (cancelled || !ref.current) return
          const el = ref.current
          const codes = el.querySelectorAll('code[class*="language-"]')
          if (codes.length > 0 && prismLoaded) {
            const Prism = getPrism()
            if (Prism?.highlightAllUnder) {
              try {
                Prism.highlightAllUnder(el)
              } catch {
                // An unknown grammar leaves the escaped code text in place.
              }
            }
          }
          if (codes.length === 0 || prismLoaded) {
            el.setAttribute('data-stream-settled', 'true')
          }
        })
      })
      return () => {
        cancelled = true
        cancelAnimationFrame(outer)
        if (inner) cancelAnimationFrame(inner)
      }
    }, [html, prismLoaded])

    return (
      <div
        ref={ref}
        className="latex-stream-block"
        data-stream-block={blockKey}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    )
  },
  (prev, next) =>
    prev.source === next.source &&
    prev.blockKey === next.blockKey &&
    prev.prismLoaded === next.prismLoaded &&
    prev.renderLatex === next.renderLatex
)

export interface StreamingLatexProps {
  source: string
  className?: string
  contentRef: React.Ref<HTMLDivElement>
  renderLatex: (text: string) => string
  prismLoaded: boolean
}

/**
 * Renders a growing reply as stable blocks. Completed blocks keep their DOM
 * nodes. The unclosed tail is not painted, so raw `$$`, fences, and table
 * separators never flash.
 */
export function StreamingLatex({
  source,
  className = '',
  contentRef,
  renderLatex,
  prismLoaded,
}: StreamingLatexProps) {
  const split = useMemo(() => splitStreamingRender(source), [source])
  const tailHtml = useMemo(
    () => (split.visibleTail ? renderLatex(split.visibleTail) : ''),
    [renderLatex, split.visibleTail]
  )

  return (
    <div
      ref={contentRef}
      className={`latex-content ${className}`}
      data-streaming-render="true"
      style={LATEX_STYLE}
    >
      {split.blocks.map(block => (
        <StreamBlock
          key={block.key}
          blockKey={block.key}
          source={block.source}
          renderLatex={renderLatex}
          prismLoaded={prismLoaded}
        />
      ))}
      {split.visibleTail ? (
        <div
          className="latex-stream-tail"
          data-stream-tail="true"
          dangerouslySetInnerHTML={{ __html: tailHtml }}
        />
      ) : null}
    </div>
  )
}
