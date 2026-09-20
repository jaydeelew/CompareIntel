import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  useComparisonPage,
  getModelLimit,
  filterModelsByProviderToText,
  isModelIdSelectableForUser,
} from '@compareintel/core'
import type { ModelInfo, User } from '@compareintel/core'

import type { PreloadedTabContent } from '@compareintel/core'
import { ProviderIcon } from '@frontend/components/layout/ProviderIcon'

import { apiClient, loadModels } from '../api'
import { openWebAppLogin } from '../webAppActions'
import { extractTabContentFromSidePanel } from '../extractTabContent'
import { sendTabContextMessage } from '../messaging'
import {
  acknowledgePageContextIntro,
  hasAcknowledgedPageContextIntro,
} from '../../shared/pageContextIntro'

import { ExtensionContextBar, TabMentionInput } from './ExtensionContextBar'
import { ExtensionModelPicker } from './ExtensionModelPicker'
import { ExtensionDefaultsMenu } from './ExtensionDefaultsMenu'
import { PageContextIntroModal } from './PageContextIntroModal'
import type { ExtensionShellPersistedState } from '../types/shellState'
import {
  addPinnedContext,
  matchOpenTabsToContexts,
  type SavedPageContext,
} from '../utils/pageContextSnapshot'
import { upsertRecentChat } from '../../shared/recentChats'
import {
  deleteModelDefault,
  getLastModelDefaultId,
  listModelDefaults,
  MAX_MODEL_DEFAULTS,
  saveModelDefault,
  setLastModelDefaultId,
  type ModelDefault,
} from '../../shared/modelDefaults'
import {
  hydrateConversationResults,
  hydrateSelectedModelIds,
  isModelCatalogReady,
  resolveSelectedModelsForCatalog,
  sameModelIds,
} from '../utils/resolveSelectedModels'

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 19V5M12 5l-6 6M12 5l6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function StopIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
    </svg>
  )
}

function NewIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

const LatexRenderer = lazy(() => import('@frontend/components/LatexRenderer'))

interface ExtensionComparisonShellProps {
  user: User | null
  browserFingerprint?: string
  onComparisonFinished?: () => void
  persistedState?: ExtensionShellPersistedState
  persistTabId?: number
  onPersistState?: (tabId: number, state: ExtensionShellPersistedState) => void
  onRecentChatSaved?: () => void
  onActiveRecentChatChange?: (chatId: string | null) => void
}

function sameModelSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false
  const set = new Set(left)
  return right.every((id) => set.has(id))
}

function isModelTurnInHistory(
  history: Array<{ role: string; content: string; model_id?: string }>,
  userPrompt: string,
  modelId: string,
  assistantContent: string
): boolean {
  let lastMatchingUserIndex = -1
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index]?.role === 'user' && history[index]?.content === userPrompt) {
      lastMatchingUserIndex = index
      break
    }
  }
  if (lastMatchingUserIndex < 0) return false

  return history.slice(lastMatchingUserIndex + 1).some(
    (message) =>
      message.role === 'assistant' &&
      message.model_id === modelId &&
      message.content === assistantContent
  )
}

export function ExtensionComparisonShell({
  user,
  browserFingerprint,
  onComparisonFinished,
  persistedState,
  persistTabId,
  onPersistState,
  onRecentChatSaved,
  onActiveRecentChatChange,
}: ExtensionComparisonShellProps) {
  const [activeRecentChatId, setActiveRecentChatId] = useState<string | null>(
    persistedState?.activeRecentChatId ?? null
  )
  const [modelsByProvider, setModelsByProvider] = useState<Record<string, ModelInfo[]>>({})
  const [modelsLoadError, setModelsLoadError] = useState<string | null>(null)
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [modelsCollapsed, setModelsCollapsed] = useState(false)
  const [pageContextCollapsed, setPageContextCollapsed] = useState(
    persistedState?.pageContextCollapsed ?? true
  )
  const [sharePageContext, setSharePageContext] = useState(
    persistedState?.sharePageContext ?? true
  )
  const [pageContexts, setPageContexts] = useState<SavedPageContext[]>(
    persistedState?.pageContexts ?? []
  )
  const [collapsedResultIds, setCollapsedResultIds] = useState<Set<string>>(
    () => new Set(persistedState?.collapsedResultIds ?? [])
  )
  const [showPageContextIntro, setShowPageContextIntro] = useState(false)
  const [submittedPrompt, setSubmittedPrompt] = useState(persistedState?.submittedPrompt ?? '')
  const [closedModelIds, setClosedModelIds] = useState<Set<string>>(
    () => new Set(persistedState?.closedModelIds ?? [])
  )
  const [modelDefaults, setModelDefaults] = useState<ModelDefault[]>([])
  const [activeModelDefaultId, setActiveModelDefaultId] = useState<string | null>(
    persistedState?.activeModelDefaultId ?? null
  )
  const [showDefaultsMenu, setShowDefaultsMenu] = useState(false)
  const [defaultsMenuPos, setDefaultsMenuPos] = useState<{ top: number; right: number } | null>(
    null
  )
  // The default that brand-new tabs should open with. Kept in sync with storage
  // so selecting/saving a default in one tab only affects tabs opened later,
  // and closing the named default means later tabs open with no default.
  const [lastDefaultId, setLastDefaultId] = useState<string | null>(null)
  const [lastDefaultLoaded, setLastDefaultLoaded] = useState(false)
  // A shell only counts as "fresh" (eligible for the latest default) when it
  // mounts without any persisted state — i.e. a brand-new tab or comparison.
  // Existing tabs always carry persisted state, so their selection is untouched.
  const isFreshShellRef = useRef(!persistedState)
  const appliedInitialDefaultRef = useRef(false)
  const defaultsControlRef = useRef<HTMLDivElement>(null)
  const defaultsTriggerRef = useRef<HTMLButtonElement>(null)

  const maxModels = user
    ? getModelLimit(user.subscription_tier)
    : getModelLimit('unregistered')

  useEffect(() => {
    let cancelled = false
    setModelsLoadError(null)
    loadModels()
      .then((data) => {
        if (cancelled) return
        setModelsByProvider(data ?? {})
      })
      .catch((err) => {
        if (cancelled) return
        const message = err instanceof Error ? err.message : 'Failed to load models'
        setModelsLoadError(
          message === 'Failed to fetch'
            ? 'Can’t reach the API. Start the local backend on port 8000, then reload the extension.'
            : message
        )
      })
    return () => {
      cancelled = true
    }
  }, [user])

  useEffect(() => {
    hasAcknowledgedPageContextIntro()
      .then((acknowledged) => {
        if (!acknowledged) setShowPageContextIntro(true)
      })
      .catch(() => undefined)
  }, [])

  const handleAcknowledgePageContextIntro = () => {
    void acknowledgePageContextIntro().then(() => setShowPageContextIntro(false))
  }

  useEffect(() => {
    let cancelled = false
    Promise.all([listModelDefaults(), getLastModelDefaultId()])
      .then(([defaults, lastId]) => {
        if (cancelled) return
        setModelDefaults(defaults)
        setLastDefaultId(lastId)
        setLastDefaultLoaded(true)
      })
      .catch(() => {
        if (!cancelled) setLastDefaultLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const updateDefaultsMenuPosition = useCallback(() => {
    const rect = defaultsTriggerRef.current?.getBoundingClientRect()
    if (!rect) return
    setDefaultsMenuPos({
      top: rect.bottom + 6,
      right: Math.max(8, window.innerWidth - rect.right),
    })
  }, [])

  useEffect(() => {
    if (!showDefaultsMenu) return
    updateDefaultsMenuPosition()
    const handlePointerDown = (event: MouseEvent) => {
      if (!defaultsControlRef.current?.contains(event.target as Node)) {
        setShowDefaultsMenu(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('resize', updateDefaultsMenuPosition)
    window.addEventListener('scroll', updateDefaultsMenuPosition, true)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('resize', updateDefaultsMenuPosition)
      window.removeEventListener('scroll', updateDefaultsMenuPosition, true)
    }
  }, [showDefaultsMenu, updateDefaultsMenuPosition])

  const textModelsByProvider = useMemo(
    () => filterModelsByProviderToText(modelsByProvider),
    [modelsByProvider]
  )

  const allModels = useMemo(
    () => Object.values(textModelsByProvider).flat(),
    [textModelsByProvider]
  )
  const pickerModelsByProvider = isModelCatalogReady(textModelsByProvider)
    ? textModelsByProvider
    : modelsByProvider

  const getTabContext = useCallback(async () => {
    const activeRes = await sendTabContextMessage({ type: 'GET_ACTIVE_TAB' })
    const tabIds = new Set<number>()
    if (sharePageContext && activeRes.type === 'ACTIVE_TAB' && activeRes.tab) {
      tabIds.add(activeRes.tab.tabId)
    }

    const tabUrlById = new Map<number, string>()
    if (activeRes.type === 'ACTIVE_TAB' && activeRes.tab) {
      tabUrlById.set(activeRes.tab.tabId, activeRes.tab.url)
    }
    const listRes = await sendTabContextMessage({ type: 'LIST_TABS', allWindows: true })
    if (listRes.type === 'TABS_LIST') {
      for (const tab of listRes.tabs) {
        tabUrlById.set(tab.tabId, tab.url)
      }
      for (const tabId of matchOpenTabsToContexts(pageContexts, listRes.tabs)) {
        tabIds.add(tabId)
      }
    }

    const preloaded: Record<number, PreloadedTabContent> = {}
    await Promise.all(
      [...tabIds].map(async (tabId) => {
        const content = await extractTabContentFromSidePanel(tabId, tabUrlById.get(tabId))
        if (content) preloaded[tabId] = content
      })
    )

    const res = await sendTabContextMessage({
      type: 'GET_TAB_CONTEXT',
      tabIds: [...tabIds],
      includeSelection: true,
      preloaded: Object.keys(preloaded).length > 0 ? preloaded : undefined,
    })
    if (res.type === 'TAB_CONTEXT') {
      return res.bundle
    }
    return null
  }, [pageContexts, sharePageContext])

  const handleComparisonFinished = useCallback(() => {
    onComparisonFinished?.()
  }, [onComparisonFinished])

  const comparison = useComparisonPage({
    apiClient,
    modelsByProvider: textModelsByProvider,
    browserFingerprint,
    getTabContext:
      sharePageContext || pageContexts.length > 0 ? getTabContext : undefined,
    sharePageContext: sharePageContext || pageContexts.length > 0,
    maxModels,
    onComparisonFinished: handleComparisonFinished,
    initialState: persistedState
      ? {
          input: persistedState.input,
          selectedModels: hydrateSelectedModelIds({
            selectedModels: persistedState.selectedModels,
            results: persistedState.results,
            conversationHistory: persistedState.conversationHistory,
          }),
          results: hydrateConversationResults(
            persistedState.results,
            persistedState.conversationHistory
          ),
          conversationId: persistedState.conversationId,
          conversationHistory: persistedState.conversationHistory,
          error: persistedState.error,
        }
      : undefined,
  })

  const capturePersistedState = useCallback((): ExtensionShellPersistedState => {
    return {
      input: comparison.input,
      selectedModels: comparison.selectedModels,
      results: comparison.results,
      conversationId: comparison.conversationId,
      conversationHistory: comparison.conversationHistory,
      error: comparison.error,
      sharePageContext,
      pageContexts,
      pageContextCollapsed,
      collapsedResultIds: [...collapsedResultIds],
      submittedPrompt,
      activeRecentChatId,
      activeModelDefaultId,
      closedModelIds: [...closedModelIds],
    }
  }, [
    activeModelDefaultId,
    activeRecentChatId,
    closedModelIds,
    collapsedResultIds,
    comparison.conversationHistory,
    comparison.conversationId,
    comparison.error,
    comparison.input,
    comparison.results,
    comparison.selectedModels,
    pageContexts,
    pageContextCollapsed,
    sharePageContext,
    submittedPrompt,
  ])

  const saveRecentChat = useCallback(async () => {
    if (comparison.conversationHistory.length === 0 && comparison.results.length === 0) {
      return
    }

    const state = capturePersistedState()
    let sourceTabId = persistTabId
    let sourceTabTitle: string | undefined
    let sourceTabUrl = state.pageContexts?.[0]?.url

    if (sourceTabId == null || sourceTabId < 0) {
      const activeRes = await sendTabContextMessage({ type: 'GET_ACTIVE_TAB' })
      if (activeRes.type === 'ACTIVE_TAB' && activeRes.tab) {
        sourceTabId = activeRes.tab.tabId
        sourceTabTitle = activeRes.tab.title
        sourceTabUrl = sourceTabUrl ?? activeRes.tab.url
      }
    } else {
      const listRes = await sendTabContextMessage({ type: 'LIST_TABS', allWindows: true })
      if (listRes.type === 'TABS_LIST') {
        const sourceTab = listRes.tabs.find((tab) => tab.tabId === sourceTabId)
        sourceTabTitle = sourceTab?.title
        sourceTabUrl = sourceTabUrl ?? sourceTab?.url
      }
    }

    const saved = await upsertRecentChat({
      id: activeRecentChatId,
      state,
      sourceTabId,
      sourceTabTitle,
      sourceTabUrl,
    })
    setActiveRecentChatId(saved.id)
    onActiveRecentChatChange?.(saved.id)
    onRecentChatSaved?.()
  }, [
    activeRecentChatId,
    capturePersistedState,
    comparison.conversationHistory.length,
    comparison.results.length,
    onActiveRecentChatChange,
    onRecentChatSaved,
    persistTabId,
  ])

  const wasLoadingRef = useRef(false)
  useEffect(() => {
    const justFinished = wasLoadingRef.current && !comparison.isLoading
    wasLoadingRef.current = comparison.isLoading
    if (
      justFinished &&
      (comparison.conversationHistory.length > 0 || comparison.results.length > 0)
    ) {
      void saveRecentChat().catch(() => undefined)
    }
  }, [
    comparison.conversationHistory.length,
    comparison.isLoading,
    comparison.results.length,
    saveRecentChat,
  ])

  useEffect(() => {
    if (!onPersistState || persistTabId == null) return
    const delayMs = comparison.isLoading ? 400 : 0
    const timer = window.setTimeout(() => {
      onPersistState(persistTabId, capturePersistedState())
    }, delayMs)
    return () => window.clearTimeout(timer)
  }, [capturePersistedState, comparison.isLoading, onPersistState, persistTabId])

  useEffect(() => {
    if (!onPersistState || persistTabId == null) return
    return () => {
      onPersistState(persistTabId, capturePersistedState())
    }
  }, [capturePersistedState, onPersistState, persistTabId])

  const isFollowUpMode =
    comparison.results.length > 0 || comparison.conversationHistory.length > 0

  useEffect(() => {
    if (isFollowUpMode) setShowModelPicker(false)
  }, [isFollowUpMode])

  useEffect(() => {
    if (isFollowUpMode) return
    if (!isModelCatalogReady(textModelsByProvider)) return
    comparison.setSelectedModels((prev) => {
      const next = resolveSelectedModelsForCatalog({
        selectedModels: prev,
        fallbackModelIds: [],
        modelsByProvider: textModelsByProvider,
        isAuthenticated: !!user,
        user,
      })
      return sameModelIds(prev, next) ? prev : next
    })
  }, [user, textModelsByProvider, comparison.setSelectedModels, isFollowUpMode])

  useEffect(() => {
    if (comparison.results.length === 0 && comparison.conversationHistory.length === 0) {
      setCollapsedResultIds(new Set())
      setSubmittedPrompt('')
      setClosedModelIds(new Set())
    }
  }, [comparison.results.length, comparison.conversationHistory.length])

  const activeModelDefault = activeModelDefaultId
    ? modelDefaults.find((entry) => entry.id === activeModelDefaultId) ?? null
    : null

  // The models from a saved default that the current user can actually select,
  // capped to their model limit. Used both when applying a default and when
  // deciding whether the active default still matches the live selection.
  const applicableDefaultModelIds = useCallback(
    (def: ModelDefault) =>
      def.modelIds
        .filter((modelId) =>
          isModelIdSelectableForUser(modelId, textModelsByProvider, !!user, user)
        )
        .slice(0, maxModels),
    [textModelsByProvider, user, maxModels]
  )

  // A default is only "active" while the current selection still matches it.
  // Any manual model change (add/remove) drops back to normal selection mode.
  useEffect(() => {
    if (!activeModelDefaultId) return
    const def = modelDefaults.find((entry) => entry.id === activeModelDefaultId)
    if (!def || !sameModelSet(applicableDefaultModelIds(def), comparison.selectedModels)) {
      setActiveModelDefaultId(null)
    }
  }, [activeModelDefaultId, modelDefaults, comparison.selectedModels, applicableDefaultModelIds])

  // On a brand-new tab/comparison, open with the latest default selection.
  // Runs once, only while the selection is still empty, so it never overrides a
  // selection restored for an existing tab or loaded chat.
  useEffect(() => {
    if (appliedInitialDefaultRef.current) return
    if (!isFreshShellRef.current || isFollowUpMode) {
      appliedInitialDefaultRef.current = true
      return
    }
    if (!lastDefaultLoaded) return
    if (!isModelCatalogReady(textModelsByProvider)) return
    if (comparison.selectedModels.length > 0) {
      appliedInitialDefaultRef.current = true
      return
    }
    appliedInitialDefaultRef.current = true
    const def = lastDefaultId ? modelDefaults.find((entry) => entry.id === lastDefaultId) : null
    if (!def) return
    const applicable = applicableDefaultModelIds(def)
    if (applicable.length === 0) return
    comparison.setSelectedModels(applicable)
    setActiveModelDefaultId(def.id)
    // A default already picks the models, so open a new tab compactly.
    setModelsCollapsed(true)
  }, [
    lastDefaultLoaded,
    lastDefaultId,
    modelDefaults,
    textModelsByProvider,
    isFollowUpMode,
    comparison.selectedModels,
    comparison.setSelectedModels,
    applicableDefaultModelIds,
  ])

  // Defaults only apply to a fresh selection, not an in-progress conversation.
  useEffect(() => {
    if (isFollowUpMode) {
      setShowDefaultsMenu(false)
      setActiveModelDefaultId(null)
    }
  }, [isFollowUpMode])

  const conversationResults =
    comparison.results.length > 0
      ? comparison.results
      : hydrateConversationResults([], comparison.conversationHistory)

  const visibleResults = conversationResults.filter(
    (result) => !closedModelIds.has(result.modelId)
  )

  const isActiveTurn =
    comparison.isLoading ||
    comparison.results.some((result) => result.isStreaming)

  const handleSubmit = () => {
    setSubmittedPrompt(comparison.input.trim())
    comparison.submitComparison()
    comparison.setInput('')
  }

  const toggleResultCollapsed = (modelId: string) => {
    setCollapsedResultIds((prev) => {
      const next = new Set(prev)
      if (next.has(modelId)) {
        next.delete(modelId)
      } else {
        next.add(modelId)
      }
      return next
    })
  }

  const handleCloseModel = (modelId: string) => {
    setClosedModelIds((prev) => {
      const next = new Set(prev)
      next.add(modelId)
      return next
    })
    comparison.setSelectedModels((prev) => prev.filter((id) => id !== modelId))
  }

  const handleToggleModel = (modelId: string) => {
    const isSelected = comparison.selectedModels.includes(modelId)
    if (isFollowUpMode) {
      if (isSelected) handleCloseModel(modelId)
      return
    }
    if (
      !isSelected &&
      !isModelIdSelectableForUser(modelId, textModelsByProvider, !!user, user)
    ) {
      return
    }
    comparison.toggleModel(modelId)
  }

  const handleNewComparison = () => {
    comparison.newComparison()
    setShowModelPicker(false)
    setShowDefaultsMenu(false)
    setActiveModelDefaultId(null)
    setClosedModelIds(new Set())
    setPageContexts([])
    setActiveRecentChatId(null)
    onActiveRecentChatChange?.(null)
  }

  const handleSelectDefault = (id: string) => {
    const def = modelDefaults.find((entry) => entry.id === id)
    if (!def) return
    const applicable = applicableDefaultModelIds(def)
    if (applicable.length === 0) return
    comparison.setSelectedModels(applicable)
    setActiveModelDefaultId(def.id)
    setLastDefaultId(def.id)
    void setLastModelDefaultId(def.id)
    setShowDefaultsMenu(false)
  }

  const handleSaveDefault = (name: string) => {
    const modelIds = [...comparison.selectedModels]
    void saveModelDefault({ name, modelIds }).then((result) => {
      setModelDefaults(result.defaults)
      if (result.status === 'saved') {
        setActiveModelDefaultId(result.saved.id)
        setLastDefaultId(result.saved.id)
        void setLastModelDefaultId(result.saved.id)
      }
    })
  }

  const handleDeleteDefault = (id: string) => {
    void deleteModelDefault(id).then((defaults) => {
      setModelDefaults(defaults)
      setActiveModelDefaultId((current) => (current === id ? null : current))
      setLastDefaultId((current) => (current === id ? null : current))
    })
  }

  const clearActiveDefault = () => {
    setActiveModelDefaultId(null)
    setLastDefaultId(null)
    void setLastModelDefaultId(null)
  }

  return (
    <>
      <div className="scroll-body">
        {showPageContextIntro && (
          <PageContextIntroModal onAcknowledge={handleAcknowledgePageContextIntro} />
        )}
        <ExtensionContextBar
          sharePageContext={sharePageContext}
          onSharePageContextChange={setSharePageContext}
          pageContexts={pageContexts}
          onPageContextsChange={setPageContexts}
          collapsed={pageContextCollapsed}
          onCollapsedChange={setPageContextCollapsed}
          restoreKey={activeRecentChatId ?? undefined}
        />
        {persistedState?.pageContextUnavailable && (
          <p className="page-context-unavailable">
            Page context from the original tab is not stored with this chat.
          </p>
        )}

        <div className={`models-section${modelsCollapsed ? ' models-section-collapsed' : ''}`}>
          <div className="models-header">
            <button
              type="button"
              className="ghost context-collapse-toggle"
              onClick={() => setModelsCollapsed((value) => !value)}
              aria-expanded={!modelsCollapsed}
              aria-label={modelsCollapsed ? 'Expand models' : 'Collapse models'}
            >
              <span className="context-collapse-chevron" aria-hidden="true">
                {modelsCollapsed ? '▶' : '▼'}
              </span>
              Models
            </button>
            {activeModelDefault ? (
              <span
                className="model-default-indicator"
                aria-label={`Default selection: ${activeModelDefault.name}`}
              >
                <span className="model-default-indicator-name">{activeModelDefault.name}</span>
                <button
                  type="button"
                  className="model-default-indicator-close"
                  onClick={clearActiveDefault}
                  title="Clear default selection"
                  aria-label="Clear default selection"
                >
                  ×
                </button>
              </span>
            ) : (
              <>
                <span
                  className="section-count"
                  aria-label={
                    isFollowUpMode
                      ? `${comparison.selectedModels.length} selected models`
                      : `${comparison.selectedModels.length} of ${maxModels} models selected`
                  }
                >
                  {isFollowUpMode
                    ? comparison.selectedModels.length
                    : `${comparison.selectedModels.length}/${maxModels}`}
                </span>
                {comparison.selectedModels.length > 0 && (
                  <div className="tab-icons" aria-hidden="true">
                    {comparison.selectedModels.map((id) => {
                      const model = allModels.find((m) => m.id === id)
                      const name = model?.name ?? id
                      return (
                        <span key={id} className="tab-icon" title={name}>
                          {model?.provider ? (
                            <ProviderIcon provider={model.provider} />
                          ) : (
                            <span className="tab-icon-fallback">
                              {name.charAt(0).toUpperCase()}
                            </span>
                          )}
                        </span>
                      )
                    })}
                  </div>
                )}
              </>
            )}
            {!modelsCollapsed && !isFollowUpMode && !activeModelDefault && (
              <div className="model-defaults-control" ref={defaultsControlRef}>
                <button
                  type="button"
                  ref={defaultsTriggerRef}
                  className="model-defaults-trigger"
                  onClick={() => {
                    if (!showDefaultsMenu) updateDefaultsMenuPosition()
                    setShowDefaultsMenu((open) => !open)
                  }}
                  aria-expanded={showDefaultsMenu}
                  aria-haspopup="dialog"
                  title="Save the current selection as a default"
                >
                  Set default
                </button>
                {showDefaultsMenu && (
                  <ExtensionDefaultsMenu
                    defaults={modelDefaults}
                    activeDefaultId={activeModelDefaultId}
                    selectedCount={comparison.selectedModels.length}
                    maxDefaults={MAX_MODEL_DEFAULTS}
                    style={
                      defaultsMenuPos
                        ? { top: defaultsMenuPos.top, right: defaultsMenuPos.right }
                        : undefined
                    }
                    onSelectDefault={handleSelectDefault}
                    onSaveDefault={handleSaveDefault}
                    onDeleteDefault={handleDeleteDefault}
                  />
                )}
              </div>
            )}
          </div>
          {!modelsCollapsed && (
            <>
              <div className="model-chips">
                {comparison.selectedModels.map((id) => {
                  const model = allModels.find((m) => m.id === id)
                  const name = model?.name ?? id
                  return (
                    <button
                      key={id}
                      type="button"
                      className="model-chip selected"
                      onClick={() => handleToggleModel(id)}
                      title={
                        isFollowUpMode
                          ? `Stop getting replies from ${name}`
                          : `Remove ${name}`
                      }
                      aria-label={
                        isFollowUpMode
                          ? `Stop getting replies from ${name}`
                          : `Remove ${name}`
                      }
                    >
                      {name} ×
                    </button>
                  )
                })}
                {!isFollowUpMode && (
                  <button
                    type="button"
                    className="model-chip"
                    onClick={(event) => {
                      event.stopPropagation()
                      setModelsCollapsed(false)
                      setShowModelPicker((open) => !open)
                    }}
                    aria-expanded={showModelPicker}
                  >
                    {showModelPicker ? 'Collapse' : '+ Add'}
                  </button>
                )}
              </div>
              {!isFollowUpMode && showModelPicker && modelsLoadError && (
                <div className="recent-chats-empty">{modelsLoadError}</div>
              )}
              {!isFollowUpMode &&
                showModelPicker &&
                !modelsLoadError &&
                !isModelCatalogReady(pickerModelsByProvider) && (
                  <div className="recent-chats-empty">Loading models…</div>
                )}
              {!isFollowUpMode &&
                showModelPicker &&
                isModelCatalogReady(pickerModelsByProvider) && (
                  <ExtensionModelPicker
                    modelsByProvider={pickerModelsByProvider}
                    selectedModels={comparison.selectedModels}
                    maxModels={maxModels}
                    user={user}
                    onToggleModel={handleToggleModel}
                    onOpenAuth={() => void openWebAppLogin()}
                  />
                )}
            </>
          )}
        </div>

        {comparison.error && <div className="error-banner">{comparison.error}</div>}

        {comparison.contextMessageCount > 0 && (
          <div className="history-list">
            Follow-up mode: {comparison.contextMessageCount} messages in context
          </div>
        )}

        {visibleResults.length > 0 && (
          <div className="results">
            {visibleResults.map((result) => {
              const isCollapsed = collapsedResultIds.has(result.modelId)

              const pastMessages: Array<{ role: 'user' | 'assistant'; content: string }> = []
              for (const msg of comparison.conversationHistory) {
                if (msg.role === 'user') {
                  pastMessages.push({ role: 'user', content: msg.content })
                } else if (msg.role === 'assistant' && msg.model_id === result.modelId) {
                  pastMessages.push({ role: 'assistant', content: msg.content })
                }
              }

              const assistantContent = result.error
                ? result.error
                : result.content || (result.isStreaming ? '' : 'No response')
              const turnInHistory =
                !!submittedPrompt &&
                isModelTurnInHistory(
                  comparison.conversationHistory,
                  submittedPrompt,
                  result.modelId,
                  assistantContent
                )
              const shouldShowCurrentTurn =
                !!submittedPrompt && (isActiveTurn || !turnInHistory)

              const currentTurnMessages: Array<{ role: 'user' | 'assistant'; content: string }> =
                []
              if (shouldShowCurrentTurn) {
                currentTurnMessages.push({ role: 'user', content: submittedPrompt })
                if (result.content || result.isStreaming || result.error) {
                  currentTurnMessages.push({
                    role: 'assistant',
                    content: assistantContent,
                  })
                }
              }

              const allMessages = [...pastMessages, ...currentTurnMessages]

              return (
                <div
                  key={result.modelId}
                  className={`result-card${isCollapsed ? ' collapsed' : ''}`}
                >
                  <div className="result-card-header">
                    <button
                      type="button"
                      className="result-card-toggle"
                      onClick={() => toggleResultCollapsed(result.modelId)}
                      aria-expanded={!isCollapsed}
                      aria-controls={`result-body-${result.modelId}`}
                    >
                      <span className="result-card-chevron" aria-hidden="true">
                        {isCollapsed ? '▶' : '▼'}
                      </span>
                      <span className="result-card-title">{result.modelName}</span>
                      {isCollapsed && result.isStreaming && (
                        <span className="result-card-status">Streaming…</span>
                      )}
                      {isCollapsed && result.error && (
                        <span className="result-card-status error">Error</span>
                      )}
                    </button>
                    {isFollowUpMode && (
                      <button
                        type="button"
                        className="result-card-close"
                        onClick={() => handleCloseModel(result.modelId)}
                        title={`Stop getting replies from ${result.modelName}`}
                        aria-label={`Stop getting replies from ${result.modelName}`}
                      >
                        ×
                      </button>
                    )}
                  </div>
                  {!isCollapsed && (
                    <div
                      id={`result-body-${result.modelId}`}
                      className="result-card-body conversation-body"
                    >
                      {allMessages.map((msg, i) => (
                        <div
                          key={i}
                          className={`ext-message ext-message-${msg.role}`}
                        >
                          <div className="ext-message-label">
                            {msg.role === 'user' ? 'You' : result.modelName}
                          </div>
                          <div
                            className={`ext-message-content${
                              msg.role === 'assistant' &&
                              i === allMessages.length - 1 &&
                              result.isStreaming
                                ? ' streaming'
                                : msg.role === 'assistant'
                                  ? ' message-content'
                                  : ''
                            }`}
                          >
                            {msg.role === 'assistant' && !msg.content && result.isStreaming ? (
                              'Thinking…'
                            ) : msg.role === 'assistant' &&
                              result.isStreaming &&
                              i === allMessages.length - 1 ? (
                              msg.content
                            ) : msg.role === 'assistant' ? (
                              <Suspense fallback={msg.content}>
                                <LatexRenderer modelId={result.modelId}>{msg.content}</LatexRenderer>
                              </Suspense>
                            ) : (
                              msg.content
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div
        className={`composer-footer${
          comparison.results.length === 0 ? ' composer-footer-expanded' : ''
        }`}
      >
        <div className="composer-box">
          <TabMentionInput
            className="composer-input"
            value={comparison.input}
            onChange={comparison.setInput}
            onPinTab={(tab) => {
              setPageContexts((prev) => addPinnedContext(prev, tab))
            }}
            placeholder={
              comparison.results.length > 0
                ? 'Continue the conversation here...'
                : 'Ask anything… Optionally include one or more tabs with @'
            }
          />
          <div className="composer-actions">
            <button
              type="button"
              className="icon-button icon-button-ghost"
              onClick={handleNewComparison}
              title="New comparison"
              aria-label="New comparison"
            >
              <NewIcon />
            </button>
            {comparison.isLoading ? (
              <button
                type="button"
                className="icon-button icon-button-stop"
                onClick={comparison.cancelComparison}
                title="Cancel"
                aria-label="Cancel"
              >
                <StopIcon />
              </button>
            ) : (
              <button
                type="button"
                className="icon-button icon-button-send"
                onClick={handleSubmit}
                disabled={!comparison.input.trim() || comparison.selectedModels.length === 0}
                title="Submit"
                aria-label="Submit"
              >
                <SendIcon />
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
