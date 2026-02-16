import { useState, useEffect, useRef, useCallback } from 'react'

import type {
  ModelConversation,
  ModelsByProvider,
  Model,
  ComparisonMetadata,
  ConversationMessage,
} from '../types'
import type { ComparisonExportData } from '../utils'
import {
  showNotification,
  exportToPDF,
  downloadMarkdown,
  downloadJSON,
  downloadHTML,
} from '../utils'
import logger from '../utils/logger'

export type ExportFormat = 'pdf' | 'markdown' | 'json' | 'html'

export interface UseExportOptions {
  /** Current conversations to export */
  conversations: ModelConversation[]
  /** Models organized by provider */
  modelsByProvider: ModelsByProvider
  /** Response metadata (optional) */
  responseMetadata?: ComparisonMetadata
  /** Current input text (fallback for prompt) */
  input: string
  /** Function to get the first user message content */
  getFirstUserMessage: () => ConversationMessage | undefined
}

export interface UseExportReturn {
  /** Whether the export menu is currently shown */
  showExportMenu: boolean
  /** Toggle or set the export menu visibility */
  setShowExportMenu: React.Dispatch<React.SetStateAction<boolean>>
  /** Ref to attach to the export menu container (for click-outside detection) */
  exportMenuRef: React.RefObject<HTMLDivElement>
  /** Handle exporting in the specified format */
  handleExport: (format: ExportFormat) => Promise<void>
}

/**
 * Hook for managing export functionality (PDF, Markdown, JSON, HTML)
 * Handles export menu state, click-outside detection, and export execution
 */
export function useExport({
  conversations,
  modelsByProvider,
  responseMetadata,
  input,
  getFirstUserMessage,
}: UseExportOptions): UseExportReturn {
  const [showExportMenu, setShowExportMenu] = useState(false)
  const exportMenuRef = useRef<HTMLDivElement>(null)

  // Handle export functionality
  const handleExport = useCallback(
    async (format: ExportFormat) => {
      setShowExportMenu(false)

      // Build models lookup from modelsByProvider
      const modelsLookup: Record<string, Model> = Object.fromEntries(
        Object.values(modelsByProvider)
          .flat()
          .map(model => [model.id, model])
      )

      // Build export data from current conversations
      const exportData: ComparisonExportData = {
        prompt: getFirstUserMessage()?.content || input || 'Comparison',
        timestamp: new Date().toISOString(),
        conversations: conversations,
        models: modelsLookup,
        metadata: responseMetadata,
      }

      try {
        if (format === 'pdf') {
          const notification = showNotification('Generating PDF...', 'success')
          notification.setIcon(
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'
          )
          await exportToPDF(exportData)
          showNotification('PDF downloaded successfully!', 'success')
        } else if (format === 'markdown') {
          downloadMarkdown(exportData)
          showNotification('Markdown downloaded successfully!', 'success')
        } else if (format === 'json') {
          downloadJSON(exportData)
          showNotification('JSON downloaded successfully!', 'success')
        } else if (format === 'html') {
          downloadHTML(exportData)
          showNotification('HTML downloaded successfully!', 'success')
        }
      } catch (err) {
        logger.error('Export error:', err)
        showNotification('Failed to export. Please try again.', 'error')
      }
    },
    [conversations, modelsByProvider, responseMetadata, input, getFirstUserMessage]
  )

  // Close export menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false)
      }
    }

    if (showExportMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showExportMenu])

  return {
    showExportMenu,
    setShowExportMenu,
    exportMenuRef,
    handleExport,
  }
}
