import { useEffect } from 'react'

interface ExtensionSignedInBannerProps {
  visible: boolean
  onDismiss: () => void
}

function SignedInCheckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 6 9 17l-5-5"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function DismissIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M18 6 6 18M6 6l12 12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ExtensionSignedInBanner({ visible, onDismiss }: ExtensionSignedInBannerProps) {
  useEffect(() => {
    if (!visible) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return
      onDismiss()
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [visible, onDismiss])

  if (!visible) return null

  return (
    <div
      className="extension-signed-in-banner"
      role="status"
      aria-labelledby="extension-signed-in-title"
      aria-describedby="extension-signed-in-message"
    >
      <div className="extension-signed-in-banner-icon">
        <SignedInCheckIcon />
      </div>
      <div className="extension-signed-in-banner-copy">
        <p id="extension-signed-in-title" className="extension-signed-in-banner-title">
          You&apos;re signed in
        </p>
        <p id="extension-signed-in-message" className="extension-signed-in-banner-message">
          You can close this tab and return to the extension.
        </p>
      </div>
      <button
        type="button"
        className="extension-signed-in-banner-dismiss"
        onClick={onDismiss}
        aria-label="Dismiss signed-in notification"
      >
        <DismissIcon />
      </button>
    </div>
  )
}
