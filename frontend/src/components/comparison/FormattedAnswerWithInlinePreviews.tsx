import React, { useEffect, useMemo, useState } from 'react'

import { splitAnswerIntoBlocksWithPreviewUrls } from '../../utils/extractAnswerLinks'

import { InlineLinkPreview } from './InlineLinkPreview'

import './InlineLinkPreview.css'

interface LazyLatexRendererProps {
  children: string
  className?: string
  modelId?: string
  streaming?: boolean
}

type LatexRendererComponent = React.ComponentType<LazyLatexRendererProps>

let loadedLatexRenderer: LatexRendererComponent | null = null

const loadLatexRenderer = () =>
  import('../LatexRenderer').then(module => {
    loadedLatexRenderer = module.default
    return module.default
  })

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
  const [LatexView, setLatexView] = useState<LatexRendererComponent | null>(
    () => loadedLatexRenderer
  )

  useEffect(() => {
    if (LatexView) return
    let cancelled = false
    void loadLatexRenderer().then(Renderer => {
      if (!cancelled) setLatexView(() => Renderer)
    })
    return () => {
      cancelled = true
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
      >
        {streaming ? null : content}
      </div>
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
