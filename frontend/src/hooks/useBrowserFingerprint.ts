/**
 * Custom hook for managing browser fingerprint
 *
 * Generates and caches a browser fingerprint for unregistered user tracking
 * and rate limiting purposes.
 */

import { useState, useEffect } from 'react'

import { generateBrowserFingerprint } from '../utils'

export interface UseBrowserFingerprintReturn {
  browserFingerprint: string
  setBrowserFingerprint: React.Dispatch<React.SetStateAction<string>>
}

export function useBrowserFingerprint(): UseBrowserFingerprintReturn {
  const [browserFingerprint, setBrowserFingerprint] = useState('')

  // Generate browser fingerprint on mount
  useEffect(() => {
    const generateFingerprint = async () => {
      try {
        const fingerprint = await generateBrowserFingerprint()
        setBrowserFingerprint(fingerprint)
      } catch (error) {
        // Handle error gracefully - keep fingerprint empty on error
        // This ensures the app continues to work even if fingerprint generation fails
        console.error('Failed to generate browser fingerprint:', error)
        setBrowserFingerprint('')
      }
    }

    generateFingerprint()
  }, [])

  return {
    browserFingerprint,
    setBrowserFingerprint,
  }
}
