/**
 * AdvancedSettings - Collapsible section for advanced comparison options
 *
 * Contains temperature control and other per-comparison settings.
 * Placed near model selection for discoverability.
 */

import { useState } from 'react'

import { TemperatureInfoModal } from './TemperatureInfoModal'

export interface AdvancedSettingsProps {
  temperature: number
  onTemperatureChange: (temp: number) => void
  disabled?: boolean
  /** When true, tapping the temperature label shows an info modal (mobile) */
  isMobileLayout?: boolean
}

export function AdvancedSettings({
  temperature,
  onTemperatureChange,
  disabled = false,
  isMobileLayout = false,
}: AdvancedSettingsProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [showTemperatureInfoModal, setShowTemperatureInfoModal] = useState(false)

  const clampedTemp = Math.max(0, Math.min(2, temperature))
  const displayValue = clampedTemp.toFixed(1)

  const handleTemperatureLabelClick = (e: React.MouseEvent) => {
    if (isMobileLayout) {
      e.preventDefault()
      setShowTemperatureInfoModal(true)
    }
  }

  return (
    <div className="advanced-settings">
      <button
        type="button"
        className="advanced-settings-toggle"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        aria-controls="advanced-settings-content"
      >
        <span className="advanced-settings-toggle-text">Advanced</span>
        <svg
          className={`advanced-settings-chevron ${isExpanded ? 'expanded' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          <path
            d="M7 10l5 5 5-5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {isExpanded && (
        <div id="advanced-settings-content" className="advanced-settings-content">
          <div className="advanced-settings-row">
            <label
              htmlFor="temperature-slider"
              className={`advanced-settings-label ${isMobileLayout ? 'advanced-settings-label-tappable' : ''}`}
              title="Controls response randomness. Lower = more deterministic and reproducible; higher = more creative and varied."
              onClick={handleTemperatureLabelClick}
            >
              Temperature
              <span className="advanced-settings-hint">(0–2)</span>
              {isMobileLayout && (
                <span className="advanced-settings-info-hint" aria-hidden>
                  Tap for info
                </span>
              )}
            </label>
            <div className="advanced-settings-slider-wrap">
              <input
                id="temperature-slider"
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={clampedTemp}
                onChange={e => onTemperatureChange(parseFloat(e.target.value))}
                disabled={disabled}
                className="advanced-settings-slider"
                aria-valuemin={0}
                aria-valuemax={2}
                aria-valuenow={clampedTemp}
                aria-valuetext={`${displayValue}`}
              />
              <span className="advanced-settings-value">{displayValue}</span>
            </div>
          </div>
        </div>
      )}

      <TemperatureInfoModal
        isOpen={showTemperatureInfoModal}
        onClose={() => setShowTemperatureInfoModal(false)}
      />
    </div>
  )
}
