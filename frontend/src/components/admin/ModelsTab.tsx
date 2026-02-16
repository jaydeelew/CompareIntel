import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAuthHeaders } from '../../contexts/AuthContext'
import type { AvailableModelsResponse } from '../../services/modelsService'
import type { Model } from '../../types/models'
import logger from '../../utils/logger'
import { LoadingSpinner } from '../shared/LoadingSpinner'

import { waitForServerRestart } from './utils'

const isDevelopment = import.meta.env.DEV

interface ModelsTabProps {
  saveScrollPosition: () => void
  restoreScrollPosition: () => void
  onBusyChange: (busy: boolean) => void
}

const ModelsTab: React.FC<ModelsTabProps> = ({
  saveScrollPosition,
  restoreScrollPosition,
  onBusyChange,
}) => {
  const getAuthHeaders = useAuthHeaders()
  const navigate = useNavigate()
  const addModelAbortControllerRef = useRef<AbortController | null>(null)
  const addModelReaderRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null)

  const [models, setModels] = useState<AvailableModelsResponse | null>(null)
  const [modelsLoading, setModelsLoading] = useState(false)
  const [newModelId, setNewModelId] = useState('')
  const [newModelKnowledgeCutoff, setNewModelKnowledgeCutoff] = useState('')
  const [addingModel, setAddingModel] = useState(false)
  const [editingCutoff, setEditingCutoff] = useState<{ modelId: string; value: string } | null>(
    null
  )
  const [modelProgress, setModelProgress] = useState<{
    stage: string
    message: string
    progress: number
  } | null>(null)
  const [modelError, setModelError] = useState<string | null>(null)
  const [modelSuccess, setModelSuccess] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [modelToDelete, setModelToDelete] = useState<{ id: string; name: string } | null>(null)
  const [deletingModel, setDeletingModel] = useState(false)

  useEffect(() => {
    onBusyChange(addingModel || deletingModel)
  }, [addingModel, deletingModel, onBusyChange])

  const fetchModels = useCallback(async () => {
    try {
      setModelsLoading(true)
      const headers = getAuthHeaders()
      const response = await fetch('/api/admin/models', { headers, credentials: 'include' })
      if (!response.ok) {
        if (response.status === 401)
          throw new Error('Authentication required. Please log in again.')
        if (response.status === 403) throw new Error('Access denied. Admin privileges required.')
        throw new Error(`Failed to fetch models (${response.status})`)
      }
      const data = await response.json()
      setModels(data)
    } catch (err) {
      logger.error('Error fetching models:', err)
    } finally {
      setModelsLoading(false)
    }
  }, [getAuthHeaders])

  useEffect(() => {
    fetchModels()
  }, [fetchModels])

  const handleAddModel = async () => {
    if (!newModelId.trim()) {
      setModelError('Please enter a model ID')
      return
    }
    saveScrollPosition()
    if (typeof window !== 'undefined') navigate('/admin', { replace: true })
    if (typeof window !== 'undefined') sessionStorage.setItem('adminPanel_activeTab', 'models')

    setAddingModel(true)
    setModelError(null)
    setModelSuccess(null)
    setModelProgress({ stage: 'validating', message: 'Validating model...', progress: 0 })

    const abortController = new AbortController()
    addModelAbortControllerRef.current = abortController

    try {
      const headers = getAuthHeaders()
      const validateResponse = await fetch('/api/admin/models/validate', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_id: newModelId.trim(),
          knowledge_cutoff: newModelKnowledgeCutoff.trim() || null,
        }),
        credentials: 'include',
        signal: abortController.signal,
      })
      const validateData = await validateResponse.json()
      if (!validateResponse.ok) throw new Error(validateData.detail || 'Model validation failed')
      if (!validateData.valid)
        throw new Error(validateData.message || `Model ${newModelId.trim()} is not valid`)

      const response = await fetch('/api/admin/models/add-stream', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_id: newModelId.trim(),
          knowledge_cutoff: newModelKnowledgeCutoff.trim() || null,
        }),
        credentials: 'include',
        signal: abortController.signal,
      })
      if (!response.ok) {
        try {
          const errorData = await response.json()
          throw new Error(errorData.detail || 'Failed to start model addition')
        } catch {
          throw new Error(`Failed to start model addition: ${response.statusText}`)
        }
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      if (!reader) throw new Error('Response body is not readable')
      addModelReaderRef.current = reader

      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              if (data.type === 'progress') {
                setModelProgress({
                  stage: data.stage || 'processing',
                  message: data.message || 'Processing...',
                  progress: data.progress || 0,
                })
              } else if (data.type === 'success') {
                setModelSuccess(`Model ${data.model_id || newModelId.trim()} added successfully!`)
                setNewModelId('')
                setNewModelKnowledgeCutoff('')
                setModelProgress({
                  stage: 'restarting',
                  message: 'Waiting for server to restart...',
                  progress: 95,
                })
                await waitForServerRestart(getAuthHeaders)
                await fetchModels()
                setModelProgress(null)
                setAddingModel(false)
                addModelAbortControllerRef.current = null
                addModelReaderRef.current = null
                if (typeof window !== 'undefined')
                  sessionStorage.setItem('adminPanel_activeTab', 'models')
                setTimeout(() => restoreScrollPosition(), 50)
                return
              } else if (data.type === 'error') {
                throw new Error(data.message || 'Failed to add model')
              }
            } catch (e) {
              if (e instanceof SyntaxError) continue
              throw e
            }
          }
        }
      }
      throw new Error('Stream ended unexpectedly')
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setModelError('Model addition cancelled')
      } else {
        setModelError(err instanceof Error ? err.message : 'Failed to add model')
      }
      setModelProgress(null)
      setAddingModel(false)
      addModelAbortControllerRef.current = null
      addModelReaderRef.current = null
      if (typeof window !== 'undefined') sessionStorage.setItem('adminPanel_activeTab', 'models')
      setTimeout(() => restoreScrollPosition(), 50)
    }
  }

  const handleCancelAddModel = () => {
    if (addModelAbortControllerRef.current) {
      addModelAbortControllerRef.current.abort()
      addModelAbortControllerRef.current = null
    }
    if (addModelReaderRef.current) {
      addModelReaderRef.current.cancel()
      addModelReaderRef.current = null
    }
    setModelProgress(null)
    setAddingModel(false)
    setModelError('Model addition cancelled')
  }

  const handleDeleteModel = async () => {
    if (!modelToDelete) return
    saveScrollPosition()
    if (typeof window !== 'undefined') navigate('/admin', { replace: true })
    if (typeof window !== 'undefined') sessionStorage.setItem('adminPanel_activeTab', 'models')

    setDeletingModel(true)
    setModelError(null)
    setModelSuccess(null)
    try {
      const headers = getAuthHeaders()
      const response = await fetch('/api/admin/models/delete', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_id: modelToDelete.id }),
        credentials: 'include',
      })
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to delete model')
      }
      setModelSuccess(`Model ${modelToDelete.id} deleted successfully!`)
      setShowDeleteConfirm(false)
      setModelToDelete(null)
      await waitForServerRestart(getAuthHeaders)
      await fetchModels()
      if (typeof window !== 'undefined') sessionStorage.setItem('adminPanel_activeTab', 'models')
    } catch (err) {
      setModelError(err instanceof Error ? err.message : 'Failed to delete model')
      if (typeof window !== 'undefined') sessionStorage.setItem('adminPanel_activeTab', 'models')
    } finally {
      setDeletingModel(false)
      if (typeof window !== 'undefined') sessionStorage.setItem('adminPanel_activeTab', 'models')
      setTimeout(() => restoreScrollPosition(), 50)
    }
  }

  const handleUpdateKnowledgeCutoff = async (modelId: string, cutoff: string) => {
    try {
      const headers = getAuthHeaders()
      const response = await fetch('/api/admin/models/update-knowledge-cutoff', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_id: modelId, knowledge_cutoff: cutoff.trim() || null }),
        credentials: 'include',
      })
      if (!response.ok) {
        if (response.status === 401)
          throw new Error('Authentication required. Please log in again.')
        if (response.status === 403) throw new Error('Access denied. Admin privileges required.')
        const errorData = await response
          .json()
          .catch(() => ({ detail: 'Failed to update knowledge cutoff' }))
        throw new Error(
          errorData.detail || `Failed to update knowledge cutoff (${response.status})`
        )
      }
      await fetchModels()
      setEditingCutoff(null)
      setModelSuccess(`Knowledge cutoff updated for ${modelId}`)
      setTimeout(() => setModelSuccess(null), 3000)
    } catch (err) {
      logger.error('Error updating knowledge cutoff:', err)
      setModelError(err instanceof Error ? err.message : 'Failed to update knowledge cutoff')
      setTimeout(() => setModelError(null), 5000)
    }
  }

  return (
    <>
      <div className="logs-management">
        <div className="logs-management-header">
          <h2>Model Management</h2>
          <button className="refresh-logs-btn" onClick={fetchModels} disabled={modelsLoading}>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
              <path d="M8 16H3v5" />
            </svg>
            Refresh
          </button>
        </div>

        {isDevelopment && (
          <div
            style={{
              marginBottom: '2rem',
              padding: '1.5rem',
              background: 'var(--bg-secondary)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-color)',
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: '1rem', color: 'var(--text-primary)' }}>
              Add New Model
            </h3>
            <div
              style={{
                marginBottom: '1rem',
                padding: '0.75rem',
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--warning-color, #f59e0b)',
                fontSize: '0.875rem',
                color: 'var(--text-secondary)',
              }}
            >
              <strong style={{ color: 'var(--warning-color, #f59e0b)' }}>💡 Reminder:</strong> When
              adding a new model, be sure to enter the knowledge cutoff date if available. This will
              be displayed in tooltips for users. You can also add/update it later in the models
              list below.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <label
                    style={{
                      display: 'block',
                      marginBottom: '0.5rem',
                      fontSize: '0.875rem',
                      color: 'var(--text-secondary)',
                      fontWeight: 500,
                    }}
                  >
                    Model ID
                  </label>
                  <input
                    type="text"
                    placeholder="Enter model ID (e.g., x-ai/grok-4.1-fast)"
                    value={newModelId}
                    onChange={e => {
                      setNewModelId(e.target.value)
                      setModelError(null)
                      setModelSuccess(null)
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !addingModel) handleAddModel()
                    }}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-color)',
                      background: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      fontSize: '1rem',
                    }}
                    disabled={addingModel}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label
                    style={{
                      display: 'block',
                      marginBottom: '0.5rem',
                      fontSize: '0.875rem',
                      color: 'var(--text-secondary)',
                      fontWeight: 500,
                    }}
                  >
                    Knowledge Cutoff Date (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., March 2025 or leave empty"
                    value={newModelKnowledgeCutoff}
                    onChange={e => {
                      setNewModelKnowledgeCutoff(e.target.value)
                      setModelError(null)
                      setModelSuccess(null)
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !addingModel) handleAddModel()
                    }}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-color)',
                      background: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      fontSize: '1rem',
                    }}
                    disabled={addingModel}
                  />
                </div>
              </div>
              {modelError && (
                <div
                  style={{ marginTop: '0.5rem', color: 'var(--error-color)', fontSize: '0.875rem' }}
                >
                  {modelError}
                </div>
              )}
              {modelSuccess && (
                <div
                  style={{
                    marginTop: '0.5rem',
                    color: 'var(--success-color)',
                    fontSize: '0.875rem',
                  }}
                >
                  {modelSuccess}
                </div>
              )}
              <button
                onClick={handleAddModel}
                disabled={addingModel || !newModelId.trim()}
                style={{
                  padding: '0.75rem 1.5rem',
                  borderRadius: 'var(--radius-md)',
                  border: 'none',
                  background:
                    addingModel || !newModelId.trim()
                      ? 'var(--bg-tertiary)'
                      : 'linear-gradient(135deg, var(--primary-color), var(--accent-color))',
                  color: 'white',
                  fontWeight: 600,
                  cursor: addingModel || !newModelId.trim() ? 'not-allowed' : 'pointer',
                  opacity: addingModel || !newModelId.trim() ? 0.6 : 1,
                  alignSelf: 'flex-start',
                }}
              >
                {addingModel ? 'Adding...' : 'Add Model'}
              </button>
            </div>
          </div>
        )}

        {!isDevelopment && (
          <div
            style={{
              marginBottom: '2rem',
              padding: '1.5rem',
              background: 'var(--bg-secondary)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-secondary)',
            }}
          >
            <p style={{ margin: 0 }}>
              Model management (add/delete) is only available in development environment. Models
              should be added via development and deployed to production.
            </p>
          </div>
        )}

        {modelsLoading ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
            Loading models...
          </div>
        ) : models?.models_by_provider ? (
          <div>
            <h3 style={{ marginBottom: '1.5rem', color: 'var(--text-primary)' }}>Current Models</h3>
            {Object.entries(models.models_by_provider).map(([provider, providerModels]) => (
              <div key={provider} style={{ marginBottom: '2rem' }}>
                <div
                  style={{
                    padding: '1rem 1.5rem',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-lg)',
                    marginBottom: '0.5rem',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <h4
                      style={{
                        margin: 0,
                        color: 'var(--text-primary)',
                        fontSize: '1.1rem',
                        fontWeight: 600,
                      }}
                    >
                      {provider}
                    </h4>
                    <span
                      style={{
                        padding: '0.25rem 0.75rem',
                        borderRadius: 'var(--radius-md)',
                        background: 'var(--bg-tertiary)',
                        color: 'var(--text-secondary)',
                        fontSize: '0.875rem',
                      }}
                    >
                      {providerModels.length} model{providerModels.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                    gap: '1rem',
                  }}
                >
                  {providerModels.map((model: Model) => (
                    <div
                      key={model.id}
                      style={{
                        padding: '1rem',
                        background: 'var(--bg-primary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-md)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.75rem',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div
                            style={{
                              fontWeight: 600,
                              color: 'var(--text-primary)',
                              marginBottom: '0.25rem',
                            }}
                          >
                            {model.name}
                          </div>
                          <div
                            style={{
                              fontSize: '0.875rem',
                              color: 'var(--text-secondary)',
                              fontFamily: 'monospace',
                              marginBottom: '0.5rem',
                            }}
                          >
                            {model.id}
                          </div>
                          <div
                            style={{
                              fontSize: '0.875rem',
                              color: 'var(--text-secondary)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem',
                            }}
                          >
                            <strong>Knowledge Cutoff:</strong>
                            {editingCutoff?.modelId === model.id ? (
                              <div
                                style={{
                                  display: 'flex',
                                  gap: '0.5rem',
                                  alignItems: 'center',
                                  flex: 1,
                                }}
                              >
                                <input
                                  type="text"
                                  value={editingCutoff.value}
                                  onChange={e =>
                                    setEditingCutoff({ modelId: model.id, value: e.target.value })
                                  }
                                  placeholder="e.g., March 2025 or leave empty"
                                  style={{
                                    flex: 1,
                                    padding: '0.375rem 0.5rem',
                                    borderRadius: 'var(--radius-sm)',
                                    border: '1px solid var(--border-color)',
                                    background: 'var(--bg-secondary)',
                                    color: 'var(--text-primary)',
                                    fontSize: '0.875rem',
                                  }}
                                  onKeyDown={async e => {
                                    if (e.key === 'Enter')
                                      await handleUpdateKnowledgeCutoff(
                                        model.id,
                                        editingCutoff.value
                                      )
                                    else if (e.key === 'Escape') setEditingCutoff(null)
                                  }}
                                  autoFocus
                                />
                                <button
                                  onClick={() =>
                                    handleUpdateKnowledgeCutoff(model.id, editingCutoff.value)
                                  }
                                  style={{
                                    padding: '0.375rem 0.75rem',
                                    borderRadius: 'var(--radius-sm)',
                                    border: 'none',
                                    background: 'var(--primary-color)',
                                    color: 'white',
                                    fontWeight: 500,
                                    cursor: 'pointer',
                                    fontSize: '0.875rem',
                                  }}
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => setEditingCutoff(null)}
                                  style={{
                                    padding: '0.375rem 0.75rem',
                                    borderRadius: 'var(--radius-sm)',
                                    border: '1px solid var(--border-color)',
                                    background: 'var(--bg-secondary)',
                                    color: 'var(--text-primary)',
                                    fontWeight: 500,
                                    cursor: 'pointer',
                                    fontSize: '0.875rem',
                                  }}
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <span
                                style={{
                                  color: model.knowledge_cutoff
                                    ? 'var(--primary-color)'
                                    : 'var(--warning-color, #f59e0b)',
                                  fontStyle: model.knowledge_cutoff ? 'normal' : 'italic',
                                }}
                              >
                                {model.knowledge_cutoff || 'Date pending'}
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          {editingCutoff?.modelId !== model.id && (
                            <button
                              onClick={() =>
                                setEditingCutoff({
                                  modelId: model.id,
                                  value: model.knowledge_cutoff || '',
                                })
                              }
                              style={{
                                padding: '0.375rem 0.75rem',
                                borderRadius: 'var(--radius-sm)',
                                border: '1px solid var(--border-color)',
                                background: 'var(--bg-secondary)',
                                color: 'var(--text-primary)',
                                fontWeight: 500,
                                cursor: 'pointer',
                                fontSize: '0.875rem',
                              }}
                              title="Edit knowledge cutoff date"
                            >
                              Edit
                            </button>
                          )}
                          {isDevelopment && (
                            <button
                              onClick={() => {
                                setModelToDelete({ id: model.id, name: model.name })
                                setShowDeleteConfirm(true)
                              }}
                              style={{
                                padding: '0.375rem 0.75rem',
                                borderRadius: 'var(--radius-sm)',
                                border: 'none',
                                background: 'var(--error-color)',
                                color: 'white',
                                fontWeight: 600,
                                cursor: 'pointer',
                                fontSize: '0.875rem',
                              }}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
            No models found
          </div>
        )}
      </div>

      {showDeleteConfirm && modelToDelete && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: 'var(--bg-primary)',
              borderRadius: 'var(--radius-lg)',
              padding: '2rem',
              maxWidth: '500px',
              width: '90%',
              border: '1px solid var(--border-color)',
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: '1rem', color: 'var(--text-primary)' }}>
              Confirm Deletion
            </h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
              Are you sure you want to delete <strong>{modelToDelete.name}</strong> (
              {modelToDelete.id})?
              <br />
              This will remove the model from model_runner.py and delete its renderer configuration.
            </p>
            {modelError && (
              <div
                style={{
                  marginBottom: '1rem',
                  padding: '0.75rem',
                  background: 'var(--error-color)',
                  color: 'white',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.875rem',
                }}
              >
                {modelError}
              </div>
            )}
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowDeleteConfirm(false)
                  setModelToDelete(null)
                  setModelError(null)
                }}
                disabled={deletingModel}
                style={{
                  padding: '0.75rem 1.5rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  fontWeight: 600,
                  cursor: deletingModel ? 'not-allowed' : 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteModel}
                disabled={deletingModel}
                style={{
                  padding: '0.75rem 1.5rem',
                  borderRadius: 'var(--radius-md)',
                  border: 'none',
                  background: deletingModel ? 'var(--bg-tertiary)' : 'var(--error-color)',
                  color: 'white',
                  fontWeight: 600,
                  cursor: deletingModel ? 'not-allowed' : 'pointer',
                }}
              >
                {deletingModel ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {addingModel && (
        <div className="modal-overlay" onClick={e => e.stopPropagation()}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    display: 'inline-block',
                    verticalAlign: 'middle',
                    marginRight: '0.5rem',
                  }}
                >
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                  <line x1="12" y1="22.08" x2="12" y2="12" />
                </svg>
                Adding Model
              </h2>
            </div>
            <div style={{ padding: '2rem', textAlign: 'center' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginBottom: '1.5rem',
                }}
              >
                <LoadingSpinner size="large" modern={true} />
              </div>
              <p
                style={{
                  marginTop: '0',
                  color: 'var(--text-primary)',
                  fontSize: '1rem',
                  fontWeight: 500,
                }}
              >
                Adding model <strong>{newModelId.trim() || '...'}</strong>
              </p>
              {modelProgress && (
                <>
                  <p
                    style={{
                      marginTop: '1rem',
                      color: 'var(--text-primary)',
                      fontSize: '0.95rem',
                      fontWeight: 600,
                    }}
                  >
                    {modelProgress.message}
                  </p>
                  <div
                    style={{
                      marginTop: '1rem',
                      width: '100%',
                      height: '8px',
                      background: 'var(--bg-tertiary)',
                      borderRadius: '4px',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${modelProgress.progress}%`,
                        height: '100%',
                        background:
                          'linear-gradient(135deg, var(--primary-color), var(--accent-color))',
                        transition: 'width 0.3s ease',
                        borderRadius: '4px',
                      }}
                    />
                  </div>
                  <p
                    style={{
                      marginTop: '0.5rem',
                      color: 'var(--text-secondary)',
                      fontSize: '0.75rem',
                    }}
                  >
                    {Math.round(modelProgress.progress)}% complete
                  </p>
                </>
              )}
              {!modelProgress && (
                <p
                  style={{
                    marginTop: '0.5rem',
                    color: 'var(--text-secondary)',
                    fontSize: '0.875rem',
                  }}
                >
                  Please wait while we validate and add the model to your system.
                </p>
              )}
              <div
                style={{
                  marginTop: '2rem',
                  display: 'flex',
                  justifyContent: 'center',
                  gap: '1rem',
                }}
              >
                <button
                  onClick={handleCancelAddModel}
                  style={{
                    padding: '0.75rem 1.5rem',
                    fontSize: '0.95rem',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default ModelsTab
