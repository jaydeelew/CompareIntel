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
  const stopListeningRef = useRef<(() => void) | null>(null)

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
      // Request microphone access with optimized audio constraints
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000, // Optimize for speech recognition (16kHz is standard)
          channelCount: 1, // Mono for smaller file size
        },
      })
      streamRef.current = stream

      // Determine best MIME type (prefer webm with opus codec for better compression)
      let mimeType = 'audio/webm;codecs=opus'
      if (!MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        if (MediaRecorder.isTypeSupported('audio/webm')) {
          mimeType = 'audio/webm'
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4'
        } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
          mimeType = 'audio/ogg'
        } else {
          mimeType = ''
        }
      }

      // Create MediaRecorder with optimized settings
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: mimeType || undefined,
        audioBitsPerSecond: 16000, // Lower bitrate = smaller files = faster upload
      })

      audioChunksRef.current = []
      let accumulatedTranscript = ''
      let isProcessing = false
      let lastChunkTime = 0

      // Function to send audio chunk for transcription
      const sendAudioChunk = async (audioBlob: Blob): Promise<string | null> => {
        if (isProcessing || audioBlob.size === 0) return null

        isProcessing = true
        try {
          const formData = new FormData()
          formData.append('audio', audioBlob, 'chunk.webm')

          const apiUrl = import.meta.env.VITE_API_URL || '/api'
          const response = await fetch(`${apiUrl}/speech-to-text`, {
            method: 'POST',
            body: formData,
          })

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}))
            throw new Error(errorData.detail || 'Transcription failed.')
          }

          const data = await response.json()
          return data.transcript || null
        } catch (err) {
          console.error('Chunk transcription error:', err)
          return null
        } finally {
          isProcessing = false
        }
      }

      // Send chunks every 2 seconds for faster response
      const CHUNK_INTERVAL = 2000 // 2 seconds
      const MIN_CHUNK_SIZE = 1000 // Minimum 1KB to avoid sending tiny chunks

      mediaRecorder.ondataavailable = async event => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)

          // Send chunk every 2 seconds for faster transcription
          const now = Date.now()
          if (now - lastChunkTime >= CHUNK_INTERVAL && event.data.size >= MIN_CHUNK_SIZE) {
            lastChunkTime = now

            // Send the current chunk immediately
            const transcript = await sendAudioChunk(event.data)
            if (transcript && transcript.trim()) {
              // Use the latest transcript (it contains the full context)
              accumulatedTranscript = transcript
              // Send partial result immediately for better UX
              onResult(transcript)
            }
          }
        }
      }

      mediaRecorder.onstop = async () => {
        setIsListening(false)

        // Send final audio chunk if there's remaining data
        // Only send if we don't already have a recent transcript
        const audioBlob = new Blob(audioChunksRef.current, {
          type: mediaRecorder.mimeType || 'audio/webm',
        })

        // If we have accumulated transcript from chunks, use it (it's already the latest)
        // Otherwise, send the full recording as fallback
        if (accumulatedTranscript) {
          // We already have the latest transcript from chunks
          // No need to send again - it's already been sent via onResult
        } else if (audioBlob.size > 0) {
          // If we didn't get any partial results, send the full recording
          try {
            const finalTranscript = await sendAudioChunk(audioBlob)
            if (finalTranscript && finalTranscript.trim()) {
              onResult(finalTranscript)
            } else {
              setError('No transcription received. Please try again.')
            }
          } catch (err) {
            const errorMessage =
              err instanceof Error ? err.message : 'Failed to transcribe audio. Please try again.'
            setError(errorMessage)
            console.error('Final transcription error:', err)
          }
        }

        // Clean up
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop())
          streamRef.current = null
        }
        audioChunksRef.current = []
        accumulatedTranscript = ''
        lastChunkTime = 0
      }

      mediaRecorderRef.current = mediaRecorder
      setIsListening(true)
      setError(null)
      // Start recording with 2-second chunks for faster transcription
      mediaRecorder.start(CHUNK_INTERVAL)

      // Auto-stop after 15 seconds to prevent very long recordings
      // Reduced from 30s for faster response
      autoStopTimeoutRef.current = setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          stopListening()
        }
      }, 15000)
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
  }, [hasMediaRecorderSupport, onResult])

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
