/**
 * ModelsArea - Model selection section component
 *
 * Encapsulates the model selection UI including:
 * - Models section header with controls
 * - Provider dropdowns with model toggles
 *
 * This component reduces MainPage complexity by owning
 * the models-related UI logic.
 */

import type { User, ModelsByProvider, CompareResponse, Model } from '../../types'
import type { ModelConversation } from '../../types/conversation'
import { ModelsSection, ModelsSectionHeader } from '../comparison'
import { ErrorBoundary } from '../shared'

export interface ModelsAreaProps {
  // Data
  modelsByProvider: ModelsByProvider
  selectedModels: string[]
  originalSelectedModels: string[]
  openDropdowns: Set<string>
  allModels: Model[]
  isLoadingModels: boolean

  // State
  isFollowUpMode: boolean
  maxModelsLimit: number
  hidePremiumModels: boolean
  isModelsHidden: boolean
  isAuthenticated: boolean
  user: User | null

  // Layout
  isWideLayout: boolean
  isMobileLayout: boolean

  // Comparison state (for header)
  response: CompareResponse | null
  conversations: ModelConversation[]

  // Refs
  modelsSectionRef: React.RefObject<HTMLDivElement>
  selectedModelsGridRef: React.RefObject<HTMLDivElement>

  // Handlers
  onToggleDropdown: (provider: string) => void
  onToggleModel: (modelId: string) => void
  onToggleAllForProvider: (provider: string) => void
  onToggleModelsHidden: () => void
  onToggleHidePremiumModels: () => void
  onShowPremiumModelsModal: () => void
  onCollapseAllDropdowns: () => void
  onShowDisabledButtonInfo: (info: {
    button: 'collapse-all' | 'clear-all' | null
    message: string
  }) => void
  onClearAllModels: () => void
  onSetDefaultSelectionOverridden: (overridden: boolean) => void
  onClearConversations: () => void
  onClearResponse: () => void
  onExpandModelsSection: () => void
  onError: (error: string | null) => void
  onRetryModels?: () => void
  onShowDisabledModelModal?: (info: {
    userTier: 'unregistered' | 'free'
    modelTierAccess: 'free' | 'paid'
    modelName?: string
  }) => void
}

export function ModelsArea({
  // Data
  modelsByProvider,
  selectedModels,
  originalSelectedModels,
  openDropdowns,
  allModels,
  isLoadingModels,

  // State
  isFollowUpMode,
  maxModelsLimit,
  hidePremiumModels,
  isModelsHidden,
  isAuthenticated,
  user,

  // Layout
  isWideLayout,
  isMobileLayout,

  // Comparison state
  response,
  conversations,

  // Refs
  modelsSectionRef,
  selectedModelsGridRef,

  // Handlers
  onToggleDropdown,
  onToggleModel,
  onToggleAllForProvider,
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
  onError,
  onRetryModels,
  onShowDisabledModelModal,
}: ModelsAreaProps) {
  return (
    <ErrorBoundary>
      <section className="models-section" ref={modelsSectionRef}>
        <ModelsSectionHeader
          selectedModels={selectedModels}
          maxModelsLimit={maxModelsLimit}
          isModelsHidden={isModelsHidden}
          isFollowUpMode={isFollowUpMode}
          isAuthenticated={isAuthenticated}
          user={user}
          isWideLayout={isWideLayout}
          isMobileLayout={isMobileLayout}
          hidePremiumModels={hidePremiumModels}
          openDropdowns={openDropdowns}
          response={response}
          conversations={conversations}
          onToggleModelsHidden={onToggleModelsHidden}
          onToggleHidePremiumModels={onToggleHidePremiumModels}
          onShowPremiumModelsModal={onShowPremiumModelsModal}
          onCollapseAllDropdowns={onCollapseAllDropdowns}
          onShowDisabledButtonInfo={onShowDisabledButtonInfo}
          onClearAllModels={onClearAllModels}
          onSetDefaultSelectionOverridden={onSetDefaultSelectionOverridden}
          onClearConversations={onClearConversations}
          onClearResponse={onClearResponse}
          onExpandModelsSection={onExpandModelsSection}
        />

        {!isModelsHidden && (
          <ModelsSection
            modelsByProvider={modelsByProvider}
            selectedModels={selectedModels}
            originalSelectedModels={originalSelectedModels}
            openDropdowns={openDropdowns}
            allModels={allModels}
            isLoadingModels={isLoadingModels}
            isFollowUpMode={isFollowUpMode}
            maxModelsLimit={maxModelsLimit}
            hidePremiumModels={hidePremiumModels}
            isAuthenticated={isAuthenticated}
            user={user}
            selectedModelsGridRef={selectedModelsGridRef}
            onToggleDropdown={onToggleDropdown}
            onToggleModel={onToggleModel}
            onToggleAllForProvider={onToggleAllForProvider}
            onError={onError}
            onRetryModels={onRetryModels}
            onShowDisabledModelModal={onShowDisabledModelModal}
          />
        )}
      </section>
    </ErrorBoundary>
  )
}
