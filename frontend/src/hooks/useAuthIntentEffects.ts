import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import {
  parseAuthModalParam,
  peekPendingAuthIntent,
  stripAuthModalParam,
} from '../utils/authIntent'

interface UseAuthIntentEffectsOptions {
  isAuthenticated: boolean
  authLoading: boolean
  openLogin: () => void
  openRegister: () => void
}

/**
 * Opens the existing auth modal for `?showAuthModal=signup|login` (removing the param without
 * adding a history entry) and, once the user is authenticated, sends them back to the page that
 * started the flow (e.g. /pricing after clicking Subscribe).
 */
export function useAuthIntentEffects({
  isAuthenticated,
  authLoading,
  openLogin,
  openRegister,
}: UseAuthIntentEffectsOptions) {
  const location = useLocation()
  const navigate = useNavigate()
  const openLoginRef = useRef(openLogin)
  const openRegisterRef = useRef(openRegister)
  openLoginRef.current = openLogin
  openRegisterRef.current = openRegister

  const { pathname, search, hash } = location

  useEffect(() => {
    if (authLoading) return
    const mode = parseAuthModalParam(search)
    if (!mode) return

    navigate({ pathname, search: stripAuthModalParam(search), hash }, { replace: true })

    if (isAuthenticated) return
    if (mode === 'signup') {
      openRegisterRef.current()
    } else {
      openLoginRef.current()
    }
  }, [authLoading, isAuthenticated, pathname, search, hash, navigate])

  useEffect(() => {
    if (authLoading || !isAuthenticated) return
    const intent = peekPendingAuthIntent()
    if (!intent) return
    navigate(intent.returnTo, { replace: true })
  }, [authLoading, isAuthenticated, navigate])
}
