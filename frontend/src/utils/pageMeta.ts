/**
 * Page Meta Tags Utility
 *
 * Manages dynamic meta tags (canonical, description, Open Graph, etc.)
 * for SEO optimization per route. This ensures each page has unique
 * meta tags that help search engines properly index and display pages.
 */

const BASE_URL = 'https://compareintel.com'
const DEFAULT_OG_IMAGE = 'https://compareintel.com/CompareIntel-social.png'

interface PageMeta {
  title: string
  description: string
  canonical: string
  ogTitle?: string
  ogDescription?: string
  ogImage?: string
}

const PAGE_META: Record<string, PageMeta> = {
  '/': {
    title: 'CompareIntel - Compare AI Models Side-by-Side',
    description:
      'Compare AI models side-by-side. Test GPT-5, Claude 4.5, Gemini, Grok 4, Llama 3, and more simultaneously. New models added regularly. Free tier available.',
    canonical: `${BASE_URL}/`,
    ogTitle: 'CompareIntel - Compare 65+ AI Models Side-by-Side',
    ogDescription:
      'Compare GPT-5.1, Claude Opus 4.5, Gemini 3 Pro, Llama 4, and 65+ AI models side-by-side. Test prompts simultaneously and find the best AI for your needs. Free tier available.',
    ogImage: DEFAULT_OG_IMAGE,
  },
  '/about': {
    title: 'About - CompareIntel',
    description:
      'Learn about CompareIntel, the platform for comparing AI models side-by-side. Discover our mission and how we help you find the best AI for your needs.',
    canonical: `${BASE_URL}/about`,
    ogTitle: 'About - CompareIntel',
    ogDescription:
      'Learn about CompareIntel, the platform for comparing AI models side-by-side. Discover our mission and how we help you find the best AI for your needs.',
    ogImage: DEFAULT_OG_IMAGE,
  },
  '/features': {
    title: 'Features - CompareIntel',
    description:
      'Explore CompareIntel features: compare 65+ AI models, real-time streaming, LaTeX rendering, syntax highlighting, conversation history, and more.',
    canonical: `${BASE_URL}/features`,
    ogTitle: 'Features - CompareIntel',
    ogDescription:
      'Explore CompareIntel features: compare 65+ AI models, real-time streaming, LaTeX rendering, syntax highlighting, conversation history, and more.',
    ogImage: DEFAULT_OG_IMAGE,
  },
  '/how-it-works': {
    title: 'How It Works - CompareIntel',
    description:
      'Learn how CompareIntel works. Compare AI models side-by-side, test prompts simultaneously, and analyze responses with advanced formatting support.',
    canonical: `${BASE_URL}/how-it-works`,
    ogTitle: 'How It Works - CompareIntel',
    ogDescription:
      'Learn how CompareIntel works. Compare AI models side-by-side, test prompts simultaneously, and analyze responses with advanced formatting support.',
    ogImage: DEFAULT_OG_IMAGE,
  },
  '/faq': {
    title: 'FAQ - CompareIntel',
    description:
      'Frequently asked questions about CompareIntel. Learn about AI model comparison, pricing, features, and how to get started.',
    canonical: `${BASE_URL}/faq`,
    ogTitle: 'FAQ - CompareIntel',
    ogDescription:
      'Frequently asked questions about CompareIntel. Learn about AI model comparison, pricing, features, and how to get started.',
    ogImage: DEFAULT_OG_IMAGE,
  },
  '/privacy-policy': {
    title: 'Privacy Policy - CompareIntel',
    description:
      "Read CompareIntel's privacy policy. Learn how we protect your data and respect your privacy.",
    canonical: `${BASE_URL}/privacy-policy`,
    ogTitle: 'Privacy Policy - CompareIntel',
    ogDescription:
      "Read CompareIntel's privacy policy. Learn how we protect your data and respect your privacy.",
    ogImage: DEFAULT_OG_IMAGE,
  },
  '/terms-of-service': {
    title: 'Terms of Service - CompareIntel',
    description:
      "Read CompareIntel's terms of service. Understand the rules and guidelines for using our platform.",
    canonical: `${BASE_URL}/terms-of-service`,
    ogTitle: 'Terms of Service - CompareIntel',
    ogDescription:
      "Read CompareIntel's terms of service. Understand the rules and guidelines for using our platform.",
    ogImage: DEFAULT_OG_IMAGE,
  },
  '/admin': {
    title: 'Admin Panel - CompareIntel',
    description: 'CompareIntel admin panel',
    canonical: `${BASE_URL}/admin`,
  },
}

/**
 * Get meta information for a given route
 * @param pathname - The current route pathname
 * @returns PageMeta object with all meta information
 */
export function getPageMeta(pathname: string): PageMeta {
  // Normalize pathname (remove trailing slash, handle exact matches)
  const normalizedPath = pathname === '/' ? '/' : pathname.replace(/\/$/, '')

  // Check for exact match first
  if (PAGE_META[normalizedPath]) {
    return PAGE_META[normalizedPath]
  }

  // Check if it's an admin route (could be /admin/*)
  if (normalizedPath.startsWith('/admin')) {
    return PAGE_META['/admin']
  }

  // Default fallback
  return {
    title: 'CompareIntel',
    description:
      'Compare AI models side-by-side. Test GPT-5, Claude 4.5, Gemini, Grok 4, Llama 3, and more simultaneously.',
    canonical: `${BASE_URL}${normalizedPath}`,
    ogTitle: 'CompareIntel',
    ogDescription:
      'Compare AI models side-by-side. Test GPT-5, Claude 4.5, Gemini, Grok 4, Llama 3, and more simultaneously.',
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
