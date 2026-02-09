import type { TutorialStep } from '../../hooks/useTutorial'

export interface StepConfig {
  step: TutorialStep
  targetSelector: string
  title: string
  description: string
  position: 'top' | 'bottom' | 'left' | 'right'
  // Optional: custom completion detection
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
    description: 'Click on both highlighted Google models to select them for comparison.',
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
    targetSelector: '.follow-up-button:not(.export-dropdown-trigger)',
    title: 'Continue the Conversation',
    description:
      'Review the results, then click the "Follow up" button to continue the conversation.',
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
    title: 'View Follow-Up Results',
    description:
      'Compare the follow-up responses. Notice how each model maintains conversation context.',
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
    description: 'Save your favorite model combinations for quick access.',
    position: 'top',
  },
}
