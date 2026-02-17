/**
 * ComparisonPageContent - Main comparison view layout
 *
 * Composes the comparison form, model selection, and results into a single
 * section. Extracted from MainPage to reduce its size and improve clarity.
 */

import type { ReactNode, RefObject } from 'react'

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
import { CreditWarningBanner, ErrorBoundary } from '../shared'
import { TrialExpiredBanner } from '../trial'

import type { ModelsAreaProps } from './ModelsArea'
import { ModelsArea } from './ModelsArea'
import type { ResultsAreaProps } from './ResultsArea'
import { ResultsArea } from './ResultsArea'

export interface ComparisonPageContentProps {
  // Hero / tooltip
  visibleTooltip: string | null
  onCapabilityTileTap: (capability: string) => void

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

  // Models
  modelsAreaProps: ModelsAreaProps

  // Loading
  onCancel: () => void

  // Results
  showResults: boolean
  resultsAreaProps: ResultsAreaProps
}

export function ComparisonPageContent({
  visibleTooltip,
  onCapabilityTileTap,
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
  modelsAreaProps,
  onCancel,
  showResults,
  resultsAreaProps,
}: ComparisonPageContentProps) {
  return (
    <ComparisonView>
      <Hero visibleTooltip={visibleTooltip} onCapabilityTileTap={onCapabilityTileTap}>
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

      {isAuthenticated && user?.trial_ends_at && !user?.is_trial_active && (
        <TrialExpiredBanner trialEndsAt={user.trial_ends_at} onDismiss={() => {}} />
      )}

      {error && (
        <div className="error-message" ref={errorMessageRef}>
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
