import { useCallback, useEffect, useRef } from 'react'
import { useAudioRecorder } from './useAudioRecorder'
import { useTranscription, type TranscriptionResponse } from './useTranscription'
import { useModels } from './useModels'
import { useAppStore } from '@/stores/app.store'
import { ReadyState } from 'react-use-websocket'

export interface UseRecordingOptions {
  /** Auto-connect to WebSocket when starting recording */
  autoConnect?: boolean
  /** Sample rate for audio capture */
  sampleRate?: number
  /** Specific device ID to use for recording */
  deviceId?: string
}

/**
 * Combined hook for audio recording and transcription
 * Integrates useAudioRecorder and useTranscription into a single interface
 * 
 * @example
 * ```tsx
 * const { 
 *   isRecording, 
 *   transcript, 
 *   startRecording, 
 *   stopRecording 
 * } = useRecording()
 * ```
 */
export function useRecording(options: UseRecordingOptions = {}) {
  const { autoConnect = true, sampleRate = 16000, deviceId } = options

  // Global state
  const {
    selectedModel,
    isRecording,
    setIsRecording,
    sessionId,
    setSessionId,
    currentTranscript,
    setCurrentTranscript,
    clearTranscript,
  } = useAppStore()

  // Model helpers for dynamic timeout
  const { getRecommendedTimeout } = useModels()

  // Track if we initiated the recording
  const recordingInitiatedRef = useRef(false)
  
  // Use refs to store current values to avoid recreating callbacks
  const currentTranscriptRef = useRef(currentTranscript)
  currentTranscriptRef.current = currentTranscript

  const setCurrentTranscriptRef = useRef(setCurrentTranscript)
  setCurrentTranscriptRef.current = setCurrentTranscript
  
  // Store selectedModel in ref for use in stopRecording
  const selectedModelRef = useRef(selectedModel)
  selectedModelRef.current = selectedModel

  // Stable transcription callback using useCallback with empty deps
  // Handles BOTH streaming (is_final: false) and finalized (is_final: true) results
  const handleTranscription = useCallback((response: TranscriptionResponse) => {
    const text = response.text.trim()
    if (!text) return
    
    if (response.is_final) {
      // Final result: Append to stored transcript
      const current = currentTranscriptRef.current
      setCurrentTranscriptRef.current(
        current 
          ? `${current} ${text}`
          : text
      )
    }
    // Note: Streaming (is_final: false) results are handled by useTranscription's
    // internal state (interimText, fullTranscript) and displayed via TranscriptDisplay
  }, [])

  // Stable error callback
  const handleTranscriptionError = useCallback((error: string) => {
    console.error('[Recording] Transcription error:', error)
  }, [])

  // Transcription hook with stable callbacks
  const transcription = useTranscription({
    model: selectedModel,
    sampleRate,
    onTranscription: handleTranscription,
    onError: handleTranscriptionError,
  })

  // Store transcription methods in refs to avoid dependency issues
  const transcriptionRef = useRef(transcription)
  transcriptionRef.current = transcription

  // Stable audio data callback
  const handleAudioData = useCallback((buffer: ArrayBuffer) => {
    transcriptionRef.current.sendAudio(buffer)
  }, [])

  // Stable audio error callback
  const handleAudioError = useCallback((error: Error) => {
    console.error('[Recording] Audio error:', error)
  }, [])

  // Audio recorder hook with stable callbacks
  const audioRecorder = useAudioRecorder({
    sampleRate,
    deviceId,
    onAudioData: handleAudioData,
    onError: handleAudioError,
  })

  // Store audioRecorder methods in refs
  const audioRecorderRef = useRef(audioRecorder)
  audioRecorderRef.current = audioRecorder

  // Sync session ID
  useEffect(() => {
    if (transcription.sessionId && transcription.sessionId !== sessionId) {
      setSessionId(transcription.sessionId)
    }
  }, [transcription.sessionId, sessionId, setSessionId])

  /**
   * Start recording and transcription
   */
  const startRecording = useCallback(async () => {
    try {
      recordingInitiatedRef.current = true
      
      // Clear previous transcript in store first
      clearTranscript()
      // Also clear the ref value to ensure handleTranscription starts fresh
      currentTranscriptRef.current = ''
      // Clear transcription hook state
      transcriptionRef.current.clearTranscription()

      // Connect WebSocket first
      if (autoConnect) {
        transcriptionRef.current.connect()
      }

      // Wait for WebSocket to be ready (with timeout)
      // Using shorter interval for faster response
      const waitForConnection = async (): Promise<boolean> => {
        const maxWait = 10000 // 10 seconds max
        const checkInterval = 50 // 50ms - faster polling
        let waited = 0

        while (waited < maxWait) {
          const currentState = transcriptionRef.current.readyState
          if (currentState === ReadyState.OPEN) {
            return true
          }
          // If connection failed, exit early
          if (currentState === ReadyState.CLOSED && waited > 500) {
            console.log('[Recording] Connection closed, retrying...')
          }
          await new Promise((resolve) => setTimeout(resolve, checkInterval))
          waited += checkInterval
        }
        return false
      }

      const connected = await waitForConnection()
      if (!connected) {
        throw new Error('Failed to connect to transcription server')
      }

      // Start audio capture
      await audioRecorderRef.current.start()
      setIsRecording(true)

      console.log('[Recording] Started')
    } catch (error) {
      console.error('[Recording] Failed to start:', error)
      recordingInitiatedRef.current = false
      setIsRecording(false)
      throw error
    }
  }, [autoConnect, clearTranscript, setIsRecording])

  /**
   * Stop recording and transcription
   * Sends flush signal to process remaining audio buffer before disconnecting
   * Uses dynamic timeout based on model's expected latency
   */
  const stopRecording = useCallback(async () => {
    // Stop audio capture first
    audioRecorderRef.current.stop()

    // Send flush signal to force transcribe remaining buffer
    const flushed = transcriptionRef.current.flush()
    
    if (flushed) {
      // Get dynamic timeout based on selected model
      const currentModel = selectedModelRef.current
      const recommendedTimeout = getRecommendedTimeout(currentModel)
      const maxWait = Math.max(recommendedTimeout, 5000) // At least 5s
      
      console.log(`[Recording] Model: ${currentModel}, timeout: ${maxWait}ms`)
      
      const checkInterval = 100 // 100ms - polling
      let waited = 0
      let lastTranscriptLength = transcriptionRef.current.fullTranscript?.length || 0
      let stableTime = 0 // Time since transcript stopped changing
      let hadAnyData = lastTranscriptLength > 0
      
      console.log('[Recording] Waiting for final transcription...')
      
      while (waited < maxWait) {
        await new Promise((resolve) => setTimeout(resolve, checkInterval))
        waited += checkInterval
        
        // Check transcription hook's fullTranscript (directly from WS messages)
        const currentLength = transcriptionRef.current.fullTranscript?.length || 0
        
        if (currentLength !== lastTranscriptLength) {
          // New data received - reset stable timer
          console.log(`[Recording] New data received at ${waited}ms, length: ${currentLength}`)
          lastTranscriptLength = currentLength
          stableTime = 0
          hadAnyData = true
        } else {
          stableTime += checkInterval
        }
        
        // If transcript has been stable for 1s after receiving data, we're done
        const stableThreshold = 1000
        if (stableTime >= stableThreshold && hadAnyData) {
          console.log(`[Recording] Transcript stable for ${stableThreshold}ms, proceeding to disconnect`)
          break
        }
        
        // Log progress every 2 seconds while waiting
        if (waited % 2000 === 0) {
          console.log(`[Recording] Still waiting... ${waited}ms/${maxWait}ms elapsed, data: ${hadAnyData}`)
        }
      }
      
      if (waited >= maxWait) {
        console.warn(`[Recording] Timeout after ${maxWait}ms waiting for transcription`)
      }
      
      // Update store from transcription hook's final state
      const finalTranscript = transcriptionRef.current.fullTranscript
      if (finalTranscript && finalTranscript.trim()) {
        setCurrentTranscriptRef.current(finalTranscript.trim())
        currentTranscriptRef.current = finalTranscript.trim()
        console.log(`[Recording] Final transcript: ${finalTranscript.slice(0, 100)}...`)
      }
    }

    // Disconnect WebSocket
    transcriptionRef.current.disconnect()

    // Update state
    setIsRecording(false)
    recordingInitiatedRef.current = false

    console.log('[Recording] Stopped')
  }, [setIsRecording, getRecommendedTimeout])

  /**
   * Toggle recording state
   */
  const toggleRecording = useCallback(async () => {
    if (isRecording) {
      await stopRecording()
    } else {
      await startRecording()
    }
  }, [isRecording, startRecording, stopRecording])

  // Cleanup on unmount - empty deps since we use refs
  useEffect(() => {
    return () => {
      if (recordingInitiatedRef.current) {
        audioRecorderRef.current.cleanup()
        transcriptionRef.current.disconnect()
      }
    }
  }, [])

  return {
    // Recording state
    isRecording,
    isConnected: transcription.isConnected,
    isConnecting: transcription.isConnecting,
    isReady: transcription.isReady,

    // Transcript data
    transcript: currentTranscript,
    interimText: transcription.interimText,
    fullTranscript: transcription.fullTranscript,
    finalizedSegments: transcription.finalizedSegments,

    // Moderation data (from ViSoBERT-HSD)
    latestModeration: transcription.latestModeration,
    moderationResults: transcription.moderationResults,

    // Session info
    sessionId,
    selectedModel,

    // Errors
    audioError: audioRecorder.error,
    wsError: transcription.error,

    // Connection state
    connectionState: transcription.connectionState,
    ReadyState,

    // Media stream for visualization
    mediaStream: audioRecorder.mediaStream,

    // Actions
    startRecording,
    stopRecording,
    toggleRecording,
    clearTranscript,

    // Direct access to sub-hooks (for advanced usage)
    audioRecorder,
    transcription,
  }
}
