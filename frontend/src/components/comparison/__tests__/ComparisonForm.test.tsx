/**
 * ComparisonForm — RTL smoke: composer renders; Enter submits or continues follow-up.
 * Heavy deps mocked; hooks useResponsive / useSpeechRecognition stubbed with importOriginal.
 */
/// <reference types="@testing-library/jest-dom" />

import { fireEvent, render, screen } from '@testing-library/react'
import React, { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'

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
})
