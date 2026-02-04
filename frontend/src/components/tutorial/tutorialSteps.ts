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
    description: 'Click on the Google provider dropdown to expand it and see available AI models.',
    position: 'top',
  },
  'select-models': {
    step: 'select-models',
    targetSelector: '.provider-dropdown[data-provider-name="Google"]',
    title: 'Select Models',
    description:
      'Select both available Google models by clicking anywhere on them. These are the two Google models available to unregistered users.',
    position: 'top',
  },
  'enter-prompt': {
    step: 'enter-prompt',
    targetSelector: '.composer',
    title: 'Enter Your Prompt',
    description:
      'Type your question or prompt in the text area below. This is what you want the AI models to respond to.',
    position: 'top',
  },
  'submit-comparison': {
    step: 'submit-comparison',
    targetSelector: '[data-testid="comparison-submit-button"]',
    title: 'Run Your Comparison',
    description:
      'Click the submit button in the actions area to submit your prompt and see how different models respond to it.',
    position: 'top',
  },
  'follow-up': {
    step: 'follow-up',
    targetSelector: '.follow-up-button:not(.export-dropdown-trigger)',
    title: 'Continue the Conversation',
    description:
      'View the model results below. When finished, click "Follow up" to continue the conversation. Each model maintains its own conversation context.',
    position: 'top',
  },
  'enter-prompt-2': {
    step: 'enter-prompt-2',
    targetSelector: '.composer',
    title: 'Enter a Follow-Up Prompt',
    description:
      'Now reply to the models with a follow-up. Type your follow-up prompt in the text area below to continue the conversation with the AI models.',
    position: 'top',
  },
  'submit-comparison-2': {
    step: 'submit-comparison-2',
    targetSelector: '[data-testid="comparison-submit-button"]',
    title: 'Submit Your Follow-Up',
    description:
      'Click the submit button to send your follow-up and see how the models respond in the context of your previous conversation.',
    position: 'top',
  },
  'view-follow-up-results': {
    step: 'view-follow-up-results',
    targetSelector: '.results-section',
    title: 'View Follow-Up Results',
    description:
      'Here are the follow-up responses from each model. Notice how they maintain context from your previous conversation. Take a moment to compare the responses.',
    position: 'top',
  },
  'history-dropdown': {
    step: 'history-dropdown',
    targetSelector: '.history-toggle-button',
    title: 'Access Your History',
    description:
      'Click the history button to view and load your previous conversations. Your comparison history is saved automatically.',
    position: 'top',
  },
  'save-selection': {
    step: 'save-selection',
    targetSelector: '.saved-selections-button',
    title: 'Save Model Selections',
    description:
      'Save your favorite model combinations for quick access. Click this button to save or load saved selections.',
    position: 'top',
  },
}
