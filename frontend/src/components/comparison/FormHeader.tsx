import React from 'react'

export interface FormHeaderProps {
  isFollowUpMode: boolean
  selectedModels: string[]
  isLoading: boolean
  tutorialIsActive?: boolean
  onNewComparison: () => void
  modelsSectionRef?: React.RefObject<HTMLDivElement | null>
  /** When provided and no models selected, scrolls to models, expands section, opens Help me choose */
  onOpenHelpMeChoose?: () => void
}

export function FormHeader({
  isFollowUpMode,
  selectedModels,
  isLoading,
  tutorialIsActive,
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
            onClick={e => {
              if (tutorialIsActive) {
                e.preventDefault()
                return
              }
              onNewComparison()
            }}
            className="textarea-icon-button new-inquiry-button"
            title="Exit follow up mode"
            disabled={isLoading}
          >
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
          </button>
        </>
      ) : selectedModels.length === 0 ? (
        <h2>
          <button
            type="button"
            className="select-models-heading-link"
            onClick={() => {
              if (onOpenHelpMeChoose) {
                onOpenHelpMeChoose()
              } else {
                modelsSectionRef?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
            }}
            title={
              onOpenHelpMeChoose
                ? 'Get model recommendations by use case'
                : 'Scroll to model selection'
            }
          >
            {onOpenHelpMeChoose ? 'Help me choose models →' : 'Scroll Down to Select Models'}
          </button>
        </h2>
      ) : (
        <h2>Enter Your Prompt</h2>
      )}
    </div>
  )
}
