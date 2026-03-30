/**
 * ComparisonPageContent - Main comparison view layout
 *
 * Composes the comparison form, model selection, and results into a single
 * section. Extracted from MainPage to reduce its size and improve clarity.
 */

import { useLayoutEffect, useRef } from 'react'
import type { ReactNode, RefObject } from 'react'

import { useComposerFloat } from '../../hooks/useComposerFloat'
import type { TutorialStep } from '../../hooks/useTutorial'
import type { CreditBalance } from '../../services/creditService'
import type { User, ModelsByProvider } from '../../types'
import type { ModelConversation } from '../../types/conversation'
import {
  ComparisonForm,
  ComparisonView,
  LoadingSection,
  type HistoryProps,
  type SelectionProps,
  type FileProps,
} from '../comparison'
import { Hero } from '../layout'
import { CreditWarningBanner, DismissibleErrorBanner, ErrorBoundary } from '../shared'
import { TrialExpiredBanner } from '../trial'

import type { ModelsAreaProps } from './ModelsArea'
import { ModelsArea } from './ModelsArea'
import type { ResultsAreaProps } from './ResultsArea'
import { ResultsArea } from './ResultsArea'

export interface ComparisonPageContentProps {
  // Form
  input: string
  setInput: (value: string) => void
  textareaRef: RefObject<HTMLTextAreaElement | null>
  isFollowUpMode: boolean
  isLoading: boolean
  isAnimatingButton: boolean
  isAnimatingTextarea: boolean
  isAuthenticated: boolean
  user: User | null
  conversations: ModelConversation[]
  historyProps: HistoryProps
  onSubmitClick: () => void
  onContinueConversation: () => void
  onNewComparison: () => void
  renderUsagePreview: () => ReactNode
  selectedModels: string[]
  modelsByProvider: ModelsByProvider
  onAccurateTokenCountChange?: (totalInputTokens: number | null) => void
  creditsRemaining: number
  selectionProps: SelectionProps
  fileProps: FileProps
  webSearchEnabled?: boolean
  onWebSearchEnabledChange?: (enabled: boolean) => void
  tutorialStep?: TutorialStep | null
  tutorialIsActive?: boolean
  modelsSectionRef?: RefObject<HTMLDivElement | null>

  // Credit warning
  creditWarningMessage: string | null
  creditWarningMessageRef: RefObject<HTMLDivElement | null>
  creditWarningDismissible: boolean
  creditBalance: CreditBalance | null
  onDismissCreditWarning: () => void

  // Error
  error: string | null
  errorMessageRef: RefObject<HTMLDivElement | null>

  // Vision notice (dismissible error banner for image/model conflicts)
  visionNoticeMessage: string | null
  onDismissVisionNotice: () => void

  // Models
  modelsAreaProps: ModelsAreaProps
  /** When provided, scrolls to models, expands section, opens Help me choose dropdown */
  onOpenHelpMeChoose?: (options?: { scrollToCategoryId?: string }) => void
  /** Block compare until image aspect/size matches all selected image models */
  imageGenerationSubmitBlocked?: boolean
  /** True when selected image models share no common aspect ratio + size (Advanced cannot fix) */
  imageGenerationNoSharedImageOptions?: boolean
  /** Called when user activates submit while blocked (e.g. image config conflict) */
  onImageGenerationSubmitBlockedTap?: () => void

  // Loading
  onCancel: () => void

  // Results
  showResults: boolean
  showFloatingComposer?: boolean
  resultsAreaProps: ResultsAreaProps
}

export function ComparisonPageContent({
  input,
  setInput,
  textareaRef,
  isFollowUpMode,
  isLoading,
  isAnimatingButton,
  isAnimatingTextarea,
  isAuthenticated,
  user,
  conversations,
  historyProps,
  onSubmitClick,
  onContinueConversation,
  onNewComparison,
  renderUsagePreview,
  selectedModels,
  modelsByProvider,
  onAccurateTokenCountChange,
  creditsRemaining,
  selectionProps,
  fileProps,
  webSearchEnabled,
  onWebSearchEnabledChange,
  tutorialStep,
  tutorialIsActive,
  modelsSectionRef,
  creditWarningMessage,
  creditWarningMessageRef,
  creditWarningDismissible,
  creditBalance,
  onDismissCreditWarning,
  error,
  errorMessageRef,
  visionNoticeMessage,
  onDismissVisionNotice,
  modelsAreaProps,
  onOpenHelpMeChoose,
  imageGenerationSubmitBlocked = false,
  imageGenerationNoSharedImageOptions = false,
  onImageGenerationSubmitBlockedTap,
  onCancel,
  showResults,
  showFloatingComposer = false,
  resultsAreaProps,
}: ComparisonPageContentProps) {
  const composerFloating = useComposerFloat(
    showFloatingComposer !== undefined ? showFloatingComposer : showResults,
    tutorialIsActive ?? false
  )

  const prevIsLoadingRef = useRef<boolean>(isLoading)

  // When the in-flow loading section disappears (on completion), it would normally pull
  // the results upward. If the user is currently anchored at the top of results, we
  // compensate before paint so the viewport stays visually stable.
  useLayoutEffect(() => {
    const wasLoading = prevIsLoadingRef.current
    prevIsLoadingRef.current = isLoading

    if (!wasLoading || isLoading || !showResults) return

    const resultsSection = document.querySelector('.results-section') as HTMLElement | null
    if (!resultsSection) return

    const top = resultsSection.getBoundingClientRect().top
    // Only correct small post-layout shifts (e.g. removing loading section or minor reflow).
    if (top < -8 && top > -320) {
      window.scrollBy({ top, left: 0, behavior: 'auto' })
    }
  }, [isLoading, showResults])

  return (
    <ComparisonView>
      <Hero>
        <ErrorBoundary>
          <ComparisonForm
            input={input}
            setInput={setInput}
            textareaRef={textareaRef}
            isFollowUpMode={isFollowUpMode}
            isLoading={isLoading}
            isAnimatingButton={isAnimatingButton}
            isAnimatingTextarea={isAnimatingTextarea}
            isAuthenticated={isAuthenticated}
            user={user}
            conversations={conversations}
            historyProps={historyProps}
            onSubmitClick={onSubmitClick}
            onContinueConversation={onContinueConversation}
            onNewComparison={onNewComparison}
            renderUsagePreview={renderUsagePreview}
            selectedModels={selectedModels}
            modelsByProvider={modelsByProvider}
            onAccurateTokenCountChange={onAccurateTokenCountChange}
            creditsRemaining={creditsRemaining}
            selectionProps={selectionProps}
            fileProps={fileProps}
            webSearchEnabled={webSearchEnabled}
            onWebSearchEnabledChange={onWebSearchEnabledChange}
            tutorialStep={tutorialStep}
            tutorialIsActive={tutorialIsActive}
            modelsSectionRef={modelsSectionRef}
            composerFloating={composerFloating}
            onOpenHelpMeChoose={onOpenHelpMeChoose}
            imageGenerationSubmitBlocked={imageGenerationSubmitBlocked}
            imageGenerationNoSharedImageOptions={imageGenerationNoSharedImageOptions}
            onImageGenerationSubmitBlockedTap={onImageGenerationSubmitBlockedTap}
          />
        </ErrorBoundary>
      </Hero>

      <CreditWarningBanner
        message={creditWarningMessage}
        messageRef={creditWarningMessageRef}
        isDismissible={creditWarningDismissible}
        creditBalance={creditBalance}
        onDismiss={onDismissCreditWarning}
      />

      <DismissibleErrorBanner message={visionNoticeMessage} onDismiss={onDismissVisionNotice} />

      {isAuthenticated && user?.trial_ends_at && !user?.is_trial_active && (
        <TrialExpiredBanner trialEndsAt={user.trial_ends_at} onDismiss={() => {}} />
      )}

      {error && !(visionNoticeMessage && error === 'Please select at least one model') && (
        <div className="error-message" ref={errorMessageRef as React.RefObject<HTMLDivElement>}>
          <span>⚠️ {error}</span>
        </div>
      )}

      <ModelsArea {...modelsAreaProps} />

      {isLoading && (
        <LoadingSection selectedModelsCount={selectedModels.length} onCancel={onCancel} />
      )}

      {showResults && <ResultsArea {...resultsAreaProps} />}
    </ComparisonView>
  )
}
