import type { Model, ModelsByProvider } from '../../types'
import { formatTokenCount } from '../../utils/format'
import {
  getSupportedAspectRatios,
  getSupportedImageSizes,
  orderAspectRatiosLikeAdvanced,
  orderImageSizesLikeAdvanced,
} from '../../utils/imageConfigValidation'

export function ModelInfoPanelContent({
  model,
  modelsByProvider,
}: {
  model: Model
  modelsByProvider: ModelsByProvider
}) {
  const isImageModel = !!model.supports_image_generation
  const aspectText = isImageModel
    ? (() => {
        const a = orderAspectRatiosLikeAdvanced(
          getSupportedAspectRatios(model.id, modelsByProvider)
        )
        return a.length > 0 ? a.join(', ') : '—'
      })()
    : ''
  const sizeText = isImageModel
    ? (() => {
        const s = orderImageSizesLikeAdvanced(getSupportedImageSizes(model.id, modelsByProvider))
        return s.length > 0 ? s.join(', ') : '—'
      })()
    : ''

  return (
    <>
      <span className="tooltip-section">
        <span className="tooltip-row">
          <span className="tooltip-label">Context window:</span>
          <span className="tooltip-value context-window">
            {formatTokenCount(model.max_input_tokens)} tokens
          </span>
        </span>
      </span>
      {isImageModel ? (
        <>
          <span className="tooltip-section">
            <span className="tooltip-row">
              <span className="tooltip-label">Aspect Ratios:</span>
              <span className="tooltip-value">{aspectText}</span>
            </span>
          </span>
          <span className="tooltip-section">
            <span className="tooltip-row">
              <span className="tooltip-label">Image Sizes:</span>
              <span className="tooltip-value">{sizeText}</span>
            </span>
          </span>
        </>
      ) : (
        <span className="tooltip-section">
          <span className="tooltip-row">
            <span className="tooltip-label">Knowledge cutoff:</span>
            {model.knowledge_cutoff ? (
              <span className="tooltip-value cutoff-date">{model.knowledge_cutoff}</span>
            ) : (
              <span className="tooltip-value cutoff-pending">Date pending</span>
            )}
          </span>
        </span>
      )}
    </>
  )
}
