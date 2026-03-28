import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

import { useTheme } from '../../contexts/ThemeContext'
import { useHideHeroUtilityTiles } from '../../hooks/useHideHeroUtilityTiles'
import { StyledTooltip } from '../shared'

/**
 * Same path (`/videos/foo.mp4`) is heavily cached by browsers (and CDNs). Bump this when you
 * replace any hero capability video file so clients fetch the new bytes.
 */
const CAPABILITY_VIDEO_CACHE_BUST = 'v=2'

/** Matches hero.css phone rules (theme toggle in hero, etc.); mobile keeps tiles in DOM but hidden. */
const NARROW_HERO_MQ = '(max-width: 480px)'

function useNarrowHeroLayout(): boolean {
  return useSyncExternalStore(
    onStoreChange => {
      const mq = window.matchMedia(NARROW_HERO_MQ)
      mq.addEventListener('change', onStoreChange)
      return () => mq.removeEventListener('change', onStoreChange)
    },
    () => window.matchMedia(NARROW_HERO_MQ).matches,
    () => false
  )
}

interface CapabilityTileProps {
  id: string
  icon: ReactNode
  title: string
  backTitle: string
  description: string
  /** Still image on the tile back when `backVideo` is not set */
  backImage?: string
  /** When set, video is shown on the tile back */
  backVideo?: string
  backText: string
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
  backImage,
  backVideo,
  backText,
  isFlipped,
  onTileClick,
  onImageEnlarge,
}: CapabilityTileProps) {
  const tileRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const prevFlipped = useRef(isFlipped)

  useEffect(() => {
    if (prevFlipped.current && !isFlipped) {
      tileRef.current?.blur()
    }
    prevFlipped.current = isFlipped
  }, [isFlipped])

  useEffect(() => {
    const v = videoRef.current
    if (!v || !backVideo) return
    if (isFlipped) {
      void v.play().catch(() => {})
    } else {
      v.pause()
      v.currentTime = 0
    }
  }, [isFlipped, backVideo])

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onTileClick(id)
  }

  const handleEnlargeClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    const src = backVideo ?? backImage
    if (src) onImageEnlarge?.(src)
  }

  return (
    <div className="capability-tile-wrapper">
      <div
        ref={tileRef}
        className={`capability-tile ${isFlipped ? 'flipped' : ''}`}
        onClick={handleClick}
      >
        <div className="capability-tile-front">
          <div className="capability-icon">{icon}</div>
          <h3 className="capability-title">{title}</h3>
          <p className="capability-description">{description}</p>
        </div>
        <div className="capability-tile-back" data-tile={id}>
          <div className="capability-tile-back-label-row">
            <p className="capability-tile-back-label">{backTitle}</p>
            {isFlipped && onImageEnlarge && (
              <StyledTooltip text="Enlarge screenshot">
                <button
                  type="button"
                  className="capability-tile-enlarge-btn"
                  onClick={handleEnlargeClick}
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
              </StyledTooltip>
            )}
          </div>
          <div className="capability-tile-back-image-wrap">
            {backVideo ? (
              <video
                ref={videoRef}
                src={backVideo}
                className="capability-tile-back-image"
                muted
                loop
                playsInline
                preload="none"
                aria-label={`${title} example`}
              />
            ) : (
              backImage && (
                <img
                  src={backImage}
                  alt={`${title} example`}
                  className="capability-tile-back-image"
                />
              )
            )}
          </div>
          <p className="capability-tile-back-text">{backText}</p>
        </div>
      </div>
    </div>
  )
}

interface HeroProps {
  children?: ReactNode
}

/**
 * Hero - Main hero section with title, capabilities, and comparison form
 */
export function Hero({ children }: HeroProps) {
  const [showFlash, setShowFlash] = useState(false)
  const [flippedTile, setFlippedTile] = useState<string | null>(null)
  const [enlargedImageSrc, setEnlargedImageSrc] = useState<string | null>(null)
  const { theme, toggleTheme } = useTheme()
  const hideHeroUtilityTiles = useHideHeroUtilityTiles()
  const narrowHero = useNarrowHeroLayout()

  const meshStyle = useMemo(() => {
    const r = (min: number, max: number) => min + Math.random() * (max - min)
    return {
      '--mesh-x1': `${r(35, 65)}%`,
      '--mesh-y1': `${r(0, 25)}%`,
      '--mesh-w1': `${r(55, 95)}%`,
      '--mesh-h1': `${r(35, 60)}%`,
      '--mesh-o1': `${r(0.1, 0.2)}`,
      '--mesh-x2': `${r(5, 35)}%`,
      '--mesh-y2': `${r(60, 90)}%`,
      '--mesh-w2': `${r(40, 75)}%`,
      '--mesh-h2': `${r(28, 50)}%`,
      '--mesh-o2': `${r(0.06, 0.14)}`,
      '--mesh-x3': `${r(60, 92)}%`,
      '--mesh-y3': `${r(35, 75)}%`,
      '--mesh-w3': `${r(40, 70)}%`,
      '--mesh-h3': `${r(28, 50)}%`,
      '--mesh-o3': `${r(0.05, 0.12)}`,
      '--mesh-x4': `${r(30, 70)}%`,
      '--mesh-y4': `${r(40, 70)}%`,
      '--mesh-w4': `${r(35, 60)}%`,
      '--mesh-h4': `${r(25, 45)}%`,
      '--mesh-o4': `${r(0.04, 0.09)}`,
      '--mesh-duration': `${r(12, 20).toFixed(1)}s`,
      '--hero-angle': `${[r(20, 70), r(110, 160), r(200, 250), r(290, 340)][Math.floor(Math.random() * 4)].toFixed(0)}deg`,
      '--hero-stop2': `${r(10, 32).toFixed(0)}%`,
      '--hero-stop3': `${r(35, 65).toFixed(0)}%`,
      '--hero-stop4': `${r(68, 90).toFixed(0)}%`,
    } as React.CSSProperties
  }, [])
  /** Desktop: omit tiles when hidden (original behavior). ≤480px: keep tiles for layout stability. */
  const renderCapabilityTilesInHero = !hideHeroUtilityTiles || narrowHero

  const dismissFlip = useCallback(() => {
    setFlippedTile(null)
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
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
    },
    [flippedTile]
  )

  return (
    <div
      className={
        hideHeroUtilityTiles ? 'hero-section hero-section--composer-focused' : 'hero-section'
      }
      style={meshStyle}
    >
      {/* Flash logo background */}
      <div className={`hero-logo-flash ${showFlash ? 'active' : ''}`}>
        <img src="/brand/logo.svg" alt="CompareIntel logo" className="hero-flash-logo-img" />
      </div>

      {hideHeroUtilityTiles && (
        <>
          <img
            src="/brand/logo-no-arrows.svg"
            alt=""
            className="hero-centered-logo hero-centered-logo--no-arrows"
            aria-hidden="true"
          />
          <img
            src="/brand/logo.svg"
            alt=""
            className="hero-centered-logo hero-centered-logo--with-arrows"
            aria-hidden="true"
          />
          <svg
            className="hero-arrow hero-arrow--left"
            viewBox="0 0 1000 100"
            preserveAspectRatio="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <defs>
              <linearGradient
                id="heroArrowGradL"
                x1="500"
                y1="0"
                x2="500"
                y2="100"
                gradientUnits="userSpaceOnUse"
              >
                <stop stopColor="#4DA8FF" />
                <stop offset="1" stopColor="#2878C8" />
              </linearGradient>
            </defs>
            <path d="M0 35 H850 V0 L1000 50 L850 100 V65 H0 Z" fill="url(#heroArrowGradL)" />
          </svg>
          <svg
            className="hero-arrow hero-arrow--right"
            viewBox="0 0 1000 100"
            preserveAspectRatio="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <defs>
              <linearGradient
                id="heroArrowGradR"
                x1="500"
                y1="0"
                x2="500"
                y2="100"
                gradientUnits="userSpaceOnUse"
              >
                <stop stopColor="#4DA8FF" />
                <stop offset="1" stopColor="#2878C8" />
              </linearGradient>
            </defs>
            <path d="M1000 35 H150 V0 L0 50 L150 100 V65 H1000 Z" fill="url(#heroArrowGradR)" />
          </svg>
        </>
      )}

      <div className="hero-content">
        {/* Theme toggle in hero at phone widths only (see hero.css @media max-width: 480px); navbar keeps it on wider viewports. */}
        <div className="hero-theme-toggle-mobile">
          <button
            className="hero-theme-toggle-button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
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
          <span className="sr-only">Compare AI Language and Image Models Side by Side</span>
          <span aria-hidden="true">
            <span className="hero-title-first-line">Compare AI Models</span>{' '}
            <span className="hero-title-second-line">Side by Side</span>
          </span>
        </h1>
        <p className="hero-subtitle">
          <span className="hero-subtitle-first-line">Get responses from multiple AI models</span>
          <span className="hero-subtitle-second-line"> at the same time</span>
        </p>

        {renderCapabilityTilesInHero && (
          <div
            className={`hero-capabilities${enlargedImageSrc ? ' lightbox-open' : ''}`}
            aria-hidden={hideHeroUtilityTiles}
          >
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
              backVideo={`/videos/natural_language.mp4?${CAPABILITY_VIDEO_CACHE_BUST}`}
              backText="Ask any question and instantly compare how each model responds — notice the differences in tone, detail, and perspective."
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
              backVideo={`/videos/code-generation.mp4?${CAPABILITY_VIDEO_CACHE_BUST}`}
              backText="Submit a coding prompt and compare the generated implementations — evaluate syntax, style, and correctness side by side."
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
              backVideo={`/videos/formatted-math.mp4?${CAPABILITY_VIDEO_CACHE_BUST}`}
              backText="Request a derivation or formula and see how each model renders mathematical notation — compare clarity and step-by-step accuracy."
              isFlipped={flippedTile === 'formatted-math'}
              onTileClick={handleTileClick}
              onImageEnlarge={setEnlargedImageSrc}
            />

            <CapabilityTile
              id="image-creation"
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
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              }
              title="Image Creation"
              backTitle="Image Creation COMPARISON"
              description="Compare AI-generated images"
              backVideo={`/videos/image-generation.mp4?${CAPABILITY_VIDEO_CACHE_BUST}`}
              backText="Enter a prompt and compare images generated by multiple AI models side by side — see how each interprets your vision."
              isFlipped={flippedTile === 'image-creation'}
              onTileClick={handleTileClick}
              onImageEnlarge={setEnlargedImageSrc}
            />
          </div>
        )}

        {/* Render children (comparison form) inside hero-input-section */}
        {children && <div className="hero-input-section">{children}</div>}
      </div>

      {enlargedImageSrc &&
        createPortal(
          <div
            className="capability-tile-image-lightbox"
            role="dialog"
            aria-modal="true"
            aria-label="Enlarged preview — click to close"
            onClick={closeEnlargedAndUnflip}
          >
            {enlargedImageSrc.split(/[?#]/)[0].toLowerCase().endsWith('.mp4') ? (
              <video
                src={enlargedImageSrc}
                className="capability-tile-image-lightbox-img"
                controls
                autoPlay
                muted
                loop
                playsInline
              />
            ) : (
              <img
                src={enlargedImageSrc}
                alt="Enlarged preview — click to close"
                className="capability-tile-image-lightbox-img"
              />
            )}
          </div>,
          document.body
        )}
    </div>
  )
}
