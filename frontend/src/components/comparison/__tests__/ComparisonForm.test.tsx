/**
 * ComparisonForm — RTL smoke: composer renders; Enter submits or continues follow-up.
 * Heavy deps mocked; hooks useResponsive / useSpeechRecognition stubbed with importOriginal.
 */
/// <reference types="@testing-library/jest-dom" />

import { fireEvent, render, screen } from '@testing-library/react'
import React, { createRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { isVoiceFeatureEnabled } from '../../../config/voiceFlag'
import { createModelId } from '../../../types'
import { ComparisonForm } from '../ComparisonForm'
import type { HistoryProps, SelectionProps } from '../ComparisonFormTypes'

vi.mock('../../../config/voiceFlag', () => ({
  isVoiceFeatureEnabled: vi.fn(() => true),
}))

const desktopResponsive = () => ({
  isSmallLayout: false,
  isMobileLayout: false,
  isTabletLayout: false,
  isCapabilityIconRowLayout: false,
  isWideLayout: true,
  viewportWidth: 1200,
  useModalForTooltips: false,
  isTouchDevice: false,
  prefersFinePointerHover: true,
})

vi.mock('../ActionButtonTooltipModal', () => ({ ActionButtonTooltipModal: () => null }))
vi.mock('../AttachmentChips', () => ({ AttachmentChips: () => null }))
vi.mock('../ContextWarning', () => ({ ContextWarning: () => null }))
vi.mock('../DisabledButtonInfoModal', () => ({ DisabledButtonInfoModal: () => null }))
vi.mock('../FileUpload', () => ({
  FileUpload: React.forwardRef((_props, ref) => {
    React.useImperativeHandle(ref, () => ({
      openFilePicker: vi.fn(),
      processFile: vi.fn().mockResolvedValue(undefined),
    }))
    return <div data-testid="mock-file-upload" />
  }),
}))
vi.mock('../HistoryDropdown', () => ({ HistoryDropdown: () => null }))
vi.mock('../SavedSelectionsDropdown', () => ({ SavedSelectionsDropdown: () => null }))
vi.mock('../TokenUsageDisplay', () => ({ TokenUsageDisplay: () => null }))

vi.mock('../../../hooks', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../hooks')>()
  return {
    ...actual,
    useResponsive: () => desktopResponsive(),
    useSpeechRecognition: () => ({
      isListening: false,
      isSupported: false,
      startListening: vi.fn(),
      stopListening: vi.fn(),
      error: null,
      browserSupport: 'none',
    }),
  }
})

type ComparisonFormProps = React.ComponentProps<typeof ComparisonForm>

const baseHistory: HistoryProps = {
  showHistoryDropdown: false,
  setShowHistoryDropdown: vi.fn(),
  conversationHistory: [],
  isLoadingHistory: false,
  historyLimit: 20,
  currentVisibleComparisonId: null,
  onLoadConversation: vi.fn(),
  onDeleteConversation: vi.fn(),
}

const baseSelection: SelectionProps = {
  savedModelSelections: [],
  onSaveModelSelection: () => ({ success: true }),
  onLoadModelSelection: vi.fn(),
  onDeleteModelSelection: vi.fn(),
  onSetDefaultSelection: vi.fn(),
  getDefaultSelectionId: () => null,
  getDefaultSelection: () => null,
  defaultSelectionOverridden: false,
  canSaveMoreSelections: true,
  maxSavedSelections: 5,
}

function renderComparisonForm(overrides: Partial<ComparisonFormProps> = {}) {
  const textareaRef = createRef<HTMLTextAreaElement | null>()
  const props: ComparisonFormProps = {
    input: '',
    setInput: vi.fn(),
    textareaRef,
    isFollowUpMode: false,
    isLoading: false,
    isAnimatingButton: false,
    isAnimatingTextarea: false,
    isAuthenticated: false,
    user: null,
    conversations: [],
    historyProps: baseHistory,
    onSubmitClick: vi.fn(),
    onContinueConversation: vi.fn(),
    onNewComparison: vi.fn(),
    renderUsagePreview: () => null,
    selectedModels: [createModelId('gpt-4')],
    modelsByProvider: {},
    creditsRemaining: 50,
    selectionProps: baseSelection,
    fileProps: {
      attachedFiles: [],
      setAttachedFiles: vi.fn(),
    },
    ...overrides,
  }
  const view = render(<ComparisonForm {...props} />)
  return { textareaRef, ...view, props }
}

describe('ComparisonForm', () => {
  afterEach(() => {
    vi.mocked(isVoiceFeatureEnabled).mockReturnValue(true)
  })

  it('renders composer textarea', () => {
    renderComparisonForm()
    expect(screen.getByTestId('comparison-input-textarea')).toBeInTheDocument()
  })

  it('submits on Enter when input, models, and credits allow', () => {
    const onSubmitClick = vi.fn()
    renderComparisonForm({
      input: 'hello world',
      onSubmitClick,
      selectedModels: [createModelId('gpt-4')],
      creditsRemaining: 10,
    })

    fireEvent.keyDown(screen.getByTestId('comparison-input-textarea'), {
      key: 'Enter',
      shiftKey: false,
    })
    expect(onSubmitClick).toHaveBeenCalledTimes(1)
  })

  it('shows a Voice mode toggle on the text composer', () => {
    const onVoiceModeChange = vi.fn()
    renderComparisonForm({ modelMode: 'text', onVoiceModeChange })
    expect(screen.getByTestId('voice-mode-toggle')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('voice-mode-toggle'))
    expect(onVoiceModeChange).toHaveBeenCalledWith(true)
  })

  it('shows the spoken composer when voice mode is on', () => {
    const onVoiceModeChange = vi.fn()
    renderComparisonForm({
      modelMode: 'voice',
      onVoiceModeChange,
      voiceSession: {
        status: 'idle',
        isSupported: true,
        unsupportedMessage: null,
        isRecording: false,
        isTranscribing: false,
        isSpeaking: false,
        lastTranscript: 'Hello there',
        error: null,
        voices: ['alloy', 'nova'],
        toggleTalk: vi.fn(),
        interruptPlayback: vi.fn(),
        stopAll: vi.fn(),
      },
    })
    expect(screen.getByTestId('voice-composer')).toBeInTheDocument()
    expect(screen.getByTestId('voice-mode-toggle')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByTestId('comparison-input-textarea')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('voice-mode-toggle'))
    expect(onVoiceModeChange).toHaveBeenCalledWith(false)
  })

  it('hides the Voice mode toggle on the image composer', () => {
    renderComparisonForm({ modelMode: 'image', onVoiceModeChange: vi.fn() })
    expect(screen.queryByTestId('voice-mode-toggle')).not.toBeInTheDocument()
  })

  it('hides the Voice mode toggle when the voice feature flag is off', () => {
    vi.mocked(isVoiceFeatureEnabled).mockReturnValue(false)
    renderComparisonForm({ modelMode: 'text', onVoiceModeChange: vi.fn() })
    expect(screen.queryByTestId('voice-mode-toggle')).not.toBeInTheDocument()
  })

  it('continues conversation on Enter when in follow-up mode', () => {
    const onSubmitClick = vi.fn()
    const onContinueConversation = vi.fn()
    renderComparisonForm({
      isFollowUpMode: true,
      input: 'more context',
      onSubmitClick,
      onContinueConversation,
      selectedModels: [createModelId('gpt-4')],
      creditsRemaining: 10,
    })

    fireEvent.keyDown(screen.getByTestId('comparison-input-textarea'), {
      key: 'Enter',
      shiftKey: false,
    })
    expect(onContinueConversation).toHaveBeenCalledTimes(1)
    expect(onSubmitClick).not.toHaveBeenCalled()
  })
})
