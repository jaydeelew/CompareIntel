import type { TutorialStep } from '../hooks/useTutorial'
import type { ModelsByProvider } from '../types/models'
import {
  getProvidersForModelIds,
  resolveStarterSelectionModelIds,
} from '../utils/starterSelectionModels'

import { TUTORIAL_STEPS_CONFIG, filterModelsForTutorial } from './tutorialSteps'

export interface StarterModelEntry {
  modelId: string
  provider: string
  displayName: string
}

const TUTORIAL_TAIL_STEPS: TutorialStep[] = [
  'enter-prompt',
  'submit-comparison',
  'follow-up',
  'enter-prompt-2',
  'submit-comparison-2',
  'view-follow-up-results',
  'history-dropdown',
  'save-selection',
]

/** Runtime order when both starter models live in one provider (legacy single select-models step). */
export function buildTutorialRuntimeStepSequenceSameProvider(): TutorialStep[] {
  return ['expand-provider', 'select-models', ...TUTORIAL_TAIL_STEPS]
}

/** Runtime order when each starter model is in its own provider group. */
export function buildTutorialRuntimeStepSequenceSplitProviders(): TutorialStep[] {
  return [
    'expand-provider',
    'select-starter-model-1',
    'expand-starter-provider-2',
    'select-starter-model-2',
    ...TUTORIAL_TAIL_STEPS,
  ]
}

export function buildTutorialRuntimeStepSequence(splitProviderModelSteps: boolean): TutorialStep[] {
  return splitProviderModelSteps
    ? buildTutorialRuntimeStepSequenceSplitProviders()
    : buildTutorialRuntimeStepSequenceSameProvider()
}

export function tutorialUsesSplitModelSteps(
  modelsByProvider: ModelsByProvider,
  tutorialModelIds: readonly string[] = resolveStarterSelectionModelIds(modelsByProvider)
): boolean {
  return getProvidersForModelIds(modelsByProvider, tutorialModelIds).length > 1
}

export function buildTutorialVisibleStepOrder(splitProviderModelSteps: boolean): TutorialStep[] {
  const modelSteps: TutorialStep[] = splitProviderModelSteps
    ? ['select-starter-model-1', 'expand-starter-provider-2', 'select-starter-model-2']
    : ['select-models']
  return [
    'expand-provider',
    ...modelSteps,
    ...TUTORIAL_TAIL_STEPS.filter(s => s !== 'enter-prompt-2' && s !== 'submit-comparison-2'),
  ]
}

export function resolveStarterModelEntries(
  modelsByProvider: ModelsByProvider,
  tutorialModelIds: readonly string[] = resolveStarterSelectionModelIds(modelsByProvider)
): StarterModelEntry[] {
  const entries: StarterModelEntry[] = []
  for (const modelId of tutorialModelIds) {
    let displayName = 'this model'
    let provider = ''
    for (const [providerName, models] of Object.entries(modelsByProvider)) {
      const match = models.find(m => String(m.id) === String(modelId))
      if (match) {
        displayName = match.name
        provider = providerName
        break
      }
    }
    entries.push({ modelId: String(modelId), provider, displayName })
  }
  return entries
}

export function resolveTutorialProviderNamesForStep(
  step: TutorialStep | null,
  entries: readonly StarterModelEntry[],
  allTutorialProviders: readonly string[]
): string[] {
  if (!step) return []
  if (step === 'select-starter-model-1' && entries[0]?.provider) {
    return [entries[0].provider]
  }
  if (step === 'select-starter-model-2' && entries[1]?.provider) {
    return [entries[1].provider]
  }
  if (step === 'select-models') {
    return [...allTutorialProviders]
  }
  if (step === 'expand-provider') {
    return entries[0]?.provider ? [entries[0].provider] : []
  }
  if (step === 'expand-starter-provider-2') {
    return entries[1]?.provider ? [entries[1].provider] : []
  }
  return []
}

export function isSelectModelTutorialStep(step: TutorialStep | null | undefined): boolean {
  return (
    step === 'select-models' ||
    step === 'select-starter-model-1' ||
    step === 'select-starter-model-2'
  )
}

export function isExpandProviderTutorialStep(step: TutorialStep | null | undefined): boolean {
  return step === 'expand-provider' || step === 'expand-starter-provider-2'
}

export function isProviderPickerTutorialStep(step: TutorialStep | null | undefined): boolean {
  return (
    isExpandProviderTutorialStep(step) ||
    step === 'select-models' ||
    step === 'select-starter-model-1' ||
    step === 'select-starter-model-2'
  )
}

export function isSingleProviderSpotlightStep(step: TutorialStep | null | undefined): boolean {
  return (
    isExpandProviderTutorialStep(step) ||
    step === 'select-starter-model-1' ||
    step === 'select-starter-model-2'
  )
}

/** Step-specific model list filter (provider steps only). */
export function filterModelsForTutorialStep(
  modelsByProvider: ModelsByProvider,
  step: TutorialStep | null,
  enabled: boolean,
  tutorialModelIds: readonly string[]
): ModelsByProvider {
  if (!enabled || !step || !isProviderPickerTutorialStep(step)) {
    return modelsByProvider
  }
  if ((step === 'expand-provider' || step === 'select-starter-model-1') && tutorialModelIds[0]) {
    return filterIds(modelsByProvider, true, [tutorialModelIds[0]])
  }
  if (
    (step === 'expand-starter-provider-2' || step === 'select-starter-model-2') &&
    tutorialModelIds[1]
  ) {
    return filterIds(modelsByProvider, true, [tutorialModelIds[1]])
  }
  return filterIds(modelsByProvider, true, tutorialModelIds)
}

function filterIds(
  modelsByProvider: ModelsByProvider,
  enabled: boolean,
  ids: readonly string[]
): ModelsByProvider {
  return filterModelsForTutorial(modelsByProvider, enabled, ids)
}

export function resolveTutorialStepConfig(
  step: TutorialStep,
  entries: readonly StarterModelEntry[],
  splitProviderModelSteps: boolean
): StepConfig {
  const base = TUTORIAL_STEPS_CONFIG[step]
  if (step === 'expand-provider' && splitProviderModelSteps && entries[0]?.provider) {
    return {
      ...base,
      title: `Expand ${entries[0].provider}`,
      description: `Open the ${entries[0].provider} dropdown to see ${entries[0].displayName}.`,
    }
  }
  if (step === 'expand-starter-provider-2' && splitProviderModelSteps && entries[1]?.provider) {
    return {
      ...base,
      title: `Expand ${entries[1].provider}`,
      description: `Open the ${entries[1].provider} dropdown to see ${entries[1].displayName}.`,
    }
  }
  if (step === 'select-starter-model-1' && splitProviderModelSteps && entries[0]) {
    return {
      ...base,
      title: `Select ${entries[0].displayName}`,
      description: 'Select this model to compare.',
    }
  }
  if (step === 'select-starter-model-2' && splitProviderModelSteps && entries[1]) {
    return {
      ...base,
      title: `Select ${entries[1].displayName}`,
      description: 'Select the second model to compare.',
    }
  }
  return base
}
