export { TutorialController } from './TutorialController'
// TutorialOverlay is lazy-loaded from TutorialController only — do not re-export here or
// the barrel forces eager inclusion and defeats dynamic import() chunk splitting.
export { TutorialWelcomeModal } from './TutorialWelcomeModal'
export { MobileTutorialController } from './MobileTutorialController'
export { default as MobileTutorialOverlay } from './MobileTutorialOverlay'
export { TutorialManager } from './TutorialManager'
export { TUTORIAL_STEPS_CONFIG } from '../../data/tutorialSteps'
export type { StepConfig } from '../../data/tutorialSteps'
