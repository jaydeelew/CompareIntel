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
    <div className="auth-modal-overlay">
      <div className="auth-modal">
        <button className="auth-modal-close" onClick={() => onClose()} aria-label="Close">
          ×
        </button>

        <ResetPasswordForm token={token} onSuccess={handleSuccess} />
      </div>
    </div>
  )
}
