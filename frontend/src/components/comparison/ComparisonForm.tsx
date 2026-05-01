import ImageIcon from 'lucide-react/dist/esm/icons/image'
import React, {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
import { createPortal } from 'react-dom'

import { BREAKPOINT_MOBILE } from '../../config/constants'
import { HELP_ME_CHOOSE_CATEGORY_IMAGES_ID } from '../../data/helpMeChooseRecommendations'
import { useSpeechRecognition, useResponsive } from '../../hooks'
import type { TutorialStep } from '../../hooks/useTutorial'
import type { User, ModelConversation } from '../../types'
import type { ModelsByProvider } from '../../types/models'
import { showNotification } from '../../utils/error'
import { hasVisionModelSelected } from '../../utils/visionModels'
import { StyledTooltip } from '../shared'

import { ActionButtonTooltipModal, type ComposerTooltipButtonId } from './ActionButtonTooltipModal'
import { AttachmentChips } from './AttachmentChips'
import type { FileProps, HistoryProps, SelectionProps } from './ComparisonFormTypes'
import { ContextWarning } from './ContextWarning'
import { DisabledButtonInfoModal } from './DisabledButtonInfoModal'
import {
  FileUpload,
  type AttachedFile,
  type FileUploadHandle,
  type StoredAttachedFile,
} from './FileUpload'
import { FormHeader } from './FormHeader'
import { HistoryDropdown } from './HistoryDropdown'
import { SavedSelectionsDropdown } from './SavedSelectionsDropdown'
import { TokenUsageDisplay, type TokenUsageInfo } from './TokenUsageDisplay'
import { getTooltipModalSuppressed } from './tooltipModalStorage'

function submitIncompleteComposerTooltip(hasPrompt: boolean, hasModels: boolean): string {
  if (!hasPrompt && !hasModels) return 'Enter your input, and select models below'
  if (hasPrompt && !hasModels) return 'Before submitting, select models below'
  return 'Before submitting, enter your input'
}

export type { AttachedFile, StoredAttachedFile }
export type { HistoryProps, SelectionProps, FileProps } from './ComparisonFormTypes'

interface ComparisonFormProps {
  input: string
  setInput: Dispatch<SetStateAction<string>>
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
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
  renderUsagePreview: () => React.ReactNode
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
  modelsSectionRef?: React.RefObject<HTMLDivElement | null>
  composerFloating?: boolean
  /** Portals the “below hero” composer into this node (after results, before footer). Mobile: in-flow; desktop: fixed draggable + flow spacer. */
  afterResultsComposerSlotTarget?: HTMLElement | null
  /** When provided, enables hero CTA and FormHeader to open Help me choose (scroll, expand, open dropdown) */
  onOpenHelpMeChoose?: (options?: { scrollToCategoryId?: string }) => void
  /** When true, submit is blocked until image aspect ratio & size match all selected image models */
  imageGenerationSubmitBlocked?: boolean
  /**
   * When true with imageGenerationSubmitBlocked: models share no valid aspect+size combo;
   * tooltip directs user to change selection, not Advanced.
   */
  imageGenerationNoSharedImageOptions?: boolean
  /** Fired when user clicks submit while only blocked by image config (opens conflict UI) */
  onImageGenerationSubmitBlockedTap?: () => void
}

export const ComparisonForm = memo<ComparisonFormProps>(
  ({
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
    webSearchEnabled: webSearchEnabledProp,
    onWebSearchEnabledChange,
    tutorialStep,
    tutorialIsActive = false,
    modelsSectionRef,
    composerFloating = false,
    afterResultsComposerSlotTarget = null,
    onOpenHelpMeChoose,
    imageGenerationSubmitBlocked = false,
    imageGenerationNoSharedImageOptions = false,
    onImageGenerationSubmitBlockedTap,
  }) => {
    const blockPromptStepForTutorial =
      tutorialIsActive && (tutorialStep === 'enter-prompt' || tutorialStep === 'enter-prompt-2')

    const allowHeroMirrorTutorialPointer =
      tutorialIsActive && (tutorialStep === 'history-dropdown' || tutorialStep === 'save-selection')

    const { showHistoryDropdown, setShowHistoryDropdown } = historyProps
    const { attachedFiles, setAttachedFiles, onExpandFiles, onRemoveAttachedImages } = fileProps

    const [webSearchEnabledInternal, setWebSearchEnabledInternal] = useState(false)
    const webSearchEnabled =
      webSearchEnabledProp !== undefined ? webSearchEnabledProp : webSearchEnabledInternal
    const setWebSearchEnabled = onWebSearchEnabledChange || setWebSearchEnabledInternal

    const selectedModelsWithWebSearch = useMemo(() => {
      return selectedModels.filter(modelId => {
        const idStr = String(modelId)
        for (const providerModels of Object.values(modelsByProvider)) {
          const model = providerModels.find(m => String(m.id) === idStr)
          if (model?.supports_web_search) return true
        }
        return false
      })
    }, [selectedModels, modelsByProvider])
    const canEnableWebSearch = selectedModelsWithWebSearch.length > 0

    const { isTouchDevice, isSmallLayout, isMobileLayout, prefersFinePointerHover } =
      useResponsive()
    /** Touch-first toolbar (tap modals, no hover tooltips). False when viewport is wide or when user has a mouse on a narrow viewport. */
    const useTouchFirstComposerChrome = isMobileLayout && !prefersFinePointerHover
    const showComposerStyledTooltips =
      (!isMobileLayout || prefersFinePointerHover) && !tutorialIsActive

    const [tokenUsageInfo, setTokenUsageInfo] = useState<TokenUsageInfo | null>(null)
    const [disabledButtonInfo, setDisabledButtonInfo] = useState<{
      button: 'websearch' | 'submit' | null
      message: string
    }>({ button: null, message: '' })

    const [tooltipModalButton, setTooltipModalButton] = useState<ComposerTooltipButtonId | null>(
      null
    )

    const [isDraggingOver, setIsDraggingOver] = useState(false)
    const fileUploadRef = useRef<FileUploadHandle>(null)
    const mirrorTextareaRef = useRef<HTMLTextAreaElement>(null)
    const savedSelectionsDropdownSlotRef = useRef<HTMLDivElement>(null)
    const mirrorSavedSelectionsSlotRef = useRef<HTMLDivElement>(null)
    const baseInputWhenSpeechStartedRef = useRef<string>('')
    const mobileBaseInputRef = useRef<string>('')
    const currentInputRef = useRef<string>(input)

    const handleSpeechResult = useCallback(
      (transcript: string, isFinal: boolean) => {
        const isMobileMode =
          typeof navigator !== 'undefined' &&
          /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)

        if (isMobileMode) {
          const mobileBase = mobileBaseInputRef.current
          if (isFinal) {
            const newInput = mobileBase + (mobileBase && transcript ? ' ' : '') + transcript
            setInput(newInput)
            mobileBaseInputRef.current = newInput
          } else {
            const newInput = mobileBase + (mobileBase && transcript ? ' ' : '') + transcript
            setInput(newInput)
          }
        } else {
          const baseInput = baseInputWhenSpeechStartedRef.current
          const newInput = baseInput + (baseInput && transcript ? ' ' : '') + transcript
          setInput(newInput)
        }
      },
      [setInput]
    )

    const {
      isListening: isSpeechListening,
      isSupported: isSpeechSupported,
      startListening: startSpeechListening,
      stopListening: stopSpeechListening,
      error: speechError,
      browserSupport: speechBrowserSupport,
    } = useSpeechRecognition(handleSpeechResult)

    useEffect(() => {
      if (speechError) showNotification(speechError, 'error')
    }, [speechError])

    useEffect(() => {
      currentInputRef.current = input
      if (!isSpeechListening) mobileBaseInputRef.current = input
    }, [input, isSpeechListening])

    const prevIsListeningRef = useRef<boolean>(false)
    useEffect(() => {
      const wasListening = prevIsListeningRef.current
      prevIsListeningRef.current = isSpeechListening
      if (isSpeechListening && !wasListening) {
        const currentInput = currentInputRef.current
        baseInputWhenSpeechStartedRef.current = currentInput
        mobileBaseInputRef.current = currentInput
      } else if (!isSpeechListening && wasListening) {
        baseInputWhenSpeechStartedRef.current = ''
      }
    }, [isSpeechListening])

    const inputTrimmed = input.trim()
    const tokenUsageExceeded = tokenUsageInfo?.isExceeded ?? false

    const getTooltipModalConfig = useCallback(
      (buttonId: ComposerTooltipButtonId): { title: string; message: string } => {
        switch (buttonId) {
          case 'add-file':
            return { title: 'Add File', message: 'Select or drag text and image files here' }
          case 'voice':
            return {
              title: 'Voice Input',
              message: isSpeechListening ? 'Stop recording' : 'Start voice input',
            }
          case 'web-search':
            return {
              title: 'Web Search',
              message: !canEnableWebSearch ? 'Select a web-enabled model' : 'Web search enabled',
            }
          case 'submit':
            return {
              title: 'Submit',
              message:
                creditsRemaining <= 0
                  ? 'You have run out of credits'
                  : isLoading
                    ? 'Submit'
                    : !inputTrimmed || selectedModels.length === 0
                      ? submitIncompleteComposerTooltip(
                          inputTrimmed.length > 0,
                          selectedModels.length > 0
                        )
                      : imageGenerationSubmitBlocked
                        ? imageGenerationNoSharedImageOptions
                          ? 'These image models do not share any aspect ratio and resolution that works for all of them. Change your model selection—Advanced cannot fix this combination.'
                          : 'Adjust Advanced options below so aspect ratio and image size work for every selected image model.'
                        : isFollowUpMode && tokenUsageExceeded
                          ? 'Input capacity exceeded - inputs may be truncated'
                          : 'Submit',
            }
        }
      },
      [
        isSpeechListening,
        canEnableWebSearch,
        creditsRemaining,
        imageGenerationSubmitBlocked,
        imageGenerationNoSharedImageOptions,
        isLoading,
        inputTrimmed,
        selectedModels.length,
        isFollowUpMode,
        tokenUsageExceeded,
      ]
    )

    const handleTooltipModalConfirm = useCallback(
      (buttonId: ComposerTooltipButtonId) => {
        switch (buttonId) {
          case 'add-file':
            fileUploadRef.current?.openFilePicker()
            break
          case 'voice':
            if (isSpeechListening) stopSpeechListening()
            else startSpeechListening()
            break
          case 'web-search':
            // Mobile opens this modal only when turning web search on (off is a direct tap).
            setWebSearchEnabled(true)
            break
          case 'submit':
            if (isFollowUpMode) onContinueConversation()
            else onSubmitClick()
            break
        }
      },
      [
        isSpeechListening,
        stopSpeechListening,
        startSpeechListening,
        setWebSearchEnabled,
        isFollowUpMode,
        onContinueConversation,
        onSubmitClick,
      ]
    )

    const handleDisabledButtonTap = useCallback(
      (button: 'websearch' | 'submit') => {
        if (!isTouchDevice) return
        let message = ''
        if (button === 'websearch') {
          if (!canEnableWebSearch) {
            message =
              'Web search requires at least one model that supports web search. Select a model with the 🌐 icon in the model selection area to enable this feature.'
          } else if (isLoading) {
            message =
              'Web search cannot be toggled while a comparison is in progress. Please wait for the current comparison to complete.'
          }
        } else if (button === 'submit') {
          if (creditsRemaining <= 0) {
            message =
              'You have run out of credits. Open the account menu → Upgrade plan to subscribe, use metered overage on paid tiers when enabled, or wait for your balance to reset.'
          } else if (isLoading) {
            message =
              'Please wait for the current comparison to complete before submitting a new one.'
          } else if (!input.trim() || selectedModels.length === 0) {
            if (!input.trim() && selectedModels.length === 0) {
              message = isFollowUpMode
                ? 'To submit a follow-up, please enter your question or code and ensure at least one model is selected.'
                : 'To submit, please enter a prompt in the text area and select at least one AI model to compare.'
            } else if (!input.trim()) {
              message = isFollowUpMode
                ? 'Please enter your follow-up question or code in the text area before submitting.'
                : 'Please enter a prompt in the text area before submitting.'
            } else {
              message =
                'Please select at least one AI model from the model selection area before submitting.'
            }
          }
        }
        if (message) setDisabledButtonInfo({ button, message })
      },
      [
        isTouchDevice,
        canEnableWebSearch,
        isLoading,
        creditsRemaining,
        isFollowUpMode,
        input,
        selectedModels.length,
      ]
    )

    const handleDragEnter = useCallback((e: React.DragEvent<HTMLElement>) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.dataTransfer.types.includes('Files')) setIsDraggingOver(true)
    }, [])

    const handleDragOver = useCallback((e: React.DragEvent<HTMLElement>) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.dataTransfer.types.includes('Files')) setIsDraggingOver(true)
    }, [])

    const handleDragLeave = useCallback((e: React.DragEvent<HTMLElement>) => {
      e.preventDefault()
      e.stopPropagation()
      const relatedTarget = e.relatedTarget as Node | null
      const currentTarget = e.currentTarget
      if (!relatedTarget) {
        setIsDraggingOver(false)
        return
      }
      const composer = currentTarget.closest('.composer')
      if (composer && !composer.contains(relatedTarget)) setIsDraggingOver(false)
    }, [])

    const handleDrop = useCallback(async (e: React.DragEvent<HTMLElement>) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDraggingOver(false)
      if (!e.dataTransfer.types.includes('Files')) return
      const file = e.dataTransfer.files?.[0]
      if (!file) return
      await fileUploadRef.current?.processFile(file)
    }, [])

    const adjustTextareaHeight = useCallback(() => {
      if (!textareaRef.current) return
      const textarea = textareaRef.current
      const isMobile = window.innerWidth <= BREAKPOINT_MOBILE
      const computedStyle = window.getComputedStyle(textarea)
      const fontSize = parseFloat(computedStyle.fontSize)
      const lineHeight = parseFloat(computedStyle.lineHeight) || fontSize * (isMobile ? 1.25 : 1.6)
      const paddingTop = parseFloat(computedStyle.paddingTop)
      const paddingBottom = parseFloat(computedStyle.paddingBottom)
      const parsedMin = parseFloat(computedStyle.minHeight)
      const cssMinHeight =
        Number.isFinite(parsedMin) && parsedMin > 0 ? parsedMin : isMobile ? 40 : 44
      const maxLines = isMobile ? 3 : 5
      const maxLinesHeight = lineHeight * maxLines
      const maxHeight = maxLinesHeight + paddingTop + paddingBottom
      const calculatedMinHeight = lineHeight + paddingTop + paddingBottom
      const minHeight = Math.max(calculatedMinHeight, cssMinHeight)
      // Measure content height (minimal height + read + set final all in sync block - no visible collapse)
      textarea.style.height = '1px'
      const scrollHeight = textarea.scrollHeight
      const isEmpty = !input.trim()
      const newHeight = isEmpty
        ? cssMinHeight
        : Math.min(Math.max(scrollHeight, minHeight), maxHeight)
      textarea.style.height = `${newHeight}px`
      if (scrollHeight > maxHeight) {
        textarea.style.overflowY = 'auto'
      } else {
        textarea.style.overflowY = 'hidden'
        textarea.scrollTop = 0
      }
    }, [input, textareaRef])

    const scrollToCurrentLine = useCallback(() => {
      if (!textareaRef.current) return
      const textarea = textareaRef.current
      const isMobile = window.innerWidth <= BREAKPOINT_MOBILE
      if (!isMobile) return
      if (textarea.scrollHeight > textarea.clientHeight) {
        textarea.scrollTop = textarea.scrollHeight - textarea.clientHeight
      }
    }, [textareaRef])

    useLayoutEffect(() => {
      adjustTextareaHeight()
      if (isSpeechListening) {
        scrollToCurrentLine()
      }
      // Keep mirror textarea height in sync with the real textarea so the hero
      // placeholder occupies exactly the same space — prevents layout shift.
      if (mirrorTextareaRef.current && textareaRef.current) {
        mirrorTextareaRef.current.style.height = textareaRef.current.style.height
        mirrorTextareaRef.current.style.overflowY = textareaRef.current.style.overflowY
      }
    }, [
      input,
      adjustTextareaHeight,
      isSpeechListening,
      scrollToCurrentLine,
      textareaRef,
      mirrorTextareaRef,
    ])

    useEffect(() => {
      if (!isTouchDevice && !tutorialStep && textareaRef.current) {
        const attemptFocus = () => {
          const textarea = textareaRef.current
          if (!textarea) return false
          const rect = textarea.getBoundingClientRect()
          if (rect.width > 0 && rect.height > 0 && !textarea.disabled) {
            const hasBlockingModal = document.querySelector(
              '.tutorial-welcome-backdrop, .tutorial-backdrop, [role="dialog"]'
            )
            if (!hasBlockingModal) {
              textarea.focus()
              return true
            }
          }
          return false
        }
        requestAnimationFrame(() => {
          if (attemptFocus()) return
          const t1 = setTimeout(() => {
            if (attemptFocus()) return
            setTimeout(attemptFocus, 300)
          }, 100)
          return () => clearTimeout(t1)
        })
      }
    }, [isTouchDevice, tutorialStep, textareaRef])

    useEffect(() => {
      let resizeTimeout: ReturnType<typeof setTimeout>
      const handleResize = () => {
        clearTimeout(resizeTimeout)
        resizeTimeout = setTimeout(() => requestAnimationFrame(adjustTextareaHeight), 100)
      }
      window.addEventListener('resize', handleResize)
      return () => {
        window.removeEventListener('resize', handleResize)
        clearTimeout(resizeTimeout)
      }
    }, [adjustTextareaHeight])

    useEffect(() => {
      const timer = setTimeout(adjustTextareaHeight, 0)
      return () => clearTimeout(timer)
    }, [adjustTextareaHeight])

    // Sync mirror textarea height whenever the floating state changes (mirror mounts/unmounts).
    useLayoutEffect(() => {
      if (composerFloating && mirrorTextareaRef.current && textareaRef.current) {
        mirrorTextareaRef.current.style.height = textareaRef.current.style.height
        mirrorTextareaRef.current.style.overflowY = textareaRef.current.style.overflowY
      }
    }, [composerFloating, textareaRef])

    const [afterResultsSlotFallback, setAfterResultsSlotFallback] = useState<HTMLElement | null>(
      null
    )
    useLayoutEffect(() => {
      if (!composerFloating) {
        setAfterResultsSlotFallback(null)
        return
      }
      if (afterResultsComposerSlotTarget) {
        setAfterResultsSlotFallback(null)
        return
      }
      const el = document.querySelector('[data-after-results-composer-slot]') as HTMLElement | null
      setAfterResultsSlotFallback(el)
    }, [composerFloating, afterResultsComposerSlotTarget])

    const afterResultsPortalHost = afterResultsComposerSlotTarget ?? afterResultsSlotFallback

    const hasAttachedImages = attachedFiles.some(
      f => 'base64Data' in f && (f as AttachedFile).base64Data
    )
    const hasVisionModel = hasVisionModelSelected(selectedModels, modelsByProvider)

    const hardSubmitDisabled =
      isLoading ||
      creditsRemaining <= 0 ||
      !input.trim() ||
      selectedModels.length === 0 ||
      (isFollowUpMode && tokenUsageExceeded)

    const submitImageConfigBlocked = imageGenerationSubmitBlocked
    const submitImageBlockTooltip =
      submitImageConfigBlocked && imageGenerationNoSharedImageOptions
        ? 'These image models do not share any aspect ratio and resolution that works for all of them. Change your model selection—Advanced cannot fix this combination.'
        : submitImageConfigBlocked
          ? 'Adjust Advanced options below so aspect ratio and image size work for every selected image model.'
          : ''

    const submitReady = !hardSubmitDisabled && !submitImageConfigBlocked
    const submitProgressOutline = input.trim().length > 0 || selectedModels.length > 0

    const voiceButtonAriaLabel = isSpeechListening ? 'Stop recording' : 'Start voice input'
    const webSearchButtonAriaLabel = !canEnableWebSearch
      ? 'Select a web-enabled model'
      : webSearchEnabled
        ? 'Web search enabled'
        : 'Enable web search'
    const submitButtonAriaLabel =
      creditsRemaining <= 0
        ? 'You have run out of credits'
        : !input.trim() || selectedModels.length === 0
          ? submitIncompleteComposerTooltip(input.trim().length > 0, selectedModels.length > 0)
          : submitImageBlockTooltip !== ''
            ? submitImageBlockTooltip
            : isFollowUpMode && tokenUsageExceeded
              ? 'Input capacity exceeded - inputs may be truncated'
              : isFollowUpMode
                ? 'Continue conversation'
                : 'Submit'

    const buildComposerContent = (mirror: boolean) => (
      <div
        className={`composer ${isAnimatingTextarea && !mirror ? 'animate-pulse-border' : ''} ${composerFloating && !mirror ? 'composer-floating' : ''}`}
      >
        {hasAttachedImages && !hasVisionModel && (
          <div className="image-attachment-banner" role="alert" aria-live="polite">
            <span className="image-attachment-banner-icon" aria-hidden>
              <ImageIcon size={20} strokeWidth={1.75} />
            </span>
            <div className="image-attachment-banner-content">
              <span>Image attached — add at least one vision-capable model to interpret it.</span>
              <div className="image-attachment-banner-actions">
                {onOpenHelpMeChoose && (
                  <button
                    type="button"
                    className="image-attachment-banner-btn image-attachment-banner-btn-primary"
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
                    className="image-attachment-banner-btn image-attachment-banner-btn-secondary"
                    onClick={onRemoveAttachedImages}
                  >
                    Remove image
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
        <div className="composer-input-wrapper">
          {attachedFiles.length > 0 && (
            <AttachmentChips
              attachedFiles={attachedFiles}
              setAttachedFiles={setAttachedFiles}
              setInput={setInput}
              disabled={isLoading}
            />
          )}
          <textarea
            ref={mirror ? mirrorTextareaRef : (textareaRef as React.RefObject<HTMLTextAreaElement>)}
            value={input}
            onChange={mirror ? undefined : e => setInput(e.target.value)}
            readOnly={mirror}
            tabIndex={mirror ? -1 : undefined}
            onKeyDown={
              mirror
                ? undefined
                : e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      if (blockPromptStepForTutorial) return
                      if (submitImageConfigBlocked && !hardSubmitDisabled) {
                        onImageGenerationSubmitBlockedTap?.()
                        return
                      }
                      if (hardSubmitDisabled) return
                      if (isFollowUpMode) onContinueConversation()
                      else onSubmitClick()
                    }
                  }
            }
            onDragEnter={mirror ? undefined : handleDragEnter}
            onDragOver={mirror ? undefined : handleDragOver}
            onDragLeave={mirror ? undefined : handleDragLeave}
            onDrop={mirror ? undefined : handleDrop}
            placeholder={
              isFollowUpMode ? 'Continue your conversation here' : 'Enter your input here...'
            }
            aria-label={
              isFollowUpMode
                ? 'Continue your conversation'
                : 'Enter your prompt to compare AI models'
            }
            className={`hero-input-textarea ${isDraggingOver && !mirror ? 'drag-over' : ''}`}
            rows={1}
            data-testid={mirror ? undefined : 'comparison-input-textarea'}
          />
        </div>

        <div
          className={`composer-toolbar ${isDraggingOver ? 'drag-over' : ''}`}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {showComposerStyledTooltips ? (
            <StyledTooltip usePortal text="Load previous conversations">
              <button
                type="button"
                className={`history-toggle-button ${showHistoryDropdown ? 'active' : ''}`}
                aria-label="Load previous conversations"
                onClick={() => setShowHistoryDropdown(!showHistoryDropdown)}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
            </StyledTooltip>
          ) : (
            <button
              type="button"
              className={`history-toggle-button ${showHistoryDropdown ? 'active' : ''}`}
              aria-label="Load previous conversations"
              onClick={() => setShowHistoryDropdown(!showHistoryDropdown)}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
          )}

          <SavedSelectionsDropdown
            selectionProps={selectionProps}
            selectedModels={selectedModels}
            modelsByProvider={modelsByProvider}
            isFollowUpMode={isFollowUpMode}
            dropdownContainerRef={
              mirror ? mirrorSavedSelectionsSlotRef : savedSelectionsDropdownSlotRef
            }
            hideTooltip={!showComposerStyledTooltips}
            tooltipUsePortal={showComposerStyledTooltips}
          />

          <div className="textarea-actions">
            <FileUpload
              ref={fileUploadRef}
              attachedFiles={attachedFiles}
              setAttachedFiles={setAttachedFiles}
              input={input}
              setInput={setInput}
              textareaRef={textareaRef}
              disabled={isLoading}
              isMobileLayout={useTouchFirstComposerChrome}
              hideTooltip={!showComposerStyledTooltips}
              tooltipUsePortal={showComposerStyledTooltips}
              onMobileButtonClick={
                useTouchFirstComposerChrome && !isLoading
                  ? () => {
                      if (getTooltipModalSuppressed('add-file')) {
                        fileUploadRef.current?.openFilePicker()
                      } else {
                        setTooltipModalButton('add-file')
                      }
                    }
                  : undefined
              }
            />

            {(isFollowUpMode || input.trim().length > 0) && (
              <TokenUsageDisplay
                input={input}
                selectedModels={selectedModels}
                conversations={conversations}
                modelsByProvider={modelsByProvider}
                isFollowUpMode={isFollowUpMode}
                attachedFiles={attachedFiles}
                onExpandFiles={onExpandFiles}
                onAccurateTokenCountChange={onAccurateTokenCountChange}
                onTokenUsageInfoChange={setTokenUsageInfo}
                tutorialIsActive={tutorialIsActive}
                hideTooltip={!showComposerStyledTooltips}
                tooltipUsePortal={showComposerStyledTooltips}
                isMobileLayout={useTouchFirstComposerChrome}
              />
            )}

            {isSpeechSupported &&
              speechBrowserSupport === 'native' &&
              (useTouchFirstComposerChrome ? (
                <button
                  type="button"
                  onClick={() => {
                    if (isSpeechListening) {
                      stopSpeechListening()
                    } else if (getTooltipModalSuppressed('voice')) {
                      startSpeechListening()
                    } else {
                      setTooltipModalButton('voice')
                    }
                  }}
                  className={`textarea-icon-button voice-button ${isSpeechListening ? 'active' : ''}`}
                  aria-label={voiceButtonAriaLabel}
                  disabled={isLoading}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    style={{ width: '20px', height: '20px', display: 'block' }}
                  >
                    <path
                      d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill={isSpeechListening ? 'currentColor' : 'none'}
                    />
                    <path
                      d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              ) : showComposerStyledTooltips ? (
                <StyledTooltip
                  usePortal
                  text={isSpeechListening ? 'Stop recording' : 'Start voice input'}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (isSpeechListening) stopSpeechListening()
                      else startSpeechListening()
                    }}
                    className={`textarea-icon-button voice-button ${isSpeechListening ? 'active' : ''}`}
                    aria-label={voiceButtonAriaLabel}
                    disabled={isLoading}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      style={{ width: '20px', height: '20px', display: 'block' }}
                    >
                      <path
                        d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill={isSpeechListening ? 'currentColor' : 'none'}
                      />
                      <path
                        d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </StyledTooltip>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (isSpeechListening) stopSpeechListening()
                    else startSpeechListening()
                  }}
                  className={`textarea-icon-button voice-button ${isSpeechListening ? 'active' : ''}`}
                  aria-label={voiceButtonAriaLabel}
                  disabled={isLoading}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    style={{ width: '20px', height: '20px', display: 'block' }}
                  >
                    <path
                      d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill={isSpeechListening ? 'currentColor' : 'none'}
                    />
                    <path
                      d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              ))}

            {useTouchFirstComposerChrome ? (
              <button
                type="button"
                onClick={() => {
                  const isDisabled = !canEnableWebSearch || isLoading
                  if (isDisabled && isTouchDevice) {
                    handleDisabledButtonTap('websearch')
                  } else if (!isDisabled) {
                    if (webSearchEnabled) {
                      // Disabling: no modal, toggle directly
                      setWebSearchEnabled(false)
                    } else {
                      // Enabling: show modal with "Web search enabled" if not suppressed
                      if (getTooltipModalSuppressed('web-search')) {
                        setWebSearchEnabled(true)
                      } else {
                        setTooltipModalButton('web-search')
                      }
                    }
                  }
                }}
                className={`textarea-icon-button web-search-button ${webSearchEnabled ? 'active' : ''} ${(!canEnableWebSearch || isLoading) && isTouchDevice ? 'touch-disabled' : ''}`}
                disabled={!isTouchDevice && (!canEnableWebSearch || isLoading)}
                aria-label={webSearchButtonAriaLabel}
                aria-disabled={!canEnableWebSearch || isLoading}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  style={{ width: '20px', height: '20px' }}
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                  <path
                    d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            ) : showComposerStyledTooltips ? (
              <StyledTooltip
                usePortal
                text={
                  !canEnableWebSearch
                    ? 'Select a web-enabled model'
                    : webSearchEnabled
                      ? 'Web search enabled'
                      : 'Enable web search'
                }
              >
                <button
                  type="button"
                  onClick={() => {
                    const isDisabled = !canEnableWebSearch || isLoading
                    if (isDisabled && isTouchDevice) handleDisabledButtonTap('websearch')
                    else if (!isDisabled) setWebSearchEnabled(!webSearchEnabled)
                  }}
                  className={`textarea-icon-button web-search-button ${webSearchEnabled ? 'active' : ''} ${(!canEnableWebSearch || isLoading) && isTouchDevice ? 'touch-disabled' : ''}`}
                  disabled={!isTouchDevice && (!canEnableWebSearch || isLoading)}
                  aria-label={webSearchButtonAriaLabel}
                  aria-disabled={!canEnableWebSearch || isLoading}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    style={{ width: '20px', height: '20px' }}
                  >
                    <circle
                      cx="12"
                      cy="12"
                      r="10"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                    <path
                      d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </StyledTooltip>
            ) : (
              <button
                type="button"
                onClick={() => {
                  const isDisabled = !canEnableWebSearch || isLoading
                  if (isDisabled && isTouchDevice) handleDisabledButtonTap('websearch')
                  else if (!isDisabled) setWebSearchEnabled(!webSearchEnabled)
                }}
                className={`textarea-icon-button web-search-button ${webSearchEnabled ? 'active' : ''} ${(!canEnableWebSearch || isLoading) && isTouchDevice ? 'touch-disabled' : ''}`}
                disabled={!isTouchDevice && (!canEnableWebSearch || isLoading)}
                aria-label={webSearchButtonAriaLabel}
                aria-disabled={!canEnableWebSearch || isLoading}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  style={{ width: '20px', height: '20px' }}
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                  <path
                    d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            )}

            {useTouchFirstComposerChrome ? (
              <button
                onClick={() => {
                  if (blockPromptStepForTutorial) return
                  if (submitImageConfigBlocked && !hardSubmitDisabled) {
                    onImageGenerationSubmitBlockedTap?.()
                    return
                  }
                  if (hardSubmitDisabled && isTouchDevice) {
                    handleDisabledButtonTap('submit')
                  } else if (!hardSubmitDisabled) {
                    if (isFollowUpMode) onContinueConversation()
                    else onSubmitClick()
                  }
                }}
                disabled={!isTouchDevice && hardSubmitDisabled}
                className={`textarea-icon-button submit-button ${submitReady ? 'submit-ready' : ''} ${submitProgressOutline ? 'submit-progress-outline' : ''} ${isAnimatingButton ? 'animate-pulse-glow' : ''} ${
                  submitImageConfigBlocked && !hardSubmitDisabled
                    ? 'submit-blocked-image-config'
                    : ''
                } ${hardSubmitDisabled && isTouchDevice ? 'touch-disabled' : ''}`}
                data-testid={mirror ? undefined : 'comparison-submit-button'}
                aria-label={submitButtonAriaLabel}
                aria-disabled={hardSubmitDisabled || submitImageConfigBlocked}
              >
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M7 14l5-5 5 5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            ) : (
              (() => {
                const isReadyToSubmit =
                  !isLoading &&
                  creditsRemaining > 0 &&
                  input.trim().length > 0 &&
                  selectedModels.length > 0 &&
                  !(isFollowUpMode && tokenUsageInfo?.isExceeded) &&
                  !submitImageConfigBlocked
                const submitButton = (
                  <button
                    onClick={() => {
                      if (blockPromptStepForTutorial) return
                      if (submitImageConfigBlocked && !hardSubmitDisabled) {
                        onImageGenerationSubmitBlockedTap?.()
                        return
                      }
                      if (hardSubmitDisabled && isTouchDevice) handleDisabledButtonTap('submit')
                      else if (!hardSubmitDisabled) {
                        if (isFollowUpMode) onContinueConversation()
                        else onSubmitClick()
                      }
                    }}
                    disabled={!isTouchDevice && hardSubmitDisabled}
                    className={`textarea-icon-button submit-button ${submitReady ? 'submit-ready' : ''} ${submitProgressOutline ? 'submit-progress-outline' : ''} ${isAnimatingButton ? 'animate-pulse-glow' : ''} ${
                      submitImageConfigBlocked && !hardSubmitDisabled
                        ? 'submit-blocked-image-config'
                        : ''
                    } ${hardSubmitDisabled && isTouchDevice ? 'touch-disabled' : ''}`}
                    data-testid={mirror ? undefined : 'comparison-submit-button'}
                    aria-label={submitButtonAriaLabel}
                    aria-disabled={hardSubmitDisabled || submitImageConfigBlocked}
                  >
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path
                        d="M7 14l5-5 5 5"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                )
                return isReadyToSubmit || isLoading || !showComposerStyledTooltips ? (
                  submitButton
                ) : (
                  <StyledTooltip
                    usePortal
                    text={
                      creditsRemaining <= 0
                        ? 'You have run out of credits'
                        : !input.trim() || selectedModels.length === 0
                          ? submitIncompleteComposerTooltip(
                              input.trim().length > 0,
                              selectedModels.length > 0
                            )
                          : submitImageBlockTooltip !== ''
                            ? submitImageBlockTooltip
                            : isFollowUpMode && tokenUsageInfo?.isExceeded
                              ? 'Input capacity exceeded - inputs may be truncated'
                              : 'Submit'
                    }
                  >
                    {submitButton}
                  </StyledTooltip>
                )
              })()
            )}
          </div>
        </div>

        <div
          ref={mirror ? mirrorSavedSelectionsSlotRef : savedSelectionsDropdownSlotRef}
          className="saved-selections-dropdown-slot"
        />

        <HistoryDropdown
          historyProps={historyProps}
          isAuthenticated={isAuthenticated}
          userSubscriptionTier={user?.subscription_tier}
          isSmallLayout={isSmallLayout}
        />
      </div>
    )

    const composerContent = buildComposerContent(false)
    const composerContentMirror = buildComposerContent(true)

    const usageAndContextBelowComposer = (
      <>
        {!isFollowUpMode && <div className="usage-preview-container">{renderUsagePreview()}</div>}
        {isFollowUpMode && conversations.length > 0 && (
          <ContextWarning tokenUsageInfo={tokenUsageInfo} renderUsagePreview={renderUsagePreview} />
        )}
      </>
    )

    const stackedComposerUnit = (
      <>
        <FormHeader
          isFollowUpMode={isFollowUpMode}
          selectedModels={selectedModels}
          isLoading={isLoading}
          tutorialIsActive={tutorialIsActive}
          onNewComparison={onNewComparison}
          modelsSectionRef={modelsSectionRef}
          onOpenHelpMeChoose={onOpenHelpMeChoose}
        />
        {composerContent}
        {usageAndContextBelowComposer}
      </>
    )

    const heroMirrorUnit = (
      <>
        <FormHeader
          isFollowUpMode={isFollowUpMode}
          selectedModels={selectedModels}
          isLoading={isLoading}
          tutorialIsActive={tutorialIsActive}
          onNewComparison={onNewComparison}
          modelsSectionRef={modelsSectionRef}
          onOpenHelpMeChoose={onOpenHelpMeChoose}
        />
        {composerContentMirror}
        {usageAndContextBelowComposer}
      </>
    )

    return (
      <>
        {composerFloating ? (
          <>
            <div
              className={
                allowHeroMirrorTutorialPointer
                  ? 'composer-hero-mirror composer-hero-mirror--tutorial-pointer'
                  : 'composer-hero-mirror'
              }
              inert={allowHeroMirrorTutorialPointer ? undefined : ''}
              aria-hidden={!allowHeroMirrorTutorialPointer}
            >
              {heroMirrorUnit}
            </div>
            {afterResultsPortalHost
              ? createPortal(
                  <div className="mobile-composer-in-flow-wrapper composer-below-results-stack">
                    {stackedComposerUnit}
                  </div>,
                  afterResultsPortalHost
                )
              : null}
          </>
        ) : (
          stackedComposerUnit
        )}

        <DisabledButtonInfoModal
          isOpen={disabledButtonInfo.button !== null}
          onClose={() => setDisabledButtonInfo({ button: null, message: '' })}
          buttonType={disabledButtonInfo.button}
          message={disabledButtonInfo.message}
        />

        {tooltipModalButton && (
          <ActionButtonTooltipModal
            isOpen={true}
            onClose={() => setTooltipModalButton(null)}
            onConfirm={() => handleTooltipModalConfirm(tooltipModalButton)}
            buttonId={tooltipModalButton}
            title={getTooltipModalConfig(tooltipModalButton).title}
            message={getTooltipModalConfig(tooltipModalButton).message}
          />
        )}
      </>
    )
  }
)

ComparisonForm.displayName = 'ComparisonForm'
