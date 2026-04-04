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

import { Image as ImageIcon, X } from 'lucide-react'
import { useMemo, useState } from 'react'

import { HELP_ME_CHOOSE_CATEGORY_IMAGES_ID } from '../../data/helpMeChooseRecommendations'
import type { User, ModelsByProvider, CompareResponse, Model } from '../../types'
import type { ModelConversation } from '../../types/conversation'
import {
  getAllKnownAspectRatios,
  getAllKnownImageSizes,
  getSupportedAspectRatiosForModels,
  getSupportedImageSizesForModels,
} from '../../utils/imageConfigValidation'
import { AdvancedSettings, HelpMeChoose, ModelsSection, ModelsSectionHeader } from '../comparison'
import { ErrorBoundary } from '../shared'

export interface ModelsAreaProps {
  // Data
  /** When true, only vision-capable models are shown and a notice is displayed */
  hasAttachedImages?: boolean
  /** When set, shows a persistent warning that selected model(s) cannot process images */
  nonVisionModelsWarning?: string | null
  /** "text" = text models, "image" = image generation models */
  modelMode?: 'text' | 'image'
  /** Called when user switches between text and image model modes */
  onModelModeChange?: (mode: 'text' | 'image') => void
  modelsByProvider: ModelsByProvider
  /** Full models for Help Me Choose lookups (avoids greying text/image models when filtered by mode) */
  allModelsByProvider?: ModelsByProvider
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
  onApplyCategoryPreset?: (modelIds: string[]) => void
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
  /** When true, show aspect ratio and image size in Advanced (image mode) */
  showImageConfig?: boolean
  aspectRatio?: string
  onAspectRatioChange?: (v: string) => void
  imageSize?: string
  onImageSizeChange?: (v: string) => void
  /** Aspect ratios supported by ALL selected image models (intersection); enables options */
  supportedAspectRatios?: string[]
  /** Image sizes supported by ALL selected image models (intersection); enables options */
  supportedImageSizes?: string[]
  /** Full list of aspect ratios to display (from registry, future-proof) */
  allAspectRatios?: string[]
  /** Full list of image sizes to display (from registry, future-proof) */
  allImageSizes?: string[]
  /** Compatible defaults for reset (from getDefaultCompatibleConfig) */
  defaultAspectRatio?: string
  defaultImageSize?: string
  /** Which dropdown is open (Help me choose or Advanced); controlled by parent */
  modelsDropdownOpen: 'help-me-choose' | 'advanced' | null
  /** Called when dropdown open state changes */
  onModelsDropdownChange: (open: 'help-me-choose' | 'advanced' | null) => void
  /** When non-vision warning shows: scroll to models, open Help me choose */
  onOpenHelpMeChoose?: (options?: { scrollToCategoryId?: string }) => void
  /** Request horizontal scroll to this Help me choose category when the dropdown opens */
  helpMeChooseScrollCategoryId?: string | null
  onHelpMeChooseScrollCategoryDone?: () => void
  /** When non-vision warning shows: remove all attached images from composer */
  onRemoveAttachedImages?: () => void
  /** When true, unregistered users cannot select image models (show sign-up modal) */
  imageModelsDisabledForUnregistered?: boolean
  /** When true, disable info tooltips on model dropdowns (e.g. during tutorial) */
  isTutorialActive?: boolean
}

export function ModelsArea({
  // Data
  hasAttachedImages = false,
  nonVisionModelsWarning = null,
  modelMode = 'text',
  onModelModeChange,
  modelsByProvider,
  allModelsByProvider,
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
  onApplyCategoryPreset,
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
  showImageConfig = false,
  aspectRatio,
  onAspectRatioChange,
  imageSize,
  onImageSizeChange,
  supportedAspectRatios,
  supportedImageSizes,
  allAspectRatios,
  allImageSizes,
  defaultAspectRatio,
  defaultImageSize,
  modelsDropdownOpen: openDropdown,
  onModelsDropdownChange: setOpenDropdown,
  onOpenHelpMeChoose,
  helpMeChooseScrollCategoryId = null,
  onHelpMeChooseScrollCategoryDone,
  onRemoveAttachedImages,
  imageModelsDisabledForUnregistered = false,
  isTutorialActive = false,
}: ModelsAreaProps) {
  const [imageSignupBannerDismissed, setImageSignupBannerDismissed] = useState(false)

  // Use allModelsByProvider (full model set) for image config capability lookups.
  // This ensures we have complete image_aspect_ratios and image_sizes from the registry
  // so unsupported options (e.g. 1K/4K for Flux 2 Flex) are correctly disabled.
  const effectiveImageConfig = useMemo(() => {
    if (!showImageConfig) return null
    const modelsForLookup = allModelsByProvider ?? modelsByProvider
    return {
      supportedAspectRatios: getSupportedAspectRatiosForModels(selectedModels, modelsForLookup),
      supportedImageSizes: getSupportedImageSizesForModels(selectedModels, modelsForLookup),
      allAspectRatios: getAllKnownAspectRatios(modelsForLookup),
      allImageSizes: getAllKnownImageSizes(modelsForLookup),
    }
  }, [showImageConfig, selectedModels, allModelsByProvider, modelsByProvider])

  const effectiveSupportedAspectRatios =
    effectiveImageConfig?.supportedAspectRatios ?? supportedAspectRatios
  const effectiveSupportedImageSizes =
    effectiveImageConfig?.supportedImageSizes ?? supportedImageSizes
  const effectiveAllAspectRatios = effectiveImageConfig?.allAspectRatios ?? allAspectRatios
  const effectiveAllImageSizes = effectiveImageConfig?.allImageSizes ?? allImageSizes

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
            {nonVisionModelsWarning && (
              <div className="models-section-non-vision-warning" role="alert" aria-live="assertive">
                <span className="models-section-non-vision-warning-icon" aria-hidden>
                  ⚠️
                </span>
                <div className="models-section-non-vision-warning-content">
                  <span>{nonVisionModelsWarning}</span>
                  <div className="models-section-non-vision-warning-actions">
                    {onOpenHelpMeChoose && (
                      <button
                        type="button"
                        className="models-section-non-vision-warning-btn models-section-non-vision-warning-btn-primary"
                        onClick={() =>
                          onOpenHelpMeChoose?.({
                            scrollToCategoryId: HELP_ME_CHOOSE_CATEGORY_IMAGES_ID,
                          })
                        }
                      >
                        Pick a vision model
                      </button>
                    )}
                    {onRemoveAttachedImages && (
                      <button
                        type="button"
                        className="models-section-non-vision-warning-btn models-section-non-vision-warning-btn-secondary"
                        onClick={onRemoveAttachedImages}
                      >
                        Remove image
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
            {hasAttachedImages && !nonVisionModelsWarning && (
              <div className="models-section-image-notice" role="status" aria-live="polite">
                <span className="models-section-image-notice-icon" aria-hidden>
                  📷
                </span>
                <span>
                  Image attached — only vision-capable models are shown. Select at least one to
                  compare.
                </span>
              </div>
            )}
            {onModelModeChange && (
              <div
                className="models-section-mode-toggle"
                role="group"
                aria-label="Model type"
                data-mode={modelMode}
              >
                <span className="models-section-mode-slider" aria-hidden />
                <button
                  type="button"
                  className={`models-section-mode-btn ${modelMode === 'text' ? 'active' : ''}`}
                  onClick={() => onModelModeChange('text')}
                  aria-pressed={modelMode === 'text'}
                >
                  Text models
                </button>
                <button
                  type="button"
                  className={`models-section-mode-btn ${modelMode === 'image' ? 'active' : ''}`}
                  onClick={() => onModelModeChange('image')}
                  aria-pressed={modelMode === 'image'}
                >
                  Image generation models
                </button>
              </div>
            )}
            {imageModelsDisabledForUnregistered && !imageSignupBannerDismissed && (
              <div className="models-section-image-signup-banner" role="alert" aria-live="polite">
                <span className="models-section-image-signup-banner-icon" aria-hidden>
                  <ImageIcon size={18} strokeWidth={1.75} />
                </span>
                <span className="models-section-image-signup-banner-text">
                  Sign up for a free account to use image generation models. Usage draws from your
                  daily credits—you can run as many image comparisons as your balance allows (up to
                  3 image models per run on the free tier).
                </span>
                <button
                  type="button"
                  className="models-section-image-signup-banner-dismiss"
                  onClick={() => setImageSignupBannerDismissed(true)}
                  aria-label="Dismiss image generation sign-up notice"
                >
                  <X size={16} strokeWidth={2} aria-hidden />
                </button>
              </div>
            )}
            <div className="models-section-buttons-row">
              <HelpMeChoose
                onToggleModel={onToggleModel}
                onApplyCategoryPreset={onApplyCategoryPreset}
                disabled={isLoading}
                isFollowUpMode={isFollowUpMode}
                modelsByProvider={modelsByProvider}
                allModelsByProvider={allModelsByProvider}
                isAuthenticated={isAuthenticated}
                user={user}
                selectedModels={selectedModels}
                isExpanded={openDropdown === 'help-me-choose'}
                onExpandChange={expanded => setOpenDropdown(expanded ? 'help-me-choose' : null)}
                modelsSectionRef={modelsSectionRef}
                isMobileLayout={isMobileLayout}
                hasAttachedImages={hasAttachedImages}
                hidePremiumModels={hidePremiumModels}
                scrollCategoryIdIntoView={helpMeChooseScrollCategoryId}
                onScrollCategoryIntoViewDone={onHelpMeChooseScrollCategoryDone}
              />
              <AdvancedSettings
                temperature={temperature}
                onTemperatureChange={onTemperatureChange}
                topP={topP}
                onTopPChange={onTopPChange}
                maxTokens={maxTokens}
                onMaxTokensChange={onMaxTokensChange}
                maxTokensCap={maxTokensCap}
                disabled={isLoading}
                isExpanded={openDropdown === 'advanced'}
                onExpandChange={expanded => setOpenDropdown(expanded ? 'advanced' : null)}
                showImageConfig={showImageConfig}
                aspectRatio={aspectRatio}
                onAspectRatioChange={onAspectRatioChange}
                imageSize={imageSize}
                onImageSizeChange={onImageSizeChange}
                supportedAspectRatios={effectiveSupportedAspectRatios}
                supportedImageSizes={effectiveSupportedImageSizes}
                allAspectRatios={effectiveAllAspectRatios}
                allImageSizes={effectiveAllImageSizes}
                defaultAspectRatio={defaultAspectRatio}
                defaultImageSize={defaultImageSize}
              />
            </div>
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
              hasAttachedImages={hasAttachedImages}
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
              hideModelInfoTooltips={isTutorialActive}
              onToggleDropdown={onToggleDropdown}
              onToggleModel={onToggleModel}
              onToggleAllForProvider={onToggleAllForProvider}
              onError={onError}
              onRetryModels={onRetryModels}
              onShowDisabledModelModal={onShowDisabledModelModal}
              imageModelsDisabledForUnregistered={imageModelsDisabledForUnregistered}
            />
          </>
        )}
      </section>
    </ErrorBoundary>
  )
}
