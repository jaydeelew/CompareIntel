import React from 'react'
import { Link } from 'react-router-dom'

export const Footer: React.FC = () => {
  const linkStyle: React.CSSProperties = {
    color: '#22d3ee',
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
        color: '#94a3b8',
        fontSize: '14px',
        backgroundColor: '#0a0a0f',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
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
        <Link to="/about" style={linkStyle}>
          About
        </Link>
        <Link to="/features" style={linkStyle}>
          Features
        </Link>
        <Link to="/how-it-works" style={linkStyle}>
          How It Works
        </Link>
        <Link to="/glossary" style={linkStyle}>
          AI Glossary
        </Link>
        <Link to="/faq" style={linkStyle}>
          FAQ
        </Link>
        <Link to="/privacy-policy" style={linkStyle}>
          Privacy Policy
        </Link>
        <Link to="/terms-of-service" style={linkStyle}>
          Terms of Service
        </Link>
      </nav>

      {/* Support Email */}
      <p style={{ margin: '8px 0' }}>
        Need help or have feedback?{' '}
        <a
          href="mailto:support@compareintel.com"
          style={{
            color: '#22d3ee',
            textDecoration: 'underline',
            textDecorationThickness: '1px',
            textUnderlineOffset: '2px',
          }}
          onMouseOver={e => {
            e.currentTarget.style.color = '#06b6d4'
            e.currentTarget.style.textDecorationThickness = '2px'
          }}
          onMouseOut={e => {
            e.currentTarget.style.color = '#22d3ee'
            e.currentTarget.style.textDecorationThickness = '1px'
          }}
        >
          support@compareintel.com
        </a>
      </p>

      {/* Copyright */}
      <p style={{ margin: '8px 0', fontSize: '12px', color: '#94a3b8' }}>
        © 2026 CompareIntel. All rights reserved.
      </p>
    </footer>
  )
}
