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
  const chunkSendIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const stopListeningRef = useRef<(() => void) | null>(null)
  // Refs for Chromium-based browser speech recognition improvements
  const accumulatedFinalTranscriptRef = useRef<string>('')
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastSentFinalIndexRef = useRef<number>(0)
  // Ref for Firefox/fallback: track last sent transcript to extract incremental updates
  const lastSentTranscriptRef = useRef<string>('')

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
      let lastSendTime = 0
      // Reset last sent transcript when starting (for incremental updates)
      lastSentTranscriptRef.current = ''

      // Function to send accumulated audio chunks for transcription
      const sendAudioChunks = async (chunks: Blob[]): Promise<string | null> => {
        if (isProcessing || chunks.length === 0) return null

        // Create a complete audio blob from accumulated chunks
        const audioBlob = new Blob(chunks, {
          type: mediaRecorder.mimeType || 'audio/webm',
        })

        if (audioBlob.size < 1000) {
          // Too small, skip
          return null
        }

        isProcessing = true
        try {
          const formData = new FormData()
          // Use proper file extension based on MIME type
          const fileExtension = mediaRecorder.mimeType?.includes('webm')
            ? 'webm'
            : mediaRecorder.mimeType?.includes('mp4')
              ? 'mp4'
              : mediaRecorder.mimeType?.includes('ogg')
                ? 'ogg'
                : 'webm'

          formData.append('audio', audioBlob, `recording.${fileExtension}`)

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

      // Send accumulated chunks every 3 seconds for faster response
      const CHUNK_SEND_INTERVAL = 3000 // 3 seconds
      const MIN_CHUNK_SIZE = 2000 // Minimum 2KB to ensure valid audio

      mediaRecorder.ondataavailable = event => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      // Set up interval to send accumulated chunks periodically
      chunkSendIntervalRef.current = setInterval(async () => {
        if (
          audioChunksRef.current.length > 0 &&
          !isProcessing &&
          Date.now() - lastSendTime >= CHUNK_SEND_INTERVAL
        ) {
          // Calculate total size of accumulated chunks
          const totalSize = audioChunksRef.current.reduce((sum, chunk) => sum + chunk.size, 0)

          if (totalSize >= MIN_CHUNK_SIZE) {
            lastSendTime = Date.now()

            // Send accumulated chunks (copy array to avoid mutation during send)
            const chunksToSend = [...audioChunksRef.current]
            const transcript = await sendAudioChunks(chunksToSend)

            if (transcript && transcript.trim()) {
              // Extract incremental update from full transcript
              // Backend returns full transcript, but we only want to send the new part
              const lastSent = lastSentTranscriptRef.current
              let incrementalTranscript = transcript.trim()

              // If we have a previous transcript, extract only the new part
              if (lastSent) {
                const lastSentLower = lastSent.toLowerCase().trim()
                const transcriptLower = incrementalTranscript.toLowerCase().trim()

                // Check if the new transcript starts with the previous one (common case)
                if (transcriptLower.startsWith(lastSentLower)) {
                  // Extract the new part after the previous transcript
                  incrementalTranscript = incrementalTranscript.slice(lastSent.length).trim()
                } else {
                  // If transcript doesn't start with previous, it might be a replacement
                  // In this case, send the full transcript but mark it appropriately
                  // For now, we'll treat it as a full replacement and let the callback handle it
                  incrementalTranscript = transcript.trim()
                }
              }

              // Only send if there's new content
              if (incrementalTranscript) {
                // Update accumulated transcript with full transcript
                accumulatedTranscript = transcript.trim()
                // Update last sent to the full transcript (for next comparison)
                lastSentTranscriptRef.current = transcript.trim()
                // Send only the incremental part to append
                onResult(incrementalTranscript)
              }
            }
          }
        }
      }, CHUNK_SEND_INTERVAL)

      mediaRecorder.onstop = async () => {
        setIsListening(false)

        // Clear the interval
        if (chunkSendIntervalRef.current) {
          clearInterval(chunkSendIntervalRef.current)
          chunkSendIntervalRef.current = null
        }

        // Send final audio chunk if there's remaining data
        const audioBlob = new Blob(audioChunksRef.current, {
          type: mediaRecorder.mimeType || 'audio/webm',
        })

        // If we have accumulated transcript from chunks, ensure final part is sent
        // Otherwise, send the full recording as fallback
        if (accumulatedTranscript) {
          // Check if there's any remaining part that hasn't been sent
          const lastSent = lastSentTranscriptRef.current
          const accumulatedLower = accumulatedTranscript.toLowerCase().trim()
          const lastSentLower = lastSent.toLowerCase().trim()

          // If accumulated is longer than last sent, send the remaining part
          if (!lastSentLower || !accumulatedLower.startsWith(lastSentLower)) {
            // If they don't match, send the full accumulated (shouldn't happen normally)
            const remainingPart = accumulatedTranscript.trim()
            if (remainingPart) {
              lastSentTranscriptRef.current = accumulatedTranscript.trim()
              onResult(remainingPart)
            }
          }
        } else if (audioBlob.size >= 1000) {
          // If we didn't get any partial results, send the full recording
          try {
            const finalTranscript = await sendAudioChunks(audioChunksRef.current)
            if (finalTranscript && finalTranscript.trim()) {
              // Extract incremental update if we have previous transcript
              const lastSent = lastSentTranscriptRef.current
              let incrementalTranscript = finalTranscript.trim()

              if (lastSent) {
                const lastSentLower = lastSent.toLowerCase().trim()
                const transcriptLower = incrementalTranscript.toLowerCase().trim()

                if (transcriptLower.startsWith(lastSentLower)) {
                  incrementalTranscript = incrementalTranscript.slice(lastSent.length).trim()
                }
              }

              if (incrementalTranscript) {
                lastSentTranscriptRef.current = finalTranscript.trim()
                onResult(incrementalTranscript)
              } else {
                setError('No new transcription received. Please try again.')
              }
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
        lastSendTime = 0
        // Reset last sent transcript ref
        lastSentTranscriptRef.current = ''
      }

      mediaRecorderRef.current = mediaRecorder
      setIsListening(true)
      setError(null)
      lastSendTime = Date.now()
      // Start recording - chunks will be sent via interval, not via timeslice
      mediaRecorder.start()

      // Auto-stop after 15 seconds to prevent very long recordings
      // Reduced from 30s for faster response
      autoStopTimeoutRef.current = setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          stopListeningRef.current?.()
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

    // Clear silence timeout (for Chromium-based browsers)
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current)
      silenceTimeoutRef.current = null
    }

    // Clear chunk send interval
    if (chunkSendIntervalRef.current) {
      clearInterval(chunkSendIntervalRef.current)
      chunkSendIntervalRef.current = null
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

    // Reset Firefox fallback transcript tracking
    lastSentTranscriptRef.current = ''

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
