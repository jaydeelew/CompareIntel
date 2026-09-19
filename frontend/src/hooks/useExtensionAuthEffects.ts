import { useEffect, useState } from 'react'

import { CI_PAGE_MESSAGE, isCiPageMessage } from '@compareintel/core'

import { useAuth } from '../contexts/AuthContext'
import {
  clearExtensionLoginParam,
  clearExtensionSourceParam,
  isExtensionSourceLogin,
  shouldOpenExtensionLogin,
} from '../utils/extensionBridge'

const API_BASE_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || '/api'

interface UseExtensionAuthEffectsOptions {
  openLogin: () => void
}

export function useExtensionAuthEffects({ openLogin }: UseExtensionAuthEffectsOptions) {
  const { isAuthenticated, logout } = useAuth()
  const [showExtensionSignedInBanner, setShowExtensionSignedInBanner] = useState(false)

  useEffect(() => {
    if (!shouldOpenExtensionLogin()) return
    clearExtensionLoginParam()
    openLogin()
  }, [openLogin])

  useEffect(() => {
    if (!isExtensionSourceLogin() || !isAuthenticated) return
    setShowExtensionSignedInBanner(true)
    clearExtensionSourceParam()
  }, [isAuthenticated])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window) return
      if (!isCiPageMessage(event.data)) return
      if (event.data.type !== CI_PAGE_MESSAGE.EXTENSION_LOGOUT) return

      void fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      }).finally(() => {
        void logout()
      })
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [logout])

  return {
    showExtensionSignedInBanner,
    dismissExtensionSignedInBanner: () => setShowExtensionSignedInBanner(false),
  }
}
