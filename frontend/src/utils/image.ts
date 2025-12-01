/**
 * Image optimization utilities
 *
 * Provides helper functions for optimizing images, generating modern formats,
 * and creating responsive image configurations.
 */

/**
 * Check if an image URL is external (not from our domain)
 */
export const isExternalImage = (url: string): boolean => {
  try {
    const parsed = new URL(url, window.location.href)
    return parsed.origin !== window.location.origin
  } catch {
    // If URL parsing fails, assume it's relative (internal)
    return false
  }
}

/**
 * Check if browser supports modern image formats
 */
export const supportsWebP = (): boolean => {
  if (typeof document === 'undefined') return false
  const canvas = document.createElement('canvas')
  return canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0
}

export const supportsAVIF = (): boolean => {
  if (typeof document === 'undefined') return false
  const canvas = document.createElement('canvas')
  return canvas.toDataURL('image/avif').indexOf('data:image/avif') === 0
}

/**
 * Generate optimized image URL with query parameters for vite-imagetools
 *
 * @param src - Original image source URL
 * @param options - Optimization options
 * @returns Optimized image URL with query parameters
 *
 * @example
 * ```ts
 * optimizeImageUrl('/image.jpg', { width: 800, quality: 80 })
 * // Returns: '/image.jpg?w=800&q=80'
 * ```
 */
export interface ImageOptimizationOptions {
  /** Target width in pixels */
  width?: number
  /** Target height in pixels */
  height?: number
  /** Quality (1-100) */
  quality?: number
  /** Format: 'webp', 'avif', or 'original' */
  format?: 'webp' | 'avif' | 'original'
  /** Generate responsive srcset */
  responsive?: boolean
}

export const optimizeImageUrl = (src: string, options: ImageOptimizationOptions = {}): string => {
  // Don't optimize external images
  if (isExternalImage(src)) {
    return src
  }

  const { width, height, quality = 80, format, responsive } = options
  const url = new URL(src, window.location.href)
  const params = url.searchParams

  // Add optimization parameters
  if (width) params.set('w', width.toString())
  if (height) params.set('h', height.toString())
  if (quality !== 80) params.set('q', quality.toString())

  if (format && format !== 'original') {
    params.set('format', format)
  }

  if (responsive) {
    params.set('responsive', 'true')
  }

  return url.toString()
}

/**
 * Generate responsive srcset for an image
 *
 * @param src - Original image source URL
 * @param widths - Array of widths to generate
 * @returns srcset string
 *
 * @example
 * ```ts
 * generateSrcSet('/image.jpg', [320, 640, 1024, 1920])
 * // Returns: '/image.jpg?w=320 320w, /image.jpg?w=640 640w, ...'
 * ```
 */
export const generateSrcSet = (src: string, widths: number[] = [320, 640, 1024, 1920]): string => {
  if (isExternalImage(src)) {
    return ''
  }

  return widths.map(width => `${optimizeImageUrl(src, { width })} ${width}w`).join(', ')
}

/**
 * Generate sizes attribute for responsive images
 *
 * @param breakpoints - Breakpoints with corresponding sizes
 * @returns sizes string
 *
 * @example
 * ```ts
 * generateSizes({ 640: '100vw', 1024: '50vw' })
 * // Returns: '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw'
 * ```
 */
export const generateSizes = (breakpoints: Record<number, string>): string => {
  const sorted = Object.keys(breakpoints)
    .map(Number)
    .sort((a, b) => a - b)

  const parts = sorted.map((bp, index) => {
    const size = breakpoints[bp]
    if (index === 0) {
      return `(max-width: ${bp}px) ${size}`
    }
    return `(max-width: ${bp}px) ${size}`
  })

  // Default size (largest breakpoint)
  const defaultSize = breakpoints[sorted[sorted.length - 1]] || '100vw'
  parts.push(defaultSize)

  return parts.join(', ')
}

/**
 * Create optimized image attributes for HTML img tag
 *
 * @param src - Image source URL
 * @param options - Optimization options
 * @returns Object with optimized attributes
 */
export const createOptimizedImageAttrs = (
  src: string,
  options: ImageOptimizationOptions & {
    alt?: string
    title?: string
    className?: string
    loading?: 'lazy' | 'eager'
  } = {}
): Record<string, string> => {
  const {
    alt = '',
    title,
    className,
    loading = 'lazy',
    responsive = true,
    ...optimizationOptions
  } = options

  const attrs: Record<string, string> = {
    src: optimizeImageUrl(src, optimizationOptions),
    alt,
    loading,
  }

  if (title) attrs.title = title
  if (className) attrs.class = className

  // Add responsive attributes
  if (responsive && !isExternalImage(src)) {
    const widths = optimizationOptions.width ? [optimizationOptions.width] : [320, 640, 1024, 1920]

    attrs.srcset = generateSrcSet(src, widths)
    attrs.sizes = generateSizes({
      640: '100vw',
      1024: '50vw',
      1920: '33vw',
    })
  }

  // Add style for smooth loading
  attrs.style = 'max-width: 100%; height: auto; transition: opacity 0.3s ease-in-out;'

  return attrs
}

/**
 * Convert image attributes object to HTML string
 */
export const imageAttrsToHtml = (attrs: Record<string, string>): string => {
  return Object.entries(attrs)
    .map(([key, value]) => `${key}="${value.replace(/"/g, '&quot;')}"`)
    .join(' ')
}
