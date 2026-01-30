/**
 * ResultsArea - Comparison results section component
 *
 * Encapsulates the results UI including:
 * - Results section header with controls
 * - Results display with conversation cards
 *
 * This component reduces MainPage complexity by owning
 * the results-related UI logic.
 */

import type { ExportFormat } from '../../hooks/useExport'
import type { Model, ActiveResultTabs, ResultTab } from '../../types'
import type { ModelConversation } from '../../types/conversation'
import { ResultsDisplay, ResultsSectionHeader } from '../comparison'
import { ErrorBoundary } from '../shared'

/** Breakout animation phase type */
type BreakoutPhase = 'idle' | 'fading-out' | 'hidden' | 'fading-in'

export interface ResultsAreaProps {
  // Data
  conversations: ModelConversation[]
  selectedModels: string[]
  closedCards: Set<string>
  allModels: Model[]
  activeResultTabs: ActiveResultTabs

  // Processing state
  modelProcessingStates: Record<string, boolean>
  modelErrorStates: Record<string, boolean>
  breakoutPhase: BreakoutPhase

  // UI state
  isScrollLocked: boolean
  isFollowUpMode: boolean
  isFollowUpDisabled: boolean
  followUpDisabledReason: string
  showExportMenu: boolean
  isMobileLayout: boolean

  // Refs
  exportMenuRef: React.RefObject<HTMLDivElement>

  // Handlers
  onToggleScrollLock: () => void
  onFollowUp: () => void
  onToggleExportMenu: () => void
  onExport: (format: ExportFormat) => Promise<void>
  onShowAllResults: () => void
  onScreenshot: (modelId: string) => void
  onCopyResponse: (modelId: string) => void
  onCloseCard: (modelId: string) => void
  onSwitchTab: (modelId: string, tab: ResultTab) => void
  onBreakout: (modelId: string) => void
  onHideOthers: (modelId: string) => void
  onCopyMessage: (modelId: string, messageId: string, content: string) => void
}

export function ResultsArea({
  // Data
  conversations,
  selectedModels,
  closedCards,
  allModels,
  activeResultTabs,

  // Processing state
  modelProcessingStates,
  modelErrorStates,
  breakoutPhase,

  // UI state
  isScrollLocked,
  isFollowUpMode,
  isFollowUpDisabled,
  followUpDisabledReason,
  showExportMenu,
  isMobileLayout,

  // Refs
  exportMenuRef,

  // Handlers - Note: Types updated to match underlying component requirements
  onToggleScrollLock,
  onFollowUp,
  onToggleExportMenu,
  onExport,
  onShowAllResults,
  onScreenshot,
  onCopyResponse,
  onCloseCard,
  onSwitchTab,
  onBreakout,
  onHideOthers,
  onCopyMessage,
}: ResultsAreaProps) {
  return (
    <ErrorBoundary>
      <section className="results-section">
        <ResultsSectionHeader
          conversationsCount={conversations.length}
          isScrollLocked={isScrollLocked}
          onToggleScrollLock={onToggleScrollLock}
          isFollowUpMode={isFollowUpMode}
          isFollowUpDisabled={isFollowUpDisabled}
          followUpDisabledReason={followUpDisabledReason}
          onFollowUp={onFollowUp}
          showExportMenu={showExportMenu}
          onToggleExportMenu={onToggleExportMenu}
          exportMenuRef={exportMenuRef}
          onExport={onExport}
          closedCardsCount={closedCards.size}
          onShowAllResults={onShowAllResults}
          isMobileLayout={isMobileLayout}
        />

        <ResultsDisplay
          conversations={conversations}
          selectedModels={selectedModels}
          closedCards={closedCards}
          allModels={allModels}
          activeResultTabs={activeResultTabs}
          modelProcessingStates={modelProcessingStates}
          modelErrorStates={modelErrorStates}
          breakoutPhase={breakoutPhase}
          onScreenshot={onScreenshot}
          onCopyResponse={onCopyResponse}
          onCloseCard={onCloseCard}
          onSwitchTab={onSwitchTab}
          onBreakout={onBreakout}
          onHideOthers={onHideOthers}
          onCopyMessage={onCopyMessage}
        />
      </section>
    </ErrorBoundary>
  )
}
