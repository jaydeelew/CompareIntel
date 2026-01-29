/**
 * Back to Main CTA Component
 * Reusable call-to-action component for linking back to the main CompareIntel page
 * Displays a beautiful dark gradient card with contextual messaging
 */

import React from 'react'
import { Link } from 'react-router-dom'
import './BackToMainCTA.css'

interface BackToMainCTAProps {
  title?: string
  description?: string
  primaryButtonText?: string
  secondaryButtonText?: string
  secondaryButtonLink?: string
  showFAQButton?: boolean
}

export const BackToMainCTA: React.FC<BackToMainCTAProps> = ({
  title = 'Ready to Try AI?',
  description = 'Now that you understand the basics, put your knowledge to use! Compare different AI models side-by-side and discover which one works best for your needs.',
  primaryButtonText = 'Start Comparing AI Models',
  secondaryButtonText = 'Read the FAQ',
  secondaryButtonLink = '/faq',
  showFAQButton = true,
}) => {
  return (
    <section className="back-to-main-cta">
      <div className="cta-glow" />
      <div className="cta-content">
        <div className="cta-icon-wrapper">
          <svg
            className="cta-icon"
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </div>
        <h2 className="cta-title">{title}</h2>
        <p className="cta-description">{description}</p>
        <div className="cta-buttons">
          <Link to="/" className="cta-btn cta-btn-primary">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            {primaryButtonText}
          </Link>
          {showFAQButton && (
            <Link to={secondaryButtonLink} className="cta-btn cta-btn-secondary">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              {secondaryButtonText}
            </Link>
          )}
        </div>
      </div>
      <div className="cta-decoration cta-decoration-1" />
      <div className="cta-decoration cta-decoration-2" />
      <div className="cta-decoration cta-decoration-3" />
    </section>
  )
}
