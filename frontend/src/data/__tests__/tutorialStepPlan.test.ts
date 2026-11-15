import { describe, expect, it } from 'vitest'

import type { ModelsByProvider } from '../../types'
import {
  buildTutorialRuntimeStepSequence,
  buildTutorialVisibleStepOrder,
  resolveStarterModelEntries,
  resolveTutorialStepConfig,
  tutorialUsesSplitModelSteps,
} from '../tutorialStepPlan'

const REGISTRY: ModelsByProvider = {
  Google: [
    {
      id: 'google/gemini-2.5-flash',
      name: 'Gemini 2.5 Flash',
      description: '',
      category: 'google',
      provider: 'Google',
      available: true,
      tier_access: 'unregistered',
    },
  ],
  DeepSeek: [
    {
      id: 'deepseek/deepseek-v4.1-flash-1017',
      name: 'DeepSeek V4.1 Flash',
      description: '',
      category: 'deepseek',
      provider: 'DeepSeek',
      available: true,
      tier_access: 'unregistered',
    },
  ],
}

describe('tutorialStepPlan', () => {
  it('uses split provider steps when starter models span providers', () => {
    expect(tutorialUsesSplitModelSteps(REGISTRY)).toBe(true)
    const runtime = buildTutorialRuntimeStepSequence(true)
    expect(runtime).toContain('select-starter-model-1')
    expect(runtime).toContain('select-starter-model-2')
    expect(runtime).not.toContain('select-models')
    expect(buildTutorialVisibleStepOrder(true)).toHaveLength(9)
  })

  it('uses single select-models step when both models share a provider', () => {
    const single: ModelsByProvider = {
      Google: [
        ...REGISTRY.Google!,
        {
          id: 'deepseek/deepseek-v4.1-flash-1017',
          name: 'DeepSeek V4.1 Flash',
          description: '',
          category: 'deepseek',
          provider: 'Google',
          available: true,
          tier_access: 'unregistered',
        },
      ],
    }
    expect(tutorialUsesSplitModelSteps(single)).toBe(false)
    const runtime = buildTutorialRuntimeStepSequence(false)
    expect(runtime).toContain('select-models')
    expect(buildTutorialVisibleStepOrder(false)).toHaveLength(8)
  })

  it('builds step copy from real model display names', () => {
    const entries = resolveStarterModelEntries(REGISTRY)
    const cfg1 = resolveTutorialStepConfig('select-starter-model-1', entries, true)
    const cfg2 = resolveTutorialStepConfig('select-starter-model-2', entries, true)
    expect(cfg1.title).toBe('Select Gemini 2.5 Flash')
    expect(cfg2.title).toBe('Now select DeepSeek V4.1 Flash')
    expect(cfg1.description).not.toMatch(/Starter Selection/i)
  })
})
