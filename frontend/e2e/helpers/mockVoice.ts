import type { Page } from '@playwright/test'

const MOCK_MP3 = Buffer.from('fff348c40000000348000000004c414d45332e39362e3100', 'hex')

/** Markdown leftover the client sanitizer must strip from spoken transcripts. */
const VOICE_MOCK_REPLY =
  '**Hello** from the model. See [docs](https://example.com). Photosynthesis turns light into energy.'

function buildVoiceMockComparisonStream(models: string[]): string {
  const events: object[] = []
  for (const model of models) {
    events.push({ model, type: 'start' })
    events.push({ model, type: 'chunk', content: VOICE_MOCK_REPLY })
    events.push({ model, type: 'done', error: false })
  }
  events.push({
    type: 'complete',
    metadata: {
      input_length: 0,
      models_requested: models.length,
      models_successful: models.length,
      models_failed: 0,
      timestamp: new Date().toISOString(),
      processing_time_ms: 10,
    },
  })
  return events.map(e => `data: ${JSON.stringify(e)}\n\n`).join('')
}

export async function mockVoiceApis(page: Page): Promise<void> {
  await page.route('**/api/voice/config', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        stt_model: 'openai/whisper-large-v3',
        tts_model: 'openai/gpt-4o-mini-tts-2025-12-15',
        max_models: 2,
        voices: ['alloy', 'nova'],
        native_voice_model_ids: ['openai/gpt-audio', 'openai/gpt-audio-mini'],
      }),
    })
  })

  await page.route('**/api/voice/transcribe', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        text: 'What is photosynthesis?',
        credits_used: 1,
        credits_remaining: 99,
        cost_usd: 0.01,
      }),
    })
  })

  await page.route('**/api/voice/speech', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'audio/mpeg',
      headers: {
        'X-Credits-Used': '0',
        'X-Credits-Remaining': '98',
      },
      body: MOCK_MP3,
    })
  })

  await page.route('**/api/voice/finalize-audio', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ credits_used: 1, credits_remaining: 97 }),
    })
  })

  await page.route('**/api/compare-stream', async route => {
    let models: string[] = []
    try {
      models = (route.request().postDataJSON() as { models?: string[] })?.models ?? []
    } catch {
      models = []
    }
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      headers: { 'Cache-Control': 'no-cache' },
      body: buildVoiceMockComparisonStream(models),
    })
  })
}

export async function installMockMicrophone(
  page: Page,
  options?: { deny?: boolean }
): Promise<void> {
  const deny = options?.deny === true
  await page.addInitScript(shouldDeny => {
    class FakeMediaRecorder {
      state = 'inactive'
      mimeType = 'audio/webm;codecs=opus'
      ondataavailable: ((ev: { data: Blob }) => void) | null = null
      onstop: (() => void) | null = null
      constructor(public stream: MediaStream) {}
      start(_timeslice?: number) {
        this.state = 'recording'
      }
      requestData() {
        this.ondataavailable?.({
          data: new Blob([new Uint8Array(2048)], { type: 'audio/webm' }),
        })
      }
      stop() {
        this.state = 'inactive'
        this.requestData()
        this.onstop?.()
      }
      static isTypeSupported() {
        return true
      }
    }

    const fakeTrack = {
      stop: () => undefined,
      kind: 'audio',
      enabled: true,
    }

    const fakeStream = {
      getTracks: () => [fakeTrack],
      getAudioTracks: () => [fakeTrack],
    }

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: (_constraints: unknown) => {
          if (shouldDeny) {
            const err = new Error('Permission denied')
            err.name = 'NotAllowedError'
            return Promise.reject(err)
          }
          return Promise.resolve(fakeStream)
        },
      },
    })

    // @ts-expect-error test stub
    window.MediaRecorder = FakeMediaRecorder

    const OriginalAudio = window.Audio
    window.Audio = function MockAudio() {
      const audio = new OriginalAudio()
      audio.play = () => {
        setTimeout(() => audio.dispatchEvent(new Event('ended')), 10)
        return Promise.resolve()
      }
      return audio
    } as unknown as typeof Audio

    class FakeAnalyser {
      fftSize = 512
      getByteTimeDomainData(samples: Uint8Array) {
        samples.fill(128)
      }
    }
    class FakeSource {
      connect() {
        return undefined
      }
      disconnect() {
        return undefined
      }
    }
    class FakeAudioContext {
      createMediaStreamSource() {
        return new FakeSource()
      }
      createAnalyser() {
        return new FakeAnalyser()
      }
      close() {
        return Promise.resolve()
      }
    }
    // @ts-expect-error test stub
    window.AudioContext = FakeAudioContext
    // @ts-expect-error test stub
    window.webkitAudioContext = FakeAudioContext
  }, deny)
}
