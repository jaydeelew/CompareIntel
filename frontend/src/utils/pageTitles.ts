/**
 * Page Title Utility
 * 
 * Maps routes to their corresponding page titles for SEO.
 * Follows best practices: 50-60 characters, descriptive, includes brand.
 */

const BASE_TITLE = 'CompareIntel'

/**
 * Route to title mapping
 * Format: "Page Name - CompareIntel" (keeps titles under 60 chars)
 */
const ROUTE_TITLES: Record<string, string> = {
  '/': BASE_TITLE,
  '/about': 'About - CompareIntel',
  '/features': 'Features - CompareIntel',
  '/how-it-works': 'How It Works - CompareIntel',
  '/faq': 'FAQ - CompareIntel',
  '/privacy-policy': 'Privacy Policy - CompareIntel',
  '/terms-of-service': 'Terms of Service - CompareIntel',
  '/admin': 'Admin Panel - CompareIntel',
}

/**
 * Get the page title for a given route pathname
 * @param pathname - The current route pathname
 * @returns The page title string
 */
export function getPageTitle(pathname: string): string {
  // Normalize pathname (remove trailing slash, handle exact matches)
  const normalizedPath = pathname === '/' ? '/' : pathname.replace(/\/$/, '')
  
  // Check for exact match first
  if (ROUTE_TITLES[normalizedPath]) {
    return ROUTE_TITLES[normalizedPath]
  }
  
  // Check if it's an admin route (could be /admin/*)
  if (normalizedPath.startsWith('/admin')) {
    return ROUTE_TITLES['/admin']
  }
  
  // Default fallback
  return BASE_TITLE
}

/**
 * Update the document title based on the current route
 * @param pathname - The current route pathname
 */
export function updatePageTitle(pathname: string): void {
  const title = getPageTitle(pathname)
  document.title = title
}
