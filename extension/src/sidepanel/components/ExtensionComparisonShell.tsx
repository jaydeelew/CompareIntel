import { useEffect, useMemo, useState } from 'react'

import { useComparisonPage } from '@compareintel/core'
import type { ModelInfo, RateLimitStatus, User } from '@compareintel/core'

import { apiClient, loadModels, loadRateLimitStatus } from '../api'
import { sendTabContextMessage } from '../messaging'

import { ExtensionContextBar, TabMentionInput } from './ExtensionContextBar'

interface ExtensionComparisonShellProps {
  user: User | null
  rateLimit: RateLimitStatus | null
  browserFingerprint?: string
  onOpenAuth: () => void
}

function exportMarkdown(prompt: string, results: { modelName: string; content: string }[]) {
  const lines = [`# CompareIntel Comparison`, '', `**Prompt:** ${prompt}`, '']
  for (const r of results) {
    lines.push(`## ${r.modelName}`, '', r.content, '')
  }
  return lines.join('\n')
}

export function ExtensionComparisonShell({
  user,
  rateLimit,
  browserFingerprint,
  onOpenAuth,
}: ExtensionComparisonShellProps) {
  const [modelsByProvider, setModelsByProvider] = useState<Record<string, ModelInfo[]>>({})
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [sharePageContext, setSharePageContext] = useState(true)
  const [contextTabIds, setContextTabIds] = useState<number[]>([])
  const [tokenEstimate, setTokenEstimate] = useState<number | undefined>()

  const maxModels = rateLimit?.model_limit ?? (user ? 4 : 2)

  useEffect(() => {
    loadModels().then(setModelsByProvider).catch(() => undefined)
  }, [])

  const allModels = useMemo(
    () => Object.values(modelsByProvider).flat(),
    [modelsByProvider]
  )

  const getTabContext = async () => {
    const activeRes = await sendTabContextMessage({ type: 'GET_ACTIVE_TAB' })
    const tabIds = new Set(contextTabIds)
    if (sharePageContext && activeRes.type === 'ACTIVE_TAB' && activeRes.tab) {
      tabIds.add(activeRes.tab.tabId)
    }
    const res = await sendTabContextMessage({
      type: 'GET_TAB_CONTEXT',
      tabIds: [...tabIds],
      includeSelection: true,
    })
    if (res.type === 'TAB_CONTEXT') {
      setTokenEstimate(res.bundle.tokenEstimate)
      return res.bundle
    }
    return null
  }

  const comparison = useComparisonPage({
    apiClient,
    modelsByProvider,
    browserFingerprint,
    getTabContext: sharePageContext || contextTabIds.length > 0 ? getTabContext : undefined,
    sharePageContext: sharePageContext || contextTabIds.length > 0,
    maxModels,
  })

  const handleExportMarkdown = () => {
    const md = exportMarkdown(comparison.input, comparison.results)
    const blob = new Blob([md], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'compareintel-comparison.md'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExportJson = () => {
    const data = {
      prompt: comparison.input,
      models: comparison.selectedModels,
      results: comparison.results.map((r) => ({
        modelId: r.modelId,
        modelName: r.modelName,
        content: r.content,
        error: r.error,
      })),
      exportedAt: new Date().toISOString(),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'compareintel-comparison.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="scroll-body">
      <ExtensionContextBar
        sharePageContext={sharePageContext}
        onSharePageContextChange={setSharePageContext}
        onContextTabsChange={setContextTabIds}
        tokenEstimate={tokenEstimate}
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
                onClick={() => comparison.toggleModel(id)}
              >
                {model?.name ?? id} ×
              </button>
            )
          })}
          <button type="button" className="model-chip" onClick={() => setShowModelPicker(!showModelPicker)}>
            + Add
          </button>
        </div>
        {showModelPicker && (
          <div className="model-picker">
            {allModels.slice(0, 50).map((model) => (
              <button
                key={model.id}
                type="button"
                className="model-option"
                onClick={() => {
                  comparison.toggleModel(model.id)
                  if (comparison.selectedModels.length + 1 >= maxModels) setShowModelPicker(false)
                }}
              >
                {model.name} ({model.provider})
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="composer">
        <TabMentionInput
          value={comparison.input}
          onChange={comparison.setInput}
          placeholder="Ask about this page… Use @ to include other tabs"
        />
        <div className="composer-actions">
          <label>
            <input
              type="checkbox"
              checked={comparison.webSearchEnabled}
              onChange={(e) => comparison.setWebSearchEnabled(e.target.checked)}
            />
            Web search
          </label>
          {comparison.isLoading ? (
            <button type="button" className="secondary" onClick={comparison.cancelComparison}>
              Cancel
            </button>
          ) : (
            <button
              type="button"
              onClick={comparison.submitComparison}
              disabled={!comparison.input.trim() || comparison.selectedModels.length === 0}
            >
              Compare
            </button>
          )}
          <button type="button" className="secondary" onClick={comparison.newComparison}>
            New
          </button>
        </div>
      </div>

      {comparison.error && <div className="error-banner">{comparison.error}</div>}

      {!user && (
        <div className="error-banner" style={{ borderColor: 'var(--accent)', color: 'var(--text)' }}>
          Sign in for more models and higher limits.{' '}
          <button type="button" className="ghost" onClick={onOpenAuth}>
            Sign in
          </button>
        </div>
      )}

      {comparison.conversationHistory.length > 0 && (
        <div className="history-list">
          Follow-up mode: {comparison.conversationHistory.length} messages in context
        </div>
      )}

      {comparison.results.length > 0 && (
        <>
          <div className="export-actions">
            <button type="button" className="secondary" onClick={handleExportMarkdown}>
              Export MD
            </button>
            <button type="button" className="secondary" onClick={handleExportJson}>
              Export JSON
            </button>
          </div>
          <div className="results">
            {comparison.results.map((result) => (
              <div key={result.modelId} className="result-card">
                <div className="result-card-header">{result.modelName}</div>
                <div className={`result-card-body ${result.isStreaming ? 'streaming' : ''}`}>
                  {result.error ? (
                    <span style={{ color: 'var(--error)' }}>{result.error}</span>
                  ) : (
                    result.content || (result.isStreaming ? 'Thinking…' : 'No response')
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
