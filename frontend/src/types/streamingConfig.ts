/**
 * Composed types for streaming config. Groups related fields to reduce
 * the large flat config objects passed through useComparisonStreaming.
 */

import type { AttachedFile, StoredAttachedFile } from '../components/comparison'
import type { CreditBalance } from '../services/creditService'

import type { CompareResponse, ActiveResultTabs } from './comparison'
import type { ConversationMessage, ModelConversation } from './conversation'
import type { ModelsByProvider } from './models'
import type {
  ImageComposerAdvancedSettings,
  TextComposerAdvancedSettings,
} from './textComposerAdvanced'

export type CreditWarningType =
  | 'low'
  | 'insufficient'
  | 'none'
  | 'overage_active'
  | 'overage_cap_hit'

export interface OverageContext {
  overage_enabled?: boolean
  overage_credits_used_this_period?: number
  overage_limit_credits?: number | null
}

export interface StreamingAuthInfo {
  isAuthenticated: boolean
  user: {
    is_verified?: boolean
    subscription_tier?: string
    monthly_credits_allocated?: number
    billing_period_start?: string
    billing_period_end?: string
    credits_reset_at?: string
    total_credits_used?: number
  } | null
  browserFingerprint: string
  /** Refresh access token (used when backend returns 402 due to expired session) */
  refreshToken?: () => Promise<void>
}

export interface StreamingModelSelection {
  selectedModels: string[]
  modelsByProvider: ModelsByProvider
  originalSelectedModels: string[]
}

export interface StreamingInputState {
  input: string
  attachedFiles: (AttachedFile | StoredAttachedFile)[]
  accurateInputTokens: number | null
  webSearchEnabled: boolean
  userLocation: string | null
  temperature: number // 0.0-2.0, controls response randomness
  topP: number // 0.0-1.0, nucleus sampling
  maxTokens: number | null // cap on output length, null = use model default
  modelMode: 'text' | 'image'
  aspectRatio?: string // for image generation
  imageSize?: string // for image generation
}

export interface StreamingConversationState {
  conversations: ModelConversation[]
  isFollowUpMode: boolean
  currentVisibleComparisonId: string | number | null
}

export interface StreamingCreditState {
  creditBalance: CreditBalance | null
  anonymousCreditsRemaining: number | null
  creditWarningType: CreditWarningType
}

export interface StreamingRefs {
  userCancelledRef: React.MutableRefObject<boolean>
  hasScrolledToResultsRef: React.MutableRefObject<boolean>
  scrolledToTopRef: React.MutableRefObject<Set<string>>
  shouldScrollToTopAfterFormattingRef: React.MutableRefObject<boolean>
  autoScrollPausedRef: React.MutableRefObject<Set<string>>
  userInteractingRef: React.MutableRefObject<Set<string>>
  lastScrollTopRef: React.MutableRefObject<Map<string, number>>
  lastAlignedRoundRef: React.MutableRefObject<number>
  isPageScrollingRef: React.MutableRefObject<boolean>
  scrollListenersRef: React.MutableRefObject<
    Map<
      string,
      {
        scroll: () => void
        wheel: (e: WheelEvent) => void
        touchstart: () => void
        mousedown: () => void
      }
    >
  >
  lastSubmittedInputRef: React.MutableRefObject<string>
}

export interface StreamingStateCallbacks {
  setError: React.Dispatch<React.SetStateAction<string | null>>
  setIsLoading: (loading: boolean) => void
  setResponse: (response: CompareResponse | null) => void
  setProcessingTime: (time: number | null) => void
  setClosedCards: (cards: Set<string>) => void
  setModelErrors: React.Dispatch<React.SetStateAction<{ [key: string]: boolean }>>
  setActiveResultTabs: React.Dispatch<React.SetStateAction<ActiveResultTabs>>
  setConversations: React.Dispatch<React.SetStateAction<ModelConversation[]>>
  setInput: (input: string) => void
  setIsModelsHidden: (hidden: boolean) => void
  setShowDoneSelectingCard: (show: boolean) => void
  setUserMessageTimestamp: (timestamp: string) => void
  setCurrentAbortController: (controller: AbortController | null) => void
  setOriginalSelectedModels: (models: string[]) => void
  setCurrentVisibleComparisonId: React.Dispatch<React.SetStateAction<string | null>>
  setAlreadyBrokenOutModels: (models: Set<string>) => void
  setIsScrollLocked: (locked: boolean) => void
  setUsageCount: React.Dispatch<React.SetStateAction<number>>
  setIsFollowUpMode: (mode: boolean) => void
  setStreamingReasoningByModel: React.Dispatch<React.SetStateAction<Record<string, string>>>
  setStreamAnswerStartedByModel: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  clearStreamingReasoningUi: () => void
}

export interface StreamingCreditCallbacks {
  setAnonymousCreditsRemaining: (credits: number | null) => void
  setCreditBalance: (balance: CreditBalance | null) => void
  setCreditWarningMessage: (message: string | null) => void
  setCreditWarningType: (type: CreditWarningType) => void
  setCreditWarningDismissible: (dismissible: boolean) => void
  dismissOverageActive: (creditsResetAt?: string) => void
}

export interface StreamingHelperCallbacks {
  expandFiles: (files: (AttachedFile | StoredAttachedFile)[], text: string) => Promise<string>
  getAttachedImagesForApi: (
    files: (AttachedFile | StoredAttachedFile)[]
  ) => Array<{ mime_type: string; base64_data: string; filename: string; placeholder: string }>
  extractFileContentForStorage: (
    files: AttachedFile[]
  ) => Promise<Array<{ name: string; content: string; placeholder: string }>>
  setupScrollListener: (modelId: string) => boolean
  cleanupScrollListener: (modelId: string) => void
  saveConversationToLocalStorage: (
    inputData: string,
    models: string[],
    conversations: ModelConversation[],
    isUpdate: boolean,
    fileContents?: Array<{ name: string; content: string; placeholder: string }>,
    conversationType?: 'comparison' | 'breakout',
    parentConversationId?: string | null,
    breakoutModelId?: string | null,
    textComposerAdvanced?: TextComposerAdvancedSettings,
    imageComposerAdvanced?: ImageComposerAdvancedSettings
  ) => string | null
  syncHistoryAfterComparison: (input: string, models: string[]) => Promise<void>
  loadHistoryFromAPI: () => Promise<void>
  getFirstUserMessage: () => ConversationMessage | undefined
  getCreditWarningMessage: (
    type: CreditWarningType,
    tier: string,
    remaining: number,
    estimated?: number,
    resetAt?: string,
    overageCtx?: OverageContext,
    resetShowsUtc?: boolean
  ) => string
  isLowCreditWarningDismissed: (
    tier: string,
    periodType: 'daily' | 'monthly',
    resetAt?: string
  ) => boolean
  isOverageActiveDismissed: (resetAt?: string) => boolean
  scrollConversationsToBottom: () => void
  refreshUser: () => Promise<void>
}
