import Mic from 'lucide-react/dist/esm/icons/mic'
import Square from 'lucide-react/dist/esm/icons/square'

import type { VoiceSessionStatus } from '../../hooks/useVoiceSession'

export interface VoiceModeToggleProps {
  enabled: boolean
  disabled?: boolean
  onChange: (enabled: boolean) => void
}

export function VoiceModeToggle({ enabled, disabled = false, onChange }: VoiceModeToggleProps) {
  return (
    <button
      type="button"
      className={`voice-mode-toggle ${enabled ? 'active' : ''}`}
      onClick={() => onChange(!enabled)}
      disabled={disabled}
      aria-pressed={enabled}
      aria-label={enabled ? 'Turn off voice mode' : 'Turn on voice mode'}
      data-testid="voice-mode-toggle"
    >
      <Mic size={16} aria-hidden />
      <span>Voice</span>
    </button>
  )
}

export interface VoiceComposerProps {
  status: VoiceSessionStatus
  isSupported: boolean
  unsupportedMessage: string | null
  lastTranscript: string
  error: string | null
  selectedModelCount: number
  disabled?: boolean
  onToggleTalk: () => void
}

function statusLabel(status: VoiceSessionStatus, isSupported: boolean): string {
  if (!isSupported) return 'Microphone unavailable'
  switch (status) {
    case 'recording':
      return 'Listening… tap to send'
    case 'transcribing':
      return 'Transcribing your turn…'
    case 'waiting':
      return 'Models are answering…'
    case 'speaking':
      return 'Speaking… talk to interrupt'
    case 'error':
      return 'Voice error'
    default:
      return 'Tap to talk'
  }
}

export function VoiceComposer({
  status,
  isSupported,
  unsupportedMessage,
  lastTranscript,
  error,
  selectedModelCount,
  disabled = false,
  onToggleTalk,
}: VoiceComposerProps) {
  const isRecording = status === 'recording'
  const busy = status === 'transcribing' || status === 'waiting'
  const buttonDisabled = disabled || !isSupported || selectedModelCount === 0 || busy
  const displayError = error || (!isSupported ? unsupportedMessage : null)

  return (
    <div className="voice-composer" data-testid="voice-composer">
      <button
        type="button"
        className={`voice-ptt-button ${isRecording ? 'recording' : ''} ${status === 'speaking' ? 'speaking' : ''}`}
        onClick={onToggleTalk}
        disabled={buttonDisabled && !isRecording && status !== 'speaking'}
        aria-pressed={isRecording}
        aria-label={isRecording ? 'Stop recording' : 'Tap to talk'}
        data-testid="voice-ptt-button"
      >
        {isRecording ? <Square size={22} aria-hidden /> : <Mic size={22} aria-hidden />}
        <span>{isRecording ? 'Stop' : 'Talk'}</span>
      </button>
      <div className="voice-composer-copy">
        <p className="voice-status" data-testid="voice-status" aria-live="polite">
          {statusLabel(status, isSupported)}
        </p>
        {lastTranscript ? (
          <p className="voice-transcript" data-testid="voice-transcript">
            {lastTranscript}
          </p>
        ) : (
          <p
            className="voice-transcript voice-transcript-placeholder"
            data-testid="voice-transcript"
          >
            Your spoken turn will appear here.
          </p>
        )}
        {selectedModelCount === 0 && isSupported && (
          <p className="voice-hint">Select 1 or 2 models, then tap Talk.</p>
        )}
        {displayError && (
          <p className="voice-mic-error" data-testid="voice-mic-error" role="alert">
            {displayError}
          </p>
        )}
      </div>
    </div>
  )
}
