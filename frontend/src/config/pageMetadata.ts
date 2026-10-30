/**
 * Page Metadata Configuration
 * Central source of truth for page titles, descriptions, and metadata
 * Used for both client-side SEO and static prerendering
 */

export interface PageMetadata {
  path: string
  title: string
  description: string
  h1: string
  priority: number
  changefreq: 'daily' | 'weekly' | 'monthly' | 'yearly'
}

/**
 * Public pages that should be prerendered for SEO
 * These pages will have static HTML generated at build time
 */
export const PUBLIC_PAGES: readonly PageMetadata[] = [
  {
    path: '/',
    title: 'CompareIntel - Compare AI & Image Models Side-by-Side | Free',
    description:
      'Compare AI language and image models side-by-side. Test GPT-5, Claude, Gemini, and GPT-5 Image from OpenAI, Anthropic, Google, Meta, xAI. Image generation comparison included. Free tier.',
    h1: 'Compare AI Language and Image Models Side by Side',
    priority: 1.0,
    changefreq: 'weekly',
  },
  {
    path: '/about',
    title: 'About - CompareIntel',
    description:
      'Learn about CompareIntel, the AI model comparison platform that helps you test and compare language and image models from OpenAI, Anthropic, Google, Meta, and more.',
    h1: 'About CompareIntel',
    priority: 0.8,
    changefreq: 'monthly',
  },
  {
    path: '/features',
    title: 'Features - CompareIntel',
    description:
      'Discover CompareIntel features: side-by-side AI comparison, latest models from OpenAI, Anthropic, Google, Meta, xAI, LaTeX rendering, syntax highlighting, and more.',
    h1: 'CompareIntel Features',
    priority: 0.8,
    changefreq: 'monthly',
  },
  {
    path: '/how-it-works',
    title: 'How It Works - CompareIntel',
    description:
      'Learn how CompareIntel works: compare AI models side-by-side, test prompts across multiple models, view streaming responses, and find the best AI for your needs.',
    h1: 'How It Works',
    priority: 0.8,
    changefreq: 'monthly',
  },
  {
    path: '/faq',
    title: 'FAQ - CompareIntel',
    description:
      'Frequently asked questions about CompareIntel: supported AI models, pricing, credits, image generation, data privacy, and how to get started.',
    h1: 'Frequently Asked Questions',
    priority: 0.7,
    changefreq: 'monthly',
  },
  {
    path: '/image-generation',
    title: 'Image Generation - CompareIntel',
    description:
      'Compare AI image generation models side-by-side: Gemini image models and GPT-5 Image. Test prompts and find the best image AI for your creative projects.',
    h1: 'AI Image Generation Comparison',
    priority: 0.8,
    changefreq: 'monthly',
  },
  {
    path: '/help-me-choose-methodology',
    title: 'Help Me Choose Methodology - CompareIntel',
    description:
      'Learn about the CompareIntel methodology for choosing the right AI model: evaluation criteria, comparison framework, and best practices for testing AI models.',
    h1: 'Help Me Choose Methodology',
    priority: 0.7,
    changefreq: 'monthly',
  },
  {
    path: '/privacy-policy',
    title: 'Privacy Policy - CompareIntel',
    description:
      'CompareIntel Privacy Policy: how we collect, use, and protect your data. Learn about our commitment to user privacy and data security.',
    h1: 'Privacy Policy',
    priority: 0.5,
    changefreq: 'yearly',
  },
  {
    path: '/terms-of-service',
    title: 'Terms of Service - CompareIntel',
    description:
      'CompareIntel Terms of Service: user agreement, acceptable use policy, intellectual property rights, and terms governing use of our AI comparison platform.',
    h1: 'Terms of Service',
    priority: 0.5,
    changefreq: 'yearly',
  },
] as const

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
