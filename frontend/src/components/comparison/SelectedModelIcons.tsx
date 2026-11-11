/**
 * Selected-model provider icons for the hero credits/pricing gap.
 *
 * One carousel ProviderIcon per selected model, left-to-right in selection
 * order (duplicate providers each get their own icon). Desktop hover/focus
 * shows the exact model display name; mobile/tablet uses the existing
 * DisabledButtonInfoModal bottom-sheet pattern (no floating tooltip).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'

import { useResponsive } from '../../hooks'
import type { ModelsByProvider } from '../../types'
import { ProviderIcon } from '../layout/ProviderIcon'
import { StyledTooltip } from '../shared'

import { resolveSelectedModelIcons } from './resolveSelectedModelIcons'
import { useSelectedModelIconTrackFit } from './useSelectedModelIconTrackFit'

import './DisabledButtonInfoModal.css'
import '../../styles/selectedModelIcons.css'

function SelectedModelNameSheet({ name, onClose }: { name: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = previousOverflow
    }
  }, [onClose])

  return createPortal(
    <div
      className="disabled-button-info-overlay selected-model-name-sheet-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="selected-model-name-sheet-title"
      data-testid="selected-model-name-sheet"
    >
      <div className="disabled-button-info-modal" onClick={e => e.stopPropagation()}>
        <div className="disabled-button-info-header">
          <h3 id="selected-model-name-sheet-title">{name}</h3>
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
              aria-hidden
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="disabled-button-info-content">
          <p>{name}</p>
        </div>
        <div className="disabled-button-info-footer">
          <button className="disabled-button-info-button" onClick={onClose} type="button">
            Got it
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

interface SelectedModelIconsProps {
  selectedModels: string[]
  modelsByProvider: ModelsByProvider
}

export function SelectedModelIcons({ selectedModels, modelsByProvider }: SelectedModelIconsProps) {
  const { useModalForTooltips } = useResponsive()
  const [sheetName, setSheetName] = useState<string | null>(null)
  const items = useMemo(
    () => resolveSelectedModelIcons(selectedModels, modelsByProvider),
    [selectedModels, modelsByProvider]
  )

  const containerRef = useRef<HTMLDivElement>(null)
  const fit = useSelectedModelIconTrackFit(items.length, containerRef)

  const closeSheet = useCallback(() => setSheetName(null), [])

  const handleIconClick = useCallback(
    (e: MouseEvent, displayName: string) => {
      if (!useModalForTooltips) return
      e.preventDefault()
      e.stopPropagation()
      setSheetName(displayName)
    },
    [useModalForTooltips]
  )

  if (items.length === 0) {
    return null
  }

  const trackStyle = fit.fitted
    ? ({
        '--selected-model-icon-overlap': `${fit.overlapPx}px`,
        '--selected-model-icon-slot': `${fit.slotPx}px`,
        '--selected-model-icon-disc-scale': String(fit.discScale),
      } as React.CSSProperties)
    : undefined

  return (
    <>
      <div ref={containerRef} className="selected-model-icons" data-testid="selected-model-icons">
        <ul
          className={
            fit.fitted
              ? 'selected-model-icons-track selected-model-icons-track--fitted'
              : 'selected-model-icons-track'
          }
          style={trackStyle}
          data-track-fit={fit.fitted ? 'fitted' : 'default'}
          aria-label="Selected models"
        >
          {items.map((item, index) => {
            const button = (
              <button
                type="button"
                className="selected-model-icon-button"
                aria-label={item.displayName}
                data-testid="selected-model-icon"
                data-model-id={item.modelId}
                data-provider={item.provider}
                onClick={e => handleIconClick(e, item.displayName)}
              >
                <span
                  className="provider-carousel-item-inner selected-model-icon-inner"
                  aria-hidden
                >
                  <ProviderIcon provider={item.provider} />
                </span>
              </button>
            )

            return (
              <li key={`${item.modelId}-${index}`}>
                {useModalForTooltips ? (
                  button
                ) : (
                  <StyledTooltip usePortal text={item.displayName}>
                    {button}
                  </StyledTooltip>
                )}
              </li>
            )
          })}
        </ul>
      </div>
      {useModalForTooltips && sheetName !== null && (
        <SelectedModelNameSheet name={sheetName} onClose={closeSheet} />
      )}
    </>
  )
}
