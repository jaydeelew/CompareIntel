/**
 * MSW URL patterns for the default API client base `/api` (any origin in tests).
 */
export function apiPathGlob(suffix: string): string {
  const s = suffix.startsWith('/') ? suffix : `/${suffix}`
  return `*${s}`
}
