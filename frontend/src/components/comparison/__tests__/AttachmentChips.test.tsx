/**
 * Tests for AttachmentChips — image thumbnails vs document filename chips.
 */
/// <reference types="@testing-library/jest-dom" />

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'

import { AttachmentChips } from '../AttachmentChips'
import type { AttachedFile } from '../FileUpload'

describe('AttachmentChips', () => {
  it('renders an image thumbnail with preview src instead of a filename chip', () => {
    const image: AttachedFile = {
      id: 'img-1',
      file: new File([], 'photo.png', { type: 'image/png' }),
      name: 'photo.png',
      placeholder: '[image: photo.png]',
      base64Data: 'YWJj',
      mimeType: 'image/png',
    }

    render(
      <AttachmentChips
        attachedFiles={[image]}
        setAttachedFiles={vi.fn()}
        setInput={vi.fn()}
        imageTooltipUsePortal
      />
    )

    expect(screen.getByTestId('composer-attachment-thumbnail')).toBeInTheDocument()
    const img = screen.getByRole('img', { name: 'photo.png' })
    expect(img.closest('.composer-attachment-thumbnail-tooltip')).toHaveClass('tooltip')
    expect(img).toHaveAttribute('src', 'data:image/png;base64,YWJj')
    expect(screen.queryByText('photo.png')).not.toBeInTheDocument()
  })

  it('renders a filename chip for non-image attachments', () => {
    const doc: AttachedFile = {
      id: 'doc-1',
      file: new File([], 'notes.txt', { type: 'text/plain' }),
      name: 'notes.txt',
      placeholder: '[file: notes.txt]',
    }

    render(<AttachmentChips attachedFiles={[doc]} setAttachedFiles={vi.fn()} setInput={vi.fn()} />)

    expect(screen.queryByTestId('composer-attachment-thumbnail')).not.toBeInTheDocument()
    expect(screen.getByText('notes.txt')).toBeInTheDocument()
  })

  it('removes image attachment when thumbnail remove is clicked', async () => {
    const user = userEvent.setup()
    const setAttachedFiles = vi.fn()
    const setInput = vi.fn()
    const image: AttachedFile = {
      id: 'img-2',
      file: new File([], 'x.jpg', { type: 'image/jpeg' }),
      name: 'x.jpg',
      placeholder: '[image: x.jpg]',
      base64Data: 'eA==',
      mimeType: 'image/jpeg',
    }

    render(
      <AttachmentChips
        attachedFiles={[image]}
        setAttachedFiles={setAttachedFiles}
        setInput={setInput}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Remove x.jpg' }))
    expect(setAttachedFiles).toHaveBeenCalled()
    expect(setInput).toHaveBeenCalled()
  })
})
