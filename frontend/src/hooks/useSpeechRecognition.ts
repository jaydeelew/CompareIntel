/**
 * Custom hook for Chromium-based browser speech recognition
 *
 * Uses native Web Speech API (Chrome/Edge/Safari)
 * Only supports browsers with native Web Speech API support
 *
 * Mobile: Stock/vanilla - non-continuous, just final results
 * Desktop: Custom handling with continuous mode for pause/resume
 *
 * @example
 * ```typescript
 * const { isListening, isSupported, startListening, stopListening, error } =
 *   useSpeechRecognition((transcript, isFinal) => {
 *     setInput(baseInput + ' ' + transcript)
 *   })
 * ```
 */

import { useState, useRef, useCallback, useEffect } from 'react'

export interface UseSpeechRecognitionReturn {
  /** Whether speech recognition is currently active */
  isListening: boolean
  /** Whether speech recognition is supported in this browser */
  isSupported: boolean
  /** Start listening for speech */
  startListening: () => void
  /** Stop listening for speech */
  stopListening: () => void
  /** Error message if recognition fails */
  error: string | null
  /** Browser support type: 'native' (Web Speech API) or 'none' */
  browserSupport: 'native' | 'none'
  /** Whether running on mobile */
  isMobile: boolean
}

// Detect if running on mobile device
function isMobileDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false
  }
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
}

export function useSpeechRecognition(
  onResult: (transcript: string, isFinal: boolean) => void
): UseSpeechRecognitionReturn {
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const isMobile = isMobileDevice()

  // Check for native Web Speech API support (Chromium-based browsers)
  const hasNativeSupport =
    typeof window !== 'undefined' &&
    ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)

  const browserSupport: 'native' | 'none' = hasNativeSupport ? 'native' : 'none'
  const isSupported = hasNativeSupport

  const startListening = useCallback(() => {
    // Clear any previous error so that when the same error occurs again,
    // the state change triggers the notification (useEffect in consumer).
    // This ensures the "enable microphone" banner appears every time the
    // user clicks while the microphone is unavailable.
    setError(null)

    if (!isSupported) {
      setError(
        'Speech recognition is not supported in your browser. Please use a Chromium-based browser (Chrome, Edge, or Safari).'
      )
      return
    }

    try {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      const recognition = new SpeechRecognition()

      if (isMobile) {
        // MOBILE: Non-continuous mode with interim results for real-time display
        // Stops automatically after user finishes speaking
        recognition.continuous = false
        recognition.interimResults = true
      } else {
        // DESKTOP: Continuous mode with interim results
        recognition.continuous = true
        recognition.interimResults = true
      }
      recognition.lang = 'en-US'

      recognition.onstart = () => {
        setIsListening(true)
        setError(null)
      }

      if (isMobile) {
        // MOBILE: Send interim and final results for real-time display
        // But recognition stops automatically after speech ends (non-continuous)
        recognition.onresult = event => {
          // Get the latest result
          const result = event.results[event.results.length - 1]
          const transcript = result[0].transcript
          const isFinal = result.isFinal

          if (transcript.trim()) {
            onResult(transcript.trim(), isFinal)
          }
        }
      } else {
        // DESKTOP: Custom handling for pause/resume issues
        // Build full transcript from ALL results to handle API resets
        recognition.onresult = event => {
          let finalTranscript = ''
          let interimTranscript = ''

          // Build full transcript from ALL results (not just from resultIndex)
          // This handles API resets correctly after pauses on desktop
          for (let i = 0; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript

            if (event.results[i].isFinal) {
              finalTranscript += transcript
            } else {
              interimTranscript += transcript
            }
          }

          // Always send the full transcript (final + interim)
          const fullTranscript = (finalTranscript + interimTranscript).trim()
          const isAllFinal = interimTranscript === '' && finalTranscript !== ''

          if (fullTranscript) {
            onResult(fullTranscript, isAllFinal)
          }
        }
      }

      recognition.onerror = event => {
        const errorMessage =
          event.error === 'no-speech'
            ? 'No speech detected. Please try again.'
            : event.error === 'audio-capture'
              ? "Microphone not found or access denied. To enable: click the lock or info icon in your browser's address bar, then allow microphone access for this site."
              : event.error === 'not-allowed'
                ? "Microphone access denied. To enable: click the lock or info icon in your browser's address bar, then allow microphone access for this site."
                : `Speech recognition error: ${event.error}`

        setError(errorMessage)
        setIsListening(false)
      }

      recognition.onend = () => {
        setIsListening(false)
      }

      recognitionRef.current = recognition
      recognition.start()
    } catch (_err) {
      setError('Failed to start speech recognition')
      setIsListening(false)
    }
  }, [isSupported, isMobile, onResult])

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch (_err) {
        // Ignore errors when stopping
      }
      recognitionRef.current = null
    }

    setIsListening(false)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopListening()
    }
  }, [stopListening])

  return {
    isListening,
    isSupported,
    startListening,
    stopListening,
    error,
    browserSupport,
    isMobile,
  }
}
