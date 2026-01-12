import React from 'react'
import './TutorialWelcomeModal.css'

interface TutorialWelcomeModalProps {
  onStart: () => void
  onSkip: () => void
}

export const TutorialWelcomeModal: React.FC<TutorialWelcomeModalProps> = ({ onStart, onSkip }) => {
  return (
    <div className="tutorial-welcome-backdrop">
      <div className="tutorial-welcome-modal">
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
              <span className="tutorial-welcome-feature-icon">↗️</span>
              <span>Break out conversations</span>
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
          <div className="tutorial-welcome-actions">
            <button
              className="tutorial-welcome-button tutorial-welcome-button-primary"
              onClick={onStart}
            >
              Start Tutorial
            </button>
            <button
              className="tutorial-welcome-button tutorial-welcome-button-secondary"
              onClick={onSkip}
            >
              Skip for Now
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
