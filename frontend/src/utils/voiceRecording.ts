/**
 * Browser tap-to-talk helpers for Voice mode.
 *
 * Chrome's MediaRecorder emits ``audio/webm;codecs=opus``. OpenRouter STT needs an
 * explicit container format (webm/m4a/...), and without a timeslice Chromium often
 * stops before flushing clusters, producing a header-only blob that Whisper
 * transcribes as empty text.
 */

import { VOICE_EMPTY_TRANSCRIPT_MESSAGE } from '../config/constants'

export { VOICE_EMPTY_TRANSCRIPT_MESSAGE }

/** Flush encoded clusters while recording so stop() is not the first dataavailable. */
export const RECORDING_TIMESLICE_MS = 250

/** Smaller than a real Opus/WebM cluster; typically just an EBML header. */
export const MIN_RECORDING_BYTES = 256

const RECORDER_MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'] as const

export function pickRecorderMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  return RECORDER_MIME_CANDIDATES.find(type => MediaRecorder.isTypeSupported(type)) || ''
}

/** Strip ``codecs=`` parameters so uploads match OpenRouter's format allow-list. */
export function recordingMimeType(mimeType: string | undefined | null): string {
  const base = (mimeType || '').split(';')[0].trim().toLowerCase()
  if (
    base === 'audio/mp4' ||
    base === 'video/mp4' ||
    base === 'audio/m4a' ||
    base === 'audio/x-m4a'
  ) {
    return 'audio/mp4'
  }
  if (base === 'audio/aac') return 'audio/aac'
  if (base === 'audio/ogg' || base === 'audio/opus') return 'audio/ogg'
  if (base === 'audio/wav' || base === 'audio/wave' || base === 'audio/x-wav') return 'audio/wav'
  if (base === 'audio/mpeg' || base === 'audio/mp3') return 'audio/mpeg'
  if (base === 'audio/webm' || base === 'video/webm') return 'audio/webm'
  if (base.startsWith('audio/') || base.startsWith('video/')) return base
  return 'audio/webm'
}

/**
 * Filename extension OpenRouter (and our backend) use to pick ``input_audio.format``.
 * Safari's ``audio/mp4`` maps to ``.m4a`` (``mp4`` is not in OpenRouter's STT list).
 */
export function recordingFilename(mimeType: string | undefined | null): string {
  const mime = recordingMimeType(mimeType)
  if (mime === 'audio/mp4' || mime === 'audio/aac') return 'turn.m4a'
  if (mime === 'audio/ogg') return 'turn.ogg'
  if (mime === 'audio/wav') return 'turn.wav'
  if (mime === 'audio/mpeg') return 'turn.mp3'
  return 'turn.webm'
}

export function assembleRecordingBlob(chunks: Blob[], mimeType: string | undefined | null): Blob {
  const type = recordingMimeType(mimeType)
  return new Blob(
    chunks.filter(chunk => chunk.size > 0),
    { type }
  )
}

export function isRecordingTooShort(blob: Blob, _durationSeconds?: number): boolean {
  // Size is the reliable signal for header-only WebM. Wall-clock duration
  // false-positives on fast tap-to-talk (and Playwright) even when clusters flushed.
  // Silent-but-valid audio is handled by STT returning an empty transcript.
  return !blob || blob.size < MIN_RECORDING_BYTES
}

export function appendRecordingFile(
  form: FormData,
  blob: Blob
): { filename: string; mimeType: string } {
  const mimeType = recordingMimeType(blob.type)
  const filename = recordingFilename(blob.type)
  // Always re-wrap so codecs= parameters are not copied into the part Content-Type.
  const typed = new Blob([blob], { type: mimeType })
  let part: Blob = typed
  if (typeof File !== 'undefined') {
    try {
      part = new File([typed], filename, { type: mimeType })
    } catch {
      part = typed
    }
  }
  form.append('file', part, filename)
  return { filename, mimeType }
}

export function startMediaRecorder(
  stream: MediaStream,
  handlers: {
    onData: (chunk: Blob) => void
    onStop: (recorder: MediaRecorder) => void
  }
): MediaRecorder {
  const mimeType = pickRecorderMimeType()
  const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
  recorder.ondataavailable = event => {
    if (event.data && event.data.size > 0) handlers.onData(event.data)
  }
  recorder.onstop = () => handlers.onStop(recorder)
  try {
    recorder.start(RECORDING_TIMESLICE_MS)
  } catch {
    recorder.start()
  }
  return recorder
}

export function flushAndStopRecorder(recorder: MediaRecorder): void {
  if (recorder.state === 'inactive') return
  try {
    if (recorder.state === 'recording') {
      recorder.requestData()
    }
  } catch {
    // ignore — stop() still flushes on spec-compliant browsers
  }
  recorder.stop()
}
