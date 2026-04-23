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
  closedCards: Set<string>
  allModels: Model[]
  activeResultTabs: ActiveResultTabs

  // Processing state
  modelProcessingStates: Record<string, boolean>
  modelErrorStates: Record<string, boolean>
  breakoutPhase: BreakoutPhase

  // UI state
  isScrollLocked: boolean
  showExportMenu: boolean
  isMobileLayout: boolean

  // Refs
  exportMenuRef: React.RefObject<HTMLDivElement>

  // Handlers
  onToggleScrollLock: () => void
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
  streamingReasoningByModel?: Record<string, string>
  streamAnswerStartedByModel?: Record<string, boolean>
}

export function ResultsArea({
  // Data
  conversations,
  closedCards,
  allModels,
  activeResultTabs,

  // Processing state
  modelProcessingStates,
  modelErrorStates,
  breakoutPhase,

  // UI state
  isScrollLocked,
  showExportMenu,
  isMobileLayout,

  // Refs
  exportMenuRef,

  // Handlers - Note: Types updated to match underlying component requirements
  onToggleScrollLock,
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
  streamingReasoningByModel = {},
  streamAnswerStartedByModel = {},
}: ResultsAreaProps) {
  return (
    <ErrorBoundary>
      <section className="results-section">
        <ResultsSectionHeader
          conversationsCount={conversations.length}
          isScrollLocked={isScrollLocked}
          onToggleScrollLock={onToggleScrollLock}
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
          streamingReasoningByModel={streamingReasoningByModel}
          streamAnswerStartedByModel={streamAnswerStartedByModel}
        />
      </section>
    </ErrorBoundary>
  )
}
