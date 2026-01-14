interface MockModeBannerProps {
  isAnonymous: boolean
  isDev?: boolean
}

/**
 * MockModeBanner - Displays a banner when mock mode is active
 * Shows different messages for authenticated users vs unregistered users
 */
export function MockModeBanner({ isAnonymous, isDev = false }: MockModeBannerProps) {
  return (
    <div className="mock-mode-banner">
      <div className="mock-mode-banner-content">
        <span className="mock-mode-icon">🎭</span>
        <span className="mock-mode-text">
          <strong>{isAnonymous ? 'Anonymous Mock Mode Active' : 'Mock Mode Active'}</strong> - Using
          test responses instead of real API calls
          {isDev && <span className="dev-mode-indicator"> (Dev Mode)</span>}
        </span>
      </div>
    </div>
  )
}
