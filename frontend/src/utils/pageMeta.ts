/**
 * Page Meta Tags Utility
 *
 * Manages dynamic meta tags (canonical, description, Open Graph, etc.)
 * for SEO optimization per route. This ensures each page has unique
 * meta tags that help search engines properly index and display pages.
 *
 * Now uses the centralized pageMetadata config.
 */

import { isPreviewDeploy } from '../config/deployEnv'
import { getPageMetadata } from '../config/pageMetadata'
import type { PublicShareSnapshot } from '../services/shareService'

const BASE_URL = 'https://compareintel.com'
const DEFAULT_OG_IMAGE = 'https://compareintel.com/brand/CompareIntel-social.png'

interface PageMeta {
  title: string
  description: string
  canonical: string
  ogTitle?: string
  ogDescription?: string
  ogImage?: string
}

/**
 * Get meta information for a given route
 * @param pathname - The current route pathname
 * @returns PageMeta object with all meta information
 */
export function getPageMeta(pathname: string): PageMeta {
  // Try to get from the page metadata config
  const metadata = getPageMetadata(pathname)

  if (metadata) {
    return {
      title: metadata.title,
      description: metadata.description,
      canonical: metadata.path === '/' ? `${BASE_URL}/` : `${BASE_URL}${metadata.path}`,
      ogTitle: metadata.title,
      ogDescription: metadata.description,
      ogImage: DEFAULT_OG_IMAGE,
    }
  }

  // Check if it's an admin route
  const normalizedPath = pathname === '/' ? '/' : pathname.replace(/\/$/, '')
  if (normalizedPath.startsWith('/c/')) {
    return {
      title: 'Shared comparison - CompareIntel',
      description: 'A shared AI model comparison on CompareIntel.',
      canonical: `${BASE_URL}${normalizedPath}`,
      ogTitle: 'Shared comparison - CompareIntel',
      ogDescription: 'A shared AI model comparison on CompareIntel.',
      ogImage: DEFAULT_OG_IMAGE,
    }
  }
  if (normalizedPath.startsWith('/admin')) {
    return {
      title: 'Admin Panel - CompareIntel',
      description: 'CompareIntel admin dashboard for site management.',
      canonical: `${BASE_URL}/admin`,
      ogImage: DEFAULT_OG_IMAGE,
    }
  }

  // Default fallback
  return {
    title: 'CompareIntel - Compare AI & Image Models Side-by-Side | Free',
    description:
      'Compare AI language and image models side-by-side from OpenAI, Anthropic, Google, Meta, xAI, and more. Image generation comparison included.',
    canonical: `${BASE_URL}${normalizedPath}`,
    ogTitle: 'CompareIntel - AI & Image Model Comparison Side-by-Side | Free',
    ogDescription:
      'Compare AI language and image models side-by-side. Test GPT-5.4, Claude 4.6, Gemini 3, FLUX from OpenAI, Anthropic, Google, Meta, xAI. Free tier.',
    ogImage: DEFAULT_OG_IMAGE,
  }
}

/**
 * Update or create a meta tag
 * @param selector - CSS selector for the meta tag
 * @param attribute - Attribute name (e.g., 'name' or 'property')
 * @param attributeValue - Value for the attribute
 * @param content - Content value for the meta tag
 */
function updateMetaTag(
  selector: string,
  attribute: 'name' | 'property',
  attributeValue: string,
  content: string
): void {
  let tag = document.querySelector(
    `${selector}[${attribute}="${attributeValue}"]`
  ) as HTMLMetaElement
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute(attribute, attributeValue)
    document.head.appendChild(tag)
  }
  tag.setAttribute('content', content)
}

/**
 * Update or create a link tag
 * @param rel - The rel attribute value
 * @param href - The href attribute value
 */
function updateLinkTag(rel: string, href: string): void {
  let link = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement
  if (!link) {
    link = document.createElement('link')
    link.setAttribute('rel', rel)
    document.head.appendChild(link)
  }
  link.setAttribute('href', href)
}

/**
 * Update all meta tags for the current page
 * This includes:
 * - Document title
 * - Canonical URL
 * - Meta description
 * - Open Graph tags (og:url, og:title, og:description, og:image)
 * - Twitter Card tags (twitter:url, twitter:title, twitter:description, twitter:image)
 *
 * @param pathname - The current route pathname
 */
export function updatePageMeta(pathname: string): void {
  const meta = getPageMeta(pathname)

  // Update title
  document.title = meta.title

  // Update canonical link
  updateLinkTag('canonical', meta.canonical)

  // Update meta description
  updateMetaTag('meta', 'name', 'description', meta.description)

  // Preview deploys must stay noindex even after client-side route updates.
  // Shared comparison permalinks are noindex by default (opt-in share, not a landing page).
  if (isPreviewDeploy() || pathname.startsWith('/c/')) {
    updateMetaTag('meta', 'name', 'robots', 'noindex, nofollow')
    updateMetaTag('meta', 'name', 'googlebot', 'noindex, nofollow')
  }

  // Update Open Graph tags
  updateMetaTag('meta', 'property', 'og:url', meta.canonical)
  updateMetaTag('meta', 'property', 'og:title', meta.ogTitle || meta.title)
  updateMetaTag('meta', 'property', 'og:description', meta.ogDescription || meta.description)
  if (meta.ogImage) {
    updateMetaTag('meta', 'property', 'og:image', meta.ogImage)
  }

  // Update Twitter Card tags
  updateMetaTag('meta', 'name', 'twitter:url', meta.canonical)
  updateMetaTag('meta', 'name', 'twitter:title', meta.ogTitle || meta.title)
  updateMetaTag('meta', 'name', 'twitter:description', meta.ogDescription || meta.description)
  if (meta.ogImage) {
    updateMetaTag('meta', 'name', 'twitter:image', meta.ogImage)
  }
}

function snippet(text: string, limit: number): string {
  const collapsed = text.split(/\s+/).join(' ')
  if (collapsed.length <= limit) return collapsed
  return `${collapsed.slice(0, Math.max(0, limit - 1))}…`
}

/**
 * Apply title/description/OG tags for a loaded (or missing) shared comparison.
 * Share pages stay noindex by default.
 */
export function applySharePageMeta(snapshot: PublicShareSnapshot | null, pathname: string): void {
  const canonicalPath = pathname.startsWith('/') ? pathname : `/${pathname}`
  const canonical = `${BASE_URL}${canonicalPath}`
  const names = snapshot?.models.map(model => model.name).join(', ') || 'AI models'
  const title = snapshot
    ? `CompareIntel comparison: ${snippet(snapshot.prompt, 80)}`
    : 'Shared comparison not found - CompareIntel'
  const description = snapshot
    ? `Side-by-side comparison of ${names}. Prompt: ${snippet(snapshot.prompt, 140)}`
    : 'This shared comparison is invalid or is no longer public.'

  document.title = title
  updateLinkTag('canonical', canonical)
  updateMetaTag('meta', 'name', 'description', description)
  updateMetaTag('meta', 'name', 'robots', 'noindex, nofollow')
  updateMetaTag('meta', 'name', 'googlebot', 'noindex, nofollow')
  updateMetaTag('meta', 'property', 'og:url', canonical)
  updateMetaTag('meta', 'property', 'og:title', title)
  updateMetaTag('meta', 'property', 'og:description', description)
  updateMetaTag('meta', 'property', 'og:image', DEFAULT_OG_IMAGE)
  updateMetaTag('meta', 'name', 'twitter:card', 'summary_large_image')
  updateMetaTag('meta', 'name', 'twitter:url', canonical)
  updateMetaTag('meta', 'name', 'twitter:title', title)
  updateMetaTag('meta', 'name', 'twitter:description', description)
  updateMetaTag('meta', 'name', 'twitter:image', DEFAULT_OG_IMAGE)
}
