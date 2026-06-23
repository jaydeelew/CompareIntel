import { useEffect, useMemo, useState } from 'react'

import {
  useComparisonPage,
  getModelLimit,
  filterModelsByProviderToText,
  isModelIdSelectableForUser,
} from '@compareintel/core'
import type { ModelInfo, User } from '@compareintel/core'

import type { PreloadedTabContent } from '@compareintel/core'

import { apiClient, loadModels } from '../api'
import { extractTabContentFromSidePanel } from '../extractTabContent'
import { sendTabContextMessage } from '../messaging'
import {
  acknowledgePageContextIntro,
  hasAcknowledgedPageContextIntro,
} from '../../shared/pageContextIntro'

import { ExtensionContextBar, TabMentionInput } from './ExtensionContextBar'
import { ExtensionModelPicker } from './ExtensionModelPicker'
import { PageContextIntroModal } from './PageContextIntroModal'

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

interface ExtensionComparisonShellProps {
  user: User | null
  browserFingerprint?: string
  onOpenAuth: () => void
  onComparisonFinished?: () => void
}

export function ExtensionComparisonShell({
  user,
  browserFingerprint,
  onOpenAuth,
  onComparisonFinished,
}: ExtensionComparisonShellProps) {
  const [modelsByProvider, setModelsByProvider] = useState<Record<string, ModelInfo[]>>({})
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [sharePageContext, setSharePageContext] = useState(true)
  const [contextTabIds, setContextTabIds] = useState<number[]>([])
  const [collapsedResultIds, setCollapsedResultIds] = useState<Set<string>>(new Set())
  const [showPageContextIntro, setShowPageContextIntro] = useState(false)
  const [submittedPrompt, setSubmittedPrompt] = useState('')

  const maxModels = user
    ? getModelLimit(user.subscription_tier)
    : getModelLimit('unregistered')

  useEffect(() => {
    loadModels().then(setModelsByProvider).catch(() => undefined)
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

  const textModelsByProvider = useMemo(
    () => filterModelsByProviderToText(modelsByProvider),
    [modelsByProvider]
  )

  const allModels = useMemo(
    () => Object.values(textModelsByProvider).flat(),
    [textModelsByProvider]
  )

  const getTabContext = async () => {
    const activeRes = await sendTabContextMessage({ type: 'GET_ACTIVE_TAB' })
    const tabIds = new Set(contextTabIds)
    if (sharePageContext && activeRes.type === 'ACTIVE_TAB' && activeRes.tab) {
      tabIds.add(activeRes.tab.tabId)
    }

    const tabUrlById = new Map<number, string>()
    if (activeRes.type === 'ACTIVE_TAB' && activeRes.tab) {
      tabUrlById.set(activeRes.tab.tabId, activeRes.tab.url)
    }
    const listRes = await sendTabContextMessage({ type: 'LIST_TABS' })
    if (listRes.type === 'TABS_LIST') {
      for (const tab of listRes.tabs) {
        tabUrlById.set(tab.tabId, tab.url)
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
  }

  const comparison = useComparisonPage({
    apiClient,
    modelsByProvider: textModelsByProvider,
    browserFingerprint,
    getTabContext: sharePageContext || contextTabIds.length > 0 ? getTabContext : undefined,
    sharePageContext: sharePageContext || contextTabIds.length > 0,
    maxModels,
    onComparisonFinished,
  })

  useEffect(() => {
    comparison.setSelectedModels((prev) =>
      prev.filter((id) =>
        isModelIdSelectableForUser(id, textModelsByProvider, !!user, user)
      )
    )
  }, [user, textModelsByProvider, comparison.setSelectedModels])

  useEffect(() => {
    if (comparison.results.length === 0) {
      setCollapsedResultIds(new Set())
      setSubmittedPrompt('')
    }
  }, [comparison.results.length])

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

  const handleToggleModel = (modelId: string) => {
    if (
      !comparison.selectedModels.includes(modelId) &&
      !isModelIdSelectableForUser(modelId, textModelsByProvider, !!user, user)
    ) {
      return
    }
    comparison.toggleModel(modelId)
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
          onContextTabsChange={setContextTabIds}
        />

        <div className="models-section">
          <h3>Models ({comparison.selectedModels.length}/{maxModels})</h3>
          <div className="model-chips">
            {comparison.selectedModels.map((id) => {
              const model = allModels.find((m) => m.id === id)
              return (
                <button
                  key={id}
                  type="button"
                  className="model-chip selected"
                  onClick={() => handleToggleModel(id)}
                >
                  {model?.name ?? id} ×
                </button>
              )
            })}
            <button
              type="button"
              className="model-chip"
              onClick={() => setShowModelPicker(!showModelPicker)}
              aria-expanded={showModelPicker}
            >
              {showModelPicker ? 'Collapse' : '+ Add'}
            </button>
          </div>
          {showModelPicker && (
            <ExtensionModelPicker
              modelsByProvider={textModelsByProvider}
              selectedModels={comparison.selectedModels}
              maxModels={maxModels}
              user={user}
              onToggleModel={handleToggleModel}
              onOpenAuth={onOpenAuth}
            />
          )}
        </div>

        {comparison.error && <div className="error-banner">{comparison.error}</div>}

        {comparison.contextMessageCount > 0 && (
          <div className="history-list">
            Follow-up mode: {comparison.contextMessageCount} messages in context
          </div>
        )}

        {comparison.results.length > 0 && (
          <div className="results">
            {comparison.results.map((result) => {
              const isCollapsed = collapsedResultIds.has(result.modelId)

              const pastMessages: Array<{ role: 'user' | 'assistant'; content: string }> = []
              for (const msg of comparison.conversationHistory) {
                if (msg.role === 'user') {
                  pastMessages.push({ role: 'user', content: msg.content })
                } else if (msg.role === 'assistant' && msg.model_id === result.modelId) {
                  pastMessages.push({ role: 'assistant', content: msg.content })
                }
              }

              const currentTurnMessages: Array<{ role: 'user' | 'assistant'; content: string }> = []
              if (submittedPrompt) {
                currentTurnMessages.push({ role: 'user', content: submittedPrompt })
              }
              if (result.content || result.isStreaming || result.error) {
                currentTurnMessages.push({
                  role: 'assistant',
                  content: result.error
                    ? result.error
                    : result.content || (result.isStreaming ? '' : 'No response'),
                })
              }

              const allMessages = [...pastMessages, ...currentTurnMessages]

              return (
                <div
                  key={result.modelId}
                  className={`result-card${isCollapsed ? ' collapsed' : ''}`}
                >
                  <button
                    type="button"
                    className="result-card-header"
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
                            className={`ext-message-content${msg.role === 'assistant' &&
                                i === allMessages.length - 1 &&
                                result.isStreaming
                                ? ' streaming'
                                : ''
                              }`}
                          >
                            {msg.role === 'assistant' && !msg.content && result.isStreaming
                              ? 'Thinking…'
                              : msg.content}
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
            placeholder={
              comparison.results.length > 0
                ? 'Continue the conversation here...'
                : 'Ask about this page… Use @ to include other tabs'
            }
          />
          <div className="composer-actions">
            <button
              type="button"
              className="icon-button icon-button-ghost"
              onClick={comparison.newComparison}
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
