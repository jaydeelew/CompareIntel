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
      <p style={{ margin: '8px 0', fontSize: '12px', color: '#4b5563' }}>
        © 2025 CompareIntel. All rights reserved.
      </p>
    </footer>
  )
}
