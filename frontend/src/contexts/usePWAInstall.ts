import { useContext } from 'react'

import { PWAInstallContext, type PWAInstallContextValue } from './pwaInstallContext'

export function usePWAInstall(): PWAInstallContextValue {
  const context = useContext(PWAInstallContext)
  if (context === undefined) {
    throw new Error('usePWAInstall must be used within PWAInstallProvider')
  }
  return context
}
