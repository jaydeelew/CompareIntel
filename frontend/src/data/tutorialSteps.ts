import type { TutorialStep } from '../hooks/useTutorial'
import type { ModelsByProvider } from '../types/models'
import { resolveStarterSelectionModelIds } from '../utils/starterSelectionModels'

/**
 * During provider steps, limit the model picker to Starter Selection models only.
 * No-op when `enabled` is false or filtering would drop every model (safety fallback).
 */
export function filterModelsForTutorial(
  modelsByProvider: ModelsByProvider,
  enabled: boolean,
  tutorialModelIds: readonly string[] = resolveStarterSelectionModelIds(modelsByProvider)
): ModelsByProvider {
  if (!enabled) return modelsByProvider
  if (tutorialModelIds.length === 0) return modelsByProvider

  const allowed = new Set(tutorialModelIds.map(String))
  const order = new Map(tutorialModelIds.map((id, i) => [id, i]))
  const result: ModelsByProvider = {}
  let keptAny = false

  for (const [provider, models] of Object.entries(modelsByProvider)) {
    const filtered = models.filter(m => allowed.has(String(m.id)))
    if (filtered.length > 0) {
      filtered.sort((a, b) => (order.get(String(a.id)) ?? 99) - (order.get(String(b.id)) ?? 99))
      result[provider] = filtered
      keptAny = true
    }
  }

  if (!keptAny) return modelsByProvider
  return result
}

/** @deprecated Use filterModelsForTutorial */
export const filterGoogleModelsForTutorial = filterModelsForTutorial

export interface StepConfig {
  step: TutorialStep
  targetSelector: string
  title: string
  description: string
  position: 'top' | 'bottom' | 'left' | 'right'
  completionCheck?: () => boolean | Promise<boolean>
}

export const TUTORIAL_STEPS_CONFIG: Record<TutorialStep, StepConfig> = {
  'expand-provider': {
    step: 'expand-provider',
    targetSelector: '.provider-dropdown .provider-header',
    title: 'Expand a Provider',
    description: 'Open a provider dropdown to see the suggested starter models.',
    position: 'top',
  },
  'select-models': {
    step: 'select-models',
    targetSelector: '.provider-dropdown[data-provider-name="Google"]',
    title: 'Select Models',
    description: 'Select the same two models used for Starter Selection.',
    position: 'top',
  },
  'enter-prompt': {
    step: 'enter-prompt',
    targetSelector: '.composer',
    title: 'Enter Your Prompt',
    description: 'Type your question or prompt in the text area.',
    position: 'bottom',
  },
  'submit-comparison': {
    step: 'submit-comparison',
    targetSelector: '[data-testid="comparison-submit-button"]',
    title: 'Run Your Comparison',
    description: 'Click the submit button to send your prompt to the selected models.',
    position: 'top',
  },
  'follow-up': {
    step: 'follow-up',
    targetSelector: '[data-after-results-composer-slot] .composer:not(.composer-placeholder)',
    title: 'Continue the Conversation',
    description:
      'Review the responses from both models above. Then, type a follow-up and click the green submit button.',
    position: 'top',
  },
  'enter-prompt-2': {
    step: 'enter-prompt-2',
    targetSelector: '.composer',
    title: 'Enter a Follow-Up',
    description: 'Type a follow-up prompt in the text area below.',
    position: 'bottom',
  },
  'submit-comparison-2': {
    step: 'submit-comparison-2',
    targetSelector: '[data-testid="comparison-submit-button"]',
    title: 'Submit Your Follow-Up',
    description: 'Click submit to see how models respond in context of your conversation.',
    position: 'top',
  },
  'view-follow-up-results': {
    step: 'view-follow-up-results',
    targetSelector: '.results-section',
    title: 'Review the New Responses',
    description:
      'Read the latest replies from each model side by side. Compare how they stay consistent with the conversation so far.',
    position: 'top',
  },
  'history-dropdown': {
    step: 'history-dropdown',
    targetSelector: '.history-toggle-button',
    title: 'Access Your History',
    description: 'Toggle this dropdown to view and load previous conversations.',
    position: 'top',
  },
  'save-selection': {
    step: 'save-selection',
    targetSelector: '.saved-selections-button',
    title: 'Save Model Selections',
    description:
      'After this tutorial, save your favorite model combinations for quick access, and even set one as default.',
    position: 'top',
  },
}

/**
 * Steps included in "Step X of Y" and progress dots.
 * Omits `enter-prompt-2` and `submit-comparison-2`, which are skipped during the normal tour.
 */
export const TUTORIAL_VISIBLE_STEP_ORDER: TutorialStep[] = [
  'expand-provider',
  'select-models',
  'enter-prompt',
  'submit-comparison',
  'follow-up',
  'view-follow-up-results',
  'history-dropdown',
  'save-selection',
]

/** 1-based step index for UI progress (e.g. review results = 6 of 8). */
export function getTutorialVisibleStepProgress(step: TutorialStep | null): {
  stepIndex: number
  totalSteps: number
} {
  const totalSteps = TUTORIAL_VISIBLE_STEP_ORDER.length
  if (!step) {
    return { stepIndex: 0, totalSteps }
  }
  const i = TUTORIAL_VISIBLE_STEP_ORDER.indexOf(step)
  if (i >= 0) {
    return { stepIndex: i + 1, totalSteps }
  }
  if (step === 'enter-prompt-2' || step === 'submit-comparison-2') {
    const j = TUTORIAL_VISIBLE_STEP_ORDER.indexOf('follow-up')
    return { stepIndex: j + 1, totalSteps }
  }
  return { stepIndex: 1, totalSteps }
}