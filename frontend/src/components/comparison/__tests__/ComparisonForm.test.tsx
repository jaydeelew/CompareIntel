/**
 * ComparisonForm — RTL smoke: composer renders; Enter submits or continues follow-up.
 * Heavy deps mocked; hooks useResponsive / useSpeechRecognition stubbed with importOriginal.
 */
/// <reference types="@testing-library/jest-dom" />

import { fireEvent, render, screen } from '@testing-library/react'
import React, { createRef } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { TutorialStep } from '../../../hooks/useTutorial'
import { createModelId } from '../../../types'
import { ComparisonForm } from '../ComparisonForm'
import type { HistoryProps, SelectionProps } from '../ComparisonFormTypes'

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

const speechStub = vi.hoisted(() => ({
  isSupported: false,
  browserSupport: 'none' as 'native' | 'none',
}))

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
      isSupported: speechStub.isSupported,
      startListening: vi.fn(),
      stopListening: vi.fn(),
      error: null,
      browserSupport: speechStub.browserSupport,
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
  const view = render(
    <BrowserRouter>
      <ComparisonForm {...props} />
    </BrowserRouter>
  )
  return { textareaRef, ...view, props }
}

describe('ComparisonForm', () => {
  beforeEach(() => {
    speechStub.isSupported = false
    speechStub.browserSupport = 'none'
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

  it('disables web search toggle in follow-up mode but keeps on/off styling', () => {
    const onWebSearchEnabledChange = vi.fn()
    renderComparisonForm({
      isFollowUpMode: true,
      webSearchEnabled: true,
      onWebSearchEnabledChange,
      modelsByProvider: {
        OpenAI: [
          {
            id: 'openai/gpt-4',
            name: 'GPT-4',
            provider: 'OpenAI',
            supports_web_search: true,
          },
        ],
      },
      selectedModels: [createModelId('openai/gpt-4')],
    })

    const webSearchButton = screen.getByTestId('web-search-button')
    expect(webSearchButton).toHaveClass('active')
    expect(webSearchButton).toHaveClass('web-search-locked')
    expect(webSearchButton).not.toBeDisabled()
    expect(webSearchButton).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByTestId('web-search-globe-icon')).toBeInTheDocument()
    expect(webSearchButton).toHaveAttribute(
      'aria-label',
      'Web search enabled (fixed for this conversation)'
    )
    fireEvent.click(webSearchButton)
    expect(onWebSearchEnabledChange).not.toHaveBeenCalled()
  })

  it('keeps the pre-Voice dictation mic and does not show a Voice mode toggle', () => {
    speechStub.isSupported = true
    speechStub.browserSupport = 'native'
    renderComparisonForm()
    expect(screen.getByRole('button', { name: /start voice input/i })).toBeInTheDocument()
    expect(screen.queryByTestId('voice-mode-toggle')).not.toBeInTheDocument()
    expect(screen.queryByTestId('voice-composer')).not.toBeInTheDocument()
  })

  it.each<[TutorialStep, string]>([
    ['view-follow-up-results', 'tutorial-review-input-locked'],
    ['history-dropdown', 'tutorial-history-input-locked'],
    ['save-selection', 'tutorial-save-input-locked'],
  ])('blocks composer text on tutorial step %s', (step, lockClass) => {
    const setInput = vi.fn()
    const onContinueConversation = vi.fn()
    renderComparisonForm({
      input: 'existing prompt',
      setInput,
      isFollowUpMode: true,
      tutorialIsActive: true,
      tutorialStep: step,
      onContinueConversation,
    })
    const field = screen.getByTestId('comparison-input-textarea')
    expect(field).toHaveProperty('readOnly', true)
    expect(field).toHaveAttribute('aria-readonly', 'true')
    expect(field).toHaveAttribute('inputMode', 'none')
    expect(field.closest('.composer')).toHaveClass(lockClass)
    fireEvent.change(field, { target: { value: 'typed over' } })
    fireEvent.paste(field)
    fireEvent.keyDown(field, { key: 'Enter', shiftKey: false })
    expect(setInput).not.toHaveBeenCalled()
    expect(onContinueConversation).not.toHaveBeenCalled()
    expect(field).toHaveValue('existing prompt')
  })

  it('keeps the history and save composer rings while the prompt is locked', () => {
    const { unmount } = renderComparisonForm({
      tutorialIsActive: true,
      tutorialStep: 'history-dropdown',
    })
    expect(screen.getByTestId('comparison-input-textarea').closest('.composer')).toHaveClass(
      'tutorial-highlight'
    )
    unmount()
    renderComparisonForm({
      tutorialIsActive: true,
      tutorialStep: 'save-selection',
    })
    const composer = screen.getByTestId('comparison-input-textarea').closest('.composer')
    expect(composer).toHaveClass('tutorial-highlight')
    expect(composer).toHaveClass('tutorial-save-input-locked')
    expect(composer).not.toHaveClass('tutorial-review-input-locked')
  })

  it('keeps the composer editable on the prompt step and after the tutorial', () => {
    const setInput = vi.fn()
    const { unmount } = renderComparisonForm({
      input: '',
      setInput,
      tutorialIsActive: true,
      tutorialStep: 'enter-prompt',
    })
    const during = screen.getByTestId('comparison-input-textarea')
    expect(during).toHaveProperty('readOnly', false)
    fireEvent.change(during, { target: { value: 'hello' } })
    expect(setInput).toHaveBeenCalledWith('hello')
    unmount()

    setInput.mockClear()
    renderComparisonForm({
      input: 'kept',
      setInput,
      tutorialIsActive: false,
      tutorialStep: null,
    })
    const after = screen.getByTestId('comparison-input-textarea')
    expect(after).toHaveProperty('readOnly', false)
    expect(after.closest('.composer')).not.toHaveClass('tutorial-save-input-locked')
    fireEvent.change(after, { target: { value: 'kept and edited' } })
    expect(setInput).toHaveBeenCalledWith('kept and edited')
  })
})
