/**
 * SelectedModelIcons — order, duplicate providers, exact names, desktop
 * tooltip vs mobile bottom sheet, selection updates, and layout placement.
 */
/// <reference types="@testing-library/jest-dom" />

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React, { createRef, useState } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createMockModel } from '../../../__tests__/utils'
import { createModelId } from '../../../types'
import { ComparisonForm } from '../ComparisonForm'
import type { HistoryProps, SelectionProps } from '../ComparisonFormTypes'
import { computeIconTrackFit, getDefaultTrackMetrics } from '../fitSelectedModelIconTrack'
import { resolveSelectedModelIcons } from '../resolveSelectedModelIcons'
import { SelectedModelIcons } from '../SelectedModelIcons'

const responsiveState = vi.hoisted(() => ({
  useModalForTooltips: false,
}))

vi.mock('../../../hooks', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../hooks')>()
  return {
    ...actual,
    useResponsive: () => ({
      isSmallLayout: false,
      isMobileLayout: responsiveState.useModalForTooltips,
      isTabletLayout: false,
      isCapabilityIconRowLayout: false,
      isWideLayout: !responsiveState.useModalForTooltips,
      viewportWidth: responsiveState.useModalForTooltips ? 390 : 1200,
      useModalForTooltips: responsiveState.useModalForTooltips,
      isTouchDevice: responsiveState.useModalForTooltips,
      prefersFinePointerHover: !responsiveState.useModalForTooltips,
    }),
    useSpeechRecognition: () => ({
      isListening: false,
      isSupported: false,
      startListening: vi.fn(),
      stopListening: vi.fn(),
      error: null,
      browserSupport: 'none' as const,
    }),
  }
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

const gpt4 = createMockModel({
  id: createModelId('openai/gpt-4'),
  name: 'GPT-4',
  provider: 'OpenAI',
})
const gpt41 = createMockModel({
  id: createModelId('openai/gpt-4.1'),
  name: 'GPT-4.1',
  provider: 'OpenAI',
})
const claude = createMockModel({
  id: createModelId('anthropic/claude-sonnet-4'),
  name: 'Claude Sonnet 4',
  provider: 'Anthropic',
})
const gemini = createMockModel({
  id: createModelId('google/gemini-2.5-flash'),
  name: 'Gemini 2.5 Flash',
  provider: 'Google',
})

const modelsByProvider = {
  OpenAI: [gpt4, gpt41],
  Anthropic: [claude],
  Google: [gemini],
}

function renderIcons(selectedModels: string[] = [gpt4.id, claude.id], catalog = modelsByProvider) {
  return render(
    <div className="hero-section">
      <div className="usage-preview-container">
        <div>
          <span className="credits-remaining-wrapper">2 models selected</span>
        </div>
        <SelectedModelIcons selectedModels={selectedModels} modelsByProvider={catalog} />
      </div>
    </div>
  )
}

describe('resolveSelectedModelIcons', () => {
  it('preserves selection order and keeps duplicate-provider icons', () => {
    expect(resolveSelectedModelIcons([claude.id, gpt4.id, gpt41.id], modelsByProvider)).toEqual([
      { modelId: claude.id, provider: 'Anthropic', displayName: 'Claude Sonnet 4' },
      { modelId: gpt4.id, provider: 'OpenAI', displayName: 'GPT-4' },
      { modelId: gpt41.id, provider: 'OpenAI', displayName: 'GPT-4.1' },
    ])
  })

  it('omits unresolved IDs instead of inventing defaults', () => {
    expect(resolveSelectedModelIcons(['unknown/model', gpt4.id], modelsByProvider)).toEqual([
      { modelId: gpt4.id, provider: 'OpenAI', displayName: 'GPT-4' },
    ])
  })

  it('returns an empty list when nothing is selected', () => {
    expect(resolveSelectedModelIcons([], modelsByProvider)).toEqual([])
  })
})

describe('SelectedModelIcons', () => {
  beforeEach(() => {
    responsiveState.useModalForTooltips = false
  })

  it('renders one icon per selected model in selection order', () => {
    renderIcons([claude.id, gpt4.id, gemini.id])
    const icons = screen.getAllByTestId('selected-model-icon')
    expect(icons.map(el => el.getAttribute('data-model-id'))).toEqual([
      claude.id,
      gpt4.id,
      gemini.id,
    ])
    expect(icons.map(el => el.getAttribute('aria-label'))).toEqual([
      'Claude Sonnet 4',
      'GPT-4',
      'Gemini 2.5 Flash',
    ])
  })

  it('shows a separate icon for each model when providers are duplicated', () => {
    renderIcons([gpt4.id, gpt41.id])
    const icons = screen.getAllByTestId('selected-model-icon')
    expect(icons).toHaveLength(2)
    expect(icons.every(el => el.getAttribute('data-provider') === 'OpenAI')).toBe(true)
    expect(icons.map(el => el.getAttribute('aria-label'))).toEqual(['GPT-4', 'GPT-4.1'])
  })

  it('renders nothing when zero models are selected', () => {
    renderIcons([])
    expect(screen.queryByTestId('selected-model-icons')).not.toBeInTheDocument()
  })

  it('updates immediately when the selection changes', () => {
    function Harness() {
      const [selected, setSelected] = useState<string[]>([gpt4.id])
      return (
        <>
          <button type="button" onClick={() => setSelected([gpt4.id, claude.id])}>
            add
          </button>
          <button type="button" onClick={() => setSelected([])}>
            reset
          </button>
          <button type="button" onClick={() => setSelected([gemini.id, gpt41.id])}>
            default
          </button>
          <SelectedModelIcons selectedModels={selected} modelsByProvider={modelsByProvider} />
        </>
      )
    }
    render(<Harness />)
    expect(screen.getAllByTestId('selected-model-icon')).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'add' }))
    expect(
      screen.getAllByTestId('selected-model-icon').map(el => el.getAttribute('aria-label'))
    ).toEqual(['GPT-4', 'Claude Sonnet 4'])

    fireEvent.click(screen.getByRole('button', { name: 'reset' }))
    expect(screen.queryByTestId('selected-model-icons')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'default' }))
    expect(
      screen.getAllByTestId('selected-model-icon').map(el => el.getAttribute('aria-label'))
    ).toEqual(['Gemini 2.5 Flash', 'GPT-4.1'])
  })

  it('shows the exact model display name on desktop hover and focus, not just the provider', async () => {
    const user = userEvent.setup()
    renderIcons([gpt4.id, claude.id])
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    const gptButton = screen.getByRole('button', { name: 'GPT-4' })
    await user.hover(gptButton)
    await waitFor(() => {
      expect(screen.getByRole('tooltip')).toHaveTextContent('GPT-4')
    })
    expect(screen.getByRole('tooltip')).not.toHaveTextContent('OpenAI')

    await user.unhover(gptButton)
    await waitFor(() => {
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    })

    const claudeButton = screen.getByRole('button', { name: 'Claude Sonnet 4' })
    fireEvent.focusIn(claudeButton)
    await waitFor(() => {
      expect(screen.getByRole('tooltip')).toHaveTextContent('Claude Sonnet 4')
    })
  })

  it('does not render a floating tooltip on mobile; tap opens a dismissible bottom sheet', async () => {
    responsiveState.useModalForTooltips = true
    const user = userEvent.setup()
    renderIcons([gpt4.id])

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'GPT-4' }))

    const sheet = screen.getByTestId('selected-model-name-sheet')
    expect(sheet).toHaveAttribute('role', 'dialog')
    expect(sheet).toHaveClass('selected-model-name-sheet-overlay')
    expect(sheet).toHaveTextContent('GPT-4')
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Got it' }))
    expect(screen.queryByTestId('selected-model-name-sheet')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'GPT-4' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('selected-model-name-sheet')).not.toBeInTheDocument()
  })

  it('marks the track fitted when many models exceed the container width', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 360, writable: true })

    const providers = ['OpenAI', 'Anthropic', 'Google', 'Meta', 'Mistral'] as const
    const many: string[] = []
    const catalog: Record<string, ReturnType<typeof createMockModel>[]> = {}
    for (let i = 0; i < 12; i++) {
      const provider = providers[i % providers.length]
      const id = createModelId(`provider-${i}/model-${i}`)
      many.push(id)
      catalog[provider] = [
        ...(catalog[provider] ?? []),
        createMockModel({
          id,
          name: `Model ${i}`,
          provider,
        }),
      ]
    }

    renderIcons(many, catalog)
    const row = screen.getByTestId('selected-model-icons')
    Object.defineProperty(row, 'clientWidth', { configurable: true, value: 360 })
    fireEvent(window, new Event('resize'))

    const metrics = getDefaultTrackMetrics(360, 16)
    const expectedFit = computeIconTrackFit({ ...metrics, availableWidthPx: 360, iconCount: 12 })
    expect(expectedFit.fitted).toBe(true)

    const track = screen.getByRole('list', { name: 'Selected models' })
    expect(track).toHaveAttribute('data-track-fit', 'fitted')
    expect(track).toHaveClass('selected-model-icons-track--fitted')
  })

  it('fits many models in a single non-wrapping track without leaving the credits container', () => {
    const many = [gpt4, gpt41, claude, gemini, gpt4, gpt41, claude, gemini, gpt4]
    const ids = many.map((m, i) => `${m.id}#${i}`)
    const catalog = {
      OpenAI: [
        createMockModel({ id: createModelId(ids[0]), name: 'A', provider: 'OpenAI' }),
        createMockModel({ id: createModelId(ids[1]), name: 'B', provider: 'OpenAI' }),
        createMockModel({ id: createModelId(ids[4]), name: 'E', provider: 'OpenAI' }),
        createMockModel({ id: createModelId(ids[5]), name: 'F', provider: 'OpenAI' }),
        createMockModel({ id: createModelId(ids[8]), name: 'I', provider: 'OpenAI' }),
      ],
      Anthropic: [
        createMockModel({ id: createModelId(ids[2]), name: 'C', provider: 'Anthropic' }),
        createMockModel({ id: createModelId(ids[6]), name: 'G', provider: 'Anthropic' }),
      ],
      Google: [
        createMockModel({ id: createModelId(ids[3]), name: 'D', provider: 'Google' }),
        createMockModel({ id: createModelId(ids[7]), name: 'H', provider: 'Google' }),
      ],
    }
    const { container } = renderIcons(
      ids.map(id => createModelId(id)),
      catalog
    )
    const row = screen.getByTestId('selected-model-icons')
    const track = row.querySelector('.selected-model-icons-track')
    expect(track).not.toBeNull()
    expect(screen.getAllByTestId('selected-model-icon')).toHaveLength(9)
    expect(row.parentElement).toHaveClass('usage-preview-container')
    const styles = window.getComputedStyle(row)
    expect(styles.position === 'absolute' || row.className.includes('selected-model-icons')).toBe(
      true
    )
    expect(container.querySelector('.selected-model-icons-track')).toBeTruthy()
  })

  it('sits inside the credits container so ComparisonForm can keep it above the pricing line', () => {
    const { container } = renderIcons([gpt4.id])
    const usage = container.querySelector('.usage-preview-container')
    const row = screen.getByTestId('selected-model-icons')
    expect(usage).toContainElement(row)
    expect(usage?.querySelector('.credits-remaining-wrapper')).toBeTruthy()
    expect(row.compareDocumentPosition(usage!.querySelector('.credits-remaining-wrapper')!)).toBe(
      Node.DOCUMENT_POSITION_PRECEDING
    )
  })
})

describe('ComparisonForm selected-model icons layout', () => {
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

  beforeEach(() => {
    responsiveState.useModalForTooltips = false
  })

  it('places icons below the credits line and above the pricing line', () => {
    const textareaRef = createRef<HTMLTextAreaElement | null>()
    const { container } = render(
      <BrowserRouter>
        <ComparisonForm
          input=""
          setInput={vi.fn()}
          textareaRef={textareaRef}
          isFollowUpMode={false}
          isLoading={false}
          isAnimatingButton={false}
          isAnimatingTextarea={false}
          isAuthenticated={false}
          user={null}
          conversations={[]}
          historyProps={baseHistory}
          onSubmitClick={vi.fn()}
          onContinueConversation={vi.fn()}
          onNewComparison={vi.fn()}
          renderUsagePreview={() => (
            <div>
              <span className="credits-remaining-wrapper">2 models selected</span>
            </div>
          )}
          selectedModels={[gpt4.id, claude.id]}
          modelsByProvider={modelsByProvider}
          creditsRemaining={50}
          selectionProps={baseSelection}
          fileProps={{ attachedFiles: [], setAttachedFiles: vi.fn() }}
        />
      </BrowserRouter>
    )

    const usage = container.querySelector('.usage-preview-container')
    const pricing = container.querySelector('.hero-pricing-line')
    const row = screen.getByTestId('selected-model-icons')
    expect(usage).toContainElement(row)
    expect(pricing).toBeInTheDocument()
    expect(usage!.compareDocumentPosition(pricing!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(row.compareDocumentPosition(pricing!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(screen.getAllByTestId('selected-model-icon')).toHaveLength(2)
  })

  it('hides icons in follow-up mode where the credits/pricing gap is not shown', () => {
    const textareaRef = createRef<HTMLTextAreaElement | null>()
    render(
      <BrowserRouter>
        <ComparisonForm
          input=""
          setInput={vi.fn()}
          textareaRef={textareaRef}
          isFollowUpMode={true}
          isLoading={false}
          isAnimatingButton={false}
          isAnimatingTextarea={false}
          isAuthenticated={false}
          user={null}
          conversations={[]}
          historyProps={baseHistory}
          onSubmitClick={vi.fn()}
          onContinueConversation={vi.fn()}
          onNewComparison={vi.fn()}
          renderUsagePreview={() => (
            <div>
              <span className="credits-remaining-wrapper">2 models selected</span>
            </div>
          )}
          selectedModels={[gpt4.id]}
          modelsByProvider={modelsByProvider}
          creditsRemaining={50}
          selectionProps={baseSelection}
          fileProps={{ attachedFiles: [], setAttachedFiles: vi.fn() }}
        />
      </BrowserRouter>
    )
    expect(screen.queryByTestId('selected-model-icons')).not.toBeInTheDocument()
  })
})
