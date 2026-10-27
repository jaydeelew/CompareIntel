/**
 * Flag-off: Text/Image tabs stay, Voice tab is gone (pre-#93 layout).
 */
/// <reference types="@testing-library/jest-dom" />

import { render, screen } from '@testing-library/react'
import { createRef, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { ModelsArea, type ModelsAreaProps } from '../ModelsArea'

vi.mock('../../../config/voiceFlag', () => ({
  isVoiceEnabled: () => false,
}))

vi.mock('../../comparison', () => ({
  AdvancedSettings: () => null,
  HelpMeChoose: () => null,
  ModelSearch: () => null,
  ModelsSection: () => null,
  ModelsSectionHeader: () => null,
}))

vi.mock('../../shared', () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

function renderToggle(overrides?: Partial<ModelsAreaProps>) {
  const props: ModelsAreaProps = {
    modelsByProvider: {},
    selectedModels: [],
    originalSelectedModels: [],
    openDropdowns: new Set(),
    allModels: [],
    isLoadingModels: false,
    isLoading: false,
    isFollowUpMode: false,
    maxModelsLimit: 3,
    hidePremiumModels: false,
    isModelsHidden: false,
    isAuthenticated: false,
    user: null,
    isWideLayout: true,
    isMobileLayout: false,
    response: null,
    conversations: [],
    modelsSectionRef: createRef<HTMLDivElement>(),
    selectedModelsGridRef: createRef<HTMLDivElement>(),
    onToggleDropdown: vi.fn(),
    onToggleModel: vi.fn(),
    onToggleAllForProvider: vi.fn(),
    onToggleModelsHidden: vi.fn(),
    onToggleHidePremiumModels: vi.fn(),
    onShowPremiumModelsModal: vi.fn(),
    onCollapseAllDropdowns: vi.fn(),
    onShowDisabledButtonInfo: vi.fn(),
    onClearAllModels: vi.fn(),
    onSetDefaultSelectionOverridden: vi.fn(),
    onClearConversations: vi.fn(),
    onClearResponse: vi.fn(),
    onExpandModelsSection: vi.fn(),
    onError: vi.fn(),
    temperature: 0.7,
    onTemperatureChange: vi.fn(),
    topP: 1,
    onTopPChange: vi.fn(),
    maxTokens: null,
    onMaxTokensChange: vi.fn(),
    advancedSettings: { temperature: 0.7, topP: 1, maxTokens: null },
    maxTokensCap: 4096,
    modelsDropdownOpen: null,
    onModelsDropdownChange: vi.fn(),
    onModelModeChange: vi.fn(),
    modelMode: 'text',
    ...overrides,
  }
  return render(<ModelsArea {...props} />)
}

describe('ModelsArea with VITE_ENABLE_VOICE off', () => {
  it('shows Text and Image tabs and no Voice entry', () => {
    renderToggle()

    expect(screen.getByTestId('text-tab-button')).toBeInTheDocument()
    expect(screen.getByTestId('image-tab-button')).toBeInTheDocument()
    expect(screen.queryByTestId('voice-tab-button')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Voice$/i })).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Model type' })).not.toHaveAttribute('data-tabs')
  })
})
