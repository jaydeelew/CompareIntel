/**
 * AdvancedSettings - Collapsible section for advanced comparison options.
 *
 * Contains temperature, top_p, and max_tokens controls with
 * rich tooltips on desktop and info modals on mobile.
 */

import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

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
  /** Controlled expanded state (when set, parent controls open/close) */
  isExpanded?: boolean
  /** Called when expand state should change (for mutual exclusivity with other dropdowns) */
  onExpandChange?: (expanded: boolean) => void
  /** When true, show aspect ratio and image size only; hide temp/topP/maxTokens */
  showImageConfig?: boolean
  aspectRatio?: string
  onAspectRatioChange?: (v: string) => void
  imageSize?: string
  onImageSizeChange?: (v: string) => void
  /** Aspect ratios supported by ALL selected models (intersection); options not in this list are disabled */
  supportedAspectRatios?: string[]
  /** Image sizes supported by ALL selected models (intersection); options not in this list are disabled */
  supportedImageSizes?: string[]
  /** Full list of aspect ratio options to display (from registry); when omitted, uses supported or defaults */
  allAspectRatios?: string[]
  /** Full list of image size options to display (from registry); when omitted, uses supported or defaults */
  allImageSizes?: string[]
  /** Compatible defaults for reset (from getDefaultCompatibleConfig); when provided, Reset uses these */
  defaultAspectRatio?: string
  defaultImageSize?: string
  /** CSS selector for elements that should NOT close the dropdown when clicked (e.g. model-provider dropdowns) */
  excludeFromClickOutsideSelector?: string
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

/** Ordered by width/height ascending (portrait to landscape) */
const IMAGE_ASPECT_RATIOS = [
  '9:16',
  '2:3',
  '3:4',
  '4:5',
  '1:1',
  '5:4',
  '4:3',
  '3:2',
  '16:9',
  '21:9',
]
const IMAGE_SIZES = ['1K', '2K', '4K']

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
  aspectRatio: {
    title: 'Aspect Ratio',
    description:
      'Shape of the generated image. Common choices: 1:1 (square), 16:9 (landscape), 9:16 (portrait). Options vary by model.',
  },
  imageSize: {
    title: 'Image Size',
    description:
      'Output resolution: 1K, 2K, or 4K. Higher resolution uses more credits. Some models do not support 4K.',
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
          <p className="param-info-methodology-link">
            <Link to="/faq#advanced-settings" onClick={onClose}>
              Learn more about advanced settings
            </Link>
          </p>
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
  isExpanded: controlledExpanded,
  onExpandChange,
  showImageConfig = false,
  aspectRatio = '1:1',
  onAspectRatioChange,
  imageSize = '1K',
  onImageSizeChange,
  supportedAspectRatios = IMAGE_ASPECT_RATIOS,
  supportedImageSizes = IMAGE_SIZES,
  allAspectRatios,
  allImageSizes,
  defaultAspectRatio,
  defaultImageSize,
  excludeFromClickOutsideSelector,
}: AdvancedSettingsProps) {
  const aspectRatioOptions = allAspectRatios ?? supportedAspectRatios ?? IMAGE_ASPECT_RATIOS
  const imageSizeOptions = allImageSizes ?? supportedImageSizes ?? IMAGE_SIZES
  const supportedRatiosSet = new Set(supportedAspectRatios)
  const supportedSizesSet = new Set(supportedImageSizes)
  const effectiveMax = Math.max(MAX_TOKENS_MIN, maxTokensCap)
  const [internalExpanded, setInternalExpanded] = useState(false)
  const isExpanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded
  const setIsExpanded =
    onExpandChange !== undefined
      ? (v: boolean) => onExpandChange(v)
      : (v: boolean) => setInternalExpanded(v)
  const containerRef = useRef<HTMLDivElement>(null)
  const [infoKey, setInfoKey] = useState<string | null>(null)
  const { isMobileLayout } = useResponsive()

  const clampedTemp = Math.max(0, Math.min(2, temperature))
  const clampedTopP = Math.max(0, Math.min(1, topP))
  const displayTemp = clampedTemp.toFixed(1)
  const displayTopP = clampedTopP.toFixed(2)

  const imageDefaultRatio = defaultAspectRatio ?? '1:1'
  const imageDefaultSize = defaultImageSize ?? '1K'
  const isNonDefault = showImageConfig
    ? aspectRatio !== imageDefaultRatio || imageSize !== imageDefaultSize
    : temperature !== DEFAULTS.temperature ||
      topP !== DEFAULTS.topP ||
      maxTokens !== DEFAULTS.maxTokens

  const handleReset = () => {
    if (showImageConfig) {
      const targetRatio = defaultAspectRatio ?? '1:1'
      const targetSize = defaultImageSize ?? '1K'
      onAspectRatioChange?.(targetRatio)
      onImageSizeChange?.(targetSize)
    } else {
      onTemperatureChange(DEFAULTS.temperature)
      onTopPChange(DEFAULTS.topP)
      onMaxTokensChange(DEFAULTS.maxTokens)
    }
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
    const openModal = () => setInfoKey(paramKey)
    if (isMobileLayout) {
      return (
        <button
          type="button"
          className="advanced-settings-info-btn"
          onClick={openModal}
          aria-label={`Learn about ${PARAM_INFO[paramKey].title}`}
        >
          <InfoIcon />
        </button>
      )
    }
    return (
      <button
        type="button"
        className="advanced-settings-info-trigger"
        onClick={openModal}
        aria-label={`Learn about ${PARAM_INFO[paramKey].title}`}
      >
        <InfoIcon />
        <span className="advanced-settings-tooltip" role="tooltip">
          {PARAM_INFO[paramKey].description}
        </span>
      </button>
    )
  }

  useEffect(() => {
    if (!isExpanded) return
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (containerRef.current?.contains(target)) return
      // Don't close when clicking inside model-provider dropdowns (selecting a model)
      if (
        excludeFromClickOutsideSelector &&
        (target as Element).closest?.(excludeFromClickOutsideSelector)
      ) {
        return
      }
      setIsExpanded(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isExpanded, excludeFromClickOutsideSelector])

  return (
    <div
      ref={containerRef}
      className={`advanced-settings${isExpanded ? ' advanced-settings-expanded' : ''}`}
    >
      <button
        type="button"
        className="advanced-settings-toggle"
        onClick={() => setIsExpanded(!isExpanded)}
        disabled={disabled}
        aria-expanded={isExpanded}
        aria-haspopup="true"
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
          {showImageConfig ? (
            <>
              {/* Aspect Ratio - checkbox-style single-select */}
              <div className="advanced-settings-row">
                <div className="advanced-settings-label-row">
                  <span id="aspect-ratio-label" className="advanced-settings-label">
                    Aspect ratio
                  </span>
                  {renderInfoTrigger('aspectRatio')}
                </div>
                <div
                  className="advanced-settings-option-grid"
                  role="radiogroup"
                  aria-labelledby="aspect-ratio-label"
                  aria-label="Aspect ratio"
                >
                  {aspectRatioOptions.map(r => {
                    const isSupported = supportedRatiosSet.has(r)
                    const isSelected = aspectRatio === r
                    return (
                      <button
                        key={r}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        aria-disabled={disabled || !isSupported}
                        disabled={disabled || !isSupported}
                        className={`advanced-settings-option-chip ${!isSupported ? 'disabled' : ''} ${isSelected ? 'selected' : ''}`}
                        onClick={() => isSupported && onAspectRatioChange?.(r)}
                      >
                        <span className="advanced-settings-option-chip-label">{r}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
              {/* Image Size - checkbox-style single-select */}
              <div className="advanced-settings-row">
                <div className="advanced-settings-label-row">
                  <span id="image-size-label" className="advanced-settings-label">
                    Image size
                  </span>
                  {renderInfoTrigger('imageSize')}
                </div>
                <div
                  className="advanced-settings-option-grid"
                  role="radiogroup"
                  aria-labelledby="image-size-label"
                  aria-label="Image size"
                >
                  {imageSizeOptions.map(s => {
                    const isSupported = supportedSizesSet.has(s)
                    const isSelected = imageSize === s
                    return (
                      <button
                        key={s}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        aria-disabled={disabled || !isSupported}
                        disabled={disabled || !isSupported}
                        className={`advanced-settings-option-chip ${!isSupported ? 'disabled' : ''} ${isSelected ? 'selected' : ''}`}
                        onClick={() => isSupported && onImageSizeChange?.(s)}
                      >
                        <span className="advanced-settings-option-chip-label">{s}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </>
          ) : (
            <>
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
            </>
          )}

          {/* Reset to defaults - always visible; disabled when already at defaults */}
          <div className="advanced-settings-reset-row">
            <button
              type="button"
              className="advanced-settings-reset-btn"
              onClick={handleReset}
              disabled={disabled || !isNonDefault}
              title={
                isNonDefault
                  ? showImageConfig
                    ? 'Restore aspect ratio 1:1, image size 1K'
                    : 'Restore Temperature 0.7, Top P 1.0, Max output tokens Auto'
                  : 'Already using default values'
              }
            >
              Reset to defaults
            </button>
          </div>
        </div>
      )}

      {infoKey && <ParamInfoModal paramKey={infoKey} onClose={() => setInfoKey(null)} />}
    </div>
  )
}
