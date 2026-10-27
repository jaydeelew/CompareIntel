import { describe, expect, it } from 'vitest'

import { createModelId } from '../../types'
import { inferModelModeForLoadedModels } from '../modelModeInference'

describe('inferModelModeForLoadedModels', () => {
  it('honors a saved voice composer_mode', () => {
    const mode = inferModelModeForLoadedModels(
      ['openai/gpt-4o-mini'],
      {},
      { composerMode: 'voice' }
    )
    expect(mode).toBe('voice')
  })

  it('keeps composer_mode=voice even when text composer advanced settings exist', () => {
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
