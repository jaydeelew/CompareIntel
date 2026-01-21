import { useState, useEffect } from 'react'

import { generateBrowserFingerprint } from '../utils'

export interface UseBrowserFingerprintReturn {
  browserFingerprint: string
  setBrowserFingerprint: React.Dispatch<React.SetStateAction<string>>
}

// Generates a fingerprint on mount for anonymous rate limiting
export function useBrowserFingerprint(): UseBrowserFingerprintReturn {
  const [browserFingerprint, setBrowserFingerprint] = useState('')

  useEffect(() => {
    generateBrowserFingerprint()
      .then(setBrowserFingerprint)
      .catch(err => {
        console.error('Fingerprint generation failed:', err)
        // App still works without it, just no anon rate limiting
      })
  }, [])

  return { browserFingerprint, setBrowserFingerprint }
}
