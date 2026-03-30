import { FileText, Image as ImageIcon, X } from 'lucide-react'
import { memo, useCallback, type Dispatch, type SetStateAction } from 'react'

import { removePlaceholderFromInput } from '../../utils/attachmentInputUtils'

import type { AttachedFile, StoredAttachedFile } from './FileUpload'

export interface AttachmentChipsProps {
  attachedFiles: (AttachedFile | StoredAttachedFile)[]
  setAttachedFiles: Dispatch<SetStateAction<(AttachedFile | StoredAttachedFile)[]>>
  setInput: Dispatch<SetStateAction<string>>
  disabled?: boolean
}

function isImageAttachment(f: AttachedFile | StoredAttachedFile): boolean {
  return 'base64Data' in f && !!(f as AttachedFile).base64Data
}

export const AttachmentChips = memo(function AttachmentChips({
  attachedFiles,
  setAttachedFiles,
  setInput,
  disabled = false,
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
        const image = isImageAttachment(f)
        return (
          <div key={f.id} className="composer-attachment-chip" role="listitem">
            <span className="composer-attachment-chip-icon" aria-hidden>
              {image ? (
                <ImageIcon size={14} strokeWidth={2} />
              ) : (
                <FileText size={14} strokeWidth={2} />
              )}
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
