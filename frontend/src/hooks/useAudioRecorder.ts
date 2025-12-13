import { useRef, useCallback, useState } from 'react'

export interface AudioRecorderState {
  isRecording: boolean
  isInitialized: boolean
  error: string | null
  mediaStream: MediaStream | null
  /** Current audio level (RMS, 0-1) for VU meter */
  audioLevel: number
  /** Actual sample rate being used (may differ from requested) */
  actualSampleRate: number | null
}

/** Message types from PCM Processor */
interface PCMProcessorMessage {
  type: 'audio' | 'level' | 'error' | 'state'
  buffer?: ArrayBuffer
  level?: number
  error?: string
  state?: string
}

export interface UseAudioRecorderOptions {
  onAudioData?: (data: ArrayBuffer) => void
  onError?: (error: Error) => void
  /** Called when audio level changes (for VU meter) */
  onAudioLevel?: (level: number) => void
  /** Called when processor state changes */
  onStateChange?: (state: string) => void
  sampleRate?: number
  /** Specific device ID to use for recording */
  deviceId?: string
  /** Buffer size for PCM processor (default: 4096) */
  bufferSize?: number
}

/**
 * Test if a specific sample rate is supported by creating a test AudioContext
 */
async function testSampleRateSupport(sampleRate: number): Promise<boolean> {
  try {
    const testContext = new AudioContext({ sampleRate })
    const supported = testContext.sampleRate === sampleRate
    await testContext.close()
    return supported
  } catch {
    return false
  }
}

/**
 * Get the best available sample rate with fallback
 * Prefers 16kHz, falls back to native rate with downsampling
 */
async function getBestSampleRate(preferredRate: number): Promise<{ sampleRate: number; needsDownsampling: boolean }> {
  // Try preferred rate first
  if (await testSampleRateSupport(preferredRate)) {
    return { sampleRate: preferredRate, needsDownsampling: false }
  }
  
  // Fallback to common rates, we'll downsample in the worklet
  const fallbackRates = [48000, 44100, 22050]
  for (const rate of fallbackRates) {
    if (await testSampleRateSupport(rate)) {
      console.log(`[AudioRecorder] Using ${rate}Hz (downsampling to ${preferredRate}Hz)`)
      return { sampleRate: rate, needsDownsampling: true }
    }
  }
  
  // Last resort: use default rate
  const defaultContext = new AudioContext()
  const defaultRate = defaultContext.sampleRate
  await defaultContext.close()
  
  console.log(`[AudioRecorder] Using default ${defaultRate}Hz (downsampling to ${preferredRate}Hz)`)
  return { sampleRate: defaultRate, needsDownsampling: defaultRate !== preferredRate }
}

/**
 * Custom hook for audio recording using AudioWorklet
 * Captures audio from microphone and converts to PCM Int16 format at 16kHz
 * 
 * Features:
 * - Automatic sample rate fallback when 16kHz not supported
 * - Real-time audio level monitoring for VU meter
 * - Proper downsampling in AudioWorklet
 * - Error handling and state management
 * 
 * @example
 * ```tsx
 * const { start, stop, isRecording, audioLevel } = useAudioRecorder({
 *   onAudioData: (buffer) => sendMessage(buffer),
 *   onAudioLevel: (level) => updateVuMeter(level),
 *   sampleRate: 16000,
 * })
 * ```
 */
export function useAudioRecorder(options: UseAudioRecorderOptions = {}) {
  const {
    onAudioData,
    onError,
    onAudioLevel,
    onStateChange,
    sampleRate = 16000,
    deviceId,
    // PERFORMANCE: Increased from 4096 to 8192 (~512ms at 16kHz)
    // Reduces number of audio chunks sent, decreasing WebSocket overhead
    // and React callback invocations by 50%
    bufferSize = 8192,
  } = options

  const [state, setState] = useState<AudioRecorderState>({
    isRecording: false,
    isInitialized: false,
    error: null,
    mediaStream: null,
    audioLevel: 0,
    actualSampleRate: null,
  })

  // Refs for audio objects (persist across renders)
  const audioContextRef = useRef<AudioContext | null>(null)
  const workletNodeRef = useRef<AudioWorkletNode | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const targetSampleRateRef = useRef<number>(sampleRate)

  /**
   * Initialize AudioContext and AudioWorklet
   */
  const initialize = useCallback(async (): Promise<boolean> => {
    try {
      // Find best available sample rate
      const { sampleRate: contextSampleRate, needsDownsampling } = await getBestSampleRate(sampleRate)
      
      // Create AudioContext with best available sample rate
      const audioContext = new AudioContext({
        sampleRate: contextSampleRate,
      })

      // Load AudioWorklet processor
      await audioContext.audioWorklet.addModule('/pcm-processor.js')

      audioContextRef.current = audioContext
      targetSampleRateRef.current = sampleRate
      
      setState((prev) => ({ 
        ...prev, 
        isInitialized: true, 
        error: null,
        actualSampleRate: contextSampleRate,
      }))
      
      if (needsDownsampling) {
        console.log(`[AudioRecorder] Initialized with downsampling: ${contextSampleRate}Hz → ${sampleRate}Hz`)
      } else {
        console.log(`[AudioRecorder] Initialized at native ${sampleRate}Hz`)
      }
      
      return true
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Failed to initialize audio')
      setState((prev) => ({ ...prev, error: err.message }))
      onError?.(err)
      return false
    }
  }, [sampleRate, onError])

  /**
   * Start recording audio from microphone
   */
  const start = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, error: null }))

      // Initialize if needed
      if (!audioContextRef.current) {
        const success = await initialize()
        if (!success) return
      }

      const audioContext = audioContextRef.current!

      // Resume context if suspended (browser autoplay policy)
      if (audioContext.state === 'suspended') {
        await audioContext.resume()
      }

      // Request microphone access
      const audioConstraints: MediaTrackConstraints = {
        channelCount: 1, // Mono
        sampleRate: audioContext.sampleRate, // Use actual context rate
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      }

      // Use specific device if provided
      if (deviceId) {
        audioConstraints.deviceId = { exact: deviceId }
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
      })

      mediaStreamRef.current = stream

      // Create source node from microphone
      const sourceNode = audioContext.createMediaStreamSource(stream)
      sourceNodeRef.current = sourceNode

      // Create AudioWorklet node with configuration
      const workletNode = new AudioWorkletNode(audioContext, 'pcm-processor', {
        processorOptions: {
          bufferSize,
          targetSampleRate: targetSampleRateRef.current,
        },
      })
      workletNodeRef.current = workletNode

      // Handle messages from PCM processor
      workletNode.port.onmessage = (event: MessageEvent<PCMProcessorMessage>) => {
        const { type, buffer, level, error, state: processorState } = event.data
        
        switch (type) {
          case 'audio':
            if (buffer && onAudioData) {
              onAudioData(buffer)
            }
            break
            
          case 'level':
            if (level !== undefined) {
              setState((prev) => ({ ...prev, audioLevel: level }))
              onAudioLevel?.(level)
            }
            break
            
          case 'error':
            if (error) {
              console.error('[AudioRecorder] Processor error:', error)
              setState((prev) => ({ ...prev, error }))
              onError?.(new Error(error))
            }
            break
            
          case 'state':
            if (processorState) {
              onStateChange?.(processorState)
            }
            break
        }
      }

      // Connect: Microphone -> Worklet
      sourceNode.connect(workletNode)
      // Note: We don't connect to destination (no playback needed)

      setState((prev) => ({ ...prev, isRecording: true, mediaStream: stream, audioLevel: 0 }))
    } catch (error) {
      let errorMessage = 'Failed to start recording'
      
      // Handle specific errors
      if (error instanceof DOMException) {
        if (error.name === 'NotAllowedError') {
          errorMessage = 'Microphone permission denied. Please allow microphone access.'
        } else if (error.name === 'NotFoundError') {
          errorMessage = 'No microphone found. Please connect a microphone.'
        }
      } else if (error instanceof Error) {
        errorMessage = error.message
      }

      const err = new Error(errorMessage)
      setState((prev) => ({ ...prev, error: errorMessage }))
      onError?.(err)
    }
  }, [initialize, deviceId, bufferSize, onAudioData, onAudioLevel, onStateChange, onError])

  /**
   * Stop recording and cleanup resources
   */
  const stop = useCallback(() => {
    // Send stop signal to processor to flush remaining buffer
    if (workletNodeRef.current) {
      try {
        workletNodeRef.current.port.postMessage({ type: 'stop' })
      } catch {
        // Port might be closed
      }
      workletNodeRef.current.port.onmessage = null
      workletNodeRef.current.disconnect()
      workletNodeRef.current = null
    }

    // Disconnect source
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect()
      sourceNodeRef.current = null
    }

    // Stop all media tracks
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop())
      mediaStreamRef.current = null
    }

    setState((prev) => ({ ...prev, isRecording: false, mediaStream: null, audioLevel: 0 }))
  }, [])

  /**
   * Cleanup all resources (call on unmount)
   */
  const cleanup = useCallback(() => {
    stop()

    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }

    setState({
      isRecording: false,
      isInitialized: false,
      error: null,
      mediaStream: null,
      audioLevel: 0,
      actualSampleRate: null,
    })
  }, [stop])

  return {
    // State
    isRecording: state.isRecording,
    isInitialized: state.isInitialized,
    error: state.error,
    mediaStream: state.mediaStream,
    audioLevel: state.audioLevel,
    actualSampleRate: state.actualSampleRate,

    // Actions
    start,
    stop,
    cleanup,
    initialize,
  }
}
