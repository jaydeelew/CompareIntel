/**
 * Hashing utilities for CompareIntel frontend.
 *
 * Provides functions for creating secure hashes from strings,
 * primarily used for browser fingerprinting and data integrity.
 */

/**
 * Simple hash function to convert a string to a fixed-length SHA-256 hash.
 *
 * Uses the Web Crypto API to generate a SHA-256 hash of the input string.
 * Returns a hexadecimal string representation of the hash.
 *
 * @param str - The string to hash
 * @returns Promise resolving to a hexadecimal hash string (64 characters)
 *
 * @example
 * ```typescript
 * const hash = await simpleHash('hello world');
 * console.log(hash); // 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9'
 * ```
 */
export async function simpleHash(str: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(str)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}
