/**
 * Voice mode session: tap-to-talk recording, OpenRouter STT, sequential TTS, VAD interrupt.
 */

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'

import { VOICE_EMPTY_TRANSCRIPT_MESSAGE } from '../config/constants'
import { isCancellationError } from '../services/api/errors'
import type { CreditBalance } from '../services/creditService'
import {
  DEFAULT_VOICE_CONFIG,
  finalizeVoiceAudio,
  getVoiceConfig,
  synthesizeSpeech,
  transcribeRecording,
  voiceForModelIndex,
  type VoiceConfig,
} from '../services/voiceService'
import type { ModelConversation } from '../types'
import logger from '../utils/logger'
import { nextSpeakableSentences } from '../utils/sentenceSplitter'
import { sanitizeVoiceSpeech } from '../utils/voiceSpeech'
import {
  assembleRecordingBlob,
  flushAndStopRecorder,
  isRecordingTooShort,
  startMediaRecorder,
} from '../utils/voiceRecording'
import {
  getMicrophoneUnsupportedMessage,
  microphonePermissionErrorMessage,
  startVoiceActivityMonitor,
  type VoiceMonitor,
} from '../utils/voiceActivityDetection'

export type VoiceSessionStatus =
  | 'idle'
  | 'recording'
  | 'transcribing'
  | 'waiting'
  | 'speaking'
  | 'error'

export interface UseVoiceSessionOptions {
  enabled: boolean
  selectedModels: string[]
  conversations: ModelConversation[]
  isLoading: boolean
  isFollowUpMode: boolean
  browserFingerprint: string
  creditsRemaining: number
  setInput: (value: string) => void
  setIsFollowUpMode: (value: boolean) => void
  setError: (value: string | null) => void
  setCreditBalance?: Dispatch<SetStateAction<CreditBalance | null>>
  submitComparison: (inputOverride?: string) => void
  cancelComparison: () => void
}

export interface UseVoiceSessionReturn {
  status: VoiceSessionStatus
  isSupported: boolean
  unsupportedMessage: string | null
  isRecording: boolean
  isTranscribing: boolean
  isSpeaking: boolean
  lastTranscript: string
  error: string | null
  voices: string[]
  toggleTalk: () => void
  interruptPlayback: () => void
  stopAll: () => void
}

function latestAssistantText(conversations: ModelConversation[], modelId: string): string {
  const conv = conversations.find(c => String(c.modelId) === String(modelId))
  if (!conv) return ''
  const assistants = conv.messages.filter(m => m.type === 'assistant')
  return sanitizeVoiceSpeech(assistants[assistants.length - 1]?.content ?? '')
}

function playAudioBlob(blob: Blob, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    const cleanup = () => {
      audio.pause()
      audio.removeAttribute('src')
      URL.revokeObjectURL(url)
    }
    const onAbort = () => {
      cleanup()
      reject(new DOMException('Aborted', 'AbortError'))
    }
    if (signal.aborted) {
      cleanup()
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    signal.addEventListener('abort', onAbort, { once: true })
    audio.onended = () => {
      signal.removeEventListener('abort', onAbort)
      cleanup()
      resolve()
    }
    audio.onerror = () => {
      signal.removeEventListener('abort', onAbort)
      cleanup()
      reject(new Error('Audio playback failed'))
    }
    void audio.play().catch(err => {
      signal.removeEventListener('abort', onAbort)
      cleanup()
      reject(err)
    })
  })
}

export function useVoiceSession(options: UseVoiceSessionOptions): UseVoiceSessionReturn {
  const {
    enabled,
    selectedModels,
    conversations,
    isLoading,
    isFollowUpMode,
    browserFingerprint,
    creditsRemaining,
    setInput,
    setIsFollowUpMode,
    setError,
    setCreditBalance,
    submitComparison,
    cancelComparison,
  } = options

  const unsupportedMessage = getMicrophoneUnsupportedMessage()
  const isSupported = unsupportedMessage == null

  const [status, setStatus] = useState<VoiceSessionStatus>('idle')
  const [lastTranscript, setLastTranscript] = useState('')
  const [error, setLocalError] = useState<string | null>(null)
  const [voices, setVoices] = useState<string[]>(DEFAULT_VOICE_CONFIG.voices)
  const [config, setConfig] = useState<VoiceConfig>(DEFAULT_VOICE_CONFIG)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recordStartedAtRef = useRef<number>(0)
  const playbackAbortRef = useRef<AbortController | null>(null)
  const vadMonitorRef = useRef<VoiceMonitor | null>(null)
  const spokenPrefixRef = useRef<Record<string, string>>({})
  const speakingIndexRef = useRef(0)
  const ttsQueueRef = useRef<Promise<void>>(Promise.resolve())
  const interruptedRef = useRef(false)
  const pendingSubmitRef = useRef(false)

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    void getVoiceConfig().then(cfg => {
      if (cancelled) return
      setConfig(cfg)
      setVoices(cfg.voices)
    })
    return () => {
      cancelled = true
    }
  }, [enabled])

  const stopMicTracks = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach(track => track.stop())
    mediaStreamRef.current = null
    mediaRecorderRef.current = null
  }, [])

  const stopVad = useCallback(() => {
    vadMonitorRef.current?.stop()
    vadMonitorRef.current = null
  }, [])

  const abortPlayback = useCallback(() => {
    playbackAbortRef.current?.abort()
    playbackAbortRef.current = new AbortController()
    stopVad()
  }, [stopVad])

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      try {
        flushAndStopRecorder(recorder)
      } catch {
        // ignore
      }
    }
  }, [])

  const stopAll = useCallback(() => {
    interruptedRef.current = true
    pendingSubmitRef.current = false
    stopRecording()
    stopMicTracks()
    abortPlayback()
    setStatus('idle')
  }, [abortPlayback, stopMicTracks, stopRecording])

  const startVadForPlayback = useCallback(async () => {
    stopVad()
    if (!navigator.mediaDevices?.getUserMedia) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      })
      const monitor = startVoiceActivityMonitor(stream, () => {
        stream.getTracks().forEach(track => track.stop())
        interruptedRef.current = true
        abortPlayback()
        cancelComparison()
        setIsFollowUpMode(true)
        setStatus('idle')
        // Begin a new user turn immediately.
        void startRecordingRef.current?.()
      })
      vadMonitorRef.current = {
        stop: () => {
          monitor.stop()
          stream.getTracks().forEach(track => track.stop())
        },
      }
    } catch (err) {
      logger.warn('Voice VAD microphone unavailable:', err)
    }
  }, [abortPlayback, cancelComparison, setIsFollowUpMode, stopVad])

  const startRecordingRef = useRef<(() => Promise<void>) | null>(null)

  const finishRecordingAndSubmit = useCallback(
    async (blob: Blob, durationSeconds: number) => {
      if (!enabled) return
      if (creditsRemaining <= 0) {
        const message = 'You have run out of credits'
        setLocalError(message)
        setError(message)
        setStatus('error')
        return
      }
      if (selectedModels.length === 0) {
        const message = 'Select 1 or 2 models before talking.'
        setLocalError(message)
        setError(message)
        setStatus('error')
        return
      }
      setStatus('transcribing')
      setLocalError(null)
      try {
        const result = await transcribeRecording(blob, {
          durationSeconds,
          browserFingerprint,
          timezone,
        })
        const transcript = result.text.trim()
        if (!transcript) {
          setLocalError(VOICE_EMPTY_TRANSCRIPT_MESSAGE)
          setError(VOICE_EMPTY_TRANSCRIPT_MESSAGE)
          setStatus('error')
          return
        }
        setLastTranscript(transcript)
        spokenPrefixRef.current = {}
        speakingIndexRef.current = 0
        interruptedRef.current = false
        pendingSubmitRef.current = true
        if (typeof result.credits_remaining === 'number') {
          const remaining = result.credits_remaining
          setCreditBalance?.(prev => (prev ? { ...prev, credits_remaining: remaining } : prev))
        }
        setInput(transcript)
        setStatus('waiting')
        submitComparison(transcript)
      } catch (err) {
        if (isCancellationError(err)) {
          setStatus('idle')
          return
        }
        const raw = err instanceof Error ? err.message : ''
        const message = /didn't catch that|empty transcript|no speech detected/i.test(raw)
          ? VOICE_EMPTY_TRANSCRIPT_MESSAGE
          : raw || 'Could not transcribe your recording. Please try again.'
        setLocalError(message)
        setError(message)
        setStatus('error')
      }
    },
    [
      browserFingerprint,
      creditsRemaining,
      enabled,
      selectedModels.length,
      setError,
      setCreditBalance,
      setInput,
      submitComparison,
      timezone,
    ]
  )

  const startRecording = useCallback(async () => {
    if (!enabled) return
    const unsupported = getMicrophoneUnsupportedMessage()
    if (unsupported) {
      setLocalError(unsupported)
      setError(unsupported)
      setStatus('error')
      return
    }
    if (selectedModels.length === 0) {
      const message = 'Select 1 or 2 models before talking.'
      setLocalError(message)
      setError(message)
      setStatus('error')
      return
    }
    interruptedRef.current = false
    abortPlayback()
    if (isLoading) {
      cancelComparison()
      setIsFollowUpMode(true)
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      })
      mediaStreamRef.current = stream
      chunksRef.current = []
      recordStartedAtRef.current = Date.now()
      const recorder = startMediaRecorder(stream, {
        onData: chunk => {
          chunksRef.current.push(chunk)
        },
        onStop: stopped => {
          const blob = assembleRecordingBlob(chunksRef.current, stopped.mimeType)
          const duration = (Date.now() - recordStartedAtRef.current) / 1000
          stopMicTracks()
          if (isRecordingTooShort(blob, duration)) {
            setLocalError(VOICE_EMPTY_TRANSCRIPT_MESSAGE)
            setError(VOICE_EMPTY_TRANSCRIPT_MESSAGE)
            setStatus('error')
            return
          }
          void finishRecordingAndSubmit(blob, duration)
        },
      })
      mediaRecorderRef.current = recorder
      setLocalError(null)
      setError(null)
      setStatus('recording')
    } catch (err) {
      const message = microphonePermissionErrorMessage(err)
      setLocalError(message)
      setError(message)
      setStatus('error')
      stopMicTracks()
    }
  }, [
    abortPlayback,
    cancelComparison,
    enabled,
    finishRecordingAndSubmit,
    isLoading,
    selectedModels.length,
    setError,
    setIsFollowUpMode,
    stopMicTracks,
  ])

  startRecordingRef.current = startRecording

  const toggleTalk = useCallback(() => {
    if (status === 'recording') {
      stopRecording()
      return
    }
    if (status === 'speaking' || status === 'waiting' || isLoading) {
      interruptedRef.current = true
      abortPlayback()
      cancelComparison()
      setIsFollowUpMode(true)
      void startRecording()
      return
    }
    void startRecording()
  }, [
    abortPlayback,
    cancelComparison,
    isLoading,
    setIsFollowUpMode,
    startRecording,
    status,
    stopRecording,
  ])

  const interruptPlayback = useCallback(() => {
    interruptedRef.current = true
    abortPlayback()
    cancelComparison()
    setIsFollowUpMode(true)
    setStatus('idle')
  }, [abortPlayback, cancelComparison, setIsFollowUpMode])

  // Sequential TTS while assistant text streams, in selection order.
  useEffect(() => {
    if (!enabled || interruptedRef.current) return
    if (status !== 'waiting' && status !== 'speaking') return

    const models = selectedModels
    if (models.length === 0) return

    const speakNextSentences = () => {
      if (interruptedRef.current) return
      const index = speakingIndexRef.current
      const modelId = models[index]
      if (!modelId) {
        if (!isLoading) {
          setStatus('idle')
          void finalizeVoiceAudio({ browserFingerprint, timezone }).catch(() => undefined)
        }
        return
      }
      const fullText = latestAssistantText(conversations, modelId)
      const spoken = spokenPrefixRef.current[modelId] ?? ''
      const flush = !isLoading
      const { sentences, spokenPrefix } = nextSpeakableSentences(fullText, spoken, flush)
      spokenPrefixRef.current[modelId] = spokenPrefix
      if (sentences.length === 0) {
        if (flush && speakingIndexRef.current === index) {
          speakingIndexRef.current = index + 1
          speakNextSentences()
        }
        return
      }

      setStatus('speaking')
      const controller = playbackAbortRef.current ?? new AbortController()
      playbackAbortRef.current = controller
      void startVadForPlayback()

      sentences.forEach((sentence, sentenceIndex) => {
        ttsQueueRef.current = ttsQueueRef.current
          .catch(() => undefined)
          .then(async () => {
            if (interruptedRef.current || controller.signal.aborted) return
            const isLastOfTurn =
              flush && index === models.length - 1 && sentenceIndex === sentences.length - 1
            const spoken = await synthesizeSpeech(sentence, {
              voice: voiceForModelIndex(index, config.voices),
              browserFingerprint,
              timezone,
              finalizeTurn: isLastOfTurn,
              signal: controller.signal,
            })
            if (typeof spoken.creditsRemaining === 'number') {
              const remaining = spoken.creditsRemaining
              setCreditBalance?.(prev => (prev ? { ...prev, credits_remaining: remaining } : prev))
            }
            await playAudioBlob(spoken.blob, controller.signal)
          })
      })

      void ttsQueueRef.current.finally(() => {
        if (interruptedRef.current) return
        if (flush && speakingIndexRef.current === index) {
          speakingIndexRef.current = index + 1
          speakNextSentences()
        }
      })
    }

    speakNextSentences()
  }, [
    browserFingerprint,
    config.voices,
    conversations,
    enabled,
    isLoading,
    selectedModels,
    setCreditBalance,
    startVadForPlayback,
    status,
    timezone,
  ])

  useEffect(() => {
    if (pendingSubmitRef.current && isLoading) {
      pendingSubmitRef.current = false
      setStatus(prev => (prev === 'waiting' ? 'waiting' : prev))
    }
  }, [isLoading])

  useEffect(() => {
    if (!isFollowUpMode) {
      spokenPrefixRef.current = {}
      speakingIndexRef.current = 0
    }
  }, [isFollowUpMode])

  useEffect(() => {
    if (!enabled) {
      stopAll()
      return
    }
    interruptedRef.current = false
  }, [enabled, stopAll])

  useEffect(() => {
    return () => {
      stopAll()
    }
  }, [stopAll])

  return {
    status,
    isSupported,
    unsupportedMessage,
    isRecording: status === 'recording',
    isTranscribing: status === 'transcribing',
    isSpeaking: status === 'speaking',
    lastTranscript,
    error: error || (enabled && !isSupported ? unsupportedMessage : null),
    voices,
    toggleTalk,
    interruptPlayback,
    stopAll,
  }
}
