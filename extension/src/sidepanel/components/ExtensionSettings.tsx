import browser from 'webextension-polyfill'

interface ExtensionSettingsProps {
  onClose: () => void
  onLogout: () => void
  onOpenBilling: () => void
  userEmail?: string
}

export function ExtensionSettings({
  onClose,
  onLogout,
  onOpenBilling,
  userEmail,
}: ExtensionSettingsProps) {
  const openWebApp = () => {
    browser.tabs.create({ url: 'https://compareintel.com' })
  }

  const openHelp = () => {
    browser.tabs.create({ url: 'https://compareintel.com/help-me-choose-methodology' })
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>
        {userEmail && <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>{userEmail}</p>}
        <div className="settings-section">
          <button type="button" className="secondary" onClick={openWebApp}>
            Open CompareIntel web app
          </button>
          <button type="button" className="secondary" onClick={openHelp}>
            Help Me Choose methodology
          </button>
          <button type="button" className="secondary" onClick={onOpenBilling}>
            Billing &amp; upgrade
          </button>
          {userEmail && (
            <button type="button" className="secondary" onClick={onLogout}>
              Sign out
            </button>
          )}
        </div>
        <button type="button" className="ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}
