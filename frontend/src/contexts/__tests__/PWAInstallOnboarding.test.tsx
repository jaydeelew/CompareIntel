import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, beforeEach, afterEach } from 'vitest'

import {
  ONBOARDING_TUTORIAL_ACTIVE_EVENT,
  type OnboardingTutorialActiveDetail,
} from '../../constants/onboardingTutorialEvents'
import { PWAInstallProvider } from '../PWAInstallContext'
import { DISMISSED_KEY } from '../pwaInstallContext'
import { usePWAInstall } from '../usePWAInstall'

function InstallProbe() {
  const { showInstallBanner, showIOSInstructions } = usePWAInstall()
  return (
    <div
      data-testid="install-probe"
      data-banner={String(showInstallBanner)}
      data-ios={String(showIOSInstructions)}
    />
  )
}

describe('PWAInstallProvider onboarding gate', () => {
  beforeEach(() => {
    localStorage.removeItem(DISMISSED_KEY)
    document.documentElement.removeAttribute('data-onboarding-tutorial-active')
    Object.defineProperty(window.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      configurable: true,
    })
  })

  afterEach(() => {
    document.documentElement.removeAttribute('data-onboarding-tutorial-active')
  })

  it('suppresses install UI while onboarding tutorial is active and restores after', async () => {
    render(
      <PWAInstallProvider>
        <InstallProbe />
      </PWAInstallProvider>
    )

    const probe = () => screen.getByTestId('install-probe')

    const simulateEngagementReady = () => {
      window.dispatchEvent(new Event('scroll'))
      window.dispatchEvent(new Event('scroll'))
    }

    simulateEngagementReady()

    await waitFor(
      () => {
        expect(probe()).toHaveAttribute('data-banner', 'true')
      },
      { timeout: 3000 }
    )

    window.dispatchEvent(
      new CustomEvent<OnboardingTutorialActiveDetail>(ONBOARDING_TUTORIAL_ACTIVE_EVENT, {
        detail: { active: true },
      })
    )

    await waitFor(() => {
      expect(probe()).toHaveAttribute('data-banner', 'false')
    })

    window.dispatchEvent(
      new CustomEvent<OnboardingTutorialActiveDetail>(ONBOARDING_TUTORIAL_ACTIVE_EVENT, {
        detail: { active: false },
      })
    )

    await waitFor(() => {
      expect(probe()).toHaveAttribute('data-banner', 'true')
    })
  })
})
