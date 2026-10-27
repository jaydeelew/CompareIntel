/**
 * Voice mode API: STT, TTS, config, and audio credit finalization.
 */

import { VOICE_MAX_MODELS, VOICE_TTS_VOICES } from '../config/constants'
import { appendRecordingFile } from '../utils/voiceRecording'

import { apiClient } from './api/client'
import { ApiError } from './api/errors'

export interface VoiceConfig {
  stt_model: string
  tts_model: string
  max_models: number
  voices: string[]
  native_voice_model_ids: string[]
}

export interface TranscribeResult {
  text: string
  credits_used: number
  credits_remaining: number
  cost_usd: number
}

export const DEFAULT_VOICE_CONFIG: VoiceConfig = {
  stt_model: 'openai/whisper-large-v3',
  tts_model: 'openai/gpt-4o-mini-tts-2025-12-15',
  max_models: VOICE_MAX_MODELS,
  voices: [...VOICE_TTS_VOICES],
  native_voice_model_ids: ['openai/gpt-audio', 'openai/gpt-audio-mini'],
}

export function voiceForModelIndex(
  index: number,
  voices: string[] = DEFAULT_VOICE_CONFIG.voices
): string {
  if (voices.length === 0) return 'alloy'
  return voices[index % voices.length] ?? voices[0]
}

export async function getVoiceConfig(): Promise<VoiceConfig> {
  try {
    const response = await apiClient.get<VoiceConfig>('/voice/config', {
      enableCache: true,
      cacheTTL: 5 * 60 * 1000,
    })
    const data = response.data
    if (!data?.voices?.length) return DEFAULT_VOICE_CONFIG
    return {
      ...DEFAULT_VOICE_CONFIG,
      ...data,
      max_models: data.max_models || VOICE_MAX_MODELS,
    }
  } catch {
    return DEFAULT_VOICE_CONFIG
  }
}

export async function transcribeRecording(
  blob: Blob,
  options: {
    durationSeconds?: number
    browserFingerprint?: string
    timezone?: string
    signal?: AbortSignal
  } = {}
): Promise<TranscribeResult> {
  const form = new FormData()
  appendRecordingFile(form, blob)
  if (options.durationSeconds != null) {
    form.append('duration_seconds', String(options.durationSeconds))
  }
  if (options.browserFingerprint) {
    form.append('browser_fingerprint', options.browserFingerprint)
  }
  if (options.timezone) {
    form.append('timezone', options.timezone)
  }

  const response = await fetch(resolveApiUrl('/voice/transcribe'), {
    method: 'POST',
    body: form,
    credentials: 'include',
    signal: options.signal,
  })
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new ApiError(
      (errorData as { detail?: string }).detail || response.statusText,
      response.status,
      response.statusText,
      errorData
    )
  }
  return (await response.json()) as TranscribeResult
}

export async function synthesizeSpeech(
  text: string,
  options: {
    voice: string
    model?: string
    browserFingerprint?: string
    timezone?: string
    finalizeTurn?: boolean
    signal?: AbortSignal
  }
): Promise<{ blob: Blob; creditsRemaining?: number }> {
  const response = await fetch(resolveApiUrl('/voice/speech'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({
      text,
      voice: options.voice,
      model: options.model,
      browser_fingerprint: options.browserFingerprint,
      timezone: options.timezone,
      finalize_turn: options.finalizeTurn ?? false,
    }),
    signal: options.signal,
  })
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new ApiError(
      (errorData as { detail?: string }).detail || response.statusText,
      response.status,
      response.statusText,
      errorData
    )
  }
  const creditsHeader = response.headers.get('X-Credits-Remaining')
  const creditsRemaining =
    creditsHeader != null && creditsHeader !== '' ? Number(creditsHeader) : undefined
  return {
    blob: await response.blob(),
    creditsRemaining: Number.isFinite(creditsRemaining) ? creditsRemaining : undefined,
  }
}

export async function finalizeVoiceAudio(options: {
  browserFingerprint?: string
  timezone?: string
}): Promise<void> {
  await apiClient.post('/voice/finalize-audio', {
    browser_fingerprint: options.browserFingerprint,
    timezone: options.timezone,
  })
}

function resolveApiUrl(path: string): string {
  const base = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || '/api'
  const prefix = String(base).replace(/\/$/, '')
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${prefix}${suffix}`
}
