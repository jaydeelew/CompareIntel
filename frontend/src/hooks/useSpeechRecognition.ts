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
  const stopListeningRef = useRef<(() => void) | null>(null)
  // Refs for Chromium-based browser speech recognition
  const accumulatedFinalTranscriptRef = useRef<string>('')
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastSentFinalIndexRef = useRef<number>(0)

  // Check for native Web Speech API support (Chromium-based browsers)
  const hasNativeSupport =
    typeof window !== 'undefined' &&
    ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)

  const browserSupport: 'native' | 'none' = hasNativeSupport ? 'native' : 'none'
  const isSupported = hasNativeSupport

  // Native Web Speech API (Chrome/Edge/Safari)
  const startNativeListening = useCallback(() => {
    if (!hasNativeSupport) return

    try {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      const recognition = new SpeechRecognition()

      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = 'en-US'

      // Reset accumulated transcript when starting
      accumulatedFinalTranscriptRef.current = ''
      lastSentFinalIndexRef.current = 0

      recognition.onstart = () => {
        setIsListening(true)
        setError(null)
        accumulatedFinalTranscriptRef.current = ''
        lastSentFinalIndexRef.current = 0
      }

      recognition.onresult = event => {
        // Clear any existing silence timeout since we got a result
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current)
          silenceTimeoutRef.current = null
        }

        let newFinalTranscript = ''
        let interimTranscript = ''

        // Process all results from resultIndex onwards
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript

          if (event.results[i].isFinal) {
            // Accumulate final results
            accumulatedFinalTranscriptRef.current += transcript + ' '
            newFinalTranscript += transcript + ' '
          } else {
            // Collect interim results for real-time display
            interimTranscript += transcript
          }
        }

        // Handle final results - send only the new final part (incremental)
        if (newFinalTranscript) {
          // Send only the new final transcript segment to append
          onResult(newFinalTranscript.trim())
        }

        // Handle interim results - send accumulated final + interim for real-time feedback
        // This provides immediate visual feedback like mobile does
        if (interimTranscript) {
          const fullDisplayTranscript = accumulatedFinalTranscriptRef.current + interimTranscript
          onResult(fullDisplayTranscript.trim())
        }

        // Set up silence detection timeout (2 seconds of no results = pause)
        // This mimics mobile behavior where recording stops after pause
        silenceTimeoutRef.current = setTimeout(() => {
          // If we have accumulated final transcript, ensure it's sent
          if (accumulatedFinalTranscriptRef.current.trim()) {
            // The final transcript should already be sent, but ensure it's finalized
            const finalText = accumulatedFinalTranscriptRef.current.trim()
            if (finalText) {
              onResult(finalText)
            }
          }
          // Stop recognition after pause (like mobile does)
          if (recognitionRef.current) {
            try {
              recognitionRef.current.stop()
            } catch (_err) {
              // Ignore errors when stopping (may already be stopped)
            }
          }
        }, 2000) // 2 seconds of silence
      }

      recognition.onerror = event => {
        // Clear silence timeout on error
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current)
          silenceTimeoutRef.current = null
        }

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
        // Clear silence timeout
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current)
          silenceTimeoutRef.current = null
        }

        setIsListening(false)
        // Reset accumulated transcript when ending
        accumulatedFinalTranscriptRef.current = ''
        lastSentFinalIndexRef.current = 0
      }

      recognitionRef.current = recognition
      recognition.start()
    } catch (_err) {
      setError('Failed to start speech recognition')
      setIsListening(false)
    }
  }, [hasNativeSupport, onResult])

  const startListening = useCallback(() => {
    if (!isSupported) {
      setError(
        'Speech recognition is not supported in your browser. Please use a Chromium-based browser (Chrome, Edge, or Safari).'
      )
      return
    }

    if (browserSupport === 'native') {
      startNativeListening()
    }
  }, [isSupported, browserSupport, startNativeListening])

  const stopListening = useCallback(() => {
    // Clear silence timeout (for Chromium-based browsers)
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current)
      silenceTimeoutRef.current = null
    }

    // Stop native recognition
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

  // Keep stopListening ref in sync
  useEffect(() => {
    stopListeningRef.current = stopListening
  }, [stopListening])

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
