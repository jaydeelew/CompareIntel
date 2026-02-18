import React, {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { BREAKPOINT_MOBILE } from '../../config/constants'
import { useSpeechRecognition, useResponsive } from '../../hooks'
import type { TutorialStep } from '../../hooks/useTutorial'
import type { User, ModelConversation } from '../../types'
import type { ModelsByProvider } from '../../types/models'
import { showNotification } from '../../utils/error'

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

export type { AttachedFile, StoredAttachedFile }
export type { HistoryProps, SelectionProps, FileProps } from './ComparisonFormTypes'

interface ComparisonFormProps {
  input: string
  setInput: (value: string) => void
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
  }) => {
    const { showHistoryDropdown, setShowHistoryDropdown } = historyProps
    const { attachedFiles, setAttachedFiles, onExpandFiles } = fileProps

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

    const { isTouchDevice, isSmallLayout } = useResponsive()

    const [tokenUsageInfo, setTokenUsageInfo] = useState<TokenUsageInfo | null>(null)
    const [disabledButtonInfo, setDisabledButtonInfo] = useState<{
      button: 'websearch' | 'submit' | null
      message: string
    }>({ button: null, message: '' })

    const [isDraggingOver, setIsDraggingOver] = useState(false)
    const fileUploadRef = useRef<FileUploadHandle>(null)
    const savedSelectionsDropdownSlotRef = useRef<HTMLDivElement>(null)
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
              'You have run out of credits. Please purchase more credits to continue using CompareIntel. You can upgrade your plan from your account settings.'
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
    }, [input, adjustTextareaHeight, isSpeechListening, scrollToCurrentLine])

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

    return (
      <>
        <FormHeader
          isFollowUpMode={isFollowUpMode}
          selectedModels={selectedModels}
          isLoading={isLoading}
          tutorialIsActive={tutorialIsActive}
          onNewComparison={onNewComparison}
          modelsSectionRef={modelsSectionRef}
        />

        <div className={`composer ${isAnimatingTextarea ? 'animate-pulse-border' : ''}`}>
          <div className="composer-input-wrapper">
            <textarea
              ref={textareaRef as React.RefObject<HTMLTextAreaElement>}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  if (tutorialStep === 'enter-prompt' || tutorialStep === 'enter-prompt-2') return
                  if (isFollowUpMode) onContinueConversation()
                  else onSubmitClick()
                }
              }}
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              placeholder={
                isFollowUpMode ? 'Continue your conversation here' : 'Enter your input here...'
              }
              className={`hero-input-textarea ${isDraggingOver ? 'drag-over' : ''}`}
              rows={1}
              data-testid="comparison-input-textarea"
            />
          </div>

          <div
            className={`composer-toolbar ${isDraggingOver ? 'drag-over' : ''}`}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <button
              type="button"
              className={`history-toggle-button ${showHistoryDropdown ? 'active' : ''}`}
              onClick={() => setShowHistoryDropdown(!showHistoryDropdown)}
              title="Load previous conversations"
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

            <SavedSelectionsDropdown
              selectionProps={selectionProps}
              selectedModels={selectedModels}
              modelsByProvider={modelsByProvider}
              isFollowUpMode={isFollowUpMode}
              dropdownContainerRef={savedSelectionsDropdownSlotRef}
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
                />
              )}

              {isSpeechSupported && speechBrowserSupport === 'native' && (
                <button
                  type="button"
                  onClick={() =>
                    isSpeechListening ? stopSpeechListening() : startSpeechListening()
                  }
                  className={`textarea-icon-button voice-button ${isSpeechListening ? 'active' : ''}`}
                  title={isSpeechListening ? 'Stop recording' : 'Start voice input'}
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
              )}

              <button
                type="button"
                onClick={() => {
                  const isDisabled = !canEnableWebSearch || isLoading
                  if (isDisabled && isTouchDevice) handleDisabledButtonTap('websearch')
                  else if (!isDisabled) setWebSearchEnabled(!webSearchEnabled)
                }}
                className={`textarea-icon-button web-search-button ${webSearchEnabled ? 'active' : ''} ${(!canEnableWebSearch || isLoading) && isTouchDevice ? 'touch-disabled' : ''}`}
                title={
                  !canEnableWebSearch
                    ? 'Select a web-enabled model'
                    : webSearchEnabled
                      ? 'Web search enabled'
                      : 'Enable web search'
                }
                disabled={!isTouchDevice && (!canEnableWebSearch || isLoading)}
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

              <button
                onClick={() => {
                  if (tutorialStep === 'enter-prompt' || tutorialStep === 'enter-prompt-2') return
                  const isDisabled =
                    isLoading ||
                    creditsRemaining <= 0 ||
                    !input.trim() ||
                    selectedModels.length === 0
                  if (isDisabled && isTouchDevice) handleDisabledButtonTap('submit')
                  else if (!isDisabled) {
                    if (isFollowUpMode) onContinueConversation()
                    else onSubmitClick()
                  }
                }}
                disabled={
                  !isTouchDevice &&
                  (isLoading ||
                    creditsRemaining <= 0 ||
                    !input.trim() ||
                    selectedModels.length === 0)
                }
                className={`textarea-icon-button submit-button ${isAnimatingButton ? 'animate-pulse-glow' : ''} ${
                  (isLoading ||
                    creditsRemaining <= 0 ||
                    !input.trim() ||
                    selectedModels.length === 0) &&
                  isTouchDevice
                    ? 'touch-disabled'
                    : ''
                }`}
                title={(() => {
                  if (creditsRemaining <= 0) return 'You have run out of credits'
                  if (isLoading) return 'Submit'
                  if (!input.trim() || selectedModels.length === 0)
                    return 'Enter prompt and select models'
                  if (isFollowUpMode && tokenUsageInfo?.isExceeded)
                    return 'Input capacity exceeded - inputs may be truncated'
                  return 'Submit'
                })()}
                data-testid="comparison-submit-button"
                aria-disabled={
                  isLoading || creditsRemaining <= 0 || !input.trim() || selectedModels.length === 0
                }
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
            </div>
          </div>

          <div ref={savedSelectionsDropdownSlotRef} className="saved-selections-dropdown-slot" />

          <HistoryDropdown
            historyProps={historyProps}
            isAuthenticated={isAuthenticated}
            userSubscriptionTier={user?.subscription_tier}
            isSmallLayout={isSmallLayout}
          />
        </div>

        {!isFollowUpMode && <div className="usage-preview-container">{renderUsagePreview()}</div>}

        {isFollowUpMode && conversations.length > 0 && (
          <ContextWarning tokenUsageInfo={tokenUsageInfo} renderUsagePreview={renderUsagePreview} />
        )}

        <DisabledButtonInfoModal
          isOpen={disabledButtonInfo.button !== null}
          onClose={() => setDisabledButtonInfo({ button: null, message: '' })}
          buttonType={disabledButtonInfo.button}
          message={disabledButtonInfo.message}
        />
      </>
    )
  }
)

ComparisonForm.displayName = 'ComparisonForm'
