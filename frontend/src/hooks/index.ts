// Re-export all hooks for cleaner imports
export * from './useConversationHistory'
export * from './useBrowserFingerprint'
export * from './useRateLimitStatus'
export * from './useModelSelection'
export * from './useModelComparison'
export * from './useDebounce'
export * from './usePerformance'
export * from './useSavedModelSelections'
export * from './useSpeechRecognition'
export * from './useTouchDevice'
export * from './useTutorial'
export * from './useBreakpoint'
export * from './useFileHandling'
export * from './useConversationManager'
export * from './useSavedSelectionManager'
export * from './useCreditWarningManager'
export * from './useResponsive'
export * from './useComparisonStreaming'
export * from './useScrollManagement'
export * from './useExport'
export * from './useModelManagement'
export * from './useScreenshotCopy'
export * from './useDoneSelectingCard'
export * from './useCreditsRemaining'
export * from './useTutorialEffects'
export * from './useTokenReload'
export * from './useAuthStateEffects'
export * from './useBreakoutConversation'

// New hooks for better useEffect patterns (2025 best practices)
export * from './useInputValidation'
export * from './useAnimationState'
export * from './useModalManagement'
export * from './useActiveTabIndex'
export * from './useTokenNotification'

// Combined hooks (reducing hook count while maintaining functionality)
// Note: Using specific exports to avoid naming conflicts with original hooks
export {
  useTutorialComplete,
  type UseTutorialCompleteConfig,
  type UseTutorialCompleteReturn,
} from './useTutorialComplete'
export {
  useSavedSelectionsComplete,
  type UseSavedSelectionsCompleteConfig,
  type UseSavedSelectionsCompleteCallbacks,
  type UseSavedSelectionsCompleteReturn,
} from './useSavedSelectionsComplete'
