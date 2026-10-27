/** Browser-side voice activity helpers for interrupting TTS playback. */

export const DEFAULT_VAD_RMS_THRESHOLD = 18
export const DEFAULT_VAD_HOLD_MS = 180

export function rmsFromTimeDomain(samples: Uint8Array): number {
  if (samples.length === 0) return 0
  let sum = 0
  for (let i = 0; i < samples.length; i++) {
    const centered = samples[i] - 128
    sum += centered * centered
  }
  return Math.sqrt(sum / samples.length)
}

export function isVoiceActive(rms: number, threshold: number = DEFAULT_VAD_RMS_THRESHOLD): boolean {
  return rms >= threshold
}

export interface VoiceMonitor {
  stop: () => void
}

/**
 * Watch the live microphone and fire `onSpeech` after RMS stays above threshold.
 * Caller must stop the monitor when playback ends.
 */
export function startVoiceActivityMonitor(
  stream: MediaStream,
  onSpeech: () => void,
  options?: { threshold?: number; holdMs?: number; audioContext?: AudioContext }
): VoiceMonitor {
  const threshold = options?.threshold ?? DEFAULT_VAD_RMS_THRESHOLD
  const holdMs = options?.holdMs ?? DEFAULT_VAD_HOLD_MS
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  const context = options?.audioContext ?? (AudioCtx ? new AudioCtx() : null)
  if (!context) {
    return { stop: () => undefined }
  }

  const source = context.createMediaStreamSource(stream)
  const analyser = context.createAnalyser()
  analyser.fftSize = 512
  source.connect(analyser)
  const samples = new Uint8Array(analyser.fftSize)
  let aboveSince: number | null = null
  let frame = 0
  let stopped = false

  const tick = () => {
    if (stopped) return
    analyser.getByteTimeDomainData(samples)
    const rms = rmsFromTimeDomain(samples)
    const now = performance.now()
    if (isVoiceActive(rms, threshold)) {
      if (aboveSince == null) aboveSince = now
      if (now - aboveSince >= holdMs) {
        stopped = true
        onSpeech()
        return
      }
    } else {
      aboveSince = null
    }
    frame = window.requestAnimationFrame(tick)
  }
  frame = window.requestAnimationFrame(tick)

  return {
    stop: () => {
      stopped = true
      window.cancelAnimationFrame(frame)
      try {
        source.disconnect()
      } catch {
        // ignore
      }
      if (!options?.audioContext) {
        void context.close()
      }
    },
  }
}

export function getMicrophoneUnsupportedMessage(): string | null {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return 'Voice mode is not available in this environment.'
  }
  const hasMedia = Boolean(navigator.mediaDevices?.getUserMedia)
  const hasRecorder = typeof MediaRecorder !== 'undefined'
  if (!hasMedia || !hasRecorder) {
    return "Voice mode isn't supported in this browser. Please use a recent Chrome, Edge, Firefox, or Safari with microphone access."
  }
  if (!window.isSecureContext) {
    return 'Voice mode requires a secure connection (HTTPS). Open this site over HTTPS to use the microphone.'
  }
  return null
}

export function microphonePermissionErrorMessage(error: unknown): string {
  const name =
    error && typeof error === 'object' && 'name' in error
      ? String((error as { name?: string }).name)
      : ''
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return "Microphone access denied. To enable: click the lock or info icon in your browser's address bar, then allow microphone access for this site."
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return "Microphone not found. Connect a microphone, then click the lock or info icon in your browser's address bar and allow access for this site."
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'Could not access the microphone because it is in use by another application.'
  }
  return "Couldn't start the microphone. Check your browser permissions and try again."
}
