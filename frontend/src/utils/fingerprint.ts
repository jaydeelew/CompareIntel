/**
 * Browser fingerprinting utilities for CompareIntel frontend.
 *
 * Provides functions for generating unique browser fingerprints
 * for usage tracking and anti-abuse measures.
 */

import { simpleHash } from './hash'

/**
 * Browser fingerprint data structure.
 */
export interface BrowserFingerprintData {
  userAgent: string
  language: string
  platform: string
  screenResolution: string
  timezone: string
  canvas: string
  colorDepth: number
  hardwareConcurrency: number
}

/**
 * Generate a unique browser fingerprint for usage tracking (anti-abuse measure).
 *
 * Creates a fingerprint based on various browser and system characteristics:
 * - User agent string
 * - Language settings
 * - Platform information
 * - Screen resolution
 * - Timezone
 * - Canvas fingerprint (rendering characteristics)
 * - Color depth
 * - Hardware concurrency (CPU cores)
 *
 * The fingerprint is then hashed using SHA-256 to create a consistent,
 * fixed-length identifier that respects user privacy.
 *
 * Note: Timestamp is intentionally excluded to keep the fingerprint
 * consistent across page refreshes.
 *
 * @returns Promise resolving to a hexadecimal hash string (64 characters)
 *
 * @example
 * ```typescript
 * const fingerprint = await generateBrowserFingerprint();
 * console.log(fingerprint); // 'a1b2c3d4e5f6...' (64 char hash)
 * ```
 */
export async function generateBrowserFingerprint(): Promise<string> {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')

  if (ctx) {
    ctx.textBaseline = 'top'
    ctx.font = '14px Arial'
    ctx.fillText('Browser fingerprint', 2, 2)
  }

  const fingerprint: BrowserFingerprintData = {
    userAgent: navigator.userAgent,
    language: navigator.language,
    platform: navigator.platform,
    screenResolution: `${screen.width}x${screen.height}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    canvas: canvas.toDataURL(),
    colorDepth: screen.colorDepth,
    hardwareConcurrency: navigator.hardwareConcurrency,
    // Removed timestamp to keep fingerprint consistent across page refreshes
  }

  const fingerprintString = JSON.stringify(fingerprint)
  // Hash the fingerprint to keep it under 64 characters (SHA-256)
  return await simpleHash(fingerprintString)
}
