/**
 * Integration test: composer textarea paste attaches clipboard files (images and documents).
 */
/// <reference types="@testing-library/jest-dom" />

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

import { getFirstFileFromClipboard } from '../../../utils/clipboardFiles'

function PasteTarget({ onFilePaste }: { onFilePaste: (file: File) => void }) {
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const file = getFirstFileFromClipboard(e.clipboardData)
    if (!file) return
    e.preventDefault()
    onFilePaste(file)
  }

  return (
    <textarea
      data-testid="comparison-input-textarea"
      onPaste={handlePaste}
      aria-label="Enter your prompt to compare AI models"
    />
  )
}

describe('composer file paste', () => {
  it('attaches pasted image and does not block text-only paste', () => {
    const onFilePaste = vi.fn()
    render(<PasteTarget onFilePaste={onFilePaste} />)
    const textarea = screen.getByTestId('comparison-input-textarea')

    const image = new File([new Uint8Array([1])], '', { type: 'image/png' })
    const imageClipboard = {
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => image }],
      files: [],
      types: ['image/png'],
    } as DataTransfer

    fireEvent.paste(textarea, { clipboardData: imageClipboard })
    expect(onFilePaste).toHaveBeenCalledTimes(1)
    expect(onFilePaste.mock.calls[0][0].name).toBe('pasted-image.png')

    onFilePaste.mockClear()
    fireEvent.paste(textarea, {
      clipboardData: {
        items: [{ kind: 'string', type: 'text/plain', getAsFile: () => null }],
        files: [],
        types: ['text/plain'],
      } as DataTransfer,
    })
    expect(onFilePaste).not.toHaveBeenCalled()
  })

  it('attaches pasted document files', () => {
    const onFilePaste = vi.fn()
    render(<PasteTarget onFilePaste={onFilePaste} />)
    const textarea = screen.getByTestId('comparison-input-textarea')

    const pdf = new File([new Uint8Array([1])], 'spec.pdf', { type: 'application/pdf' })
    fireEvent.paste(textarea, {
      clipboardData: {
        items: [{ kind: 'file', type: 'application/pdf', getAsFile: () => pdf }],
        files: [pdf],
        types: ['Files'],
      } as DataTransfer,
    })

    expect(onFilePaste).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'spec.pdf', type: 'application/pdf' })
    )
  })
})
