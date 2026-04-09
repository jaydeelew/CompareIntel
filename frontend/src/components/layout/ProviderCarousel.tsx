/**
 * ProviderCarousel - 3D-look rotating carousel of AI provider icons
 *
 * Shown over the CompareIntel watermark when capability cards are hidden.
 * Items orbit a central point with simulated depth: front items grow large,
 * back items shrink and fade. Uses 2D transforms (translate + scale) for
 * reliable pointer hit-testing — CSS preserve-3d makes buttons un-clickable
 * in many browsers.
 *
 * Supports mouse drag (desktop) and touch swipe.
 * Click navigates to the provider's model dropdown; hover shows the name.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import '../../styles/providerCarousel.css'

/* ──────────────────────────────── types ──────────────────────────────── */

interface ProviderCarouselProps {
  providers: string[]
  onProviderClick: (provider: string) => void
}

/* ──────────────────────────────── brand colors ──────────────────────────────── */

const PROVIDER_COLORS: Record<string, string> = {
  OpenAI: '#10a37f',
  Anthropic: '#d4a373',
  Google: '#4285f4',
  Meta: '#0668e1',
  Microsoft: '#00a4ef',
  Mistral: '#ff7000',
  Mistralai: '#ff7000',
  xAI: '#a0a0a0',
  DeepSeek: '#4d6bfe',
  Cohere: '#39594d',
  Qwen: '#612fff',
  'Black Forest Labs': '#a78bfa',
  'ByteDance Seed': '#fe2c55',
  Minimax: '#3b82f6',
  'Moonshot AI': '#8b5cf6',
  Xiaomi: '#ff6900',
  ArceeAi: '#2563eb',
  Sourceful: '#10b981',
  Stepfun: '#8b5cf6',
  ZAi: '#6366f1',
  Kwaipilot: '#f59e0b',
}

/* ──────────────────────────────── icon SVGs ──────────────────────────────── */

const PROVIDER_ABBR: Record<string, string> = {
  OpenAI: 'Ai',
  Anthropic: 'An',
  Google: 'G',
  Meta: '∞',
  Microsoft: 'Ms',
  Mistral: 'Mi',
  Mistralai: 'Ma',
  xAI: 'xA',
  DeepSeek: 'DS',
  Cohere: 'Co',
  Qwen: 'Qw',
  'Black Forest Labs': 'BF',
  'ByteDance Seed': 'BD',
  Minimax: 'Mx',
  'Moonshot AI': '☽',
  Xiaomi: 'Xi',
  ArceeAi: 'Ar',
  Sourceful: 'Sf',
  Stepfun: 'St',
  ZAi: 'Z',
  Kwaipilot: 'Kw',
}

function ProviderIcon({ provider }: { provider: string }) {
  const color = PROVIDER_COLORS[provider] ?? '#64748b'
  const abbr = PROVIDER_ABBR[provider] ?? provider.slice(0, 2)

  switch (provider) {
    case 'OpenAI':
      return (
        <svg viewBox="0 0 24 24" className="provider-carousel-svg" aria-hidden>
          <path
            d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"
            fill={color}
          />
        </svg>
      )
    case 'Google':
      return (
        <svg viewBox="0 0 24 24" className="provider-carousel-svg" aria-hidden>
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
            fill="#4285f4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34a853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            fill="#fbbc05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#ea4335"
          />
        </svg>
      )
    case 'Meta':
      return (
        <svg viewBox="0 0 24 24" className="provider-carousel-svg" aria-hidden>
          <path
            d="M6.915 4.03c-1.968 0-3.326 1.49-4.28 3.17C1.618 9.234 1 11.333 1 12.861c0 2.474 1.174 4.096 3.25 4.096 1.145 0 2.158-.554 3.289-1.803l.567-.63.567.63c1.13 1.249 2.144 1.803 3.289 1.803.555 0 1.065-.137 1.517-.397a3.85 3.85 0 0 0 1.248-1.058c.652-.892.985-2.078.985-3.241 0-1.528-.617-3.627-1.635-5.661C13.326 5.52 11.968 4.03 10 4.03c-1.107 0-2.01.563-2.997 1.776L6.915 5.94l-.088-.133C5.93 4.593 5.022 4.03 3.915 4.03zm0 1.464c.647 0 1.27.463 2.06 1.588l.32.455c.377.54.748 1.142 1.108 1.795.385.698.726 1.421 1.003 2.123.285.722.478 1.397.578 2.012.063.384.093.701.093.942 0 .97-.26 1.73-.77 2.236-.305.303-.686.457-1.16.457-.695 0-1.37-.394-2.307-1.434l-1.04-1.155-1.04 1.155c-.937 1.04-1.612 1.434-2.307 1.434-.474 0-.855-.154-1.16-.457-.51-.507-.77-1.266-.77-2.236 0-.861.263-2.044.671-3.077.393-.994.891-1.939 1.44-2.735C5.028 5.957 5.652 5.494 6.299 5.494h.616z"
            fill={color}
          />
        </svg>
      )
    case 'Microsoft':
      return (
        <svg viewBox="0 0 24 24" className="provider-carousel-svg" aria-hidden>
          <rect x="1" y="1" width="10" height="10" fill="#f25022" rx="1" />
          <rect x="13" y="1" width="10" height="10" fill="#7fba00" rx="1" />
          <rect x="1" y="13" width="10" height="10" fill="#00a4ef" rx="1" />
          <rect x="13" y="13" width="10" height="10" fill="#ffb900" rx="1" />
        </svg>
      )
    case 'Anthropic':
      return (
        <svg viewBox="0 0 24 24" className="provider-carousel-svg" aria-hidden>
          <path
            d="M13.827 3.52h3.603L24 20.48h-3.603l-6.57-16.96zm-7.258 0h3.767L16.906 20.48h-3.674l-1.508-4.065H5.248l-1.508 4.065H0L6.569 3.52zM6.285 13.42h4.57L8.572 7.296 6.285 13.42z"
            fill={color}
          />
        </svg>
      )
    case 'Mistral':
    case 'Mistralai':
      return (
        <svg viewBox="0 0 24 24" className="provider-carousel-svg" aria-hidden>
          <rect x="3" y="2" width="4" height="4" fill={color} rx="0.5" />
          <rect x="17" y="2" width="4" height="4" fill={color} rx="0.5" />
          <rect x="3" y="7" width="4" height="4" fill={color} rx="0.5" />
          <rect x="10" y="7" width="4" height="4" fill="#ffb800" rx="0.5" />
          <rect x="17" y="7" width="4" height="4" fill={color} rx="0.5" />
          <rect x="3" y="12" width="4" height="4" fill={color} rx="0.5" />
          <rect x="10" y="12" width="4" height="4" fill="#ffb800" rx="0.5" />
          <rect x="17" y="12" width="4" height="4" fill={color} rx="0.5" />
          <rect x="3" y="17" width="4" height="4" fill={color} rx="0.5" />
          <rect x="17" y="17" width="4" height="4" fill={color} rx="0.5" />
        </svg>
      )
    case 'xAI':
      return (
        <svg viewBox="0 0 24 24" className="provider-carousel-svg" aria-hidden>
          <text
            x="12"
            y="16"
            textAnchor="middle"
            fill={color}
            fontFamily="system-ui, -apple-system, sans-serif"
            fontWeight="700"
            fontSize="12"
          >
            𝕏AI
          </text>
        </svg>
      )
    case 'DeepSeek':
      return (
        <svg viewBox="0 0 24 24" className="provider-carousel-svg" aria-hidden>
          <path
            d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1.5 14.5c-2.49 0-4.5-2.01-4.5-4.5S8.01 7.5 10.5 7.5c1.42 0 2.68.66 3.5 1.69V7.5h2v9h-2v-1.69c-.82 1.03-2.08 1.69-3.5 1.69zm0-7c-1.38 0-2.5 1.12-2.5 2.5s1.12 2.5 2.5 2.5 2.5-1.12 2.5-2.5-1.12-2.5-2.5-2.5z"
            fill={color}
          />
        </svg>
      )
    default:
      return (
        <svg viewBox="0 0 40 40" className="provider-carousel-svg" aria-hidden>
          <circle cx="20" cy="20" r="18" fill={color} opacity="0.15" />
          <circle
            cx="20"
            cy="20"
            r="18"
            stroke={color}
            strokeWidth="1.5"
            fill="none"
            opacity="0.4"
          />
          <text
            x="20"
            y="21"
            textAnchor="middle"
            dominantBaseline="central"
            fill={color}
            fontFamily="system-ui, -apple-system, sans-serif"
            fontWeight="600"
            fontSize={abbr.length > 2 ? '10' : '12'}
          >
            {abbr}
          </text>
        </svg>
      )
  }
}

/* ──────────────────────────────── layout math ──────────────────────────────── */

const RADIUS = 130
const PERSPECTIVE = 400
const AUTO_ROTATE_SPEED = 0.15
const DRAG_SENSITIVITY = 0.4
const MOMENTUM_DECAY = 0.94
const MOMENTUM_MIN = 0.05

/** Given a rotation angle (degrees), compute 2D x, scale, opacity, zIndex for one item. */
function itemLayout(itemAngleDeg: number, rotationDeg: number) {
  const theta = ((itemAngleDeg + rotationDeg) % 360) * (Math.PI / 180)
  const x = Math.sin(theta) * RADIUS
  const z = Math.cos(theta) * RADIUS
  const scale = (PERSPECTIVE + z) / (PERSPECTIVE + RADIUS)
  const opacity = 0.35 + 0.65 * ((z + RADIUS) / (2 * RADIUS))
  const zIndex = Math.round(z + RADIUS)
  return { x, scale, opacity, zIndex }
}

/* ──────────────────────────────── component ──────────────────────────────── */

export function ProviderCarousel({ providers, onProviderClick }: ProviderCarouselProps) {
  const [rotation, setRotation] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [tooltipProvider, setTooltipProvider] = useState<string | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)

  const sceneRef = useRef<HTMLDivElement>(null)
  const animRef = useRef<number>(0)
  const rotRef = useRef(0)
  const draggingRef = useRef(false)
  const hoveredRef = useRef(false)
  const velRef = useRef(0)
  const startXRef = useRef(0)
  const startRotRef = useRef(0)
  const lastXRef = useRef(0)
  const lastTimeRef = useRef(0)
  const didDragRef = useRef(false)

  const count = providers.length
  const angleStep = 360 / count
  const baseAngles = useMemo(() => providers.map((_, i) => i * angleStep), [providers, angleStep])

  // Sync ref
  useEffect(() => {
    rotRef.current = rotation
  }, [rotation])

  // Auto-rotate + momentum loop
  useEffect(() => {
    let live = true
    const tick = () => {
      if (!live) return
      if (!draggingRef.current) {
        if (Math.abs(velRef.current) > MOMENTUM_MIN) {
          rotRef.current += velRef.current
          velRef.current *= MOMENTUM_DECAY
          setRotation(rotRef.current)
        } else if (!hoveredRef.current) {
          velRef.current = 0
          rotRef.current += AUTO_ROTATE_SPEED
          setRotation(rotRef.current)
        }
      }
      animRef.current = requestAnimationFrame(tick)
    }
    animRef.current = requestAnimationFrame(tick)
    return () => {
      live = false
      cancelAnimationFrame(animRef.current)
    }
  }, [])

  // --- Pointer drag via native document listeners ---
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current) return
      const dx = e.clientX - startXRef.current
      if (Math.abs(dx) > 3) didDragRef.current = true
      const now = performance.now()
      const dt = now - lastTimeRef.current
      if (dt > 0) velRef.current = ((e.clientX - lastXRef.current) / dt) * 10
      lastXRef.current = e.clientX
      lastTimeRef.current = now
      rotRef.current = startRotRef.current + dx * DRAG_SENSITIVITY
      setRotation(rotRef.current)
    }
    const onUp = () => {
      if (!draggingRef.current) return
      draggingRef.current = false
      setIsDragging(false)
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onUp)
    return () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
    }
  }, [])

  const onScenePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    e.preventDefault()
    draggingRef.current = true
    setIsDragging(true)
    didDragRef.current = false
    velRef.current = 0
    startXRef.current = e.clientX
    startRotRef.current = rotRef.current
    lastXRef.current = e.clientX
    lastTimeRef.current = performance.now()
  }, [])

  // --- Item handlers ---
  const onItemClick = useCallback(
    (provider: string, e: React.MouseEvent) => {
      if (didDragRef.current) {
        e.preventDefault()
        e.stopPropagation()
        return
      }
      onProviderClick(provider)
    },
    [onProviderClick]
  )

  const onItemEnter = useCallback((provider: string, e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return
    hoveredRef.current = true
    setTooltipProvider(provider)
  }, [])

  const onItemPointerMove = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return
    setTooltipPos({ x: e.clientX, y: e.clientY })
  }, [])

  const onItemLeave = useCallback(() => {
    hoveredRef.current = false
    setTooltipProvider(null)
    setTooltipPos(null)
  }, [])

  return (
    <div className="provider-carousel-wrapper" aria-label="AI model providers">
      <div
        ref={sceneRef}
        className={`provider-carousel-scene${isDragging ? ' provider-carousel-scene--dragging' : ''}`}
        onPointerDown={onScenePointerDown}
      >
        {providers.map((provider, i) => {
          const { x, scale, opacity, zIndex } = itemLayout(baseAngles[i], rotation)
          return (
            <button
              key={provider}
              type="button"
              className="provider-carousel-item"
              style={{
                transform: `translate(${x}px, 0px) scale(${scale})`,
                opacity,
                zIndex,
              }}
              onClick={e => onItemClick(provider, e)}
              onPointerEnter={e => onItemEnter(provider, e)}
              onPointerMove={onItemPointerMove}
              onPointerLeave={onItemLeave}
              aria-label={`View ${provider} models`}
            >
              <ProviderIcon provider={provider} />
            </button>
          )
        })}
      </div>

      {tooltipProvider &&
        tooltipPos &&
        createPortal(
          <div
            className="provider-carousel-tooltip"
            style={{ left: tooltipPos.x, top: tooltipPos.y }}
          >
            {tooltipProvider}
          </div>,
          document.body
        )}
    </div>
  )
}
