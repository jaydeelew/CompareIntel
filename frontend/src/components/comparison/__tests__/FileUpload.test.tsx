/**
 * Tests for FileUpload component - image attachment, placeholder, cursor placement
 */
/// <reference types="@testing-library/jest-dom" />

import { render } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { FileUpload } from '../FileUpload'

const mockNotificationController = Object.assign(vi.fn(), {
  clearAutoRemove: vi.fn(),
})
const mockShowNotification = vi.fn(() => mockNotificationController)

vi.mock('../../../utils/error', () => ({
  showNotification: (...args: unknown[]) => mockShowNotification(...args),
}))

vi.mock('../../../utils/logger', () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}))

describe('FileUpload', () => {
  let setInput: ReturnType<typeof vi.fn>
  let setAttachedFiles: ReturnType<typeof vi.fn>
  let textarea: HTMLTextAreaElement
  let textareaRef: React.RefObject<HTMLTextAreaElement | null>

  beforeEach(() => {
    vi.clearAllMocks()
    setInput = vi.fn()
    setAttachedFiles = vi.fn()
    textarea = document.createElement('textarea')
    textarea.value = ''
    textarea.setSelectionRange(0, 0)
    document.body.appendChild(textarea)
    textareaRef = { current: textarea }
  })

  afterEach(() => {
    textarea.remove()
    vi.unstubAllGlobals()
  })

  const renderFileUpload = (input = '') => {
    const ref = { current: null as { processFile: (file: File) => Promise<boolean> } | null }
    render(
      <FileUpload
        ref={ref}
        attachedFiles={[]}
        setAttachedFiles={setAttachedFiles}
        input={input}
        setInput={setInput}
        textareaRef={textareaRef}
      />
    )
    return ref
  }

  const createImageFile = (name = 'photo.jpg') => new File(['x'], name, { type: 'image/jpeg' })

  const mockFileReader = (base64 = 'base64data') => {
    const mockResult = `data:image/jpeg;base64,${base64}`
    vi.stubGlobal(
      'FileReader',
      class MockFileReader {
        result: string | ArrayBuffer | null = null
        onload: ((e: ProgressEvent<FileReader>) => void) | null = null
        onerror: ((e: ProgressEvent<FileReader>) => void) | null = null

        readAsDataURL() {
          queueMicrotask(() => {
            this.result = mockResult
            this.onload?.({} as ProgressEvent<FileReader>)
          })
        }
      }
    )
  }

  it('adds image placeholder with trailing newline when image file is attached', async () => {
    mockFileReader()
    const ref = renderFileUpload('')

    textarea.value = ''
    textarea.setSelectionRange(0, 0)

    const file = createImageFile('photo.jpg')
    const result = await ref.current!.processFile(file)

    expect(result).toBe(true)
    expect(setInput).toHaveBeenCalledWith('[image: photo.jpg]\n')
  })

  it('places cursor on the line after the image placeholder', async () => {
    vi.useFakeTimers()
    mockFileReader()
    const setSelectionRangeSpy = vi.spyOn(HTMLTextAreaElement.prototype, 'setSelectionRange')
    const focusSpy = vi.spyOn(HTMLTextAreaElement.prototype, 'focus')

    const ref = renderFileUpload('')
    const file = createImageFile('test.png')

    const processPromise = ref.current!.processFile(file)
    await processPromise

    // processFile uses setTimeout(0) for cursor placement
    await vi.runAllTimersAsync()

    const placeholder = '[image: test.png]\n'
    expect(setSelectionRangeSpy).toHaveBeenCalledWith(placeholder.length, placeholder.length)
    expect(focusSpy).toHaveBeenCalled()

    vi.useRealTimers()
  })

  it('inserts image placeholder at cursor with trailing newline when input has text', async () => {
    mockFileReader()
    const ref = renderFileUpload('Hello world')
    textarea.value = 'Hello world'
    textarea.setSelectionRange(5, 5) // cursor after "Hello"

    const file = createImageFile('img.jpeg')
    await ref.current!.processFile(file)

    // textBefore="Hello", textAfter=" world" -> separatorBefore="\n\n", separatorAfter="\n\n"
    expect(setInput).toHaveBeenCalledWith('Hello\n\n[image: img.jpeg]\n\n\n world')
  })

  it('adds trailing newline for non-image (text) files', async () => {
    const ref = renderFileUpload('')
    const file = new File(['content'], 'doc.txt', { type: 'text/plain' })

    await ref.current!.processFile(file)

    expect(setInput).toHaveBeenCalledWith('[file: doc.txt]\n')
  })

  it('adds attached image to setAttachedFiles with base64Data and placeholder', async () => {
    mockFileReader('abc123')
    const ref = renderFileUpload('')

    await ref.current!.processFile(createImageFile('photo.png'))

    expect(setAttachedFiles).toHaveBeenCalledTimes(1)
    const [files] = setAttachedFiles.mock.calls[0]
    expect(files).toHaveLength(1)
    expect(files[0]).toMatchObject({
      name: 'photo.png',
      placeholder: '[image: photo.png]',
      base64Data: 'abc123',
      mimeType: 'image/jpeg',
    })
  })

  it('rejects unsupported file types', async () => {
    const ref = renderFileUpload('')
    const file = new File(['x'], 'bad.exe', { type: 'application/x-msdownload' })

    const result = await ref.current!.processFile(file)

    expect(result).toBe(false)
    expect(setInput).not.toHaveBeenCalled()
    expect(setAttachedFiles).not.toHaveBeenCalled()
    expect(mockShowNotification).toHaveBeenCalledWith(
      expect.stringContaining('Only text, code, document, and image files'),
      'error'
    )
  })
})
