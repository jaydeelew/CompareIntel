import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { VOICE_EMPTY_TRANSCRIPT_MESSAGE } from '../../config/constants'
import { ApiError } from '../../services/api/errors'
import {
  DEFAULT_VOICE_CONFIG,
  transcribeRecording,
  voiceForModelIndex,
} from '../../services/voiceService'
import { apiPathGlob } from '../msw/paths'
import { server } from '../msw/server'

describe('voiceForModelIndex', () => {
  it('assigns a distinct voice to each of the first two models', () => {
    const first = voiceForModelIndex(0, DEFAULT_VOICE_CONFIG.voices)
    const second = voiceForModelIndex(1, DEFAULT_VOICE_CONFIG.voices)
    expect(first).toBeTruthy()
    expect(second).toBeTruthy()
    expect(first).not.toBe(second)
  })
})

describe('transcribeRecording', () => {
  it('uploads a File named turn.webm even when the blob MIME includes codecs=opus', async () => {
    const appendCalls: Array<{ name: string; part: Blob; filename?: string }> = []
    const originalAppend = FormData.prototype.append
    FormData.prototype.append = function append(
      this: FormData,
      name: string,
      value: unknown,
      filename?: string
    ) {
      if (name === 'file' && value instanceof Blob) {
        appendCalls.push({ name, part: value, filename })
      }
      if (filename != null) {
        return originalAppend.call(this, name, value as Blob, filename)
      }
      return originalAppend.call(this, name, value as string)
    }

    server.use(
      http.post(apiPathGlob('/api/voice/transcribe'), async () => {
        return HttpResponse.json({
          text: 'hello from stt',
          credits_used: 0,
          credits_remaining: 10,
          cost_usd: 0,
        })
      })
    )

    try {
      const blob = new Blob([new Uint8Array(64)], { type: 'audio/webm;codecs=opus' })
      const result = await transcribeRecording(blob, { durationSeconds: 1.2 })
      expect(result.text).toBe('hello from stt')
      expect(appendCalls).toHaveLength(1)
      expect(appendCalls[0].filename).toBe('turn.webm')
      expect(appendCalls[0].part.type).toBe('audio/webm')
      expect(appendCalls[0].part).toBeInstanceOf(File)
      expect((appendCalls[0].part as File).name).toBe('turn.webm')
    } finally {
      FormData.prototype.append = originalAppend
    }
  })

  it('surfaces the friendly empty-transcript message from a 400', async () => {
    server.use(
      http.post(apiPathGlob('/api/voice/transcribe'), () =>
        HttpResponse.json({ detail: VOICE_EMPTY_TRANSCRIPT_MESSAGE }, { status: 400 })
      )
    )

    const blob = new Blob([new Uint8Array(64)], { type: 'audio/webm' })
    try {
      await transcribeRecording(blob)
      throw new Error('expected transcribeRecording to reject')
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      expect((err as ApiError).message).toBe(VOICE_EMPTY_TRANSCRIPT_MESSAGE)
      expect((err as ApiError).status).toBe(400)
    }
  })
})
