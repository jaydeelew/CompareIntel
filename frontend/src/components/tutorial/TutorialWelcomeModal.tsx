import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import './TutorialWelcomeModal.css'

interface TutorialWelcomeModalProps {
  onStart: () => void
  onSkip: () => void
  onDontShowAgain?: () => void
  showDontShowAgain?: boolean
}

export const TutorialWelcomeModal: React.FC<TutorialWelcomeModalProps> = ({
  onStart,
  onSkip,
  onDontShowAgain,
  showDontShowAgain = false,
}) => {
  const [dontShowAgain, setDontShowAgain] = useState(false)

  const handleStart = () => {
    if (dontShowAgain && onDontShowAgain) {
      onDontShowAgain()
    }
    onStart()
  }

  const handleSkip = () => {
    if (dontShowAgain && onDontShowAgain) {
      onDontShowAgain()
    }
    onSkip()
  }

  // Use portal to render outside the .app stacking context
  return createPortal(
    <div className="tutorial-welcome-backdrop">
      <div className="tutorial-welcome-modal">
        <div className="tutorial-welcome-logo-background">
          <div
            className="tutorial-welcome-logo-image"
            style={{
              WebkitMaskImage: 'url(/CI_favicon_512x512.png)',
              maskImage: 'url(/CI_favicon_512x512.png)',
            }}
          />
        </div>
        <div className="tutorial-welcome-content">
          <h2 className="tutorial-welcome-title">Welcome to CompareIntel!</h2>
          <p className="tutorial-welcome-description">
            Take a quick tour to learn how to compare AI models, continue conversations, and make
            the most of your comparisons.
          </p>
          <div className="tutorial-welcome-features">
            <div className="tutorial-welcome-feature">
              <span className="tutorial-welcome-feature-icon">🚀</span>
              <span>Run model comparisons</span>
            </div>
            <div className="tutorial-welcome-feature">
              <span className="tutorial-welcome-feature-icon">💬</span>
              <span>Continue conversations</span>
            </div>
            <div className="tutorial-welcome-feature">
              <span className="tutorial-welcome-feature-icon">📚</span>
              <span>Access conversation history</span>
            </div>
            <div className="tutorial-welcome-feature">
              <span className="tutorial-welcome-feature-icon">⭐</span>
              <span>Save favorite model selections</span>
            </div>
          </div>
          <p className="tutorial-welcome-more-features">
            Many more features are available! Check out our{' '}
            <Link to="/how-it-works" className="tutorial-welcome-link">
              How it works page
            </Link>{' '}
            to learn more.
          </p>

          {showDontShowAgain && (
            <div className="tutorial-welcome-dont-show-again">
              <label className="tutorial-welcome-checkbox-label">
                <input
                  type="checkbox"
                  checked={dontShowAgain}
                  onChange={e => setDontShowAgain(e.target.checked)}
                  className="tutorial-welcome-checkbox"
                />
                <span>Don't show again</span>
              </label>
            </div>
          )}
          <div className="tutorial-welcome-actions">
            <button
              className="tutorial-welcome-button tutorial-welcome-button-primary"
              onClick={handleStart}
            >
              Start Tutorial
            </button>
            <button
              className="tutorial-welcome-button tutorial-welcome-button-secondary"
              onClick={handleSkip}
            >
              Skip for Now
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
