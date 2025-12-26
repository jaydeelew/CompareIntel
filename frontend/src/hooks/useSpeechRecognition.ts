/**
 * Custom hook for Chromium-based browser speech recognition
 *
 * Uses native Web Speech API (Chrome/Edge/Safari)
 * Only supports browsers with native Web Speech API support
 *
 * @example
 * ```typescript
 * const { isListening, isSupported, startListening, stopListening, error } =
 *   useSpeechRecognition((transcript) => {
 *     setInput(prev => prev + ' ' + transcript)
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

export function useSpeechRecognition(
  onResult: (transcript: string) => void
): UseSpeechRecognitionReturn {
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const accumulatedFinalRef = useRef<string>('')

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

      // Reset accumulated final transcript when starting
      accumulatedFinalRef.current = ''

      recognition.onstart = () => {
        setIsListening(true)
        setError(null)
        accumulatedFinalRef.current = ''
      }

      recognition.onresult = event => {
        let interimTranscript = ''
        let newFinalTranscript = ''

        // Process all results from resultIndex onwards
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript

          if (event.results[i].isFinal) {
            // Accumulate final results
            accumulatedFinalRef.current += transcript + ' '
            newFinalTranscript += transcript + ' '
          } else {
            // Collect interim results
            interimTranscript += transcript
          }
        }

        // Send final results incrementally (only the new part)
        if (newFinalTranscript.trim()) {
          onResult(newFinalTranscript.trim())
        }

        // Send interim results with accumulated final for real-time display
        if (interimTranscript.trim()) {
          const fullTranscript = (accumulatedFinalRef.current + interimTranscript).trim()
          onResult(fullTranscript)
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
        accumulatedFinalRef.current = ''
      }

      recognitionRef.current = recognition
      recognition.start()
    } catch (_err) {
      setError('Failed to start speech recognition')
      setIsListening(false)
    }
  }, [isSupported, onResult])

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
