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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { isVerdictPanelEnabled } from '../../config/featureFlags'
import type { ExportFormat } from '../../hooks/useExport'
import type { Model, ActiveResultTabs, ResultTab } from '../../types'
import type { ModelConversation } from '../../types/conversation'
import { modelDisplayLabel } from '../../utils/retiredConversationModels'
import {
  comparisonFinishedForVerdict,
  successfulVerdictModelIds,
  toggleFavorite,
  verdictControlsVisible,
  verdictTurnKey,
} from '../../utils/verdictSession'
import { ResultsDisplay, ResultsSectionHeader, VerdictButton, VerdictPanel } from '../comparison'
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
  /** True while a comparison request is in flight (model-tab auto-focus). */
  isComparisonLoading?: boolean

  // UI state
  isScrollLocked: boolean
  showExportMenu: boolean
  isMobileLayout: boolean
  /** When true, disables all result action buttons (not model tabs or formatted/raw tabs) */
  isTutorialActive?: boolean

  // Refs
  exportMenuRef: React.RefObject<HTMLDivElement>

  // Handlers
  onToggleScrollLock: () => void
  onToggleExportMenu: () => void
  onExport: (format: ExportFormat) => Promise<void>
  onShare?: () => void
  isSharing?: boolean
  canShare?: boolean
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
  /** Mobile capability demo: draw attention to model switcher tabs */
  highlightMobileCapabilityDemoModelTabs?: boolean
  onDismissMobileCapabilityDemoModelTabsHighlight?: () => void
  /** Bumps each time guided tutorial begins (resets mobile swipe hint between sessions). */
  tutorialSwipeHintNonce?: number
  /** Bumps when a capability-demo comparison finishes with tabbed multi-model results (Try a comparison). */
  capabilitySwipeHintNonce?: number
  /** Open Help Me Choose, optionally scrolled to a category */
  onOpenHelpMeChoose?: (options?: { scrollToCategoryId?: string }) => void
  webSearchEnabled?: boolean
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
  isComparisonLoading = false,

  // UI state
  isScrollLocked,
  showExportMenu,
  isMobileLayout,
  isTutorialActive = false,

  // Refs
  exportMenuRef,

  // Handlers - Note: Types updated to match underlying component requirements
  onToggleScrollLock,
  onToggleExportMenu,
  onExport,
  onShare,
  isSharing = false,
  canShare = true,
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
  highlightMobileCapabilityDemoModelTabs = false,
  onDismissMobileCapabilityDemoModelTabsHighlight,
  tutorialSwipeHintNonce = 0,
  capabilitySwipeHintNonce = 0,
  onOpenHelpMeChoose,
  webSearchEnabled = false,
}: ResultsAreaProps) {
  const verdictEnabled = isVerdictPanelEnabled()
  const finished = comparisonFinishedForVerdict(
    conversations,
    modelProcessingStates,
    isComparisonLoading
  )
  const successIds = useMemo(
    () => successfulVerdictModelIds(conversations, modelErrorStates),
    [conversations, modelErrorStates]
  )
  const showVerdictControls = verdictControlsVisible({
    enabled: verdictEnabled,
    tutorialActive: isTutorialActive,
    finished,
    successCount: successIds.length,
  })
  const turnKey = useMemo(() => verdictTurnKey(conversations), [conversations])
  const [favoriteModelId, setFavoriteModelId] = useState<string | null>(null)
  const [verdictOpen, setVerdictOpen] = useState(false)
  const prevTurnKey = useRef(turnKey)

  useEffect(() => {
    if (prevTurnKey.current === turnKey) return
    prevTurnKey.current = turnKey
    setFavoriteModelId(null)
    setVerdictOpen(false)
  }, [turnKey])

  useEffect(() => {
    if (!showVerdictControls) setVerdictOpen(false)
  }, [showVerdictControls])

  const favoriteModelName = favoriteModelId
    ? modelDisplayLabel(
        favoriteModelId,
        allModels,
        conversations.find(conversation => conversation.modelId === favoriteModelId)?.modelName
      )
    : null

  const scrollToResultCards = useCallback(() => {
    const reduced =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const target = document.querySelector('.results-display-host .result-card, .result-card')
    target?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' })
    setVerdictOpen(false)
  }, [])

  const toggleVerdict = useCallback(() => {
    setVerdictOpen(open => !open)
  }, [])

  const closeVerdict = useCallback(() => {
    setVerdictOpen(false)
  }, [])

  const onToggleFavorite = useCallback((modelId: string) => {
    setFavoriteModelId(current => toggleFavorite(current, modelId))
  }, [])

  const favoriteModelIds = useMemo(
    () => (showVerdictControls ? new Set(successIds) : new Set<string>()),
    [showVerdictControls, successIds]
  )

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
          onShare={onShare}
          isSharing={isSharing}
          canShare={canShare}
          closedCardsCount={closedCards.size}
          onShowAllResults={onShowAllResults}
          isMobileLayout={isMobileLayout}
          isTutorialActive={isTutorialActive}
          verdictButton={
            showVerdictControls ? (
              <VerdictButton open={verdictOpen} onToggle={toggleVerdict} />
            ) : null
          }
        />

        {showVerdictControls && (
          <VerdictPanel
            open={verdictOpen}
            onClose={closeVerdict}
            conversations={conversations}
            allModels={allModels}
            modelErrorStates={modelErrorStates}
            favoriteModelName={favoriteModelId ? favoriteModelName : null}
            onPickFavorite={scrollToResultCards}
            variant={isMobileLayout ? 'sheet' : 'popover'}
            onOpenHelpMeChoose={onOpenHelpMeChoose}
          />
        )}

        <div className="results-display-host">
          <ResultsDisplay
            conversations={conversations}
            closedCards={closedCards}
            allModels={allModels}
            activeResultTabs={activeResultTabs}
            modelProcessingStates={modelProcessingStates}
            modelErrorStates={modelErrorStates}
            breakoutPhase={breakoutPhase}
            isComparisonLoading={isComparisonLoading}
            onScreenshot={onScreenshot}
            onCopyResponse={onCopyResponse}
            onCloseCard={onCloseCard}
            onSwitchTab={onSwitchTab}
            onBreakout={onBreakout}
            onHideOthers={onHideOthers}
            onCopyMessage={onCopyMessage}
            isTutorialActive={isTutorialActive}
            streamingReasoningByModel={streamingReasoningByModel}
            streamAnswerStartedByModel={streamAnswerStartedByModel}
            highlightMobileCapabilityDemoModelTabs={highlightMobileCapabilityDemoModelTabs}
            onDismissMobileCapabilityDemoModelTabsHighlight={
              onDismissMobileCapabilityDemoModelTabsHighlight
            }
            tutorialSwipeHintNonce={tutorialSwipeHintNonce}
            capabilitySwipeHintNonce={capabilitySwipeHintNonce}
            webSearchEnabled={webSearchEnabled}
            favoriteModelIds={favoriteModelIds}
            favoriteModelId={showVerdictControls ? favoriteModelId : null}
            onToggleFavorite={showVerdictControls ? onToggleFavorite : undefined}
          />
        </div>
      </section>
    </ErrorBoundary>
  )
}
