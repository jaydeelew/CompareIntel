/// <reference types="@testing-library/jest-dom" />

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { VoiceComposer } from '../VoiceComposer'

describe('VoiceComposer', () => {
  it('shows tap-to-talk and the transcript', () => {
    const onToggleTalk = vi.fn()
    render(
      <VoiceComposer
        status="idle"
        isSupported
        unsupportedMessage={null}
        lastTranscript="How does photosynthesis work?"
        error={null}
        selectedModelCount={2}
        onToggleTalk={onToggleTalk}
      />
    )
    expect(screen.getByTestId('voice-transcript')).toHaveTextContent('photosynthesis')
    fireEvent.click(screen.getByTestId('voice-ptt-button'))
    expect(onToggleTalk).toHaveBeenCalled()
  })

  it('shows a clear microphone-denied error', () => {
    render(
      <VoiceComposer
        status="error"
        isSupported
        unsupportedMessage={null}
        lastTranscript=""
        error="Microphone access denied. To enable: click the lock or info icon in your browser's address bar, then allow microphone access for this site."
        selectedModelCount={1}
        onToggleTalk={vi.fn()}
      />
    )
    expect(screen.getByTestId('voice-mic-error')).toHaveTextContent('Microphone access denied')
  })

  it('shows unsupported browser copy', () => {
    render(
      <VoiceComposer
        status="error"
        isSupported={false}
        unsupportedMessage="Voice mode isn't supported in this browser."
        lastTranscript=""
        error={null}
        selectedModelCount={1}
        onToggleTalk={vi.fn()}
      />
    )
    expect(screen.getByTestId('voice-mic-error')).toHaveTextContent("isn't supported")
  })
})
