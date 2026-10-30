/**
 * Page Metadata Configuration
 * Central source of truth for page titles, descriptions, and metadata
 * Used for both client-side SEO and static prerendering.
 *
 * Static marketing pages live in staticPublicPages.json. Model pages are
 * generated at build time into src/data/generated/seoCatalog.json. Sitemap,
 * prerender, and the preview server read the same two files via
 * scripts/loadPublicPages.js — do not hard-code a third copy of this list.
 */

import seoCatalogJson from '../data/generated/seoCatalog.json'

import staticPublicPagesJson from './staticPublicPages.json'

export interface PageMetadata {
  path: string
  title: string
  description: string
  h1: string
  priority: number
  changefreq: 'daily' | 'weekly' | 'monthly' | 'yearly'
}

const staticPublicPages = staticPublicPagesJson as PageMetadata[]
const seoCatalog = seoCatalogJson as {
  index: PageMetadata
  models: Array<{ page: PageMetadata }>
}

/**
 * Public pages that should be prerendered for SEO
 * These pages will have static HTML generated at build time
 */
export const PUBLIC_PAGES: readonly PageMetadata[] = [
  ...staticPublicPages,
  seoCatalog.index,
  ...seoCatalog.models.map(model => model.page),
]

/**
 * Get metadata for a specific path
 */
export function getPageMetadata(pathname: string): PageMetadata | undefined {
  const normalizedPath = pathname === '/' ? '/' : pathname.replace(/\/$/, '')
  return PUBLIC_PAGES.find(page => page.path === normalizedPath)
}

/**
 * Get page title for a path (with fallback)
 */
export function getPageTitle(pathname: string): string {
  const metadata = getPageMetadata(pathname)
  if (metadata) return metadata.title

  // Admin route fallback
  if (pathname.startsWith('/admin')) {
    return 'Admin Panel - CompareIntel'
  }

  return 'CompareIntel'
}

/**
 * Update document metadata based on current route
 */
export function updatePageMetadata(pathname: string): void {
  const metadata = getPageMetadata(pathname)

  if (metadata) {
    document.title = metadata.title

    // Update meta description
    const metaDescription = document.querySelector('meta[name="description"]')
    if (metaDescription) {
      metaDescription.setAttribute('content', metadata.description)
    }

    // Update canonical URL
    const canonical = document.querySelector('link[rel="canonical"]')
    if (canonical) {
      const url =
        metadata.path === '/'
          ? 'https://compareintel.com/'
          : `https://compareintel.com${metadata.path}`
      canonical.setAttribute('href', url)
    }

    // Update Open Graph tags
    const ogTitle = document.querySelector('meta[property="og:title"]')
    if (ogTitle) ogTitle.setAttribute('content', metadata.title)

    const ogDescription = document.querySelector('meta[property="og:description"]')
    if (ogDescription) ogDescription.setAttribute('content', metadata.description)

    const ogUrl = document.querySelector('meta[property="og:url"]')
    if (ogUrl) {
      const url =
        metadata.path === '/'
          ? 'https://compareintel.com/'
          : `https://compareintel.com${metadata.path}`
      ogUrl.setAttribute('href', url)
    }

    // Update Twitter Card tags
    const twitterTitle = document.querySelector('meta[name="twitter:title"]')
    if (twitterTitle) twitterTitle.setAttribute('content', metadata.title)

    const twitterDescription = document.querySelector('meta[name="twitter:description"]')
    if (twitterDescription) twitterDescription.setAttribute('content', metadata.description)

    const twitterUrl = document.querySelector('meta[name="twitter:url"]')
    if (twitterUrl) {
      const url =
        metadata.path === '/'
          ? 'https://compareintel.com/'
          : `https://compareintel.com${metadata.path}`
      twitterUrl.setAttribute('content', url)
    }
  } else {
    // Fallback to base title
    document.title = getPageTitle(pathname)
  }
}
