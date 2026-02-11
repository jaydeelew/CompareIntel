/**
 * ModalManager - Centralized modal rendering component
 *
 * Consolidates all modal rendering in one place to:
 * - Reduce MainPage JSX complexity
 * - Centralize modal logic
 * - Make modal state management clearer
 *
 * Note: Modal state is still managed in the parent, but rendering is delegated here.
 */

import { AuthModal, VerificationCodeModal, VerificationSuccessModal, ResetPassword } from '../auth'
import { PremiumModelsToggleInfoModal, DisabledButtonInfoModal } from '../comparison'
import { TrialWelcomeModal } from '../trial'

export interface ModalManagerProps {
  // Auth modal
  isAuthModalOpen: boolean
  authModalMode: 'login' | 'register'
  loginEmail: string
  onAuthModalClose: () => void

  // Verification modals
  showVerificationCodeModal: boolean
  showVerificationSuccessModal: boolean
  showPasswordReset: boolean
  userEmail: string | undefined
  onVerificationCodeModalClose: () => void
  onVerificationCodeModalUseDifferentEmail?: () => void
  onVerificationComplete: () => void
  onVerificationSuccessModalClose: () => void
  onPasswordResetClose: (email?: string) => void

  // Premium models modal
  showPremiumModelsToggleModal: boolean
  onPremiumModelsModalClose: () => void
  onPremiumModelsDontShowAgain: (checked: boolean) => void

  // Disabled button info modal
  disabledButtonInfo: {
    button: 'collapse-all' | 'clear-all' | null
    message: string
  }
  onDisabledButtonInfoClose: () => void

  // Trial welcome modal
  showTrialWelcomeModal: boolean
  trialEndsAt: string | undefined
  trialUserEmail: string | undefined
  onTrialWelcomeModalClose: () => void
}

export function ModalManager({
  // Auth modal
  isAuthModalOpen,
  authModalMode,
  loginEmail,
  onAuthModalClose,

  // Verification modals
  showVerificationCodeModal,
  showVerificationSuccessModal,
  showPasswordReset,
  userEmail,
  onVerificationCodeModalClose,
  onVerificationCodeModalUseDifferentEmail,
  onVerificationComplete,
  onVerificationSuccessModalClose,
  onPasswordResetClose,

  // Premium models modal
  showPremiumModelsToggleModal,
  onPremiumModelsModalClose,
  onPremiumModelsDontShowAgain,

  // Disabled button info modal
  disabledButtonInfo,
  onDisabledButtonInfoClose,

  // Trial welcome modal
  showTrialWelcomeModal,
  trialEndsAt,
  trialUserEmail,
  onTrialWelcomeModalClose,
}: ModalManagerProps) {
  return (
    <>
      {/* Verification Code Modal */}
      <VerificationCodeModal
        isOpen={showVerificationCodeModal && !showPasswordReset}
        onClose={onVerificationCodeModalClose}
        onUseDifferentEmail={onVerificationCodeModalUseDifferentEmail}
        onVerified={onVerificationComplete}
        userEmail={userEmail}
      />

      {/* Verification Success Modal */}
      <VerificationSuccessModal
        isOpen={showVerificationSuccessModal}
        onClose={onVerificationSuccessModalClose}
      />

      {/* Password Reset Modal */}
      {showPasswordReset && <ResetPassword onClose={onPasswordResetClose} />}

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={onAuthModalClose}
        initialMode={authModalMode}
        initialEmail={loginEmail}
      />

      {/* Premium Models Toggle Info Modal */}
      <PremiumModelsToggleInfoModal
        isOpen={showPremiumModelsToggleModal}
        onClose={onPremiumModelsModalClose}
        onDontShowAgain={onPremiumModelsDontShowAgain}
      />

      {/* Disabled Button Info Modal */}
      <DisabledButtonInfoModal
        isOpen={disabledButtonInfo.button !== null}
        onClose={onDisabledButtonInfoClose}
        buttonType={disabledButtonInfo.button}
        message={disabledButtonInfo.message}
      />

      {/* Trial Welcome Modal */}
      <TrialWelcomeModal
        isOpen={showTrialWelcomeModal}
        onClose={onTrialWelcomeModalClose}
        trialEndsAt={trialEndsAt}
        userEmail={trialUserEmail}
      />
    </>
  )
}
