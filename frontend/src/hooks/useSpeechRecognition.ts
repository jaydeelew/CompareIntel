/**
 * Custom hook for cross-browser speech recognition
 *
 * Uses a hybrid approach:
 * - Native Web Speech API for Chrome/Edge/Safari (free, real-time)
 * - MediaRecorder + backend fallback for Firefox/other browsers
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
  /** Browser support type: 'native' (Web Speech API), 'fallback' (MediaRecorder), or 'none' */
  browserSupport: 'native' | 'fallback' | 'none'
}

export function useSpeechRecognition(
  onResult: (transcript: string) => void
): UseSpeechRecognitionReturn {
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const autoStopTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Check for native Web Speech API support
  const hasNativeSupport =
    typeof window !== 'undefined' &&
    ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)

  // Check for MediaRecorder API support (for fallback)
  const hasMediaRecorderSupport =
    typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined'

  const browserSupport: 'native' | 'fallback' | 'none' = hasNativeSupport
    ? 'native'
    : hasMediaRecorderSupport
      ? 'fallback'
      : 'none'

  const isSupported = browserSupport !== 'none'

  // Native Web Speech API (Chrome/Edge/Safari)
  const startNativeListening = useCallback(() => {
    if (!hasNativeSupport) return

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

      recognition.onresult = event => {
        let finalTranscript = ''

        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript + ' '
          }
        }

        if (finalTranscript) {
          onResult(finalTranscript.trim())
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
  }, [hasNativeSupport, onResult])

  // Fallback: MediaRecorder + Backend (Firefox/other browsers)
  const startFallbackListening = useCallback(async () => {
    if (!hasMediaRecorderSupport) return

    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // Determine best MIME type
      let mimeType = 'audio/webm'
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4'
        } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
          mimeType = 'audio/ogg'
        } else {
          // Fallback to default
          mimeType = ''
        }
      }

      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: mimeType || undefined,
      })

      audioChunksRef.current = []

      mediaRecorder.ondataavailable = event => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        setIsListening(false)

        // Send audio to backend for transcription
        const audioBlob = new Blob(audioChunksRef.current, {
          type: mediaRecorder.mimeType || 'audio/webm',
        })

        // Only send if we have audio data
        if (audioBlob.size > 0) {
          try {
            const formData = new FormData()
            formData.append('audio', audioBlob, 'recording.webm')

            const apiUrl = import.meta.env.VITE_API_URL || '/api'
            const response = await fetch(`${apiUrl}/speech-to-text`, {
              method: 'POST',
              body: formData,
            })

            if (!response.ok) {
              const errorData = await response.json().catch(() => ({}))
              throw new Error(errorData.detail || 'Transcription failed. Please try again.')
            }

            const data = await response.json()
            if (data.transcript) {
              onResult(data.transcript)
            } else {
              setError('No transcription received. Please try again.')
            }
          } catch (err) {
            const errorMessage =
              err instanceof Error ? err.message : 'Failed to transcribe audio. Please try again.'
            setError(errorMessage)
            console.error('Transcription error:', err)
          }
        }

        // Clean up
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop())
          streamRef.current = null
        }
        audioChunksRef.current = []
      }

      mediaRecorderRef.current = mediaRecorder
      setIsListening(true)
      setError(null)
      mediaRecorder.start()

      // Auto-stop after 30 seconds to prevent very long recordings
      autoStopTimeoutRef.current = setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          stopListening()
        }
      }, 30000)
    } catch (err) {
      const errorMessage =
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'Microphone access denied. Please enable microphone permissions in your browser settings.'
          : err instanceof Error && err.name === 'NotFoundError'
            ? 'No microphone found. Please connect a microphone and try again.'
            : 'Microphone access failed. Please check your browser settings and try again.'

      setError(errorMessage)
      setIsListening(false)
      console.error('Microphone access error:', err)
    }
  }, [hasMediaRecorderSupport, onResult, stopListening])

  const startListening = useCallback(() => {
    if (!isSupported) {
      setError('Speech recognition is not supported in your browser')
      return
    }

    if (browserSupport === 'native') {
      startNativeListening()
    } else {
      startFallbackListening()
    }
  }, [isSupported, browserSupport, startNativeListening, startFallbackListening])

  const stopListening = useCallback(() => {
    // Clear auto-stop timeout
    if (autoStopTimeoutRef.current) {
      clearTimeout(autoStopTimeoutRef.current)
      autoStopTimeoutRef.current = null
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

    // Stop MediaRecorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop()
      } catch (_err) {
        // Ignore errors when stopping
      }
      mediaRecorderRef.current = null
    }

    // Stop media stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
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
