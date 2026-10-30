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
      'Compare AI language and image models side-by-side. Test GPT-5.4, Claude 4.6, Gemini 3, and GPT-5 Image from OpenAI, Anthropic, Google, Meta, xAI. Free tier.',
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
  if (isPreviewDeploy()) {
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
