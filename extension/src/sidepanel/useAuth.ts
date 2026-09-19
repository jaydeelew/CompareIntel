import { useCallback, useEffect, useState } from 'react'
import browser from 'webextension-polyfill'

import type { User } from '@compareintel/core'

import { AUTH_TOKEN_KEYS } from '../shared/authStorage'
import { fetchCurrentUserFromApi } from './api'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshUser = useCallback(async () => {
    const nextUser = await fetchCurrentUserFromApi()
    setUser(nextUser)
    return nextUser
  }, [])

  useEffect(() => {
    refreshUser().finally(() => setLoading(false))
  }, [refreshUser])

  useEffect(() => {
    const onChanged = (
      changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
      areaName: string
    ) => {
      if (areaName !== 'local') return
      const tokenChanged = AUTH_TOKEN_KEYS.some((key) => key in changes)
      if (!tokenChanged) return
      void refreshUser()
    }

    browser.storage.onChanged.addListener(onChanged)
    return () => browser.storage.onChanged.removeListener(onChanged)
  }, [refreshUser])

  return { user, loading, setUser, refreshUser }
}
