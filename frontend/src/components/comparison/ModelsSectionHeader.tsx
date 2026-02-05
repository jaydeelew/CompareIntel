import type { User, ModelConversation } from '../../types'

export interface ModelsSectionHeaderProps {
  /** Currently selected model IDs */
  selectedModels: string[]
  /** Maximum number of models allowed */
  maxModelsLimit: number
  /** Whether the models section is hidden/collapsed */
  isModelsHidden: boolean
  /** Whether in follow-up conversation mode */
  isFollowUpMode: boolean
  /** Whether user is authenticated */
  isAuthenticated: boolean
  /** Current user data */
  user: User | null
  /** Whether using wide layout (desktop) */
  isWideLayout: boolean
  /** Whether using mobile layout */
  isMobileLayout: boolean
  /** Whether premium models are hidden */
  hidePremiumModels: boolean
  /** Set of currently open provider dropdowns */
  openDropdowns: Set<string>
  /** Current response data (for clearing) */
  response: unknown
  /** Current conversations */
  conversations: ModelConversation[]
  /** Toggle models section visibility */
  onToggleModelsHidden: () => void
  /** Toggle premium models visibility */
  onToggleHidePremiumModels: () => void
  /** Show premium models toggle info modal */
  onShowPremiumModelsModal: () => void
  /** Collapse all provider dropdowns */
  onCollapseAllDropdowns: () => void
  /** Show disabled button info */
  onShowDisabledButtonInfo: (info: {
    button: 'collapse-all' | 'clear-all' | null
    message: string
  }) => void
  /** Clear all selected models */
  onClearAllModels: () => void
  /** Mark default selection as overridden */
  onSetDefaultSelectionOverridden: (overridden: boolean) => void
  /** Clear conversations */
  onClearConversations: () => void
  /** Clear response */
  onClearResponse: () => void
  /** Expand the models section */
  onExpandModelsSection: () => void
}

/**
 * Header component for the models selection section
 * Contains:
 * - Title and subtitle with tier info
 * - Hide premium models toggle (for free/unregistered tiers)
 * - Collapse all dropdowns button
 * - Clear all selections button
 * - Model count indicator
 * - Expand/collapse toggle
 */
export function ModelsSectionHeader({
  selectedModels,
  maxModelsLimit,
  isModelsHidden,
  isFollowUpMode,
  isAuthenticated,
  user,
  isWideLayout,
  isMobileLayout,
  hidePremiumModels,
  openDropdowns,
  response,
  conversations,
  onToggleModelsHidden,
  onToggleHidePremiumModels,
  onShowPremiumModelsModal,
  onCollapseAllDropdowns,
  onShowDisabledButtonInfo,
  onClearAllModels,
  onSetDefaultSelectionOverridden,
  onClearConversations,
  onClearResponse,
  onExpandModelsSection,
}: ModelsSectionHeaderProps) {
  // Get user tier for display and premium toggle visibility
  const userTier = isAuthenticated ? user?.subscription_tier || 'free' : 'unregistered'
  const showHidePremiumToggle = userTier === 'unregistered' || userTier === 'free'

  // Format tier name for display
  const formatTierName = () => {
    if (!isAuthenticated) return ' (Unregistered Tier)'
    if (!user?.subscription_tier) return ''
    const parts = user.subscription_tier
      .split('_')
      .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
    // Replace "Plus" with "+" when it appears after another word
    const formatted = parts.length > 1 && parts[1] === 'Plus' ? parts[0] + '+' : parts.join(' ')
    return ` (${formatted} Tier)`
  }

  // Handle premium models toggle click
  const handlePremiumToggleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    // On mobile layout, show info modal first (if not dismissed)
    if (isMobileLayout) {
      const dontShowAgain = localStorage.getItem('premium-models-toggle-info-dismissed')
      if (!dontShowAgain) {
        onShowPremiumModelsModal()
        return
      }
    }
    onToggleHidePremiumModels()
  }

  // Handle collapse all button click
  const handleCollapseAllClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    // On mobile layout, show info modal if button is disabled
    if (isMobileLayout && openDropdowns.size === 0) {
      onShowDisabledButtonInfo({
        button: 'collapse-all',
        message:
          'This button collapses all expanded model provider dropdowns. It is currently disabled because no provider dropdowns are expanded. Expand a provider dropdown first to use this feature.',
      })
      return
    }
    // Only execute if not disabled
    if (openDropdowns.size === 0) return
    onCollapseAllDropdowns()
  }

  // Handle clear all button click
  const handleClearAllClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    // On mobile layout, show info modal if button is disabled
    if (isMobileLayout && (selectedModels.length === 0 || isFollowUpMode)) {
      let message = ''
      if (isFollowUpMode) {
        message =
          'This button clears all selected models. It is currently disabled because you are in follow-up mode. Exit follow-up mode to clear your selections.'
      } else {
        message =
          'This button clears all selected models from your comparison. It is currently disabled because no models are selected. Select at least one model first to use this feature.'
      }
      onShowDisabledButtonInfo({
        button: 'clear-all',
        message,
      })
      return
    }
    // Only execute if not disabled
    if (selectedModels.length === 0 || isFollowUpMode) return
    onClearAllModels()
    // Mark default selection as overridden so it doesn't auto-reload
    onSetDefaultSelectionOverridden(true)
    // Clear comparison results if they exist
    if (response || conversations.length > 0) {
      onClearConversations()
      onClearResponse()
    }
    // Expand the models section
    onExpandModelsSection()
  }

  return (
    <div
      className="models-section-header"
      data-has-models={selectedModels.length > 0 && isWideLayout ? 'true' : undefined}
      onClick={onToggleModelsHidden}
      style={{
        // On wide layout, reserve space for the selected models column
        ...(isWideLayout && selectedModels.length > 0
          ? { paddingRight: 'calc(340px + 2rem + 2.5rem)' }
          : {}),
        ...(isWideLayout && selectedModels.length === 0
          ? { paddingRight: isModelsHidden ? 'calc(36px + 2rem)' : '0' }
          : {}),
        alignItems: 'center',
      }}
    >
      <div className="models-header-title">
        <h2 style={{ margin: 0 }}>
          {isFollowUpMode ? 'Selected Models (Follow-up Mode)' : 'Select Models to Compare'}
        </h2>
        <p
          style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}
        >
          {isFollowUpMode
            ? 'You can deselect models or reselect previously selected ones (minimum 1 model required)'
            : `Choose up to ${maxModelsLimit} models${formatTierName()}`}
        </p>
      </div>
      <div
        className="models-header-controls"
        style={{
          justifyContent: isWideLayout ? 'flex-end' : undefined,
          alignSelf: isWideLayout ? 'center' : undefined,
          marginLeft: isWideLayout ? 'auto' : undefined,
          marginTop: 0,
          position: isWideLayout ? 'absolute' : undefined,
          top: isWideLayout ? '50%' : undefined,
          right: isWideLayout ? '1rem' : undefined,
          transform: isWideLayout ? 'translateY(-50%)' : undefined,
        }}
      >
        <div className="models-header-buttons">
          {/* Hide Premium Models Toggle - only for anonymous and free tiers */}
          {showHidePremiumToggle && (
            <button
              className={`hide-premium-button ${hidePremiumModels ? 'active' : ''}`}
              onClick={handlePremiumToggleClick}
              title={hidePremiumModels ? 'Show premium models' : 'Hide premium models'}
              aria-label={hidePremiumModels ? 'Show premium models' : 'Hide premium models'}
            >
              {hidePremiumModels ? (
                /* Eye-off icon (hiding premium models) */
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                  preserveAspectRatio="xMidYMid meet"
                >
                  <path
                    d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
                    strokeWidth="1"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <line
                    x1="1"
                    y1="1"
                    x2="23"
                    y2="23"
                    strokeWidth="1"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                /* Eye icon (showing all models) */
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                  preserveAspectRatio="xMidYMid meet"
                >
                  <path
                    d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
                    strokeWidth="1"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle
                    cx="12"
                    cy="12"
                    r="3"
                    strokeWidth="1"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          )}
          <button
            className={`collapse-all-button ${isMobileLayout && openDropdowns.size === 0 ? 'touch-disabled' : ''}`}
            onClick={handleCollapseAllClick}
            disabled={!isMobileLayout && openDropdowns.size === 0}
            title="Collapse all model providers"
            aria-label="Collapse all model providers"
          >
            {/* Double chevrons up icon (collapse all) */}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
              preserveAspectRatio="xMidYMid meet"
            >
              <path
                d="M7 13l5-5 5 5M7 18l5-5 5 5"
                strokeWidth="1"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            className={`clear-all-button ${isMobileLayout && (selectedModels.length === 0 || isFollowUpMode) ? 'touch-disabled' : ''}`}
            onClick={handleClearAllClick}
            disabled={!isMobileLayout && (selectedModels.length === 0 || isFollowUpMode)}
            title={isFollowUpMode ? 'Cannot clear models during follow-up' : 'Clear all selections'}
            aria-label={
              isFollowUpMode ? 'Cannot clear models during follow-up' : 'Clear all selections'
            }
          >
            {/* Square with X icon (deselect all) */}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
              preserveAspectRatio="xMidYMid meet"
            >
              <rect
                x="5"
                y="5"
                width="14"
                height="14"
                strokeWidth="1"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M9 9l6 6M15 9l-6 6"
                strokeWidth="1"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
        <div className="models-header-right">
          <div
            className={`models-count-indicator ${selectedModels.length > 0 ? 'has-selected' : 'empty'}`}
            title="Total selections"
            onClick={e => e.stopPropagation()}
          >
            {selectedModels.length} of {maxModelsLimit} selected
          </div>
          <button
            className="models-toggle-arrow"
            onClick={e => {
              e.stopPropagation()
              onToggleModelsHidden()
            }}
            style={{
              padding: '0.5rem',
              fontSize: '1.25rem',
              border: 'none',
              outline: 'none',
              boxShadow: 'none',
              background: 'var(--bg-primary)',
              color: 'var(--primary-color)',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '36px',
              height: '36px',
              fontWeight: 'bold',
            }}
            title={isModelsHidden ? 'Show model selection' : 'Hide model selection'}
          >
            {isModelsHidden ? '▼' : '▲'}
          </button>
        </div>
      </div>
    </div>
  )
}
