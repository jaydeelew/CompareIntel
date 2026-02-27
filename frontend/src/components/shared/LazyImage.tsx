import React, { useState, useEffect, useRef } from 'react'
import type { ImgHTMLAttributes } from 'react'

export interface LazyImageProps
  extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'srcSet' | 'loading'> {
  /**
   * Image source URL
   */
  src: string
  /**
   * Alternative text for the image
   */
  alt: string
  /**
   * Optional placeholder image URL to show while loading
   */
  placeholder?: string
  /**
   * Optional blur data URL for progressive loading
   */
  blurDataURL?: string
  /**
   * Whether to use native lazy loading (loading="lazy")
   * Set to false to use Intersection Observer instead
   */
  useNativeLazy?: boolean
  /**
   * Root margin for Intersection Observer (e.g., "50px")
   */
  rootMargin?: string
  /**
   * Threshold for Intersection Observer (0-1)
   */
  threshold?: number
  /**
   * Optional srcSet for responsive images
   */
  srcSet?: string
  /**
   * Optional sizes attribute for responsive images
   */
  sizes?: string
  /**
   * Optional picture sources for modern formats (WebP, AVIF)
   */
  sources?: Array<{
    srcSet: string
    type: string
    media?: string
  }>
  /**
   * Callback when image loads successfully
   */
  onLoad?: () => void
  /**
   * Callback when image fails to load
   */
  onError?: () => void
}

/**
 * LazyImage component with lazy loading, modern format support, and progressive loading
 *
 * Features:
 * - Native lazy loading with Intersection Observer fallback
 * - Support for WebP/AVIF via picture element
 * - Progressive loading with blur placeholder
 * - Responsive images via srcSet
 * - Error handling with fallback
 *
 * @example
 * ```tsx
 * <LazyImage
 *   src="/image.jpg"
 *   alt="Description"
 *   sources={[
 *     { srcSet: "/image.avif", type: "image/avif" },
 *     { srcSet: "/image.webp", type: "image/webp" }
 *   ]}
 *   srcSet="/image-320w.jpg 320w, /image-640w.jpg 640w"
 *   sizes="(max-width: 640px) 100vw, 50vw"
 * />
 * ```
 */
export const LazyImage: React.FC<LazyImageProps> = ({
  src,
  alt,
  placeholder,
  blurDataURL,
  useNativeLazy = true,
  rootMargin = '50px',
  threshold = 0.1,
  srcSet,
  sizes,
  sources,
  onLoad,
  onError,
  className = '',
  style,
  ...rest
}) => {
  const [isLoaded, setIsLoaded] = useState(false)
  const [isInView, setIsInView] = useState(useNativeLazy)
  const [hasError, setHasError] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)
  const pictureRef = useRef<HTMLPictureElement>(null)

  // Intersection Observer for non-native lazy loading
  useEffect(() => {
    if (useNativeLazy || isInView) return

    const targetElement = sources && sources.length > 0 ? pictureRef.current : imgRef.current
    if (!targetElement) return

    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            setIsInView(true)
            observer.disconnect()
          }
        })
      },
      {
        rootMargin,
        threshold,
      }
    )

    observer.observe(targetElement)

    return () => {
      observer.disconnect()
    }
  }, [useNativeLazy, isInView, rootMargin, threshold, sources])

  const handleLoad = () => {
    setIsLoaded(true)
    onLoad?.()
  }

  const handleError = () => {
    setHasError(true)
    onError?.()
  }

  // Combine styles
  const imageStyle: React.CSSProperties = {
    ...style,
    transition: 'opacity 0.3s ease-in-out',
    opacity: isLoaded ? 1 : 0.5,
    ...(blurDataURL &&
      !isLoaded && {
        filter: 'blur(10px)',
      }),
  }

  // Render picture element if sources are provided (for modern formats)
  if (sources && sources.length > 0) {
    return (
      <picture ref={pictureRef} className={className}>
        {sources.map((source, index) => (
          <source
            key={index}
            srcSet={isInView ? source.srcSet : undefined}
            type={source.type}
            media={source.media}
          />
        ))}
        {placeholder && !isLoaded && (
          <img
            src={placeholder}
            alt="Loading placeholder"
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              filter: 'blur(10px)',
              opacity: 0.5,
            }}
          />
        )}
        <img
          src={isInView ? src : undefined}
          srcSet={isInView ? srcSet : undefined}
          sizes={sizes}
          alt={alt}
          loading={useNativeLazy ? 'lazy' : 'eager'}
          onLoad={handleLoad}
          onError={handleError}
          className={className}
          style={imageStyle}
          {...rest}
        />
        {hasError && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '200px',
              backgroundColor: '#f0f0f0',
              color: '#666',
            }}
          >
            Failed to load image
          </div>
        )}
      </picture>
    )
  }

  // Render regular img element
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {placeholder && !isLoaded && (
        <img
          src={placeholder}
          alt="Loading placeholder"
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            filter: 'blur(10px)',
            opacity: 0.5,
            zIndex: 0,
          }}
        />
      )}
      {blurDataURL && !isLoaded && (
        <img
          src={blurDataURL}
          alt="Loading placeholder"
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            filter: 'blur(10px)',
            opacity: 0.5,
            zIndex: 0,
          }}
        />
      )}
      <img
        ref={imgRef}
        src={isInView ? src : undefined}
        srcSet={isInView ? srcSet : undefined}
        sizes={sizes}
        alt={alt}
        loading={useNativeLazy ? 'lazy' : 'eager'}
        onLoad={handleLoad}
        onError={handleError}
        className={className}
        style={{
          ...imageStyle,
          position: 'relative',
          zIndex: 1,
        }}
        {...rest}
      />
      {hasError && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '200px',
            backgroundColor: '#f0f0f0',
            color: '#666',
            position: 'relative',
            zIndex: 1,
          }}
        >
          Failed to load image
        </div>
      )}
    </div>
  )
}

LazyImage.displayName = 'LazyImage'
