import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { useTheme } from '../../contexts/ThemeContext'

interface CapabilityTileProps {
  id: string
  icon: ReactNode
  title: string
  backTitle: string
  description: string
  tooltipText: string
  backImage: string
  backText: string
  isVisible: boolean
  isFlipped: boolean
  onTileClick: (id: string) => void
  onImageEnlarge?: (src: string) => void
}

function CapabilityTile({
  id,
  icon,
  title,
  backTitle,
  description,
  tooltipText,
  backImage,
  backText,
  isVisible,
  isFlipped,
  onTileClick,
  onImageEnlarge,
}: CapabilityTileProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onTileClick(id)
  }

  const handleEnlargeClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onImageEnlarge?.(backImage)
  }

  return (
    <div className="capability-tile-wrapper">
      <div className={`capability-tile ${isFlipped ? 'flipped' : ''}`} onClick={handleClick}>
        <div className="capability-tile-front">
          <div className="capability-icon">{icon}</div>
          <h3 className="capability-title">{title}</h3>
          <p className="capability-description">{description}</p>
          <div className={`capability-tooltip ${isVisible ? 'visible' : ''}`}>{tooltipText}</div>
        </div>
        <div className="capability-tile-back" data-tile={id}>
          <div className="capability-tile-back-label-row">
            <p className="capability-tile-back-label">{backTitle}</p>
            {isFlipped && onImageEnlarge && (
              <button
                type="button"
                className="capability-tile-enlarge-btn"
                onClick={handleEnlargeClick}
                title="Enlarge screenshot"
                aria-label={`Enlarge ${title} example image`}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="16.65" y1="16.65" x2="21" y2="21" />
                </svg>
              </button>
            )}
          </div>
          <div className="capability-tile-back-image-wrap">
            <img src={backImage} alt={`${title} example`} className="capability-tile-back-image" />
          </div>
          <p className="capability-tile-back-text">{backText}</p>
        </div>
      </div>
    </div>
  )
}

interface HeroProps {
  visibleTooltip: string | null
  onCapabilityTileTap: (tileId: string) => void
  children?: ReactNode
}

/**
 * Hero - Main hero section with title, capabilities, and comparison form
 */
export function Hero({ visibleTooltip, onCapabilityTileTap, children }: HeroProps) {
  const [showFlash, setShowFlash] = useState(false)
  const [flippedTile, setFlippedTile] = useState<string | null>(null)
  const [enlargedImageSrc, setEnlargedImageSrc] = useState<string | null>(null)
  const { theme, toggleTheme } = useTheme()

  const dismissFlip = useCallback(() => {
    setFlippedTile(null)
  }, [])

  const closeEnlargedImage = useCallback(() => {
    setEnlargedImageSrc(null)
  }, [])

  /** Close enlarged screenshot and unflip the tile so the rotation animation plays consistently */
  const closeEnlargedAndUnflip = useCallback(() => {
    closeEnlargedImage()
    dismissFlip()
  }, [closeEnlargedImage, dismissFlip])

  useEffect(() => {
    if (!flippedTile) return
    const handleClickOutside = () => dismissFlip()
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [flippedTile, dismissFlip])

  useEffect(() => {
    if (!enlargedImageSrc) return
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeEnlargedAndUnflip()
    }
    const handleClickAnywhere = () => closeEnlargedAndUnflip()
    document.addEventListener('keydown', handleEscape)
    document.addEventListener('click', handleClickAnywhere)
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.removeEventListener('click', handleClickAnywhere)
    }
  }, [enlargedImageSrc, closeEnlargedAndUnflip])

  const handleTileClick = useCallback(
    (tileId: string) => {
      if (flippedTile === tileId) {
        setFlippedTile(null)
        return
      }
      setFlippedTile(tileId)
      setShowFlash(true)
      setTimeout(() => setShowFlash(false), 800)
      onCapabilityTileTap(tileId)
    },
    [flippedTile, onCapabilityTileTap]
  )

  return (
    <div className="hero-section">
      {/* Flash logo background */}
      <div className={`hero-logo-flash ${showFlash ? 'active' : ''}`}>
        <img src="/CI_favicon.svg" alt="" className="hero-flash-logo-img" />
      </div>
      <div className="hero-content">
        {/* Mobile-only theme toggle - moved from navbar for better visibility */}
        <div className="hero-theme-toggle-mobile">
          <button
            className="hero-theme-toggle-button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <circle cx="12" cy="12" r="5" />
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
            ) : (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
        </div>

        <h1 className="hero-title">
          <span className="hero-title-first-line">Compare AI Models</span>{' '}
          <span className="hero-title-second-line">Side by Side</span>
        </h1>
        <p className="hero-subtitle">
          <span className="hero-subtitle-first-line">Get responses from multiple AI models</span>
          <span className="hero-subtitle-second-line"> at the same time</span>
        </p>

        <div className={`hero-capabilities${enlargedImageSrc ? ' lightbox-open' : ''}`}>
          <CapabilityTile
            id="natural-language"
            icon={
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
            }
            title="Natural Language"
            backTitle="Natural Language COMPARISON"
            description="Compare conversational responses"
            tooltipText="Natural Language: Compare conversational responses"
            backImage="/images/tile-natural-language.png"
            backText="Ask any question and instantly compare how each model responds — notice the differences in tone, detail, and perspective."
            isVisible={visibleTooltip === 'natural-language'}
            isFlipped={flippedTile === 'natural-language'}
            onTileClick={handleTileClick}
            onImageEnlarge={setEnlargedImageSrc}
          />

          <CapabilityTile
            id="code-generation"
            icon={
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="16 18 22 12 16 6"></polyline>
                <polyline points="8 6 2 12 8 18"></polyline>
              </svg>
            }
            title="Code Generation"
            backTitle="Code Generation COMPARISON"
            description="Evaluate programming capabilities"
            tooltipText="Code Generation: Evaluate programming capabilities"
            backImage="/images/tile-code-generation.png"
            backText="Submit a coding prompt and compare the generated implementations — evaluate syntax, style, and correctness side by side."
            isVisible={visibleTooltip === 'code-generation'}
            isFlipped={flippedTile === 'code-generation'}
            onTileClick={handleTileClick}
            onImageEnlarge={setEnlargedImageSrc}
          />

          <CapabilityTile
            id="formatted-math"
            icon={
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 12h3l3 7 5-14h7"></path>
              </svg>
            }
            title="Formatted Math"
            backTitle="Formatted Math COMPARISON"
            description="Render math equations beautifully"
            tooltipText="Formatted Math: Render mathematical equations beautifully"
            backImage="/images/tile-formatted-math.png"
            backText="Request a derivation or formula and see how each model renders mathematical notation — compare clarity and step-by-step accuracy."
            isVisible={visibleTooltip === 'formatted-math'}
            isFlipped={flippedTile === 'formatted-math'}
            onTileClick={handleTileClick}
            onImageEnlarge={setEnlargedImageSrc}
          />
        </div>

        {/* Render children (comparison form) inside hero-input-section */}
        {children && <div className="hero-input-section">{children}</div>}
      </div>

      {enlargedImageSrc &&
        createPortal(
          <div
            className="capability-tile-image-lightbox"
            role="dialog"
            aria-modal="true"
            aria-label="Enlarged image — click to close"
            onClick={closeEnlargedAndUnflip}
          >
            <img
              src={enlargedImageSrc}
              alt="Enlarged preview — click to close"
              className="capability-tile-image-lightbox-img"
            />
          </div>,
          document.body
        )}
    </div>
  )
}
