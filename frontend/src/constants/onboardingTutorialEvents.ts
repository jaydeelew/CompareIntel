export const ONBOARDING_TUTORIAL_ACTIVE_EVENT = 'compareintel-onboarding-tutorial-active'
export const ONBOARDING_TUTORIAL_ACTIVE_ATTR = 'data-onboarding-tutorial-active'

export interface OnboardingTutorialActiveDetail {
  active: boolean
}

/** Sync DOM flag and broadcast so PWA install UI can defer while onboarding runs. */
export function dispatchOnboardingTutorialActive(active: boolean): void {
  if (typeof window === 'undefined') return
  if (active) {
    document.documentElement.setAttribute(ONBOARDING_TUTORIAL_ACTIVE_ATTR, '')
  } else {
    document.documentElement.removeAttribute(ONBOARDING_TUTORIAL_ACTIVE_ATTR)
  }
  window.dispatchEvent(
    new CustomEvent<OnboardingTutorialActiveDetail>(ONBOARDING_TUTORIAL_ACTIVE_EVENT, {
      detail: { active },
    })
  )
}
