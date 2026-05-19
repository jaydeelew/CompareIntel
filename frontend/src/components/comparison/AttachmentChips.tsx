import FileText from 'lucide-react/dist/esm/icons/file-text'
import X from 'lucide-react/dist/esm/icons/x'
import { memo, useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react'

import { getImageAttachmentPreviewSrc, isImageAttachment } from '../../utils/attachmentImagePreview'
import { removePlaceholderFromInput } from '../../utils/attachmentInputUtils'
import { StyledTooltip } from '../shared'

import type { AttachedFile, StoredAttachedFile } from './FileUpload'

export interface AttachmentChipsProps {
  attachedFiles: (AttachedFile | StoredAttachedFile)[]
  setAttachedFiles: Dispatch<SetStateAction<(AttachedFile | StoredAttachedFile)[]>>
  setInput: Dispatch<SetStateAction<string>>
  disabled?: boolean
  /** When true, image filename uses StyledTooltip (portaled) instead of the native title tooltip */
  imageTooltipUsePortal?: boolean
}

function ImageAttachmentThumbnail({
  file,
  disabled,
  onRemove,
  tooltipUsePortal = false,
}: {
  file: AttachedFile | StoredAttachedFile
  disabled: boolean
  onRemove: () => void
  tooltipUsePortal?: boolean
}) {
  const dataUrl = getImageAttachmentPreviewSrc(file)
  const [objectUrl, setObjectUrl] = useState<string | null>(null)

  useEffect(() => {
    if (dataUrl) return
    if (!('file' in file) || !file.file.type.startsWith('image/')) return
    const url = URL.createObjectURL(file.file)
    setObjectUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [dataUrl, file])

  const src = dataUrl ?? objectUrl
  if (!src) return null

  return (
    <div
      className="composer-attachment-thumbnail"
      role="listitem"
      data-testid="composer-attachment-thumbnail"
    >
      {tooltipUsePortal ? (
        <StyledTooltip text={file.name} usePortal className="composer-attachment-thumbnail-tooltip">
          <img src={src} alt={file.name} className="composer-attachment-thumbnail-img" />
        </StyledTooltip>
      ) : (
        <span className="composer-attachment-thumbnail-tooltip" title={file.name}>
          <img src={src} alt={file.name} className="composer-attachment-thumbnail-img" />
        </span>
      )}
      <button
        type="button"
        className="composer-attachment-thumbnail-remove"
        aria-label={`Remove ${file.name}`}
        disabled={disabled}
        onClick={onRemove}
      >
        <X size={14} strokeWidth={2.25} aria-hidden />
      </button>
    </div>
  )
}

export const AttachmentChips = memo(function AttachmentChips({
  attachedFiles,
  setAttachedFiles,
  setInput,
  disabled = false,
  imageTooltipUsePortal = false,
}: AttachmentChipsProps) {
  const removeAttachment = useCallback(
    (id: string, placeholder: string) => {
      setAttachedFiles(prev => prev.filter(f => f.id !== id))
      setInput(prev => removePlaceholderFromInput(prev, placeholder))
    },
    [setAttachedFiles, setInput]
  )

  if (attachedFiles.length === 0) return null

  return (
    <div className="composer-attachment-chips" role="list" aria-label="Attached files">
      {attachedFiles.map(f => {
        if (isImageAttachment(f)) {
          return (
            <ImageAttachmentThumbnail
              key={f.id}
              file={f}
              disabled={disabled}
              tooltipUsePortal={imageTooltipUsePortal}
              onRemove={() => removeAttachment(f.id, f.placeholder)}
            />
          )
        }

        return (
          <div key={f.id} className="composer-attachment-chip" role="listitem">
            <span className="composer-attachment-chip-icon" aria-hidden>
              <FileText size={14} strokeWidth={2} />
            </span>
            <span className="composer-attachment-chip-name" title={f.name}>
              {f.name}
            </span>
            <button
              type="button"
              className="composer-attachment-chip-remove"
              aria-label={`Remove ${f.name}`}
              disabled={disabled}
              onClick={() => removeAttachment(f.id, f.placeholder)}
            >
              <X size={14} strokeWidth={2.25} aria-hidden />
            </button>
          </div>
        )
      })}
    </div>
  )
})
