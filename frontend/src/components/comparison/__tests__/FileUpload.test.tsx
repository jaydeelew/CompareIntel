/**
 * Tests for FileUpload component - attachment state, cursor/focus after attach (placeholders are chips, not textarea text)
 */
/// <reference types="@testing-library/jest-dom" />

import { act, render } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { FileUpload } from '../FileUpload'

const mockNotificationController = Object.assign(vi.fn(), {
  clearAutoRemove: vi.fn(),
  setIcon: vi.fn(),
})
const mockShowNotification = vi.fn(() => mockNotificationController)

vi.mock('../../../utils/error', () => ({
  NOTIFICATION_LOADING_SPINNER_HTML:
    '<span class="modern-spinner notification-loading-spinner"></span>',
  showNotification: (...args: unknown[]) => mockShowNotification(...args),
}))

vi.mock('../../../utils/logger', () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}))

const mockConvertHeicToJpeg = vi.fn()

vi.mock('../../../utils/convertHeicToJpeg', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../utils/convertHeicToJpeg')>()
  return {
    ...actual,
    convertHeicToJpeg: (...args: Parameters<typeof actual.convertHeicToJpeg>) =>
      mockConvertHeicToJpeg(...args),
  }
})

describe('FileUpload', () => {
  let setInput: ReturnType<typeof vi.fn>
  let setAttachedFiles: ReturnType<typeof vi.fn>
  let textarea: HTMLTextAreaElement
  let textareaRef: React.RefObject<HTMLTextAreaElement | null>

  beforeEach(() => {
    vi.clearAllMocks()
    mockConvertHeicToJpeg.mockReset()
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

  it('does not insert attachment text into textarea when composer is empty', async () => {
    mockFileReader()
    const ref = renderFileUpload('')

    textarea.value = ''
    textarea.setSelectionRange(0, 0)

    const file = createImageFile('photo.jpg')
    const result = await ref.current!.processFile(file)

    expect(result).toBe(true)
    expect(setInput).not.toHaveBeenCalled()
  })

  it('focuses textarea after attaching when input is empty', async () => {
    vi.useFakeTimers()
    mockFileReader()
    const setSelectionRangeSpy = vi.spyOn(HTMLTextAreaElement.prototype, 'setSelectionRange')
    const focusSpy = vi.spyOn(HTMLTextAreaElement.prototype, 'focus')

    const ref = renderFileUpload('')
    const file = createImageFile('test.png')

    const processPromise = ref.current!.processFile(file)
    await processPromise

    await vi.runAllTimersAsync()

    expect(setSelectionRangeSpy).not.toHaveBeenCalled()
    expect(focusSpy).toHaveBeenCalled()

    vi.useRealTimers()
  })

  it('inserts line breaks at cursor when input has text so user can type after attach', async () => {
    mockFileReader()
    const ref = renderFileUpload('Hello world')
    textarea.value = 'Hello world'
    textarea.setSelectionRange(5, 5) // cursor after "Hello"

    const file = createImageFile('img.jpeg')
    await ref.current!.processFile(file)

    // textBefore="Hello", textAfter=" world" -> separatorBefore="\n\n", separatorAfter="\n\n", insertion="\n"
    expect(setInput).toHaveBeenCalledWith('Hello\n\n\n\n\n world')
  })

  it('does not change textarea text for non-image when composer is empty', async () => {
    const ref = renderFileUpload('')
    const file = new File(['content'], 'doc.txt', { type: 'text/plain' })

    await ref.current!.processFile(file)

    expect(setInput).not.toHaveBeenCalled()
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

  it('accepts clipboard-style images with empty filename via mime type', async () => {
    mockFileReader('clipdata')
    const ref = renderFileUpload('')

    const clipboardImage = new File([new Uint8Array([1, 2, 3])], '', { type: 'image/png' })
    const result = await ref.current!.processFile(clipboardImage)

    expect(result).toBe(true)
    expect(setAttachedFiles).toHaveBeenCalledTimes(1)
    const [files] = setAttachedFiles.mock.calls[0]
    expect(files[0]).toMatchObject({
      placeholder: '[image: ]',
      base64Data: 'clipdata',
      mimeType: 'image/png',
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

  it('converts HEIC to JPEG before attaching', async () => {
    mockFileReader('heic-converted')
    const jpegFile = new File(['jpeg'], 'photo.jpg', { type: 'image/jpeg' })
    mockConvertHeicToJpeg.mockResolvedValue(jpegFile)

    const ref = renderFileUpload('')
    const heicFile = new File(['heic'], 'photo.heic', { type: 'image/heic' })
    let result = false
    await act(async () => {
      result = (await ref.current!.processFile(heicFile)) ?? false
    })

    expect(result).toBe(true)
    expect(mockConvertHeicToJpeg).toHaveBeenCalledWith(heicFile)
    expect(mockShowNotification).toHaveBeenCalledWith('Converting HEIC to JPEG…', 'success')
    expect(mockNotificationController.setIcon).toHaveBeenCalled()
    expect(setAttachedFiles).toHaveBeenCalledTimes(1)
    const [files] = setAttachedFiles.mock.calls[0]
    expect(files[0]).toMatchObject({
      name: 'photo.jpg',
      placeholder: '[image: photo.jpg]',
      base64Data: 'heic-converted',
      mimeType: 'image/jpeg',
    })
  })

  it('shows error when HEIC conversion fails', async () => {
    mockConvertHeicToJpeg.mockRejectedValue(new Error('Conversion failed'))

    const ref = renderFileUpload('')
    let result = false
    await act(async () => {
      result =
        (await ref.current!.processFile(
          new File(['heic'], 'broken.heic', { type: 'image/heic' })
        )) ?? false
    })

    expect(result).toBe(false)
    expect(setAttachedFiles).not.toHaveBeenCalled()
    expect(mockShowNotification).toHaveBeenCalledWith('Conversion failed', 'error')
  })
})
