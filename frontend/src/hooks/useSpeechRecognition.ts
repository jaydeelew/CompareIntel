/**
 * Custom hook for Chromium-based browser speech recognition
 *
 * Uses native Web Speech API (Chrome/Edge/Safari)
 * Only supports browsers with native Web Speech API support
 *
 * Mobile: Uses stock/vanilla Web Speech API behavior
 * Desktop: Uses custom handling to deal with pause/resume issues
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
    if (!isSupported) {
      setError(
        'Speech recognition is not supported in your browser. Please use a Chromium-based browser (Chrome, Edge, or Safari).'
      )
      return
    }

    try {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      const recognition = new SpeechRecognition()

      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = 'en-US'

      recognition.onstart = () => {
        setIsListening(true)
        setError(null)
      }

      if (isMobile) {
        // MOBILE: Stock/vanilla Web Speech API behavior
        // Just pass through whatever the API gives us directly
        recognition.onresult = event => {
          const result = event.results[event.resultIndex]
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
              ? 'Microphone not found or access denied.'
              : event.error === 'not-allowed'
                ? 'Microphone access denied. Please enable microphone permissions.'
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
  }
}
