/** Gate PWA install UI while onboarding / guided tutorial is active. */
export function gateInstallPromptForOnboarding(
  visible: boolean,
  onboardingTutorialActive: boolean
): boolean {
  return visible && !onboardingTutorialActive
}