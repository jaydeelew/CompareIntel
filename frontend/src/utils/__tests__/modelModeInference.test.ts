import { describe, expect, it, vi } from 'vitest'

import { createModelId } from '../../types'
import { inferModelModeForLoadedModels } from '../modelModeInference'

const voiceFlag = vi.hoisted(() => ({ enabled: false }))

vi.mock('../../config/voiceFlag', () => ({
  isVoiceEnabled: () => voiceFlag.enabled,
}))

describe('inferModelModeForLoadedModels', () => {
  it('honors a saved voice composer_mode when voice is enabled', () => {
    voiceFlag.enabled = true
    const mode = inferModelModeForLoadedModels(
      ['openai/gpt-4o-mini'],
      {},
      { composerMode: 'voice' }
    )
    expect(mode).toBe('voice')
  })

  it('keeps composer_mode=voice even when text composer advanced settings exist', () => {
    voiceFlag.enabled = true
    const mode = inferModelModeForLoadedModels(
      ['openai/gpt-4o-mini'],
      {},
      {
        composerMode: 'voice',
        textComposerAdvanced: { temperature: 0.4, topP: 0.9, maxTokens: 512 },
      }
    )
    expect(mode).toBe('voice')
  })

  it('does not restore voice mode when the voice flag is off', () => {
    voiceFlag.enabled = false
    const mode = inferModelModeForLoadedModels(
      ['openai/gpt-4o-mini'],
      {},
      { composerMode: 'voice' }
    )
    expect(mode).toBe('text')
  })

  it('falls back to text when models are not image generators', () => {
    const mode = inferModelModeForLoadedModels(['openai/gpt-4o-mini'], {
      OpenAI: [
        {
          id: createModelId('openai/gpt-4o-mini'),
          name: 'GPT-4o Mini',
          description: '',
          category: 'gpt',
          provider: 'OpenAI',
          supports_image_generation: false,
        },
      ],
    })
    expect(mode).toBe('text')
  })
})
