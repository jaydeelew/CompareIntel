import React from 'react'

import type { TokenUsageInfo } from './TokenUsageDisplay'

export interface ContextWarningProps {
  tokenUsageInfo: TokenUsageInfo | null
  renderUsagePreview: () => React.ReactNode
}

export function ContextWarning({ tokenUsageInfo, renderUsagePreview }: ContextWarningProps) {
  let warningLevel: 'info' | 'medium' | 'high' | 'critical' | null = null
  let warningMessage = ''
  let warningIcon = ''

  if (tokenUsageInfo) {
    const { percentageRemaining, isExceeded } = tokenUsageInfo
    if (isExceeded) {
      warningLevel = 'critical'
      warningIcon = '⚠️'
      warningMessage =
        "You've exceeded the maximum input capacity. Inputs may be truncated. Starting a new comparison is strongly recommended for best results."
    } else if (percentageRemaining <= 0) {
      warningLevel = 'critical'
      warningIcon = '🚫'
      warningMessage =
        'Maximum input capacity reached. Please start a fresh comparison for continued assistance.'
    } else if (percentageRemaining <= 10) {
      warningLevel = 'critical'
      warningIcon = '✨'
      warningMessage =
        'Time for a fresh start! Starting a new comparison will give you the best response quality and speed.'
    } else if (percentageRemaining <= 25) {
      warningLevel = 'high'
      warningIcon = '💡'
      warningMessage =
        'Consider starting a fresh comparison! New conversations help maintain optimal context and response quality.'
    } else if (percentageRemaining <= 50) {
      warningLevel = 'medium'
      warningIcon = '🎯'
      warningMessage = 'Pro tip: Fresh comparisons provide more focused and relevant responses!'
    } else if (percentageRemaining <= 75) {
      warningLevel = 'info'
      warningIcon = 'ℹ️'
      warningMessage =
        'Reminder: Starting a new comparison helps keep responses sharp and context-focused.'
    }
  }

  return (
    <>
      <div className="usage-preview-container">{renderUsagePreview()}</div>
      {warningLevel && (
        <div className={`context-warning ${warningLevel}`}>
          <div className="context-warning-content">
            <div className="context-warning-message">
              <span className="context-warning-icon">{warningIcon}</span>
              {warningMessage}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
