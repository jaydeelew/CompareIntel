import React from 'react'

export const Footer: React.FC = () => {
  return (
    <footer
      style={{
        textAlign: 'center',
        padding: '20px',
        borderTop: '1px solid #e5e7eb',
        marginTop: '40px',
        color: '#6b7280',
        fontSize: '14px',
        backgroundColor: '#ffffff',
      }}
    >
      <p style={{ margin: '8px 0' }}>
        Need help or have feedback?{' '}
        <a
          href="mailto:support@compareintel.com"
          style={{
            color: '#0ea5e9',
            textDecoration: 'none',
          }}
          onMouseOver={e => (e.currentTarget.style.textDecoration = 'underline')}
          onMouseOut={e => (e.currentTarget.style.textDecoration = 'none')}
        >
          support@compareintel.com
        </a>
      </p>
      <p style={{ margin: '8px 0', fontSize: '12px', color: '#9ca3af' }}>
        © 2025 CompareIntel. All rights reserved.
      </p>
    </footer>
  )
}
