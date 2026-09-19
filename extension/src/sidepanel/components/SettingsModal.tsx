import { useEffect, useState } from 'react'

import type { PanelScope } from '../../shared/extensionSettings'
import {
  DEFAULT_CONVERSATION_FONT_SIZE,
  DEFAULT_INPUT_FONT_SIZE,
  FONT_SIZE_OPTIONS,
  getFontSizes,
  getPanelScope,
  setFontSizes,
  type FontSizes,
} from '../../shared/extensionSettings'
import { applyPanelScope } from '../settingsMessaging'

interface SettingsModalProps {
  onClose: () => void
  onScopeChange: (scope: PanelScope) => void
  onFontSizesChange: (sizes: FontSizes) => void
}

export function SettingsModal({
  onClose,
  onScopeChange,
  onFontSizesChange,
}: SettingsModalProps) {
  const [scope, setScope] = useState<PanelScope>('always_open')
  const [inputFontSize, setInputFontSize] = useState(DEFAULT_INPUT_FONT_SIZE)
  const [conversationFontSize, setConversationFontSize] = useState(DEFAULT_CONVERSATION_FONT_SIZE)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([getPanelScope(), getFontSizes()])
      .then(([nextScope, sizes]) => {
        setScope(nextScope)
        setInputFontSize(sizes.inputFontSize)
        setConversationFontSize(sizes.conversationFontSize)
      })
      .catch(() => undefined)
      .finally(() => setLoading(false))
  }, [])

  const handleToggle = async (alwaysOpen: boolean) => {
    const nextScope: PanelScope = alwaysOpen ? 'always_open' : 'per_tab'
    if (nextScope === scope) return

    setSaving(true)
    setScope(nextScope)
    try {
      await applyPanelScope(nextScope)
      onScopeChange(nextScope)
    } catch {
      const previous = await getPanelScope()
      setScope(previous)
    } finally {
      setSaving(false)
    }
  }

  const persistFontSizes = async (next: FontSizes) => {
    setSaving(true)
    try {
      await setFontSizes(next)
      onFontSizesChange(next)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>

        <div className="settings-row">
          <div className="settings-row-text">
            <div className="settings-row-label">Keep open across tabs</div>
            <p className="settings-row-description">
              When enabled, the side panel stays open as you switch tabs and each tab keeps its
              own conversation. When disabled, the panel only appears on tabs where you open it.
            </p>
          </div>
          <label className="toggle settings-toggle">
            <input
              type="checkbox"
              checked={scope === 'always_open'}
              disabled={loading || saving}
              onChange={(e) => void handleToggle(e.target.checked)}
            />
          </label>
        </div>

        <div className="settings-row">
          <div className="settings-row-text">
            <div className="settings-row-label">Input font size</div>
            <p className="settings-row-description">Text size for the prompt box.</p>
          </div>
          <select
            className="settings-select"
            value={inputFontSize}
            disabled={loading || saving}
            onChange={(e) => {
              const value = Number(e.target.value)
              setInputFontSize(value)
              void persistFontSizes({ inputFontSize: value, conversationFontSize })
            }}
          >
            {FONT_SIZE_OPTIONS.map((size) => (
              <option key={`input-${size}`} value={size}>
                {size}px
              </option>
            ))}
          </select>
        </div>

        <div className="settings-row">
          <div className="settings-row-text">
            <div className="settings-row-label">Conversation font size</div>
            <p className="settings-row-description">Text size for model responses.</p>
          </div>
          <select
            className="settings-select"
            value={conversationFontSize}
            disabled={loading || saving}
            onChange={(e) => {
              const value = Number(e.target.value)
              setConversationFontSize(value)
              void persistFontSizes({ inputFontSize, conversationFontSize: value })
            }}
          >
            {FONT_SIZE_OPTIONS.map((size) => (
              <option key={`conversation-${size}`} value={size}>
                {size}px
              </option>
            ))}
          </select>
        </div>

        <button type="button" className="secondary" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}
