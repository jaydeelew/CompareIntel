import React from 'react'

import { StyledTooltip } from '../shared'

export interface FormHeaderProps {
  isFollowUpMode: boolean
  selectedModels: string[]
  isLoading: boolean
  onNewComparison: () => void
  modelsSectionRef?: React.RefObject<HTMLDivElement | null>
  /** When provided and no models selected, scrolls to models, expands section, opens Help me choose */
  onOpenHelpMeChoose?: (options?: { scrollToCategoryId?: string }) => void
}

const NEW_INQUIRY_ICON = (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M21 3v5h-5"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M3 21v-5h5"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export function FormHeader({
  isFollowUpMode,
  selectedModels,
  isLoading,
  onNewComparison,
  modelsSectionRef,
  onOpenHelpMeChoose,
}: FormHeaderProps) {
  return (
    <div
      className="follow-up-header"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
    >
      {isFollowUpMode ? (
        <>
          <h2 style={{ margin: 0 }}>Start over ➜</h2>
          <button
            type="button"
            onClick={onNewComparison}
            className="textarea-icon-button new-inquiry-button"
            disabled={isLoading}
            aria-label="Exit follow up mode"
          >
            {NEW_INQUIRY_ICON}
          </button>
        </>
      ) : selectedModels.length === 0 ? (
        <h2>
          {onOpenHelpMeChoose ? (
            <button
              type="button"
              className="select-models-heading-link"
              onClick={() => onOpenHelpMeChoose()}
            >
              Help me choose models ➜
            </button>
          ) : (
            <StyledTooltip text="Scroll to model selection">
              <button
                type="button"
                className="select-models-heading-link"
                onClick={() =>
                  modelsSectionRef?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
              >
                Scroll Down to Select Models
              </button>
            </StyledTooltip>
          )}
        </h2>
      ) : (
        <h2>Enter Your Prompt</h2>
      )}
    </div>
  )
}
