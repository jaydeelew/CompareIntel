import type { ReactNode } from 'react'

interface CapabilityTileProps {
  id: string
  icon: ReactNode
  title: string
  description: string
  tooltipText: string
  isVisible: boolean
  onTap: (id: string) => void
}

function CapabilityTile({
  id,
  icon,
  title,
  description,
  tooltipText,
  isVisible,
  onTap,
}: CapabilityTileProps) {
  return (
    <div className="capability-tile" onClick={() => onTap(id)}>
      <div className="capability-icon">{icon}</div>
      <h3 className="capability-title">{title}</h3>
      <p className="capability-description">{description}</p>
      <div className={`capability-tooltip ${isVisible ? 'visible' : ''}`}>{tooltipText}</div>
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
  return (
    <div className="hero-section">
      <div className="hero-content">
        <h1 className="hero-title">
          <span className="hero-title-first-line">Compare AI Models</span>{' '}
          <span className="hero-title-second-line">Side by Side</span>
        </h1>
        <p className="hero-subtitle">
          Get concurrent responses from multiple AI models{' '}
          <span className="hero-subtitle-second-line">
            to find the best solution for your needs
          </span>
        </p>

        <div className="hero-capabilities">
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
            description="Compare conversational responses"
            tooltipText="Natural Language: Compare conversational responses"
            isVisible={visibleTooltip === 'natural-language'}
            onTap={onCapabilityTileTap}
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
            description="Evaluate programming capabilities"
            tooltipText="Code Generation: Evaluate programming capabilities"
            isVisible={visibleTooltip === 'code-generation'}
            onTap={onCapabilityTileTap}
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
            description="Render math equations beautifully"
            tooltipText="Formatted Math: Render mathematical equations beautifully"
            isVisible={visibleTooltip === 'formatted-math'}
            onTap={onCapabilityTileTap}
          />
        </div>

        {/* Render children (comparison form) inside hero-input-section */}
        {children && <div className="hero-input-section">{children}</div>}
      </div>
    </div>
  )
}
