import React from 'react'
import { Link } from 'react-router-dom'

function scrollToTop(): void {
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  document.documentElement.scrollTop = 0
  document.body.scrollTop = 0
  const app = document.querySelector('.app') as HTMLElement
  if (app) app.scrollTop = 0
}

export const Footer: React.FC = () => {
  const linkStyle: React.CSSProperties = {
    color: 'var(--primary-color)',
    textDecoration: 'none',
    transition: 'color 0.2s',
    cursor: 'pointer',
  }

  return (
    <footer
      style={{
        textAlign: 'center',
        padding: '20px 20px 22px',
        marginTop: 0,
        color: 'var(--text-secondary)',
        fontSize: '14px',
        backgroundColor: 'var(--bg-secondary)',
        borderTop: '1px solid var(--border-color)',
      }}
    >
      {/* Navigation Links */}
      <nav
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: '8px 24px',
          marginBottom: '20px',
        }}
        aria-label="Footer navigation"
      >
        <Link to="/about" style={linkStyle} onClick={scrollToTop}>
          About
        </Link>
        <Link to="/features" style={linkStyle} onClick={scrollToTop}>
          Features
        </Link>
        <Link to="/how-it-works" style={linkStyle} onClick={scrollToTop}>
          How It Works
        </Link>
        <Link to="/glossary" style={linkStyle} onClick={scrollToTop}>
          AI Glossary
        </Link>
        <Link to="/help-me-choose-methodology" style={linkStyle} onClick={scrollToTop}>
          Help Me Choose Methodology
        </Link>
        <Link to="/faq" style={linkStyle} onClick={scrollToTop}>
          FAQ
        </Link>
        <Link to="/privacy-policy" style={linkStyle} onClick={scrollToTop}>
          Privacy Policy
        </Link>
        <Link to="/terms-of-service" style={linkStyle} onClick={scrollToTop}>
          Terms of Service
        </Link>
      </nav>

      {/* Support Email */}
      <p style={{ margin: '8px 0' }}>
        Need help or have feedback?{' '}
        <a
          href="mailto:support@compareintel.com"
          style={{
            color: 'var(--primary-color)',
            textDecoration: 'underline',
            textDecorationThickness: '1px',
            textUnderlineOffset: '2px',
          }}
          onMouseOver={e => {
            e.currentTarget.style.color = 'var(--primary-hover)'
            e.currentTarget.style.textDecorationThickness = '2px'
          }}
          onMouseOut={e => {
            e.currentTarget.style.color = 'var(--primary-color)'
            e.currentTarget.style.textDecorationThickness = '1px'
          }}
        >
          support@compareintel.com
        </a>
      </p>

      {/* Copyright */}
      <p style={{ margin: '8px 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
        © 2026 CompareIntel. All rights reserved.
      </p>
    </footer>
  )
}
