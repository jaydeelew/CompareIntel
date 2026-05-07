import { describe, it, expect } from 'vitest'

import type { ModelsByProvider, User } from '../../types'
import {
  CAPABILITY_DEMO_PRESETS,
  CAPABILITY_DEMO_SUBMIT_DELAY_MS,
  pickTwoDemoModels,
} from '../capabilityDemoPresets'

/** Minimal model factory. */
function m(
  id: string,
  provider: string,
  tierAccess: 'unregistered' | 'free' | 'paid' = 'unregistered',
  opts: {
    available?: boolean
    supports_image_generation?: boolean
    is_thinking_model?: boolean
  } = {}
) {
  return {
    id,
    name: id,
    description: '',
    category: '',
    provider,
    tier_access: tierAccess,
    available: opts.available ?? true,
    supports_image_generation: opts.supports_image_generation ?? false,
    is_thinking_model: opts.is_thinking_model ?? false,
  }
}

const FIXTURE: ModelsByProvider = {
  Google: [
    m('google/gemini-2.5-flash', 'Google'),
    m('google/gemma-3-27b-it', 'Google'),
    m('google/gemini-2.5-flash-image', 'Google', 'free', { supports_image_generation: true }),
  ],
  xAI: [m('x-ai/grok-4-fast', 'xAI')],
  DeepSeek: [m('deepseek/deepseek-chat-v3.1', 'DeepSeek')],
  OpenAI: [m('openai/gpt-oss-120b', 'OpenAI')],
}

describe('CAPABILITY_DEMO_PRESETS', () => {
  it('has entries for all four tile ids', () => {
    expect(Object.keys(CAPABILITY_DEMO_PRESETS)).toEqual(
      expect.arrayContaining([
        'natural-language',
        'code-generation',
        'formatted-math',
        'image-creation',
      ])
    )
  })

  it('each preset has a non-empty prompt and buttonLabel', () => {
    for (const preset of Object.values(CAPABILITY_DEMO_PRESETS)) {
      expect(preset.prompt.length).toBeGreaterThan(10)
      expect(preset.buttonLabel.length).toBeGreaterThan(0)
    }
  })

  it('uses a sensible delay before auto-submit after prefilling the composer', () => {
    expect(CAPABILITY_DEMO_SUBMIT_DELAY_MS).toBeGreaterThanOrEqual(1000)
    expect(CAPABILITY_DEMO_SUBMIT_DELAY_MS).toBeLessThanOrEqual(8000)
  })
})

describe('pickTwoDemoModels', () => {
  it('picks two models from different providers when possible', () => {
    const result = pickTwoDemoModels('natural-language', FIXTURE, false, null)
    expect(result).not.toBeNull()
    expect(result).toHaveLength(2)
    expect(result![0]).not.toBe(result![1])
  })

  it('prefers preferred model ids listed in the preset', () => {
    const result = pickTwoDemoModels('natural-language', FIXTURE, false, null)
    const preset = CAPABILITY_DEMO_PRESETS['natural-language']
    const preferred = new Set(preset.preferredModelIds)
    const matchCount = result!.filter(id => preferred.has(id)).length
    expect(matchCount).toBeGreaterThanOrEqual(1)
  })

  it('returns null when fewer than 2 selectable models', () => {
    const small: ModelsByProvider = {
      Google: [m('google/gemini-2.5-flash', 'Google')],
    }
    expect(pickTwoDemoModels('natural-language', small, false, null)).toBeNull()
  })

  it('returns null for unknown tile id', () => {
    expect(pickTwoDemoModels('nonexistent', FIXTURE, false, null)).toBeNull()
  })

  it('excludes image-generation models for text-mode tiles', () => {
    const result = pickTwoDemoModels('natural-language', FIXTURE, false, null)
    expect(result).not.toBeNull()
    expect(result).not.toContain('google/gemini-2.5-flash-image')
  })

  it('picks only image-generation models for image-mode tile (free user)', () => {
    const withImageModels: ModelsByProvider = {
      Google: [
        m('google/gemini-2.5-flash', 'Google'),
        m('google/gemini-2.5-flash-image', 'Google', 'free', { supports_image_generation: true }),
      ],
      OpenAI: [
        m('openai/gpt-oss-120b', 'OpenAI'),
        m('openai/gpt-5-image-mini', 'OpenAI', 'free', { supports_image_generation: true }),
      ],
    }
    const freeUser = { subscription_tier: 'free' } as User
    const result = pickTwoDemoModels('image-creation', withImageModels, true, freeUser)
    expect(result).not.toBeNull()
    expect(result).toHaveLength(2)
    result!.forEach(id => {
      expect(id).toMatch(/image/)
    })
    expect(result).not.toContain('google/gemini-2.5-flash')
    expect(result).not.toContain('openai/gpt-oss-120b')
  })

  it('returns null for image-mode tile when no image models available', () => {
    const textOnly: ModelsByProvider = {
      Google: [m('google/gemini-2.5-flash', 'Google')],
      xAI: [m('x-ai/grok-4-fast', 'xAI')],
    }
    const freeUser = { subscription_tier: 'free' } as User
    expect(pickTwoDemoModels('image-creation', textOnly, true, freeUser)).toBeNull()
  })

  it('returns null for image-mode tile for unregistered users (no image models at unregistered tier)', () => {
    const withImageModels: ModelsByProvider = {
      Google: [
        m('google/gemini-2.5-flash', 'Google'),
        m('google/gemini-2.5-flash-image', 'Google', 'free', { supports_image_generation: true }),
      ],
    }
    expect(pickTwoDemoModels('image-creation', withImageModels, false, null)).toBeNull()
  })

  it('modeOverride lets image-mode tile fall back to text models', () => {
    const mixed: ModelsByProvider = {
      Google: [
        m('google/gemini-2.5-flash', 'Google'),
        m('google/gemini-2.5-flash-image', 'Google', 'free', { supports_image_generation: true }),
      ],
      xAI: [m('x-ai/grok-4-fast', 'xAI')],
    }
    // Without override: unregistered user gets null (no image models)
    expect(pickTwoDemoModels('image-creation', mixed, false, null)).toBeNull()
    // With text override: picks text models instead
    const result = pickTwoDemoModels('image-creation', mixed, false, null, 'text')
    expect(result).not.toBeNull()
    expect(result).toHaveLength(2)
    expect(result).not.toContain('google/gemini-2.5-flash-image')
  })

  it('excludes unavailable models', () => {
    const withUnavailable: ModelsByProvider = {
      Google: [m('google/gemini-2.5-flash', 'Google', 'unregistered', { available: false })],
      xAI: [m('x-ai/grok-4-fast', 'xAI')],
      DeepSeek: [m('deepseek/deepseek-chat-v3.1', 'DeepSeek')],
    }
    const result = pickTwoDemoModels('natural-language', withUnavailable, false, null)
    expect(result).not.toBeNull()
    expect(result).not.toContain('google/gemini-2.5-flash')
  })

  it('excludes paid models for unregistered users', () => {
    const withPaid: ModelsByProvider = {
      Anthropic: [m('anthropic/claude-sonnet-4', 'Anthropic', 'paid')],
      Google: [m('google/gemini-2.5-flash', 'Google')],
      xAI: [m('x-ai/grok-4-fast', 'xAI')],
    }
    const result = pickTwoDemoModels('natural-language', withPaid, false, null)
    expect(result).not.toBeNull()
    expect(result).not.toContain('anthropic/claude-sonnet-4')
  })

  it('excludes thinking models for faster demos', () => {
    const withThinking: ModelsByProvider = {
      DeepSeek: [
        m('deepseek/deepseek-r1', 'DeepSeek', 'unregistered', { is_thinking_model: true }),
        m('deepseek/deepseek-chat-v3.1', 'DeepSeek'),
      ],
      Google: [m('google/gemini-2.5-flash', 'Google')],
    }
    const result = pickTwoDemoModels('natural-language', withThinking, false, null)
    expect(result).not.toBeNull()
    expect(result).not.toContain('deepseek/deepseek-r1')
  })

  it('falls back to same-provider pair when only one provider available', () => {
    const singleProvider: ModelsByProvider = {
      Google: [m('google/gemini-2.5-flash', 'Google'), m('google/gemma-3-27b-it', 'Google')],
    }
    const result = pickTwoDemoModels('natural-language', singleProvider, false, null)
    expect(result).not.toBeNull()
    expect(result).toHaveLength(2)
    expect(result![0]).not.toBe(result![1])
  })
})
