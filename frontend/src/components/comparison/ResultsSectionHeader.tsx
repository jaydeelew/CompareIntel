/**
 * ResultsSectionHeader Component
 *
 * Renders the header for the comparison results section including:
 * - Title "Comparison Results"
 * - Scroll Lock toggle (for multi-model comparisons)
 * - Follow Up button
 * - Export dropdown (PDF, Markdown, HTML, JSON)
 * - Show All Results button (when cards are hidden)
 *
 * Handles both desktop (full text) and mobile (icon-only) layouts.
 *
 * Extracted from App.tsx to improve code organization.
 * Created: January 21, 2026
 */

import type { ExportFormat } from '../../hooks/useExport'

interface ResultsSectionHeaderProps {
  /** Number of conversations (model cards) currently displayed */
  conversationsCount: number
  /** Whether scroll lock is enabled (all cards scroll together) */
  isScrollLocked: boolean
  /** Toggle scroll lock state */
  onToggleScrollLock: () => void
  /** Whether follow-up mode is active */
  isFollowUpMode: boolean
  /** Whether follow-up is disabled (e.g., new models added) */
  isFollowUpDisabled: boolean
  /** Reason why follow-up is disabled (for tooltip) */
  followUpDisabledReason: string
  /** Callback to enter follow-up mode */
  onFollowUp: () => void
  /** Whether export menu is open */
  showExportMenu: boolean
  /** Toggle export menu visibility */
  onToggleExportMenu: () => void
  /** Ref for export menu (for click-outside detection) */
  exportMenuRef: React.RefObject<HTMLDivElement>
  /** Handle export in specified format */
  onExport: (format: ExportFormat) => Promise<void>
  /** Number of hidden cards */
  closedCardsCount: number
  /** Callback to show all hidden results */
  onShowAllResults: () => void
  /** Whether in mobile layout */
  isMobileLayout: boolean
  /** When true, disables all header buttons (tutorial mode) */
  isTutorialActive?: boolean
}

export function ResultsSectionHeader({
  conversationsCount,
  isScrollLocked,
  onToggleScrollLock,
  isFollowUpMode,
  isFollowUpDisabled,
  followUpDisabledReason,
  onFollowUp,
  showExportMenu,
  onToggleExportMenu,
  exportMenuRef,
  onExport,
  closedCardsCount,
  onShowAllResults,
  isMobileLayout,
  isTutorialActive = false,
}: ResultsSectionHeaderProps) {
  const buttonsDisabled = isTutorialActive
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '1.5rem',
        gap: '0.75rem',
      }}
    >
      <h2 style={{ margin: 0 }}>Comparison Results</h2>
      <div
        style={{
          display: 'flex',
          gap: isMobileLayout ? '0.5rem' : '0.75rem',
          alignItems: 'center',
          flexWrap: 'nowrap',
        }}
      >
        {/* Desktop: Scroll Lock, Follow up, Export */}
        {!isMobileLayout && (
          <>
            {/* Scroll Lock Toggle - Only show when multiple models are running */}
            {conversationsCount > 1 && (
              <button
                onClick={onToggleScrollLock}
                disabled={buttonsDisabled}
                style={{
                  padding: '0.5rem 0.75rem',
                  fontSize: '0.875rem',
                  border: '1px solid ' + (isScrollLocked ? 'var(--primary-color)' : '#cccccc'),
                  background: isScrollLocked ? 'var(--primary-color)' : 'transparent',
                  color: isScrollLocked ? 'white' : '#666',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  outline: 'none',
                }}
                title={
                  isScrollLocked
                    ? 'Unlock scrolling - Each card scrolls independently'
                    : 'Lock scrolling - All cards scroll together'
                }
                onMouseOver={e => {
                  if (!isScrollLocked) {
                    e.currentTarget.style.borderColor = '#999'
                    e.currentTarget.style.color = '#333'
                  }
                }}
                onMouseOut={e => {
                  if (!isScrollLocked) {
                    e.currentTarget.style.borderColor = '#cccccc'
                    e.currentTarget.style.color = '#666'
                  }
                }}
              >
                <span>Scroll</span>
                {isScrollLocked ? (
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
                    <rect x="5" y="11" width="14" height="10" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                ) : (
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
                    <rect x="5" y="11" width="14" height="10" rx="2" ry="2" />
                    <line x1="7" y1="11" x2="7" y2="7" />
                  </svg>
                )}
              </button>
            )}
            {!isFollowUpMode && (
              <button
                onClick={onFollowUp}
                className="follow-up-button"
                title={isFollowUpDisabled ? followUpDisabledReason : 'Ask a follow-up question'}
                disabled={isFollowUpDisabled}
              >
                Follow up
              </button>
            )}

            {/* Export Dropdown for desktop */}
            <ExportDropdown
              showExportMenu={showExportMenu}
              onToggleExportMenu={onToggleExportMenu}
              exportMenuRef={exportMenuRef}
              onExport={onExport}
              isMobileLayout={false}
              disabled={buttonsDisabled}
            />

            {/* Show all results button for desktop */}
            {closedCardsCount > 0 && (
              <button
                onClick={onShowAllResults}
                disabled={buttonsDisabled}
                style={{
                  padding: '0.5rem 1rem',
                  fontSize: '0.875rem',
                  border: '1px solid var(--primary-color)',
                  background: 'var(--primary-color)',
                  color: 'white',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  fontWeight: '500',
                  whiteSpace: 'normal',
                  lineHeight: '1.4',
                  textAlign: 'center',
                }}
                onMouseOver={e => {
                  e.currentTarget.style.background = 'var(--primary-hover)'
                  e.currentTarget.style.borderColor = 'var(--primary-hover)'
                }}
                onMouseOut={e => {
                  e.currentTarget.style.background = 'var(--primary-color)'
                  e.currentTarget.style.borderColor = 'var(--primary-color)'
                }}
              >
                <span style={{ whiteSpace: 'nowrap' }}>Show All Results</span>{' '}
                <span style={{ whiteSpace: 'nowrap' }}>({closedCardsCount} hidden)</span>
              </button>
            )}
          </>
        )}

        {/* Mobile: Icon-only buttons on same line */}
        {isMobileLayout && (
          <>
            {/* Follow up button - icon only */}
            {!isFollowUpMode && (
              <button
                onClick={onFollowUp}
                className="follow-up-button"
                title={isFollowUpDisabled ? followUpDisabledReason : 'Ask a follow-up question'}
                disabled={isFollowUpDisabled}
                style={{
                  padding: '0.5rem',
                  minWidth: '36px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
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
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  <line x1="9" y1="10" x2="15" y2="10" />
                  <line x1="12" y1="7" x2="12" y2="13" />
                </svg>
              </button>
            )}

            {/* Export Dropdown - icon only */}
            <ExportDropdown
              showExportMenu={showExportMenu}
              onToggleExportMenu={onToggleExportMenu}
              exportMenuRef={exportMenuRef}
              onExport={onExport}
              isMobileLayout={true}
              disabled={buttonsDisabled}
            />

            {/* Show all results button - icon only */}
            {closedCardsCount > 0 && (
              <button
                onClick={onShowAllResults}
                disabled={buttonsDisabled}
                title={`Show all results (${closedCardsCount} hidden)`}
                style={{
                  padding: '0.5rem',
                  minWidth: '36px',
                  fontSize: '0.875rem',
                  border: '1px solid var(--primary-color)',
                  background: 'var(--primary-color)',
                  color: 'white',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onMouseOver={e => {
                  e.currentTarget.style.background = 'var(--primary-hover)'
                  e.currentTarget.style.borderColor = 'var(--primary-hover)'
                }}
                onMouseOut={e => {
                  e.currentTarget.style.background = 'var(--primary-color)'
                  e.currentTarget.style.borderColor = 'var(--primary-color)'
                }}
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
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Export Dropdown Sub-component
 * Renders the export button with dropdown menu for PDF, Markdown, HTML, JSON exports
 */
interface ExportDropdownProps {
  showExportMenu: boolean
  onToggleExportMenu: () => void
  exportMenuRef: React.RefObject<HTMLDivElement>
  onExport: (format: ExportFormat) => Promise<void>
  isMobileLayout: boolean
  disabled?: boolean
}

function ExportDropdown({
  showExportMenu,
  onToggleExportMenu,
  exportMenuRef,
  onExport,
  isMobileLayout,
  disabled = false,
}: ExportDropdownProps) {
  return (
    <div className="export-dropdown-container" ref={exportMenuRef}>
      <button
        onClick={onToggleExportMenu}
        className="follow-up-button export-dropdown-trigger"
        title="Export comparison"
        disabled={disabled}
        aria-expanded={showExportMenu}
        aria-haspopup="true"
        style={
          isMobileLayout
            ? {
                padding: '0.5rem',
                minWidth: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }
            : undefined
        }
      >
        <svg
          width={isMobileLayout ? '18' : '16'}
          height={isMobileLayout ? '18' : '16'}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        {!isMobileLayout && (
          <>
            <span>Export</span>
            <svg
              className={`export-dropdown-arrow ${showExportMenu ? 'open' : ''}`}
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </>
        )}
      </button>
      {showExportMenu && (
        <div className="export-dropdown-menu" role="menu">
          <button
            onClick={() => onExport('pdf')}
            disabled={disabled}
            className="export-dropdown-item"
            role="menuitem"
            title="Best for sharing & printing"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <path d="M9 13h6" />
              <path d="M9 17h6" />
            </svg>
            <div className="export-dropdown-item-content">
              <span className="export-dropdown-item-title">PDF</span>
            </div>
          </button>
          <button
            onClick={() => onExport('markdown')}
            disabled={disabled}
            className="export-dropdown-item"
            role="menuitem"
            title="For docs & note apps"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <path d="M12 18v-6" />
              <path d="M9 15l3-3 3 3" />
            </svg>
            <div className="export-dropdown-item-content">
              <span className="export-dropdown-item-title">Markdown</span>
            </div>
          </button>
          <button
            onClick={() => onExport('html')}
            disabled={disabled}
            className="export-dropdown-item"
            role="menuitem"
            title="Standalone web page"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
            <div className="export-dropdown-item-content">
              <span className="export-dropdown-item-title">HTML</span>
            </div>
          </button>
          <button
            onClick={() => onExport('json')}
            disabled={disabled}
            className="export-dropdown-item"
            role="menuitem"
            title="For developers & APIs"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <path d="M8 13h2" />
              <path d="M8 17h2" />
              <path d="M14 13h2" />
              <path d="M14 17h2" />
            </svg>
            <div className="export-dropdown-item-content">
              <span className="export-dropdown-item-title">JSON</span>
            </div>
          </button>
        </div>
      )}
    </div>
  )
}
