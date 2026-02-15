import React, { useEffect, useRef, useState } from 'react'

import type { SavedModelSelection } from '../../hooks/useSavedModelSelections'
import type { ModelsByProvider } from '../../types/models'
import { showNotification } from '../../utils/error'

import type { SelectionProps } from './ComparisonFormTypes'

function getModelNamesFromIds(modelIds: string[], modelsByProvider: ModelsByProvider): string {
  const names: string[] = []
  for (const providerModels of Object.values(modelsByProvider)) {
    for (const model of providerModels) {
      if (modelIds.includes(String(model.id))) {
        names.push(model.name)
        break
      }
    }
  }
  return names.length > 0 ? names.join(', ') : modelIds.join(', ')
}

function SavedSelectionCard({
  selection,
  modelsByProvider,
  isFollowUpMode,
  isDefault,
  onLoad,
  onSetDefault,
  onDelete,
  setShowDropdown,
}: {
  selection: SavedModelSelection
  modelsByProvider: ModelsByProvider
  isFollowUpMode: boolean
  isDefault: boolean
  onLoad: (id: string) => void
  onSetDefault: (id: string | null) => void
  onDelete: (id: string) => void
  setShowDropdown: (show: boolean) => void
}) {
  const metaRef = useRef<HTMLDivElement>(null)
  const [isTruncated, setIsTruncated] = useState(false)

  useEffect(() => {
    const el = metaRef.current
    if (!el) return
    const check = () => setIsTruncated(el.scrollWidth > el.clientWidth)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [selection.modelIds, modelsByProvider])

  const modelNames = getModelNamesFromIds(selection.modelIds, modelsByProvider)
  const tooltipTitle =
    isTruncated && modelNames
      ? isFollowUpMode
        ? `Cannot load during follow-up. Models: ${modelNames}`
        : modelNames
      : undefined

  return (
    <div className="saved-selection-item">
      <input
        type="checkbox"
        checked={isDefault}
        onChange={e => {
          e.stopPropagation()
          if (e.target.checked) {
            onSetDefault(selection.id)
            showNotification(`"${selection.name}" set as default selection`, 'success')
          } else {
            onSetDefault(null)
            showNotification('Default selection removed', 'success')
          }
        }}
        onClick={e => e.stopPropagation()}
        title={isDefault ? 'Default model selection' : 'Set as default model selection'}
        className="saved-selection-default-checkbox"
      />
      <div
        className="saved-selection-info"
        onClick={() => {
          if (isFollowUpMode) {
            showNotification('Cannot load saved selections during follow-up mode', 'error')
            return
          }
          onLoad(selection.id)
          setShowDropdown(false)
          showNotification(
            `Loaded "${selection.name}" (${selection.modelIds.length} model${selection.modelIds.length !== 1 ? 's' : ''})`,
            'success'
          )
        }}
        title={tooltipTitle}
        style={{ cursor: isFollowUpMode ? 'not-allowed' : 'pointer' }}
      >
        <div className="saved-selection-name">{selection.name}</div>
        <div ref={metaRef} className="saved-selection-meta">
          {modelNames}
        </div>
      </div>
      <button
        type="button"
        className="saved-selection-delete"
        onClick={e => {
          e.stopPropagation()
          onDelete(selection.id)
          showNotification(`Deleted "${selection.name}"`, 'success')
        }}
        title={`Delete "${selection.name}"`}
      >
        ×
      </button>
    </div>
  )
}

export interface SavedSelectionsDropdownProps {
  selectionProps: SelectionProps
  selectedModels: string[]
  modelsByProvider: ModelsByProvider
  isFollowUpMode: boolean
}

export function SavedSelectionsDropdown({
  selectionProps,
  selectedModels,
  modelsByProvider,
  isFollowUpMode,
}: SavedSelectionsDropdownProps) {
  const {
    savedModelSelections,
    onSaveModelSelection,
    onLoadModelSelection,
    onDeleteModelSelection,
    onSetDefaultSelection,
    getDefaultSelectionId,
    getDefaultSelection,
    defaultSelectionOverridden,
    canSaveMoreSelections,
    maxSavedSelections,
  } = selectionProps

  const [showDropdown, setShowDropdown] = useState(false)
  const [saveSelectionName, setSaveSelectionName] = useState('')
  const [saveSelectionError, setSaveSelectionError] = useState<string | null>(null)
  const [isInSaveMode, setIsInSaveMode] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (
        showDropdown &&
        containerRef.current &&
        !containerRef.current.contains(target) &&
        !target.closest('.saved-selections-dropdown')
      ) {
        setShowDropdown(false)
        setIsInSaveMode(false)
        setSaveSelectionName('')
        setSaveSelectionError(null)
      }
    }

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showDropdown])

  const defaultSelection = getDefaultSelection()

  return (
    <div className="saved-selections-container" ref={containerRef}>
      <button
        type="button"
        className={`saved-selections-button ${showDropdown ? 'active' : ''}`}
        onClick={() => {
          setShowDropdown(!showDropdown)
          setIsInSaveMode(false)
          setSaveSelectionName('')
          setSaveSelectionError(null)
        }}
        title="Save or load model selections"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
      </button>
      {!defaultSelectionOverridden && defaultSelection && (
        <span
          className="default-selection-name"
          title={
            getModelNamesFromIds(defaultSelection.modelIds, modelsByProvider) ||
            'Default model selection'
          }
        >
          {defaultSelection.name}
        </span>
      )}

      {showDropdown && (
        <div className="saved-selections-dropdown">
          <div className="saved-selections-content">
            <div className="saved-selections-header">
              <h4>Saved Model Selections</h4>
              <span className="saved-selections-count">
                {savedModelSelections.length} / {maxSavedSelections}
              </span>
            </div>

            {isInSaveMode ? (
              <div className="saved-selections-save-form">
                <input
                  type="text"
                  placeholder="Enter a name for this selection..."
                  value={saveSelectionName}
                  onChange={e => {
                    setSaveSelectionName(e.target.value)
                    setSaveSelectionError(null)
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      const result = onSaveModelSelection(saveSelectionName)
                      if (result.success) {
                        setSaveSelectionName('')
                        setIsInSaveMode(false)
                        showNotification('Model selection saved successfully!', 'success')
                      } else {
                        setSaveSelectionError(result.error || 'Failed to save selection')
                      }
                    } else if (e.key === 'Escape') {
                      setIsInSaveMode(false)
                      setSaveSelectionName('')
                      setSaveSelectionError(null)
                    }
                  }}
                  autoFocus
                  maxLength={50}
                  className="saved-selections-name-input"
                />
                <div className="saved-selections-save-actions">
                  <button
                    type="button"
                    className="saved-selections-save-btn"
                    onClick={() => {
                      const result = onSaveModelSelection(saveSelectionName)
                      if (result.success) {
                        setSaveSelectionName('')
                        setIsInSaveMode(false)
                        showNotification('Model selection saved successfully!', 'success')
                      } else {
                        setSaveSelectionError(result.error || 'Failed to save selection')
                      }
                    }}
                    disabled={!saveSelectionName.trim()}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="saved-selections-cancel-btn"
                    onClick={() => {
                      setIsInSaveMode(false)
                      setSaveSelectionName('')
                      setSaveSelectionError(null)
                    }}
                  >
                    Cancel
                  </button>
                </div>
                {saveSelectionError && (
                  <div className="saved-selections-error">{saveSelectionError}</div>
                )}
              </div>
            ) : (
              <button
                type="button"
                className="saved-selections-add-btn"
                onClick={() => {
                  if (!canSaveMoreSelections) {
                    showNotification(
                      `Maximum of ${maxSavedSelections} saved selections reached. Delete one to save a new selection.`,
                      'error'
                    )
                    return
                  }
                  if (selectedModels.length === 0) {
                    showNotification('Please select at least one model to save', 'error')
                    return
                  }
                  setIsInSaveMode(true)
                }}
                disabled={!canSaveMoreSelections || selectedModels.length === 0 || isFollowUpMode}
                title={
                  isFollowUpMode
                    ? 'Cannot save selections during follow-up mode'
                    : !canSaveMoreSelections
                      ? `Maximum of ${maxSavedSelections} saved selections reached`
                      : selectedModels.length === 0
                        ? 'Select models to save'
                        : 'Save current model selection'
                }
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Save Current Selection ({selectedModels.length} model
                {selectedModels.length !== 1 ? 's' : ''})
              </button>
            )}

            <div className="saved-selections-list-wrapper">
              <div className="saved-selections-list">
                {savedModelSelections.length === 0 ? (
                  <div className="saved-selections-empty">
                    No saved selections yet. Save your current model selection to quickly load it
                    later!
                  </div>
                ) : (
                  savedModelSelections.map(selection => (
                    <SavedSelectionCard
                      key={selection.id}
                      selection={selection}
                      modelsByProvider={modelsByProvider}
                      isFollowUpMode={isFollowUpMode}
                      isDefault={getDefaultSelectionId() === selection.id}
                      onLoad={onLoadModelSelection}
                      onSetDefault={onSetDefaultSelection}
                      onDelete={onDeleteModelSelection}
                      setShowDropdown={setShowDropdown}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
