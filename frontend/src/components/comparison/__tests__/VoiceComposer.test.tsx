/// <reference types="@testing-library/jest-dom" />

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { VOICE_EMPTY_TRANSCRIPT_MESSAGE } from '../../../config/constants'
import { isVoiceEnabled } from '../../../config/voiceFlag'
import { VoiceComposer, VoiceModeToggle } from '../VoiceComposer'

describe.skipIf(!isVoiceEnabled())('VoiceComposer', () => {
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

  it('shows a clear message when speech was not caught', () => {
    render(
      <VoiceComposer
        status="error"
        isSupported
        unsupportedMessage={null}
        lastTranscript=""
        error={VOICE_EMPTY_TRANSCRIPT_MESSAGE}
        selectedModelCount={1}
        onToggleTalk={vi.fn()}
      />
    )
    expect(screen.getByTestId('voice-mic-error')).toHaveTextContent("didn't catch that")
  })

  it('toggles voice mode from the composer control', () => {
    const onChange = vi.fn()
    render(<VoiceModeToggle enabled={false} onChange={onChange} />)
    fireEvent.click(screen.getByTestId('voice-mode-toggle'))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('turns voice mode off from the composer control', () => {
    const onChange = vi.fn()
    render(<VoiceModeToggle enabled onChange={onChange} />)
    expect(screen.getByTestId('voice-mode-toggle')).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByTestId('voice-mode-toggle'))
    expect(onChange).toHaveBeenCalledWith(false)
  })
})
