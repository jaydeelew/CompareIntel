import { describe, expect, it, vi } from 'vitest'

import {
  RECORDING_TIMESLICE_MS,
  appendRecordingFile,
  assembleRecordingBlob,
  flushAndStopRecorder,
  isRecordingTooShort,
  recordingFilename,
  recordingMimeType,
  startMediaRecorder,
} from '../voiceRecording'

describe('recordingMimeType / recordingFilename', () => {
  it('maps Chrome MediaRecorder webm/opus to a clean webm filename', () => {
    expect(recordingMimeType('audio/webm;codecs=opus')).toBe('audio/webm')
    expect(recordingFilename('audio/webm;codecs=opus')).toBe('turn.webm')
  })

  it('maps Safari audio/mp4 to turn.m4a (OpenRouter format is m4a, not mp4)', () => {
    expect(recordingMimeType('audio/mp4')).toBe('audio/mp4')
    expect(recordingFilename('audio/mp4')).toBe('turn.m4a')
  })
})

describe('assembleRecordingBlob', () => {
  it('drops empty chunks and strips codecs from the blob type', () => {
    const blob = assembleRecordingBlob(
      [
        new Blob([], { type: 'audio/webm;codecs=opus' }),
        new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/webm;codecs=opus' }),
      ],
      'audio/webm;codecs=opus'
    )
    expect(blob.size).toBe(4)
    expect(blob.type).toBe('audio/webm')
  })
})

describe('isRecordingTooShort', () => {
  it('rejects header-only blobs and sub-timeslice taps', () => {
    expect(isRecordingTooShort(new Blob([new Uint8Array(10)], { type: 'audio/webm' }))).toBe(true)
    expect(isRecordingTooShort(new Blob([new Uint8Array(2048)], { type: 'audio/webm' }), 0.1)).toBe(
      true
    )
    expect(isRecordingTooShort(new Blob([new Uint8Array(2048)], { type: 'audio/webm' }), 1.2)).toBe(
      false
    )
  })
})

describe('appendRecordingFile', () => {
  it('appends a File named turn.webm even when the blob MIME includes codecs', () => {
    const form = new FormData()
    const blob = new Blob([new Uint8Array(32)], { type: 'audio/webm;codecs=opus' })
    const meta = appendRecordingFile(form, blob)
    expect(meta.filename).toBe('turn.webm')
    expect(meta.mimeType).toBe('audio/webm')
    const file = form.get('file') as File
    expect(file).toBeTruthy()
    expect(file.name).toBe('turn.webm')
    expect(file.type).toBe('audio/webm')
  })
})

describe('startMediaRecorder', () => {
  it('starts with a timeslice so ondataavailable fires before stop', () => {
    const start = vi.fn()
    const recOnStop = vi.fn()

    class FakeRecorder {
      state = 'inactive'
      mimeType = 'audio/webm;codecs=opus'
      ondataavailable: ((ev: { data: Blob }) => void) | null = null
      onstop: (() => void) | null = null
      start(timeslice?: number) {
        start(timeslice)
        this.state = 'recording'
      }
      stop() {
        this.state = 'inactive'
        this.onstop?.()
      }
      static isTypeSupported() {
        return true
      }
    }

    vi.stubGlobal('MediaRecorder', FakeRecorder)

    const recorder = startMediaRecorder({} as MediaStream, {
      onData: vi.fn(),
      onStop: recOnStop,
    })

    expect(start).toHaveBeenCalledWith(RECORDING_TIMESLICE_MS)
    recorder.onstop?.()
    expect(recOnStop).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

describe('flushAndStopRecorder', () => {
  it('requests data before stop so the final cluster is not dropped', () => {
    const requestData = vi.fn()
    const stop = vi.fn(function (this: { state: string }) {
      this.state = 'inactive'
    })
    const recorder = {
      state: 'recording',
      requestData,
      stop,
    } as unknown as MediaRecorder

    flushAndStopRecorder(recorder)
    expect(requestData).toHaveBeenCalled()
    expect(stop).toHaveBeenCalled()
  })
})
