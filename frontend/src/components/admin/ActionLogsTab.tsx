import React, { useState, useEffect, useCallback } from 'react'

import { useAuthHeaders } from '../../contexts/AuthContext'
import logger from '../../utils/logger'

interface AdminActionLog {
  id: number
  admin_user_id: number
  admin_user_email: string | null
  target_user_id: number | null
  target_user_email: string | null
  action_type: string
  action_description: string
  details: string | null
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

interface ActionLogsTabProps {
  setError: (err: string | null) => void
}

const ActionLogsTab: React.FC<ActionLogsTabProps> = ({ setError }) => {
  const getAuthHeaders = useAuthHeaders()
  const [actionLogs, setActionLogs] = useState<AdminActionLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsPage, setLogsPage] = useState(1)
  const [logsPerPage] = useState(50)
  const [logsSearchTerm, setLogsSearchTerm] = useState('')
  const [selectedActionType, setSelectedActionType] = useState('')
  const [selectedLog, setSelectedLog] = useState<AdminActionLog | null>(null)
  const [showLogDetailModal, setShowLogDetailModal] = useState(false)

  const fetchActionLogs = useCallback(
    async (page = 1, actionType?: string) => {
      try {
        setLogsLoading(true)
        const headers = getAuthHeaders()
        const params = new URLSearchParams({
          page: page.toString(),
          per_page: logsPerPage.toString(),
        })
        if (actionType) params.append('action_type', actionType)
        const response = await fetch(`/api/admin/action-logs?${params}`, {
          headers,
          credentials: 'include',
        })
        if (!response.ok) {
          if (response.status === 401)
            throw new Error('Authentication required. Please log in again.')
          if (response.status === 403) throw new Error('Access denied. Admin privileges required.')
          throw new Error(`Failed to fetch action logs (${response.status})`)
        }
        const data = await response.json()
        setActionLogs(data)
      } catch (err) {
        logger.error('Error fetching action logs:', err)
        setError(err instanceof Error ? err.message : 'Failed to fetch action logs')
      } finally {
        setLogsLoading(false)
      }
    },
    [getAuthHeaders, logsPerPage, setError]
  )

  useEffect(() => {
    fetchActionLogs(logsPage, selectedActionType || undefined)
  }, [logsPage, selectedActionType, fetchActionLogs])

  const filteredLogs = actionLogs.filter(
    log =>
      !logsSearchTerm ||
      log.action_description.toLowerCase().includes(logsSearchTerm.toLowerCase()) ||
      log.action_type.toLowerCase().includes(logsSearchTerm.toLowerCase())
  )

  return (
    <>
      <div className="logs-management">
        <div className="logs-management-header">
          <h2>Admin Action Logs</h2>
          <button
            className="refresh-logs-btn"
            onClick={() => fetchActionLogs(logsPage, selectedActionType || undefined)}
            disabled={logsLoading}
          >
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

        <div className="logs-search-form">
          <div className="logs-search-controls">
            <input
              type="text"
              placeholder="Search by description..."
              value={logsSearchTerm}
              onChange={e => setLogsSearchTerm(e.target.value)}
              className="search-input"
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  setLogsPage(1)
                  fetchActionLogs(1, selectedActionType || undefined)
                }
              }}
            />
            <select
              value={selectedActionType}
              onChange={e => {
                setSelectedActionType(e.target.value)
                setLogsPage(1)
                fetchActionLogs(1, e.target.value || undefined)
              }}
              className="filter-select"
            >
              <option value="">All Action Types</option>
              <option value="user_create">User Create</option>
              <option value="user_update">User Update</option>
              <option value="user_delete">User Delete</option>
              <option value="password_reset">Password Reset</option>
              <option value="send_verification">Send Verification</option>
              <option value="toggle_active">Toggle Active</option>
              <option value="reset_usage">Reset Usage</option>
              <option value="toggle_mock_mode">Toggle Mock Mode</option>
              <option value="change_tier">Change Tier</option>
              <option value="toggle_anonymous_mock_mode">Toggle Anonymous Mock Mode</option>
            </select>
            <button
              type="button"
              className="search-btn"
              onClick={() => {
                setLogsPage(1)
                fetchActionLogs(1, selectedActionType || undefined)
              }}
              disabled={logsLoading}
            >
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
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              Search
            </button>
          </div>
        </div>

        {logsLoading ? (
          <div className="loading-message">Loading logs...</div>
        ) : actionLogs.length === 0 ? (
          <div className="empty-state">
            <p>No logs found.</p>
          </div>
        ) : (
          <>
            <div className="logs-table-container">
              <table className="logs-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Action Type</th>
                    <th>Description</th>
                    <th>Admin</th>
                    <th>Target User</th>
                    <th>IP Address</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map(log => (
                    <tr key={log.id}>
                      <td>
                        <span title={new Date(log.created_at).toLocaleString()}>
                          {new Date(log.created_at).toLocaleDateString()}{' '}
                          {new Date(log.created_at).toLocaleTimeString()}
                        </span>
                      </td>
                      <td>
                        <span className={`action-type-badge action-${log.action_type}`}>
                          {log.action_type.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="log-description">{log.action_description}</td>
                      <td>
                        <span className="log-user-email">{log.admin_user_email || 'Unknown'}</span>
                      </td>
                      <td>
                        {log.target_user_email ? (
                          <span className="log-user-email">{log.target_user_email}</span>
                        ) : (
                          <span className="log-na">N/A</span>
                        )}
                      </td>
                      <td className="log-ip">{log.ip_address || 'N/A'}</td>
                      <td>
                        <button
                          onClick={() => {
                            setSelectedLog(log)
                            setShowLogDetailModal(true)
                          }}
                          className="view-details-btn"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="logs-cards-mobile">
              {filteredLogs.map(log => (
                <div key={log.id} className="log-card">
                  <div className="log-card-header">
                    <div className="log-card-timestamp">
                      {new Date(log.created_at).toLocaleDateString()}{' '}
                      {new Date(log.created_at).toLocaleTimeString()}
                    </div>
                    <div className="log-card-action-type">
                      <span className={`action-type-badge action-${log.action_type}`}>
                        {log.action_type.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>
                  <div className="log-card-row">
                    <span className="log-card-label">Description</span>
                    <span className="log-card-value">{log.action_description}</span>
                  </div>
                  <div className="log-card-row">
                    <span className="log-card-label">Admin</span>
                    <span className="log-card-value">{log.admin_user_email || 'Unknown'}</span>
                  </div>
                  <div className="log-card-row">
                    <span className="log-card-label">Target User</span>
                    <span className="log-card-value">{log.target_user_email || 'N/A'}</span>
                  </div>
                  <div className="log-card-row">
                    <span className="log-card-label">IP Address</span>
                    <span className="log-card-value log-ip">{log.ip_address || 'N/A'}</span>
                  </div>
                  <div className="log-card-actions">
                    <button
                      onClick={() => {
                        setSelectedLog(log)
                        setShowLogDetailModal(true)
                      }}
                      className="view-details-btn"
                    >
                      View Details
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="pagination">
              <button
                onClick={() => {
                  if (logsPage > 1) {
                    setLogsPage(logsPage - 1)
                    fetchActionLogs(logsPage - 1, selectedActionType || undefined)
                  }
                }}
                disabled={logsPage === 1 || logsLoading}
                className="page-btn"
              >
                Previous
              </button>
              <span className="page-info">Page {logsPage}</span>
              <button
                onClick={() => {
                  setLogsPage(logsPage + 1)
                  fetchActionLogs(logsPage + 1, selectedActionType || undefined)
                }}
                disabled={actionLogs.length < logsPerPage || logsLoading}
                className="page-btn"
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>

      {showLogDetailModal && selectedLog && (
        <div
          className="modal-overlay"
          onClick={() => {
            setShowLogDetailModal(false)
            setSelectedLog(null)
          }}
        >
          <div className="modal-content log-detail-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Log Details</h2>
              <button
                className="modal-close-btn"
                onClick={() => {
                  setShowLogDetailModal(false)
                  setSelectedLog(null)
                }}
              >
                ×
              </button>
            </div>
            <div className="log-detail-body">
              <div className="log-detail-section">
                <h3>Basic Information</h3>
                <div className="log-detail-grid">
                  <div className="log-detail-item">
                    <strong>Log ID:</strong>
                    <span>{selectedLog.id}</span>
                  </div>
                  <div className="log-detail-item">
                    <strong>Timestamp:</strong>
                    <span>{new Date(selectedLog.created_at).toLocaleString()}</span>
                  </div>
                  <div className="log-detail-item">
                    <strong>Action Type:</strong>
                    <span className={`action-type-badge action-${selectedLog.action_type}`}>
                      {selectedLog.action_type.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="log-detail-item">
                    <strong>Description:</strong>
                    <span>{selectedLog.action_description}</span>
                  </div>
                </div>
              </div>
              <div className="log-detail-section">
                <h3>User Information</h3>
                <div className="log-detail-grid">
                  <div className="log-detail-item">
                    <strong>Admin User:</strong>
                    <span className="log-user-email-main">
                      {selectedLog.admin_user_email || 'Unknown'}
                    </span>
                  </div>
                  <div className="log-detail-item">
                    <strong>Target User:</strong>
                    <span className="log-user-email-main">
                      {selectedLog.target_user_email || 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="log-detail-section">
                <h3>Request Information</h3>
                <div className="log-detail-grid">
                  <div className="log-detail-item full-width">
                    <strong>IP Address:</strong>
                    <span>{selectedLog.ip_address || 'N/A'}</span>
                  </div>
                  <div className="log-detail-item full-width">
                    <strong>User Agent:</strong>
                    <span className="log-user-agent">{selectedLog.user_agent || 'N/A'}</span>
                  </div>
                </div>
              </div>
              {selectedLog.details && (
                <div className="log-detail-section">
                  <h3>Details (JSON)</h3>
                  <pre className="log-details-json">
                    {(() => {
                      try {
                        return JSON.stringify(JSON.parse(selectedLog.details), null, 2)
                      } catch {
                        return selectedLog.details
                      }
                    })()}
                  </pre>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="cancel-btn"
                onClick={() => {
                  setShowLogDetailModal(false)
                  setSelectedLog(null)
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default ActionLogsTab
