/**
 * Reset Password Page Component
 * Handles password reset from email link
 */

import React, { useEffect, useState } from 'react'

import { ResetPasswordForm } from './ResetPasswordForm'
import './AuthForms.css'

interface ResetPasswordProps {
  onClose: (email?: string) => void
}

export const ResetPassword: React.FC<ResetPasswordProps> = ({ onClose }) => {
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    // Get token from URL
    const urlParams = new URLSearchParams(window.location.search)
    const tokenParam = urlParams.get('token')
    setToken(tokenParam)
  }, [])

  const handleSuccess = (email?: string) => {
    // Clear the token from URL
    const url = new URL(window.location.href)
    url.searchParams.delete('token')
    window.history.pushState({}, '', url)

    // Close and redirect to login, passing the email
    setTimeout(() => {
      onClose(email)
    }, 2000)
  }

  // Don't render if no token
  if (!token) {
    return null
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '1rem',
      }}
    >
      <div
        style={{
          position: 'relative',
          maxWidth: '500px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'white',
          borderRadius: '12px',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        }}
      >
        <button
          onClick={() => onClose()}
          style={{
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            background: 'white',
            border: 'none',
            fontSize: '1.5rem',
            color: '#666',
            cursor: 'pointer',
            padding: '0.5rem',
            lineHeight: 1,
            zIndex: 10,
            borderRadius: '6px',
            width: '32px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease',
          }}
          onMouseOver={e => {
            e.currentTarget.style.color = '#333'
            e.currentTarget.style.background = '#f5f5f5'
          }}
          onMouseOut={e => {
            e.currentTarget.style.color = '#666'
            e.currentTarget.style.background = 'white'
          }}
          aria-label="Close"
        >
          ×
        </button>

        <ResetPasswordForm token={token} onSuccess={handleSuccess} />
      </div>
    </div>
  )
}
