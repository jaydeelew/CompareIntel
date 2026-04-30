import type { TutorialStep } from '../hooks/useTutorial'
import type { ModelsByProvider } from '../types/models'

/** Google text models shown while the tutorial is on provider steps (expand + select models; step 2 lists only these). */
export const TUTORIAL_GOOGLE_MODEL_IDS: readonly string[] = [
  'google/gemma-3-27b-it',
  'google/gemini-3.1-flash-lite-preview',
]

/**
 * During the onboarding tutorial, limit the Google provider row to {@link TUTORIAL_GOOGLE_MODEL_IDS}.
 * No-op when `enabled` is false or the allowlist would drop every model (safety fallback).
 */
export function filterGoogleModelsForTutorial(
  modelsByProvider: ModelsByProvider,
  enabled: boolean
): ModelsByProvider {
  if (!enabled) return modelsByProvider
  const google = modelsByProvider['Google']
  if (!google?.length) return modelsByProvider
  const allowed = new Set(TUTORIAL_GOOGLE_MODEL_IDS)
  const filtered = google.filter(m => allowed.has(String(m.id)))
  if (filtered.length === 0) return modelsByProvider
  const order = new Map(TUTORIAL_GOOGLE_MODEL_IDS.map((id, i) => [id, i]))
  filtered.sort((a, b) => (order.get(String(a.id)) ?? 99) - (order.get(String(b.id)) ?? 99))
  return { ...modelsByProvider, Google: filtered }
}

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
    description: 'Click the Google dropdown to see available AI models.',
    position: 'top',
  },
  'select-models': {
    step: 'select-models',
    targetSelector: '.provider-dropdown[data-provider-name="Google"]',
    title: 'Select Models',
    description: 'Select both models below: Gemma 3 27B and Gemini 3.1 Flash Lite Preview.',
    position: 'top',
  },
  'enter-prompt': {
    step: 'enter-prompt',
    targetSelector: '.composer',
    title: 'Enter Your Prompt',
    description: 'Type your question or prompt in the text area below.',
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
    description: 'Review the responses from both models above. Then, type a follow-up.',
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
    description: 'Click this button to view and load previous conversations.',
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
