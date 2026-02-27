/**
 * AdvancedSettings - Collapsible section for advanced comparison options.
 *
 * Contains temperature, top_p, and max_tokens controls with
 * rich tooltips on desktop and info modals on mobile.
 */

import { useEffect, useRef, useState } from 'react'

import { useResponsive } from '../../hooks'

import './DisabledButtonInfoModal.css'

export interface AdvancedSettingsProps {
  temperature: number
  onTemperatureChange: (temp: number) => void
  topP: number
  onTopPChange: (v: number) => void
  maxTokens: number | null
  onMaxTokensChange: (v: number | null) => void
  /** Cap based on selected models' max_output_tokens (min across selection) */
  maxTokensCap: number
  disabled?: boolean
}

const DEFAULTS = { temperature: 0.7, topP: 1.0, maxTokens: null as number | null }
const MAX_TOKENS_MIN = 256

function stepForRange(min: number, max: number): number {
  const range = max - min
  if (range <= 4096) return 256
  if (range <= 16384) return 512
  if (range <= 65536) return 1024
  return 2048
}

const PARAM_INFO: Record<string, { title: string; description: string }> = {
  temperature: {
    title: 'Temperature',
    description:
      'Controls how random or creative a response is. Low values (e.g. 0.2) produce focused, predictable output. High values (e.g. 1.5) produce more varied, creative responses. Some reasoning models (e.g. OpenAI o1, o3, GPT-5) ignore this setting.',
  },
  topP: {
    title: 'Top P (Nucleus Sampling)',
    description:
      'Limits the model to only consider tokens whose cumulative probability exceeds this threshold. Lower values make output more focused and deterministic. 1.0 means no filtering — the model considers all tokens. Generally, adjust either Temperature or Top P, not both.',
  },
  maxTokens: {
    title: 'Max Output Tokens',
    description:
      'Sets the maximum length of the generated response in tokens (roughly ¾ of a word each). "Auto" lets the system choose the best limit for each model. Lower values produce shorter responses and use fewer credits. The slider range (256 to the maximum) depends on your selected models: when comparing multiple models, the upper limit is the lowest max supported by any selected model, so all models can honor your setting.',
  },
}

function InfoIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  )
}

function ParamInfoModal({ paramKey, onClose }: { paramKey: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const info = PARAM_INFO[paramKey]

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEscape)
    closeRef.current?.focus()
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [onClose])

  if (!info) return null

  return (
    <div
      className="disabled-button-info-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="param-info-title"
    >
      <div
        className="disabled-button-info-modal"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => {
          if (e.key === 'Escape') onClose()
        }}
      >
        <div className="disabled-button-info-header">
          <h3 id="param-info-title">{info.title}</h3>
          <button
            ref={closeRef}
            className="disabled-button-info-close"
            onClick={onClose}
            aria-label="Close"
            type="button"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="disabled-button-info-content">
          <p>{info.description}</p>
        </div>
        <div className="disabled-button-info-footer">
          <button className="disabled-button-info-button" onClick={onClose} type="button" autoFocus>
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}

export function AdvancedSettings({
  temperature,
  onTemperatureChange,
  topP,
  onTopPChange,
  maxTokens,
  onMaxTokensChange,
  maxTokensCap,
  disabled = false,
}: AdvancedSettingsProps) {
  const effectiveMax = Math.max(MAX_TOKENS_MIN, maxTokensCap)
  const [isExpanded, setIsExpanded] = useState(false)
  const [mobileInfoKey, setMobileInfoKey] = useState<string | null>(null)
  const { isMobileLayout } = useResponsive()

  const clampedTemp = Math.max(0, Math.min(2, temperature))
  const clampedTopP = Math.max(0, Math.min(1, topP))
  const displayTemp = clampedTemp.toFixed(1)
  const displayTopP = clampedTopP.toFixed(2)

  const isNonDefault =
    temperature !== DEFAULTS.temperature ||
    topP !== DEFAULTS.topP ||
    maxTokens !== DEFAULTS.maxTokens

  const handleReset = () => {
    onTemperatureChange(DEFAULTS.temperature)
    onTopPChange(DEFAULTS.topP)
    onMaxTokensChange(DEFAULTS.maxTokens)
  }

  const handleMaxTokensInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.trim()
    if (v === '') {
      onMaxTokensChange(null)
      return
    }
    const n = parseInt(v, 10)
    if (!Number.isNaN(n)) {
      onMaxTokensChange(Math.max(MAX_TOKENS_MIN, Math.min(effectiveMax, n)))
    }
  }

  const handleMaxTokensSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseInt(e.target.value, 10)
    if (v <= MAX_TOKENS_MIN) {
      onMaxTokensChange(null)
    } else {
      onMaxTokensChange(v)
    }
  }

  const maxTokensSliderValue = maxTokens ?? MAX_TOKENS_MIN

  const renderInfoTrigger = (paramKey: string) => {
    if (isMobileLayout) {
      return (
        <button
          type="button"
          className="advanced-settings-info-btn"
          onClick={() => setMobileInfoKey(paramKey)}
          aria-label={`Learn about ${PARAM_INFO[paramKey].title}`}
        >
          <InfoIcon />
        </button>
      )
    }
    return (
      <span className="advanced-settings-info-trigger">
        <InfoIcon />
        <span className="advanced-settings-tooltip" role="tooltip">
          {PARAM_INFO[paramKey].description}
        </span>
      </span>
    )
  }

  return (
    <div className={`advanced-settings${isExpanded ? ' advanced-settings-expanded' : ''}`}>
      <button
        type="button"
        className="advanced-settings-toggle"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        aria-controls="advanced-settings-content"
        title={isNonDefault && !isExpanded ? 'Advanced: custom settings applied' : undefined}
      >
        <span className="advanced-settings-toggle-text">
          Advanced
          {isNonDefault && !isExpanded && (
            <span className="advanced-settings-custom-badge">(custom)</span>
          )}
        </span>
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
          {/* Temperature */}
          <div className="advanced-settings-row">
            <div className="advanced-settings-label-row">
              <label htmlFor="temperature-slider" className="advanced-settings-label">
                Temperature
                <span className="advanced-settings-hint">(0–2)</span>
              </label>
              {renderInfoTrigger('temperature')}
            </div>
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
                aria-valuetext={displayTemp}
              />
              <span
                className={`advanced-settings-value ${temperature !== DEFAULTS.temperature ? 'modified' : ''}`}
              >
                {displayTemp}
              </span>
            </div>
          </div>

          {/* Top P */}
          <div className="advanced-settings-row">
            <div className="advanced-settings-label-row">
              <label htmlFor="top-p-slider" className="advanced-settings-label">
                Top P<span className="advanced-settings-hint">(0–1)</span>
              </label>
              {renderInfoTrigger('topP')}
            </div>
            <div className="advanced-settings-slider-wrap">
              <input
                id="top-p-slider"
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={clampedTopP}
                onChange={e => onTopPChange(parseFloat(e.target.value))}
                disabled={disabled}
                className="advanced-settings-slider"
                aria-valuemin={0}
                aria-valuemax={1}
                aria-valuenow={clampedTopP}
                aria-valuetext={displayTopP}
              />
              <span
                className={`advanced-settings-value ${topP !== DEFAULTS.topP ? 'modified' : ''}`}
              >
                {displayTopP}
              </span>
            </div>
          </div>

          {/* Max Tokens */}
          <div className="advanced-settings-row">
            <div className="advanced-settings-label-row">
              <label htmlFor="max-tokens-slider" className="advanced-settings-label">
                Max output tokens
                <span className="advanced-settings-hint">
                  (Auto or 256–{effectiveMax.toLocaleString()})
                </span>
              </label>
              {renderInfoTrigger('maxTokens')}
            </div>
            <div className="advanced-settings-slider-wrap">
              <input
                id="max-tokens-slider"
                type="range"
                min={MAX_TOKENS_MIN}
                max={effectiveMax}
                step={stepForRange(MAX_TOKENS_MIN, effectiveMax)}
                value={Math.min(maxTokensSliderValue, effectiveMax)}
                onChange={handleMaxTokensSlider}
                disabled={disabled}
                className="advanced-settings-slider"
                aria-valuemin={MAX_TOKENS_MIN}
                aria-valuemax={effectiveMax}
                aria-valuenow={Math.min(maxTokensSliderValue, effectiveMax)}
                aria-valuetext={maxTokens ? String(maxTokens) : 'Auto'}
              />
              <input
                id="max-tokens-input"
                type="number"
                min={MAX_TOKENS_MIN}
                max={effectiveMax}
                step={stepForRange(MAX_TOKENS_MIN, effectiveMax)}
                value={maxTokens ?? ''}
                onChange={handleMaxTokensInput}
                disabled={disabled}
                placeholder="Auto"
                className="advanced-settings-number-input"
                aria-label="Max output tokens value"
              />
            </div>
          </div>

          {/* Reset to defaults - always visible; disabled when already at defaults */}
          <div className="advanced-settings-reset-row">
            <button
              type="button"
              className="advanced-settings-reset-btn"
              onClick={handleReset}
              disabled={disabled || !isNonDefault}
              title={
                isNonDefault
                  ? 'Restore Temperature 0.7, Top P 1.0, Max output tokens Auto'
                  : 'Already using default values'
              }
            >
              Reset to defaults
            </button>
          </div>
        </div>
      )}

      {mobileInfoKey && (
        <ParamInfoModal paramKey={mobileInfoKey} onClose={() => setMobileInfoKey(null)} />
      )}
    </div>
  )
}
