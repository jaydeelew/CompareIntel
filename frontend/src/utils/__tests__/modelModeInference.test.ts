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
