import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/useTheme'
import { useHideHeroUtilityTiles } from '../../hooks/useHideHeroUtilityTiles'
import { StyledTooltip } from '../shared'

import { ProviderCarousel } from './ProviderCarousel'

/**
 * Context that tells child components (e.g. FormHeader) whether an anonymous
 * user has toggled into carousel mode so they can adjust displayed text.
 */
const AnonCarouselContext = createContext(false)
// Hook shared with FormHeader; Fast Refresh prefers component-only files for exports.
// eslint-disable-next-line react-refresh/only-export-components -- hook co-located with provider in Hero
export function useAnonCarousel(): boolean {
  return useContext(AnonCarouselContext)
}

/**
 * Same path (`/videos/foo.mp4`) is heavily cached by browsers (and CDNs). Bump this when you
 * replace any hero capability video file so clients fetch the new bytes.
 */
const CAPABILITY_VIDEO_CACHE_BUST = 'v=2'

/** Matches .capability-tile transform transition in hero.css (0.7s) — keep stacking elevated until it finishes. */
const CAPABILITY_FLIP_STACK_MS = 750

/** First sentence of flipped-tile copy is styled as a header; remainder stays body text. */
function splitCapabilityBackText(text: string): { lead: string; rest: string } {
  const trimmed = text.trim()
  const match = trimmed.match(/^(.+?[.!?])(?:\s+([\s\S]+))?$/)
  if (match) {
    return { lead: match[1].trim(), rest: (match[2] ?? '').trim() }
  }
  return { lead: trimmed, rest: '' }
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
  /** Static first-frame image shown instantly while the video loads */
  backVideoPoster?: string
  backText: string
  isFlipped: boolean
  onTileClick: (id: string) => void
  onImageEnlarge?: (src: string) => void
  /** Demo CTA on the flipped back when `capabilityDemoLabels` / `onCapabilityDemo` are set (compact icon-row layout). */
  demoButton?: { label: string; onClick: (e: React.MouseEvent) => void } | null
}

function CapabilityTile({
  id,
  icon,
  title,
  backTitle,
  description,
  backImage,
  backVideo,
  backVideoPoster,
  backText,
  isFlipped,
  onTileClick,
  onImageEnlarge,
  demoButton,
}: CapabilityTileProps) {
  const { lead: backTextLead, rest: backTextRest } = splitCapabilityBackText(backText)
  const tileRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const prevFlipped = useRef(isFlipped)
  /** False until the browser has decoded at least one frame; hides the video's default blank/white paint. */
  const [videoHasFrame, setVideoHasFrame] = useState(false)
  /** `canplay` fires repeatedly during playback; priming must run once or `currentTime = 0` would reset the video. */
  const videoPrimedRef = useRef(false)
  /** True briefly after flip state changes so z-index stays above siblings/composer during CSS transition (esp. closing). */
  const [stackElevated, setStackElevated] = useState(false)
  const prevFlippedStackRef = useRef(isFlipped)

  /* useLayoutEffect: on close, .flipped is removed before paint so stacking must update in the same frame
     (useEffect runs after paint and one frame showed neighbors/composer on top). */
  useLayoutEffect(() => {
    if (prevFlippedStackRef.current === isFlipped) return
    prevFlippedStackRef.current = isFlipped
    setStackElevated(true)
    const id = window.setTimeout(() => setStackElevated(false), CAPABILITY_FLIP_STACK_MS)
    return () => window.clearTimeout(id)
  }, [isFlipped])

  useEffect(() => {
    if (prevFlipped.current && !isFlipped) {
      tileRef.current?.blur()
    }
    prevFlipped.current = isFlipped
  }, [isFlipped])

  useEffect(() => {
    setVideoHasFrame(false)
    videoPrimedRef.current = false
    const v = videoRef.current
    if (!v || !backVideo) return
    let cancelled = false

    const markReady = () => {
      if (cancelled || videoPrimedRef.current) return
      videoPrimedRef.current = true
      removeAll()
      try {
        v.currentTime = 0
      } catch {
        /* ignore */
      }
      setVideoHasFrame(true)
    }

    const onMetadata = () => {
      if (cancelled || videoPrimedRef.current) return
      if (v.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        try {
          v.currentTime = 0.001
        } catch {
          /* ignore */
        }
      }
    }

    const removeAll = () => {
      v.removeEventListener('loadeddata', markReady)
      v.removeEventListener('canplay', markReady)
      v.removeEventListener('seeked', markReady)
      v.removeEventListener('error', markReady)
      v.removeEventListener('loadedmetadata', onMetadata)
    }

    v.addEventListener('loadeddata', markReady)
    v.addEventListener('canplay', markReady)
    v.addEventListener('seeked', markReady)
    v.addEventListener('error', markReady)
    v.addEventListener('loadedmetadata', onMetadata)

    if (v.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      markReady()
    } else if (v.readyState >= HTMLMediaElement.HAVE_METADATA) {
      onMetadata()
    }

    return () => {
      cancelled = true
      removeAll()
    }
  }, [backVideo])

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
    <div
      className={`capability-tile-wrapper${stackElevated ? ' capability-tile-wrapper--elevated' : ''}`}
    >
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
          <div
            className={`capability-tile-back-image-wrap${
              backVideo && !videoHasFrame && !backVideoPoster
                ? ' capability-tile-back-image-wrap--video-pending'
                : ''
            }`}
          >
            {backVideo ? (
              <video
                ref={videoRef}
                src={backVideo}
                poster={backVideoPoster}
                className="capability-tile-back-image capability-tile-back-video"
                muted
                loop
                playsInline
                preload="metadata"
                aria-label={`${title} example`}
              />
            ) : (
              backImage && (
                <img
                  src={backImage}
                  alt={`${title} example`}
                  className="capability-tile-back-image"
                  loading="lazy"
                  decoding="async"
                />
              )
            )}
          </div>
          <div className="capability-tile-back-text-stack">
            <p className="capability-tile-back-text capability-tile-back-text--lead">
              {backTextLead}
            </p>
            {backTextRest ? (
              <p className="capability-tile-back-text capability-tile-back-text--rest">
                {backTextRest}
              </p>
            ) : null}
          </div>
          {isFlipped && demoButton && (
            <button
              type="button"
              className="capability-tile-demo-btn"
              onClick={e => {
                e.stopPropagation()
                demoButton.onClick(e)
              }}
            >
              {demoButton.label}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

interface HeroProps {
  children?: ReactNode
  /** Provider names for the floating carousel (shown when capability cards are hidden) */
  carouselProviders?: string[]
  /** Called when a carousel provider icon is clicked */
  onCarouselProviderClick?: (provider: string) => void
  /** Icon-row layout: demo CTA labels per tile id. When set, flipped tiles show a CTA that fires onCapabilityDemo. */
  capabilityDemoLabels?: Record<string, string>
  /** Called when the user taps the demo CTA on a flipped tile (compact icon-row layout). */
  onCapabilityDemo?: (tileId: string) => void
}

/**
 * Hero - Main hero section with title, capabilities, and comparison form
 */
export function Hero({
  children,
  carouselProviders,
  onCarouselProviderClick,
  capabilityDemoLabels,
  onCapabilityDemo,
}: HeroProps) {
  const [showFlash, setShowFlash] = useState(false)
  const [flippedTile, setFlippedTile] = useState<string | null>(null)
  const [enlargedImageSrc, setEnlargedImageSrc] = useState<string | null>(null)
  const { theme, toggleTheme } = useTheme()
  const { user } = useAuth()
  const isAuthenticated = !!user
  const registeredHide = useHideHeroUtilityTiles()

  const [anonCarouselMode, setAnonCarouselMode] = useState(false)
  const hideCards = isAuthenticated ? registeredHide : anonCarouselMode

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

  const toggleAnonCarousel = useCallback(() => {
    setAnonCarouselMode(prev => !prev)
  }, [])

  const makeDemoButton = useCallback(
    (tileId: string) => {
      if (!onCapabilityDemo || !capabilityDemoLabels?.[tileId]) return null
      return {
        label: capabilityDemoLabels[tileId],
        onClick: () => onCapabilityDemo(tileId),
      }
    },
    [onCapabilityDemo, capabilityDemoLabels]
  )

  return (
    <AnonCarouselContext.Provider value={anonCarouselMode}>
      <div
        className={hideCards ? 'hero-section hero-section--composer-focused' : 'hero-section'}
        style={meshStyle}
      >
        {hideCards && (
          <>
            <img
              src="/brand/logo-no-arrows.svg"
              alt=""
              className="hero-centered-logo hero-centered-logo--no-arrows"
              aria-hidden="true"
              fetchpriority="low"
              decoding="async"
            />
            <img
              src="/brand/logo.svg"
              alt=""
              className="hero-centered-logo hero-centered-logo--with-arrows"
              aria-hidden="true"
              fetchpriority="low"
              decoding="async"
            />
            {carouselProviders && carouselProviders.length > 0 && onCarouselProviderClick && (
              <ProviderCarousel
                providers={carouselProviders}
                onProviderClick={onCarouselProviderClick}
              />
            )}
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

          <div className="hero-capabilities-wrap">
            <div className={`hero-logo-flash ${showFlash ? 'active' : ''}`} aria-hidden="true">
              <img
                src="/brand/logo.svg"
                alt=""
                className="hero-flash-logo-img"
                fetchpriority="high"
                decoding="async"
              />
            </div>
            <div
              className={`hero-capabilities${enlargedImageSrc ? ' lightbox-open' : ''}`}
              aria-hidden={hideCards}
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
                backVideoPoster="/videos/natural_language_poster.jpg"
                backText="Compare natural language responses. Try an, already set-up, example comparison' and when the results come in, select the tab for each model to see their responses."
                isFlipped={flippedTile === 'natural-language'}
                onTileClick={handleTileClick}
                onImageEnlarge={setEnlargedImageSrc}
                demoButton={makeDemoButton('natural-language')}
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
                backVideoPoster="/videos/code-generation_poster.jpg"
                backText="Compare code solutions. Try an, already set-up, example comparison' and when the results come in, select the tab for each model to see their code."
                isFlipped={flippedTile === 'code-generation'}
                onTileClick={handleTileClick}
                onImageEnlarge={setEnlargedImageSrc}
                demoButton={makeDemoButton('code-generation')}
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
                backVideoPoster="/videos/formatted-math_poster.jpg"
                backText="Compare formatted math results. Try an, already set-up, example comparison' and when the results come in, select the tab for each model to see their work."
                isFlipped={flippedTile === 'formatted-math'}
                onTileClick={handleTileClick}
                onImageEnlarge={setEnlargedImageSrc}
                demoButton={makeDemoButton('formatted-math')}
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
                backVideoPoster="/videos/image-generation_poster.jpg"
                backText="Compare generated images. Try an, already set-up, example comparison' and when the results come in, select the tab for each model to see their images."
                isFlipped={flippedTile === 'image-creation'}
                onTileClick={handleTileClick}
                onImageEnlarge={setEnlargedImageSrc}
                demoButton={makeDemoButton('image-creation')}
              />
            </div>
          </div>

          {/* Render children (comparison form) inside hero-input-section */}
          {children && (
            <div className="hero-input-section">
              {hideCards && (
                <>
                  <div className="hero-arrow hero-arrow--left" aria-hidden="true" />
                  <div className="hero-arrow hero-arrow--right" aria-hidden="true" />
                </>
              )}

              {/* Anonymous-only toggle: switch between capability cards and provider carousel.
                Absolutely positioned above the heading so it consumes no layout space. */}
              {!isAuthenticated && (
                <div className="hero-view-toggle-wrap">
                  <button
                    type="button"
                    className="hero-view-toggle"
                    onClick={toggleAnonCarousel}
                    aria-label={
                      anonCarouselMode ? 'Show capability cards' : 'Show AI model carousel'
                    }
                  >
                    {anonCarouselMode ? (
                      <svg
                        width="22"
                        height="22"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <rect x="2" y="2" width="8.5" height="8.5" rx="1.5" />
                        <rect x="13.5" y="2" width="8.5" height="8.5" rx="1.5" />
                        <rect x="2" y="13.5" width="8.5" height="8.5" rx="1.5" />
                        <rect x="13.5" y="13.5" width="8.5" height="8.5" rx="1.5" />
                      </svg>
                    ) : (
                      <svg
                        width="42"
                        height="42"
                        viewBox="0 0 96 96"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3.5"
                        strokeLinejoin="round"
                        shapeRendering="geometricPrecision"
                        aria-hidden
                      >
                        {/* Five rings with ~4u gaps between path extents so strokes stay legible (not one blurry blob). */}
                        <circle cx="10" cy="48" r="5" opacity={0.4} />
                        <circle cx="27" cy="48" r="8" opacity={0.62} />
                        <circle cx="48" cy="48" r="9" />
                        <circle cx="69" cy="48" r="8" opacity={0.62} />
                        <circle cx="86" cy="48" r="5" opacity={0.4} />
                      </svg>
                    )}
                  </button>
                </div>
              )}

              {children}
            </div>
          )}
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
    </AnonCarouselContext.Provider>
  )
}
