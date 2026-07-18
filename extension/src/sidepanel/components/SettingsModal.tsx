import { useEffect, useState } from 'react'

import type { PanelScope } from '../../shared/extensionSettings'
import { getPanelScope } from '../../shared/extensionSettings'
import { applyPanelScope } from '../settingsMessaging'

interface SettingsModalProps {
  onClose: () => void
  onScopeChange: (scope: PanelScope) => void
}

export function SettingsModal({ onClose, onScopeChange }: SettingsModalProps) {
  const [scope, setScope] = useState<PanelScope>('always_open')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getPanelScope()
      .then((value) => setScope(value))
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

        <button type="button" className="secondary" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}
