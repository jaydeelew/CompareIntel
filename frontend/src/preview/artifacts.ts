/**
 * Preview-only HTML and Cloudflare Pages artifact helpers.
 * Used by the Vite plugin at build time and by unit tests.
 */

export const PREVIEW_ROBOTS_CONTENT = `User-agent: *
Disallow: /

# Preview deployments must not be indexed.
`

export const PREVIEW_ROBOTS_META = 'noindex, nofollow'
export const PREVIEW_X_ROBOTS_TAG = 'noindex, nofollow'

const ROBOTS_META_RE = /<meta\s+name=["']robots["']\s+content=["'][^"']*["']\s*\/?>/i
const ROBOTS_META_CONTENT_RE = /(<meta\s+name=["']robots["']\s+content=["'])[^"']*(["'])/i

/**
 * Force noindex on the document HTML (index.html and prerendered pages).
 */
export function applyPreviewNoIndex(html: string): string {
  let next = html
  if (ROBOTS_META_RE.test(next)) {
    next = next.replace(ROBOTS_META_CONTENT_RE, `$1${PREVIEW_ROBOTS_META}$2`)
  } else {
    next = next.replace(
      /<\/head>/i,
      `  <meta name="robots" content="${PREVIEW_ROBOTS_META}" />\n  </head>`
    )
  }

  if (!/name=["']googlebot["']/i.test(next)) {
    next = next.replace(
      /<meta name="robots" content="noindex, nofollow"[^>]*>/i,
      `$&\n  <meta name="googlebot" content="${PREVIEW_ROBOTS_META}" />`
    )
  }

  return next
}

export function htmlHasNoIndex(html: string): boolean {
  return (
    /<meta\s+name=["']robots["']\s+content=["'][^"']*noindex[^"']*["']/i.test(html) &&
    !/<meta\s+name=["']robots["']\s+content=["']\s*index\s*,/i.test(html)
  )
}

export function headersHaveNoIndex(headersFile: string): boolean {
  return /X-Robots-Tag\s*:\s*noindex/i.test(headersFile) && /X-Robots-Tag/i.test(headersFile)
}

const ANALYTICS_LEAK_PATTERNS: RegExp[] = [
  /google-analytics\.com/i,
  /googletagmanager\.com/i,
  /www\.google-analytics\.com/i,
  /gtag\/js/i,
  /static\.cloudflareinsights\.com\/beacon\.min\.js/i,
  /data-cf-beacon/i,
  /423fd187f89f44bdadec92bc373b1829/,
  /https?:\/\/api\.stripe\.com/i,
  /ingest\.(us\.)?sentry\.io\/[0-9]+/i,
  /sentry\.io\/api\//i,
  /https:\/\/compareintel\.com\/api/i,
  /https:\/\/www\.compareintel\.com\/api/i,
  /https:\/\/api\.compareintel\.com/i,
]

/**
 * True when built assets look like they still contain an analytics beacon,
 * Stripe live API, Sentry DSN, or production API base.
 */
export function distTextHasAnalyticsOrProdSecrets(text: string): boolean {
  return ANALYTICS_LEAK_PATTERNS.some(pattern => pattern.test(text))
}
