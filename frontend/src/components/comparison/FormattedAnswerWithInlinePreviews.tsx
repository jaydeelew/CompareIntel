import React, { useEffect, useMemo, useState } from 'react'

import { splitAnswerIntoBlocksWithPreviewUrls } from '../../utils/extractAnswerLinks'
import { getLoadedLatexRenderer, loadLatexRenderer } from '../conversation/latexRendererCache'

import { InlineLinkPreview } from './InlineLinkPreview'

import './InlineLinkPreview.css'

interface LazyLatexRendererProps {
  children: string
  className?: string
  modelId?: string
  streaming?: boolean
}

type LatexRendererComponent = React.ComponentType<LazyLatexRendererProps>

export interface FormattedAnswerWithInlinePreviewsProps {
  content: string
  modelId?: string
  enabled: boolean
  defer?: boolean
  /** Latest reply is still receiving tokens. */
  streaming?: boolean
}

/**
 * Renders formatted markdown in blocks; inserts a preview card after each block
 * that contains a first-occurrence external link (when web search previews are enabled).
 */
export const FormattedAnswerWithInlinePreviews: React.FC<
  FormattedAnswerWithInlinePreviewsProps
> = ({ content, modelId, enabled, defer = false, streaming = false }) => {
  const [LatexView, setLatexView] = useState<LatexRendererComponent | null>(() =>
    getLoadedLatexRenderer()
  )

  useEffect(() => {
    if (LatexView) return
    let cancelled = false
    let retry: ReturnType<typeof setTimeout> | undefined
    let delay = 300
    const run = () => {
      void loadLatexRenderer()
        .then(Renderer => {
          if (!cancelled) setLatexView(() => Renderer)
        })
        .catch(() => {
          if (cancelled) return
          retry = setTimeout(run, delay)
          delay = Math.min(delay * 2, 4000)
        })
    }
    run()
    return () => {
      cancelled = true
      if (retry) clearTimeout(retry)
    }
  }, [LatexView])

  const blocks = useMemo(() => {
    if (!enabled || defer) {
      return [{ text: content, previewUrls: [] as string[] }]
    }
    const split = splitAnswerIntoBlocksWithPreviewUrls(content)
    return split.length > 0 ? split : [{ text: content, previewUrls: [] }]
  }, [content, defer, enabled])

  if (!LatexView) {
    return (
      <div
        className="result-output formatted-with-previews"
        aria-busy="true"
        data-renderer-pending="true"
      />
    )
  }

  return (
    <div
      className="result-output formatted-with-previews"
      data-testid="formatted-answer-with-previews"
    >
      {blocks.map((block, index) => (
        <div key={`block-${index}`} className="formatted-answer-block">
          <LatexView className="formatted-answer-block__md" modelId={modelId} streaming={streaming}>
            {block.text}
          </LatexView>
          {enabled && !defer && block.previewUrls.length > 0 && (
            <div className="formatted-answer-block__previews" data-testid="link-preview-block-row">
              {block.previewUrls.map(url => (
                <InlineLinkPreview key={`${index}-${url}`} url={url} defer={defer} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

FormattedAnswerWithInlinePreviews.displayName = 'FormattedAnswerWithInlinePreviews'
