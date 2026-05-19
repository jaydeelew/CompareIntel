/**
 * Integration test: composer textarea paste attaches clipboard images (vision workflow).
 */
/// <reference types="@testing-library/jest-dom" />

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

import { getImageFileFromClipboard } from '../../../utils/clipboardImage'

function PasteTarget({ onImagePaste }: { onImagePaste: (file: File) => void }) {
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const imageFile = getImageFileFromClipboard(e.clipboardData)
    if (!imageFile) return
    e.preventDefault()
    onImagePaste(imageFile)
  }

  return (
    <textarea
      data-testid="comparison-input-textarea"
      onPaste={handlePaste}
      aria-label="Enter your prompt to compare AI models"
    />
  )
}

describe('composer image paste', () => {
  it('attaches pasted image and does not block text-only paste', () => {
    const onImagePaste = vi.fn()
    render(<PasteTarget onImagePaste={onImagePaste} />)
    const textarea = screen.getByTestId('comparison-input-textarea')

    const image = new File([new Uint8Array([1])], '', { type: 'image/png' })
    const imageClipboard = {
      items: [
        {
          type: 'image/png',
          getAsFile: () => image,
        },
      ],
      files: [],
      types: ['image/png'],
    } as DataTransfer

    fireEvent.paste(textarea, { clipboardData: imageClipboard })
    expect(onImagePaste).toHaveBeenCalledTimes(1)
    expect(onImagePaste.mock.calls[0][0].name).toBe('pasted-image.png')

    onImagePaste.mockClear()
    const textClipboard = {
      items: [],
      files: [],
      types: ['text/plain'],
    } as DataTransfer

    fireEvent.paste(textarea, { clipboardData: textClipboard })
    expect(onImagePaste).not.toHaveBeenCalled()
  })
})
