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
  Anthropic: [
    {
      id: 'anthropic/claude-sonnet-5.5',
      name: 'Claude Sonnet 5.5',
      description: '',
      category: 'anthropic',
      provider: 'Anthropic',
      available: true,
      tier_access: 'unregistered',
    },
  ],
  OpenAI: [
    {
      id: 'openai/gpt-5.2',
      name: 'GPT-5.2',
      description: '',
      category: 'openai',
      provider: 'OpenAI',
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
    expect(runtime).toContain('expand-starter-provider-2')
    expect(runtime).not.toContain('select-models')
    expect(buildTutorialVisibleStepOrder(true)).toHaveLength(10)
  })

  it('uses single select-models step when both models share a provider', () => {
    const single: ModelsByProvider = {
      Anthropic: [
        ...REGISTRY.Anthropic!,
        {
          id: 'openai/gpt-5.2',
          name: 'GPT-5.2',
          description: '',
          category: 'openai',
          provider: 'Anthropic',
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
    const cfgExpand = resolveTutorialStepConfig('expand-provider', entries, true)
    expect(cfg1.title).toBe('Select Claude Sonnet 5.5')
    expect(cfg1.description).toMatch(/Select this model to compare/)
    expect(cfgExpand.title).toBe('Expand Anthropic')
    expect(cfg2.title).toBe('Select GPT-5.2')
    expect(cfg1.description).not.toMatch(/Starter Selection/i)
  })
})
