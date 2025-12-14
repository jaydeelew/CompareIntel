import React, { useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'

export const Footer: React.FC = () => {
  const navigate = useNavigate()

  const linkStyle: React.CSSProperties = {
    color: '#0284c7',
    textDecoration: 'none',
    transition: 'color 0.2s',
    cursor: 'pointer',
  }

  // Handle navigation - scroll the .app container to top and navigate
  const handleNavClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>, path: string) => {
    e.preventDefault()
    
    // Scroll the .app container (which has overflow-y: auto) to top
    const appContainer = document.querySelector('.app')
    if (appContainer) {
      appContainer.scrollTop = 0
    }
    
    // Also scroll window/document as fallback
    window.scrollTo(0, 0)
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
    
    // Navigate
    navigate(path)
  }, [navigate])

  return (
    <footer
      style={{
        textAlign: 'center',
        padding: '40px 20px 20px',
        borderTop: '1px solid #e5e7eb',
        marginTop: '40px',
        color: '#6b7280',
        fontSize: '14px',
        backgroundColor: '#ffffff',
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
        <Link to="/about" style={linkStyle} onClick={e => handleNavClick(e, '/about')}>
          About
        </Link>
        <Link to="/features" style={linkStyle} onClick={e => handleNavClick(e, '/features')}>
          Features
        </Link>
        <Link to="/how-it-works" style={linkStyle} onClick={e => handleNavClick(e, '/how-it-works')}>
          How It Works
        </Link>
        <Link to="/faq" style={linkStyle} onClick={e => handleNavClick(e, '/faq')}>
          FAQ
        </Link>
        <Link to="/privacy-policy" style={linkStyle} onClick={e => handleNavClick(e, '/privacy-policy')}>
          Privacy Policy
        </Link>
        <Link to="/terms-of-service" style={linkStyle} onClick={e => handleNavClick(e, '/terms-of-service')}>
          Terms of Service
        </Link>
      </nav>

      {/* Support Email */}
      <p style={{ margin: '8px 0' }}>
        Need help or have feedback?{' '}
        <a
          href="mailto:support@compareintel.com"
          style={{
            color: '#0284c7',
            textDecoration: 'underline',
            textDecorationThickness: '1px',
            textUnderlineOffset: '2px',
          }}
          onMouseOver={e => {
            e.currentTarget.style.color = '#0369a1'
            e.currentTarget.style.textDecorationThickness = '2px'
          }}
          onMouseOut={e => {
            e.currentTarget.style.color = '#0284c7'
            e.currentTarget.style.textDecorationThickness = '1px'
          }}
        >
          support@compareintel.com
        </a>
      </p>

      {/* Copyright */}
      <p style={{ margin: '8px 0', fontSize: '12px', color: '#4b5563' }}>
        © 2025 CompareIntel. All rights reserved.
      </p>
    </footer>
  )
}
