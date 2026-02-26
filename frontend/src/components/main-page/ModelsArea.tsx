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
import { AdvancedSettings, ModelsSection, ModelsSectionHeader } from '../comparison'
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
  isLoading: boolean
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

  // Advanced settings
  temperature: number
  onTemperatureChange: (temp: number) => void
  topP: number
  onTopPChange: (v: number) => void
  maxTokens: number | null
  onMaxTokensChange: (v: number | null) => void
  advancedSettings: { temperature: number; topP: number; maxTokens: number | null }
  /** Cap for max tokens based on selected models (min of their max_output_tokens) */
  maxTokensCap: number
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
  isLoading,
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
  temperature,
  onTemperatureChange,
  topP,
  onTopPChange,
  maxTokens,
  onMaxTokensChange,
  advancedSettings: _advancedSettings,
  maxTokensCap,
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
          <>
            <AdvancedSettings
              temperature={temperature}
              onTemperatureChange={onTemperatureChange}
              topP={topP}
              onTopPChange={onTopPChange}
              maxTokens={maxTokens}
              onMaxTokensChange={onMaxTokensChange}
              maxTokensCap={maxTokensCap}
              disabled={isLoading}
            />
            {selectedModels.length > 0 &&
              (() => {
                const advancedCustomized = temperature !== 0.7 || topP !== 1 || maxTokens !== null
                const withoutAdvanced = selectedModels
                  .map(id => allModels.find(m => m.id === id))
                  .filter((m): m is Model => !!m && m.supports_temperature === false)
                if (withoutAdvanced.length === 0 || !advancedCustomized) return null
                const names =
                  withoutAdvanced.length === 1
                    ? withoutAdvanced[0].name
                    : withoutAdvanced.length === 2
                      ? `${withoutAdvanced[0].name} and ${withoutAdvanced[1].name}`
                      : withoutAdvanced
                          .slice(0, -1)
                          .map(m => m.name)
                          .join(', ') + `, and ${withoutAdvanced[withoutAdvanced.length - 1].name}`
                return (
                  <p className="advanced-settings-limited-notice" role="status">
                    {names} {withoutAdvanced.length === 1 ? 'ignores' : 'ignore'} advanced settings
                    because {withoutAdvanced.length === 1 ? 'it uses' : 'they use'} fixed parameters
                    for reasoning and {withoutAdvanced.length === 1 ? 'does' : 'do'} not accept
                    temperature, Top P, or max output tokens from the API.
                  </p>
                )
              })()}
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
          </>
        )}
      </section>
    </ErrorBoundary>
  )
}
