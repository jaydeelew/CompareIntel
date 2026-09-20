import { useState, type CSSProperties } from 'react'

import type { ModelDefault } from '../../shared/modelDefaults'

interface ExtensionDefaultsMenuProps {
  defaults: ModelDefault[]
  activeDefaultId: string | null
  selectedCount: number
  maxDefaults: number
  style?: CSSProperties
  onSelectDefault: (id: string) => void
  onSaveDefault: (name: string) => void
  onDeleteDefault: (id: string) => void
}

export function ExtensionDefaultsMenu({
  defaults,
  activeDefaultId,
  selectedCount,
  maxDefaults,
  style,
  onSelectDefault,
  onSaveDefault,
  onDeleteDefault,
}: ExtensionDefaultsMenuProps) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const trimmed = name.trim()
  const atLimit = defaults.length >= maxDefaults
  const nameMatchesExisting = defaults.some(
    (entry) => entry.name.toLowerCase() === trimmed.toLowerCase()
  )
  const canSave = trimmed.length > 0 && selectedCount > 0 && (!atLimit || nameMatchesExisting)

  const handleSave = () => {
    if (selectedCount === 0) {
      setError('Select at least one model first.')
      return
    }
    if (!trimmed) {
      setError('Enter a name for this set.')
      return
    }
    if (atLimit && !nameMatchesExisting) {
      setError(`You can save up to ${maxDefaults} defaults. Delete one first.`)
      return
    }
    onSaveDefault(trimmed)
    setName('')
    setError(null)
  }

  return (
    <div
      className="model-defaults-menu"
      role="dialog"
      aria-label="Default model selections"
      style={style}
    >
      <div className="model-defaults-menu-section">
        <div className="model-defaults-menu-title">Save current selection</div>
        <div className="model-defaults-save-row">
          <input
            className="model-defaults-name-input"
            type="text"
            value={name}
            maxLength={40}
            placeholder="Name this set"
            aria-label="Name this default selection"
            onChange={(event) => {
              setName(event.target.value)
              setError(null)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                handleSave()
              }
            }}
          />
          <button
            type="button"
            className="model-defaults-save-btn"
            onClick={handleSave}
            disabled={!canSave}
          >
            {nameMatchesExisting ? 'Update' : 'Save'}
          </button>
        </div>
        {error && <div className="model-defaults-error">{error}</div>}
      </div>

      <div className="model-defaults-menu-section">
        <div className="model-defaults-menu-title">
          Your defaults
          <span className="model-defaults-count">
            {defaults.length}/{maxDefaults}
          </span>
        </div>
        {defaults.length === 0 ? (
          <div className="model-defaults-empty">No saved defaults yet.</div>
        ) : (
          <ul className="model-defaults-list">
            {defaults.map((entry) => (
              <li
                key={entry.id}
                className={`model-defaults-item${entry.id === activeDefaultId ? ' active' : ''}`}
              >
                <button
                  type="button"
                  className="model-defaults-item-select"
                  onClick={() => onSelectDefault(entry.id)}
                  title={`Use "${entry.name}" (${entry.modelIds.length} models)`}
                >
                  <span className="model-defaults-item-name">{entry.name}</span>
                  <span className="model-defaults-item-count">{entry.modelIds.length}</span>
                </button>
                <button
                  type="button"
                  className="model-defaults-item-delete"
                  onClick={() => onDeleteDefault(entry.id)}
                  title={`Delete "${entry.name}"`}
                  aria-label={`Delete ${entry.name}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
