import { useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { Navigation } from '../components/layout'
import { ModalManager } from '../components/main-page'
import { getConversationLimit } from '../config/constants'
import { useAuth } from '../contexts/AuthContext'
import { useConversationHistory, useAuthModals } from '../hooks'
import type { ConversationSummary } from '../types'
import { truncatePrompt, formatDate } from '../utils'

/**
 * History page - full-page view of conversation history.
 * Clicking a conversation navigates to /compare and loads it.
 */
export function HistoryPage() {
  const { isAuthenticated, user, isLoading: authLoading } = useAuth()
  const navigate = useNavigate()

  const authModals = useAuthModals({
    isAuthenticated: isAuthenticated ?? false,
    user,
    authLoading: authLoading ?? false,
  })
  const {
    isAuthModalOpen,
    authModalMode,
    loginEmail,
    openLogin,
    openRegister,
    closeAuthModal,
    setShowVerificationCodeModal,
    setShowVerificationSuccessModal,
    handlePasswordResetClose,
    openLoginAfterVerificationCode,
    handleVerified,
  } = authModals

  const { conversationHistory, isLoadingHistory, historyLimit, deleteConversation } =
    useConversationHistory({
      isAuthenticated: isAuthenticated ?? false,
      user,
    })

  const userTier = isAuthenticated ? user?.subscription_tier || 'free' : 'unregistered'
  const tierLimit = getConversationLimit(userTier)

  const handleOpenConversation = useCallback(
    (summary: ConversationSummary) => {
      navigate('/compare', { state: { loadConversation: summary } })
    },
    [navigate]
  )

  return (
    <div className="app">
      <Navigation
        isAuthenticated={isAuthenticated ?? false}
        isAdmin={user?.is_admin ?? false}
        currentView="main"
        onSignInClick={openLogin}
        onSignUpClick={openRegister}
      />

      <ModalManager
        isAuthModalOpen={isAuthModalOpen}
        authModalMode={authModalMode}
        loginEmail={loginEmail}
        onAuthModalClose={closeAuthModal}
        showVerificationCodeModal={false}
        showVerificationSuccessModal={false}
        showPasswordReset={false}
        userEmail={user?.email}
        onVerificationCodeModalClose={() => setShowVerificationCodeModal(false)}
        onVerificationCodeModalUseDifferentEmail={openLoginAfterVerificationCode}
        onVerificationComplete={handleVerified}
        onVerificationSuccessModalClose={() => setShowVerificationSuccessModal(false)}
        onPasswordResetClose={handlePasswordResetClose}
        showPremiumModelsToggleModal={false}
        onPremiumModelsToggleModalClose={() => {}}
        onPremiumModelsDontShowAgain={() => {}}
        disabledButtonInfo={{ button: null, message: '' }}
        onDisabledButtonInfoClose={() => {}}
        showTrialWelcomeModal={false}
        trialEndsAt={undefined}
        trialUserEmail={undefined}
        onTrialWelcomeModalClose={() => {}}
        disabledModelModalInfo={null}
        onDisabledModelModalClose={() => {}}
        onToggleHidePremiumModels={() => {}}
        onOpenSignUp={openRegister}
      />

      <main
        className="history-page"
        style={{ padding: '2rem 1rem', maxWidth: '720px', margin: '0 auto' }}
      >
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link to="/compare">Compare</Link>
          <span className="breadcrumb-separator">/</span>
          <span aria-current="page">History</span>
        </nav>

        <h1 className="history-page-title">Conversation History</h1>
        <p className="history-page-intro">
          Your past comparisons. Click to open in the comparison view. Free tier: {tierLimit} saved.
        </p>

        <div className="history-page-actions">
          <Link to="/compare" className="history-page-link">
            ← New comparison
          </Link>
        </div>

        {isLoadingHistory ? (
          <div className="history-loading">Loading...</div>
        ) : conversationHistory.length === 0 ? (
          <div className="history-empty">No conversation history</div>
        ) : (
          <ul className="history-page-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {conversationHistory.slice(0, historyLimit).map(summary => {
              const isBreakout = summary.conversation_type === 'breakout'
              return (
                <li key={String(summary.id)} className="history-item">
                  <div
                    className="history-item-content"
                    onClick={() => handleOpenConversation(summary)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handleOpenConversation(summary)
                      }
                    }}
                  >
                    <div className="history-item-prompt">
                      {truncatePrompt(summary.input_data)}
                      {isBreakout && (
                        <span className="history-item-breakout-badge" title="Breakout conversation">
                          ↗
                        </span>
                      )}
                    </div>
                    <div className="history-item-meta">
                      <span className="history-item-models">
                        {summary.models_used.length === 1
                          ? summary.models_used[0].split('/').pop() || summary.models_used[0]
                          : `${summary.models_used.length} models`}
                      </span>
                      <span className="history-item-date">{formatDate(summary.created_at)}</span>
                    </div>
                  </div>
                  <button
                    className="history-item-delete"
                    onClick={e => deleteConversation(summary, e)}
                    aria-label="Delete conversation"
                  >
                    ×
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {(userTier === 'unregistered' || userTier === 'free') &&
          conversationHistory.length >= tierLimit && (
            <p className="history-page-upgrade">Sign up or upgrade to save more comparisons.</p>
          )}
      </main>
    </div>
  )
}
