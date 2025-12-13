import { useCallback, useEffect, useRef, useState } from 'react'
import useWebSocket, { ReadyState } from 'react-use-websocket'
import type { ModelId } from '@/stores/app.store'

// WebSocket config message
interface ConfigMessage {
  type: 'config'
  model: string
  sample_rate: number
}

// WebSocket start session message - to sync sessionId with BE
interface StartSessionMessage {
  type: 'start_session'
  sessionId: string
}

// WebSocket flush message - to force transcribe remaining audio buffer
interface FlushMessage {
  type: 'flush'
}

// WebSocket ping message for heartbeat
interface PingMessage {
  type: 'ping'
  timestamp: number
}

// WebSocket transcription response
export interface TranscriptionResponse {
  text: string
  is_final: boolean
  model: string
  session_id?: string
  latency_ms?: number
  type?: 'pong' | 'transcription' // Added type for pong response
}

// WebSocket moderation result (from ViSoBERT-HSD)
export type ModerationLabel = 'CLEAN' | 'OFFENSIVE' | 'HATE'

export interface ModerationResult {
  type: 'moderation'
  request_id: string | null
  label: ModerationLabel
  label_id: 0 | 1 | 2  // 0=CLEAN, 1=OFFENSIVE, 2=HATE
  confidence: number   // 0.0 - 1.0
  is_flagged: boolean  // true if OFFENSIVE or HATE
  latency_ms: number
  detected_keywords: string[]  // Keywords detected by ViSoBERT-HSD-Span
}

export interface TranscriptionState {
  /** Current interim text (not finalized) */
  interimText: string
  /** All finalized text segments */
  finalizedSegments: string[]
  /** Full transcript (interim + finalized) */
  fullTranscript: string
  /** Current session ID */
  sessionId: string | null
  /** WebSocket connection state */
  connectionState: ReadyState
  /** Last error message */
  error: string | null
  /** Total bytes sent in current session */
  bytesSent: number
  /** Audio chunks queued when connection not ready */
  queuedChunks: number
  /** Last heartbeat round-trip time in ms */
  lastPingLatency: number | null
  /** Connection health status */
  connectionHealth: 'healthy' | 'degraded' | 'unhealthy'
  /** Latest moderation result (from ViSoBERT-HSD) */
  latestModeration: ModerationResult | null
  /** All moderation results for current session */
  moderationResults: ModerationResult[]
}

export interface UseTranscriptionOptions {
  /** Model to use for transcription */
  model: ModelId
  /** Called when new transcription is received */
  onTranscription?: (response: TranscriptionResponse) => void
  /** Called when moderation result is received */
  onModeration?: (result: ModerationResult) => void
  /** Called when connection state changes */
  onConnectionChange?: (state: ReadyState) => void
  /** Called on error */
  onError?: (error: string) => void
  /** Called when connection health changes */
  onHealthChange?: (health: 'healthy' | 'degraded' | 'unhealthy') => void
  /** WebSocket URL (default: ws://localhost:8000/ws/transcribe) */
  wsUrl?: string
  /** Sample rate for audio (default: 16000) */
  sampleRate?: number
  /** Heartbeat interval in ms (default: 30000) */
  heartbeatInterval?: number
  /** Max queued audio chunks before dropping old ones (default: 50) */
  maxQueueSize?: number
  /** Enable audio queuing when connection not ready (default: true) */
  enableQueue?: boolean
}

const WS_URL = 'ws://localhost:8000/ws/transcribe'
const DEFAULT_HEARTBEAT_INTERVAL = 30000 // 30 seconds
const DEFAULT_MAX_QUEUE_SIZE = 50 // ~12.8 seconds of audio at 4096 samples/chunk
const PING_TIMEOUT = 5000 // 5 seconds timeout for pong response
const UNHEALTHY_THRESHOLD = 3 // Number of missed pings before unhealthy
const STATS_UPDATE_INTERVAL = 2000 // Update bytesSent/queuedChunks state every 2s to reduce re-renders

/**
 * Custom hook for WebSocket-based transcription
 * Manages connection, sends audio data, and receives transcription results
 * 
 * Features:
 * - Heartbeat/ping-pong mechanism for early connection drop detection
 * - Backpressure handling with audio queue
 * - Bytes sent tracking for debugging
 * - Connection health monitoring
 * 
 * @example
 * ```tsx
 * const { sendAudio, connect, disconnect, state, bytesSent } = useTranscription({
 *   model: 'zipformer',
 *   onTranscription: (response) => console.log(response.text),
 *   onHealthChange: (health) => updateHealthIndicator(health),
 * })
 * ```
 */
export function useTranscription(options: UseTranscriptionOptions) {
  const {
    model,
    onTranscription,
    onModeration,
    onConnectionChange,
    onError,
    onHealthChange,
    wsUrl = WS_URL,
    sampleRate = 16000,
    heartbeatInterval = DEFAULT_HEARTBEAT_INTERVAL,
    maxQueueSize = DEFAULT_MAX_QUEUE_SIZE,
    enableQueue = true,
  } = options

  const [state, setState] = useState<TranscriptionState>({
    interimText: '',
    finalizedSegments: [],
    fullTranscript: '',
    sessionId: null,
    connectionState: ReadyState.CLOSED,
    error: null,
    bytesSent: 0,
    queuedChunks: 0,
    lastPingLatency: null,
    connectionHealth: 'healthy',
    latestModeration: null,
    moderationResults: [],
  })

  // Track if config has been sent
  const configSentRef = useRef(false)
  // Track if we should connect - USE STATE to trigger re-render
  const [shouldConnect, setShouldConnect] = useState(false)
  
  // Heartbeat tracking
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastPingTimeRef = useRef<number>(0)
  const missedPingsRef = useRef<number>(0)
  
  // Audio queue for backpressure handling
  const audioQueueRef = useRef<ArrayBuffer[]>([])
  const isProcessingQueueRef = useRef(false)
  
  // Bytes tracking
  const bytesSentRef = useRef<number>(0)
  
  // Throttle stats updates to reduce re-renders during audio streaming
  const statsUpdateIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Generate session ID - simple format: timestamp + random string
  const generateSessionId = useCallback(() => {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 8)
    return `${timestamp}_${random}`
  }, [])

  /**
   * Update connection health based on missed pings
   */
  const updateConnectionHealth = useCallback((missed: number) => {
    let health: 'healthy' | 'degraded' | 'unhealthy'
    
    if (missed === 0) {
      health = 'healthy'
    } else if (missed < UNHEALTHY_THRESHOLD) {
      health = 'degraded'
    } else {
      health = 'unhealthy'
    }
    
    setState((prev) => {
      if (prev.connectionHealth !== health) {
        onHealthChange?.(health)
        return { ...prev, connectionHealth: health }
      }
      return prev
    })
  }, [onHealthChange])

  /**
   * Handle pong response - defined before useWebSocket for filter callback
   */
  const handlePong = useCallback((timestamp: number) => {
    // Clear timeout
    if (pingTimeoutRef.current) {
      clearTimeout(pingTimeoutRef.current)
      pingTimeoutRef.current = null
    }
    
    // Calculate round-trip time
    const latency = Date.now() - timestamp
    missedPingsRef.current = 0
    
    setState((prev) => ({
      ...prev,
      lastPingLatency: latency,
      connectionHealth: 'healthy',
    }))
    
    updateConnectionHealth(0)
  }, [updateConnectionHealth])

  // WebSocket connection
  const {
    sendJsonMessage,
    lastMessage,
    readyState,
    getWebSocket,
  } = useWebSocket(
    shouldConnect ? wsUrl : null,
    {
      // PERFORMANCE: Filter messages to prevent unnecessary re-renders
      // Handle pong messages directly without updating lastMessage
      filter: (message) => {
        try {
          const data = JSON.parse(message.data)
          
          // Handle pong response without triggering re-render
          if (data.type === 'pong' && 'timestamp' in data) {
            handlePong(data.timestamp)
            return false // Don't update lastMessage
          }
          
          return true // Pass through for transcription/moderation
        } catch {
          return true // Pass through non-JSON messages
        }
      },
      onOpen: () => {
        console.log('[WS] Connected to transcription server')
        configSentRef.current = false
        missedPingsRef.current = 0
        bytesSentRef.current = 0
        audioQueueRef.current = []
        
        // Reset state for new session
        setState((prev) => ({
          ...prev,
          interimText: '',
          finalizedSegments: [],
          fullTranscript: '',
          sessionId: null,
          error: null,
          bytesSent: 0,
          queuedChunks: 0,
          lastPingLatency: null,
          connectionHealth: 'healthy',
          latestModeration: null,
          moderationResults: [],
        }))
      },
      onClose: () => {
        console.log('[WS] Disconnected from transcription server')
        configSentRef.current = false
        
        // Clear heartbeat
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current)
          pingIntervalRef.current = null
        }
        if (pingTimeoutRef.current) {
          clearTimeout(pingTimeoutRef.current)
          pingTimeoutRef.current = null
        }
      },
      onError: (event) => {
        console.error('[WS] WebSocket error:', event)
        const errorMsg = 'WebSocket connection error'
        setState((prev) => ({ ...prev, error: errorMsg, connectionHealth: 'unhealthy' }))
        onError?.(errorMsg)
      },
      shouldReconnect: (closeEvent) => {
        // Reconnect on unexpected close
        return closeEvent.code !== 1000 && shouldConnect
      },
      reconnectAttempts: 5,
      reconnectInterval: 3000,
    },
    shouldConnect
  )

  /**
   * Send ping for heartbeat
   */
  const sendPing = useCallback(() => {
    if (readyState !== ReadyState.OPEN) return
    
    lastPingTimeRef.current = Date.now()
    const pingMsg: PingMessage = { 
      type: 'ping', 
      timestamp: lastPingTimeRef.current 
    }
    
    sendJsonMessage(pingMsg)
    
    // Set timeout for pong response
    pingTimeoutRef.current = setTimeout(() => {
      missedPingsRef.current++
      console.warn(`[WS] Ping timeout (missed: ${missedPingsRef.current})`)
      updateConnectionHealth(missedPingsRef.current)
      
      // If too many missed pings, consider connection dead
      if (missedPingsRef.current >= UNHEALTHY_THRESHOLD) {
        const errorMsg = 'Connection appears dead (no heartbeat response)'
        setState((prev) => ({ ...prev, error: errorMsg }))
        onError?.(errorMsg)
      }
    }, PING_TIMEOUT)
  }, [readyState, sendJsonMessage, updateConnectionHealth, onError])

  /**
   * Process queued audio chunks
   */
  const processQueue = useCallback(() => {
    if (isProcessingQueueRef.current) return
    if (readyState !== ReadyState.OPEN) return
    if (audioQueueRef.current.length === 0) return
    
    isProcessingQueueRef.current = true
    
    const ws = getWebSocket()
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      isProcessingQueueRef.current = false
      return
    }
    
    // Send all queued chunks
    while (audioQueueRef.current.length > 0) {
      const chunk = audioQueueRef.current.shift()!
      try {
        (ws as WebSocket).send(chunk)
        bytesSentRef.current += chunk.byteLength
      } catch (error) {
        console.error('[WS] Failed to send queued chunk:', error)
        // Re-queue the chunk
        audioQueueRef.current.unshift(chunk)
        break
      }
    }
    
    setState((prev) => ({
      ...prev,
      bytesSent: bytesSentRef.current,
      queuedChunks: audioQueueRef.current.length,
    }))
    
    isProcessingQueueRef.current = false
  }, [readyState, getWebSocket])

  // Update connection state
  useEffect(() => {
    setState((prev) => ({ ...prev, connectionState: readyState }))
    onConnectionChange?.(readyState)
    
    // Process queue when connection becomes ready
    if (readyState === ReadyState.OPEN) {
      processQueue()
    }
  }, [readyState, onConnectionChange, processQueue])

  // Send config when connected
  useEffect(() => {
    if (readyState === ReadyState.OPEN && !configSentRef.current) {
      const sessionId = generateSessionId()
      const config: ConfigMessage = {
        type: 'config',
        model,
        sample_rate: sampleRate,
      }
      
      sendJsonMessage(config)
      
      // Send start_session to sync sessionId with BE
      const startSession: StartSessionMessage = {
        type: 'start_session',
        sessionId,
      }
      sendJsonMessage(startSession)
      
      configSentRef.current = true
      
      setState((prev) => ({
        ...prev,
        sessionId,
        error: null,
        interimText: '',
        finalizedSegments: [],
        fullTranscript: '',
      }))
      
      console.log('[WS] Config sent:', config, 'Session:', sessionId)
      
      // Start heartbeat
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current)
      }
      pingIntervalRef.current = setInterval(sendPing, heartbeatInterval)
      
      // Send initial ping
      sendPing()
    }
  }, [readyState, model, sampleRate, sendJsonMessage, generateSessionId, heartbeatInterval, sendPing])

  // Handle incoming messages
  // NOTE: pong messages are filtered in useWebSocket filter callback for performance
  useEffect(() => {
    if (lastMessage === null) return

    try {
      const data = JSON.parse(lastMessage.data)
      
      // Handle moderation result
      if (data.type === 'moderation') {
        const moderationResult: ModerationResult = {
          ...data,
          detected_keywords: data.detected_keywords ?? [],  // Ensure array fallback
        } as ModerationResult
        setState((prev) => ({
          ...prev,
          latestModeration: moderationResult,
          moderationResults: [...prev.moderationResults, moderationResult],
        }))
        onModeration?.(moderationResult)
        const keywordsInfo = moderationResult.detected_keywords.length > 0 
          ? `, keywords: [${moderationResult.detected_keywords.join(', ')}]` 
          : ''
        console.log('[WS] Moderation result:', moderationResult.label, `(${(moderationResult.confidence * 100).toFixed(1)}%)${keywordsInfo}`)
        return
      }
      
      // Handle transcription response
      const response: TranscriptionResponse = data
      
      setState((prev) => {
        let newInterim = prev.interimText
        let newSegments = [...prev.finalizedSegments]

        if (response.is_final) {
          // Add to finalized segments
          if (response.text.trim()) {
            newSegments.push(response.text.trim())
          }
          newInterim = ''
        } else {
          // Update interim text
          newInterim = response.text
        }

        // Build full transcript
        const fullTranscript = [...newSegments, newInterim]
          .filter(Boolean)
          .join(' ')

        return {
          ...prev,
          interimText: newInterim,
          finalizedSegments: newSegments,
          fullTranscript,
        }
      })

      onTranscription?.(response)
    } catch (error) {
      console.error('[WS] Failed to parse message:', error)
    }
  }, [lastMessage, onTranscription, onModeration, handlePong])

  // Cleanup heartbeat on unmount
  useEffect(() => {
    return () => {
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current)
      }
      if (pingTimeoutRef.current) {
        clearTimeout(pingTimeoutRef.current)
      }
      if (statsUpdateIntervalRef.current) {
        clearInterval(statsUpdateIntervalRef.current)
      }
    }
  }, [])

  // Periodic stats update to reduce re-renders during audio streaming
  // Instead of updating state on every sendAudio call, we sync refs to state periodically
  useEffect(() => {
    if (readyState === ReadyState.OPEN) {
      // Start periodic stats sync
      statsUpdateIntervalRef.current = setInterval(() => {
        setState((prev) => {
          // Only update if values actually changed
          if (prev.bytesSent !== bytesSentRef.current || 
              prev.queuedChunks !== audioQueueRef.current.length) {
            return {
              ...prev,
              bytesSent: bytesSentRef.current,
              queuedChunks: audioQueueRef.current.length,
            }
          }
          return prev
        })
      }, STATS_UPDATE_INTERVAL)
      
      return () => {
        if (statsUpdateIntervalRef.current) {
          clearInterval(statsUpdateIntervalRef.current)
          statsUpdateIntervalRef.current = null
        }
      }
    }
  }, [readyState])

  /**
   * Connect to WebSocket server
   */
  const connect = useCallback(() => {
    setShouldConnect(true)
  }, [])

  /**
   * Disconnect from WebSocket server
   */
  const disconnect = useCallback(() => {
    setShouldConnect(false)
    configSentRef.current = false
    
    // Clear heartbeat
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current)
      pingIntervalRef.current = null
    }
    
    // Clear queue
    audioQueueRef.current = []
    
    const ws = getWebSocket()
    if (ws) {
      ws.close(1000, 'User disconnected')
    }
  }, [getWebSocket])

  /**
   * Send flush signal to force transcribe remaining audio buffer
   * Used before disconnecting to ensure all audio is processed
   */
  const flush = useCallback(() => {
    if (readyState !== ReadyState.OPEN) {
      console.warn('[WS] Cannot flush: WebSocket not connected')
      return false
    }
    
    const flushMsg: FlushMessage = { type: 'flush' }
    sendJsonMessage(flushMsg)
    console.log('[WS] Flush signal sent')
    return true
  }, [readyState, sendJsonMessage])

  /**
   * Send audio data (binary) over WebSocket
   * Implements backpressure handling with optional queuing
   * 
   * PERFORMANCE: Does NOT trigger React re-renders on every chunk.
   * Stats are updated via periodic interval (STATS_UPDATE_INTERVAL) instead.
   * 
   * @param audioBuffer - PCM Int16 audio data as ArrayBuffer
   * @returns true if sent/queued successfully, false otherwise
   */
  const sendAudio = useCallback((audioBuffer: ArrayBuffer): boolean => {
    // If not connected, queue if enabled
    if (readyState !== ReadyState.OPEN) {
      if (enableQueue) {
        // Add to queue, removing old chunks if over limit
        audioQueueRef.current.push(audioBuffer)
        if (audioQueueRef.current.length > maxQueueSize) {
          audioQueueRef.current.shift() // Drop oldest
          console.warn('[WS] Audio queue overflow, dropping oldest chunk')
        }
        // DON'T setState here - let periodic update handle it
        return true
      }
      console.warn('[WS] Cannot send audio: WebSocket not connected')
      return false
    }

    const ws = getWebSocket()
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return false
    }

    try {
      // Process any queued chunks first (inline to avoid callback timing issues)
      if (!isProcessingQueueRef.current && audioQueueRef.current.length > 0) {
        isProcessingQueueRef.current = true
        while (audioQueueRef.current.length > 0) {
          const chunk = audioQueueRef.current.shift()!
          try {
            (ws as WebSocket).send(chunk)
            bytesSentRef.current += chunk.byteLength
          } catch (queueError) {
            console.error('[WS] Failed to send queued chunk:', queueError)
            audioQueueRef.current.unshift(chunk)
            break
          }
        }
        isProcessingQueueRef.current = false
      }
      
      // Send current chunk
      (ws as WebSocket).send(audioBuffer)
      bytesSentRef.current += audioBuffer.byteLength
      
      // PERFORMANCE: Don't setState on every chunk - reduces re-renders dramatically
      // Stats will be synced via periodic interval
      return true
    } catch (error) {
      console.error('[WS] Failed to send audio:', error)
      
      // Queue on send failure
      if (enableQueue) {
        audioQueueRef.current.push(audioBuffer)
        if (audioQueueRef.current.length > maxQueueSize) {
          audioQueueRef.current.shift()
        }
        setState((prev) => ({ ...prev, queuedChunks: audioQueueRef.current.length }))
      }
      return false
    }
  }, [readyState, getWebSocket, enableQueue, maxQueueSize])

  /**
   * Clear current transcription state
   */
  const clearTranscription = useCallback(() => {
    setState((prev) => ({
      ...prev,
      interimText: '',
      finalizedSegments: [],
      fullTranscript: '',
      latestModeration: null,
      moderationResults: [],
    }))
  }, [])

  /**
   * Get queue statistics
   */
  const getQueueStats = useCallback(() => ({
    queuedChunks: audioQueueRef.current.length,
    queuedBytes: audioQueueRef.current.reduce((sum, chunk) => sum + chunk.byteLength, 0),
    maxQueueSize,
  }), [maxQueueSize])

  /**
   * Check if WebSocket is ready to send data
   */
  const isReady = readyState === ReadyState.OPEN && configSentRef.current

  return {
    // State
    ...state,
    isReady,
    isConnected: readyState === ReadyState.OPEN,
    isConnecting: readyState === ReadyState.CONNECTING,

    // Actions
    connect,
    disconnect,
    sendAudio,
    flush,
    clearTranscription,
    getQueueStats,

    // Connection info
    readyState,
    ReadyState,
  }
}
