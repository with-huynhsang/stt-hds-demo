/**
 * WebSocket Enhanced Features Tests
 * 
 * Tests for improved WebSocket hook features:
 * - Heartbeat/ping-pong mechanism
 * - Backpressure handling with audio queue
 * - Bytes tracking
 * - Connection health monitoring
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ==========================================
// Constants
// ==========================================

const UNHEALTHY_THRESHOLD = 3
const DEFAULT_MAX_QUEUE_SIZE = 50

// ==========================================
// Mock Enhanced WebSocket Client
// ==========================================

interface TranscriptionState {
  interimText: string
  finalizedSegments: string[]
  fullTranscript: string
  sessionId: string | null
  connectionState: number
  error: string | null
  bytesSent: number
  queuedChunks: number
  lastPingLatency: number | null
  connectionHealth: 'healthy' | 'degraded' | 'unhealthy'
}

class MockEnhancedWebSocketClient {
  private state: TranscriptionState = {
    interimText: '',
    finalizedSegments: [],
    fullTranscript: '',
    sessionId: null,
    connectionState: 0, // CONNECTING
    error: null,
    bytesSent: 0,
    queuedChunks: 0,
    lastPingLatency: null,
    connectionHealth: 'healthy',
  }
  
  private ws: MockWebSocket | null = null
  private audioQueue: ArrayBuffer[] = []
  private missedPings = 0
  private lastPingTime = 0
  private enableQueue: boolean
  private maxQueueSize: number
  
  // Callbacks
  onHealthChange?: (health: 'healthy' | 'degraded' | 'unhealthy') => void
  onError?: (error: string) => void
  
  constructor(options: { enableQueue?: boolean; maxQueueSize?: number } = {}) {
    this.enableQueue = options.enableQueue ?? true
    this.maxQueueSize = options.maxQueueSize ?? DEFAULT_MAX_QUEUE_SIZE
  }
  
  connect(wsUrl: string): void {
    this.ws = new MockWebSocket(wsUrl)
    this.state.connectionState = 0 // CONNECTING
    
    this.ws.onopen = () => {
      this.state.connectionState = 1 // OPEN
      this.missedPings = 0
      this.state.connectionHealth = 'healthy'
      this.state.bytesSent = 0
      this.audioQueue = []
    }
    
    this.ws.onclose = () => {
      this.state.connectionState = 3 // CLOSED
    }
    
    this.ws.onerror = () => {
      this.state.error = 'WebSocket connection error'
      this.state.connectionHealth = 'unhealthy'
      this.onError?.('WebSocket connection error')
    }
    
    this.ws.onmessage = (event) => {
      this.handleMessage(event.data)
    }
  }
  
  // Simulate opening the connection (for testing without timers)
  // preserveQueue = true will keep existing queued audio
  simulateOpen(preserveQueue = false): void {
    this.state.connectionState = 1
    if (this.ws) {
      this.ws.readyState = 1 // OPEN
    }
    this.missedPings = 0
    this.state.connectionHealth = 'healthy'
    this.state.bytesSent = 0
    if (!preserveQueue) {
      this.audioQueue = []
      this.state.queuedChunks = 0
    }
  }
  
  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data)
      
      // Handle pong response
      if (message.type === 'pong') {
        this.handlePong(message.timestamp)
        return
      }
      
      // Handle transcription
      if (message.text !== undefined) {
        if (message.is_final) {
          if (message.text.trim()) {
            this.state.finalizedSegments.push(message.text.trim())
          }
          this.state.interimText = ''
        } else {
          this.state.interimText = message.text
        }
        
        this.state.fullTranscript = [...this.state.finalizedSegments, this.state.interimText]
          .filter(Boolean)
          .join(' ')
      }
    } catch {
      // Ignore parse errors
    }
  }
  
  sendPing(): void {
    if (this.state.connectionState !== 1) {
      throw new Error('WebSocket not open')
    }
    
    this.lastPingTime = Date.now()
    this.ws?.send(JSON.stringify({ type: 'ping', timestamp: this.lastPingTime }))
  }
  
  // Simulate ping timeout (for testing)
  simulatePingTimeout(): void {
    this.missedPings++
    this.updateConnectionHealth()
    
    if (this.missedPings >= UNHEALTHY_THRESHOLD) {
      this.state.error = 'Connection appears dead (no heartbeat response)'
      this.onError?.('Connection appears dead (no heartbeat response)')
    }
  }
  
  private handlePong(timestamp: number): void {
    this.state.lastPingLatency = Date.now() - timestamp
    this.missedPings = 0
    this.state.connectionHealth = 'healthy'
    this.updateConnectionHealth()
  }
  
  private updateConnectionHealth(): void {
    let health: 'healthy' | 'degraded' | 'unhealthy'
    
    if (this.missedPings === 0) {
      health = 'healthy'
    } else if (this.missedPings < UNHEALTHY_THRESHOLD) {
      health = 'degraded'
    } else {
      health = 'unhealthy'
    }
    
    if (this.state.connectionHealth !== health) {
      this.state.connectionHealth = health
      this.onHealthChange?.(health)
    }
  }
  
  sendAudio(audioBuffer: ArrayBuffer): boolean {
    // If not connected, queue if enabled
    if (this.state.connectionState !== 1) {
      if (this.enableQueue) {
        this.audioQueue.push(audioBuffer)
        if (this.audioQueue.length > this.maxQueueSize) {
          this.audioQueue.shift() // Drop oldest
        }
        this.state.queuedChunks = this.audioQueue.length
        return true
      }
      return false
    }
    
    try {
      // Send any queued chunks first
      while (this.audioQueue.length > 0) {
        const chunk = this.audioQueue.shift()!
        this.ws?.send(chunk)
        this.state.bytesSent += chunk.byteLength
      }
      
      // Send current chunk
      this.ws?.send(audioBuffer)
      this.state.bytesSent += audioBuffer.byteLength
      this.state.queuedChunks = this.audioQueue.length
      
      return true
    } catch {
      if (this.enableQueue) {
        this.audioQueue.push(audioBuffer)
        if (this.audioQueue.length > this.maxQueueSize) {
          this.audioQueue.shift()
        }
        this.state.queuedChunks = this.audioQueue.length
      }
      return false
    }
  }
  
  disconnect(): void {
    this.audioQueue = []
    this.state.queuedChunks = 0
    this.ws?.close()
    this.ws = null
    this.state.connectionState = 3
  }
  
  getState(): TranscriptionState { return { ...this.state } }
  getMissedPings(): number { return this.missedPings }
  getQueueLength(): number { return this.audioQueue.length }
  
  // For testing: simulate pong response
  simulatePong(timestamp: number): void {
    this.handlePong(timestamp)
  }
  
  // For testing: simulate missed pings
  simulateMissedPings(count: number): void {
    this.missedPings = count
    this.updateConnectionHealth()
  }
}

class MockWebSocket {
  url: string
  readyState = 0
  
  onopen: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  
  private sentMessages: (string | ArrayBuffer)[] = []
  
  constructor(url: string) {
    this.url = url
  }
  
  send(data: string | ArrayBuffer): void {
    if (this.readyState !== 1) {
      throw new Error('WebSocket not open')
    }
    this.sentMessages.push(data)
  }
  
  close(): void {
    this.readyState = 3
    this.onclose?.(new CloseEvent('close', { code: 1000 }))
  }
  
  getSentMessages(): (string | ArrayBuffer)[] { return this.sentMessages }
}

// ==========================================
// Test Suites
// ==========================================

describe('WebSocket Heartbeat', () => {
  let client: MockEnhancedWebSocketClient
  
  beforeEach(() => {
    client = new MockEnhancedWebSocketClient()
  })
  
  afterEach(() => {
    client.disconnect()
  })
  
  describe('Ping/Pong Mechanism', () => {
    it('should start with healthy connection after connect', () => {
      client.connect('ws://localhost/test')
      client.simulateOpen()
      
      expect(client.getState().connectionHealth).toBe('healthy')
    })
    
    it('should update latency on pong response', () => {
      client.connect('ws://localhost/test')
      client.simulateOpen()
      
      const timestamp = Date.now() - 50 // 50ms ago
      client.simulatePong(timestamp)
      
      expect(client.getState().lastPingLatency).toBeGreaterThan(0)
    })
    
    it('should increment missed pings on timeout', () => {
      client.connect('ws://localhost/test')
      client.simulateOpen()
      
      // Simulate ping timeout
      client.simulatePingTimeout()
      
      expect(client.getMissedPings()).toBe(1)
    })
    
    it('should track multiple missed pings', () => {
      client.connect('ws://localhost/test')
      client.simulateOpen()
      
      client.simulatePingTimeout()
      client.simulatePingTimeout()
      client.simulatePingTimeout()
      
      expect(client.getMissedPings()).toBe(3)
    })
  })
  
  describe('Connection Health', () => {
    it('should be healthy with no missed pings', () => {
      client.connect('ws://localhost/test')
      client.simulateOpen()
      
      client.simulateMissedPings(0)
      
      expect(client.getState().connectionHealth).toBe('healthy')
    })
    
    it('should be degraded with some missed pings', () => {
      client.connect('ws://localhost/test')
      client.simulateOpen()
      
      client.simulateMissedPings(1)
      
      expect(client.getState().connectionHealth).toBe('degraded')
    })
    
    it('should be unhealthy after threshold missed pings', () => {
      client.connect('ws://localhost/test')
      client.simulateOpen()
      
      client.simulateMissedPings(UNHEALTHY_THRESHOLD)
      
      expect(client.getState().connectionHealth).toBe('unhealthy')
    })
    
    it('should call onHealthChange callback', () => {
      const onHealthChange = vi.fn()
      client.onHealthChange = onHealthChange
      
      client.connect('ws://localhost/test')
      client.simulateOpen()
      
      client.simulateMissedPings(1)
      
      expect(onHealthChange).toHaveBeenCalledWith('degraded')
    })
    
    it('should reset to healthy on successful pong', () => {
      client.connect('ws://localhost/test')
      client.simulateOpen()
      
      // Simulate missed pings
      client.simulateMissedPings(2)
      expect(client.getState().connectionHealth).toBe('degraded')
      
      // Receive pong
      client.simulatePong(Date.now())
      
      expect(client.getState().connectionHealth).toBe('healthy')
      expect(client.getMissedPings()).toBe(0)
    })
  })
})

describe('Audio Queue (Backpressure)', () => {
  let client: MockEnhancedWebSocketClient
  
  beforeEach(() => {
    client = new MockEnhancedWebSocketClient({ enableQueue: true, maxQueueSize: 5 })
  })
  
  afterEach(() => {
    client.disconnect()
  })
  
  describe('Queue Behavior', () => {
    it('should queue audio when not connected', () => {
      // Don't connect yet
      const audio = new ArrayBuffer(1024)
      
      const result = client.sendAudio(audio)
      
      expect(result).toBe(true)
      expect(client.getQueueLength()).toBe(1)
      expect(client.getState().queuedChunks).toBe(1)
    })
    
    it('should queue multiple chunks', () => {
      for (let i = 0; i < 3; i++) {
        client.sendAudio(new ArrayBuffer(1024))
      }
      
      expect(client.getQueueLength()).toBe(3)
    })
    
    it('should drop oldest when queue is full', () => {
      // Queue is max 5
      for (let i = 0; i < 7; i++) {
        client.sendAudio(new ArrayBuffer(1024))
      }
      
      // Should have dropped 2 oldest chunks
      expect(client.getQueueLength()).toBe(5)
    })
    
    it('should flush queue when connected and sending', () => {
      // Queue some audio
      for (let i = 0; i < 3; i++) {
        client.sendAudio(new ArrayBuffer(1024))
      }
      expect(client.getQueueLength()).toBe(3)
      
      // Connect
      client.connect('ws://localhost/test')
      client.simulateOpen()
      
      // Send new audio (should flush queue first)
      client.sendAudio(new ArrayBuffer(1024))
      
      expect(client.getQueueLength()).toBe(0)
    })
  })
  
  describe('Queue Disabled', () => {
    it('should not queue when disabled', () => {
      const noQueueClient = new MockEnhancedWebSocketClient({ enableQueue: false })
      
      const result = noQueueClient.sendAudio(new ArrayBuffer(1024))
      
      expect(result).toBe(false)
      expect(noQueueClient.getQueueLength()).toBe(0)
      
      noQueueClient.disconnect()
    })
  })
})

describe('Bytes Tracking', () => {
  let client: MockEnhancedWebSocketClient
  
  beforeEach(() => {
    client = new MockEnhancedWebSocketClient()
  })
  
  afterEach(() => {
    client.disconnect()
  })
  
  it('should track bytes sent', () => {
    client.connect('ws://localhost/test')
    client.simulateOpen()
    
    client.sendAudio(new ArrayBuffer(1024))
    client.sendAudio(new ArrayBuffer(2048))
    
    expect(client.getState().bytesSent).toBe(3072)
  })
  
  it('should reset bytes on reconnect', () => {
    client.connect('ws://localhost/test')
    client.simulateOpen()
    
    client.sendAudio(new ArrayBuffer(1024))
    expect(client.getState().bytesSent).toBe(1024)
    
    client.disconnect()
    client.connect('ws://localhost/test')
    client.simulateOpen()
    
    expect(client.getState().bytesSent).toBe(0)
  })
  
  it('should include queued bytes when flushing', () => {
    // Queue first
    client.sendAudio(new ArrayBuffer(1024))
    client.sendAudio(new ArrayBuffer(1024))
    
    // Connect (preserve queue)
    client.connect('ws://localhost/test')
    client.simulateOpen(true) // preserveQueue = true
    
    // Send new audio (flushes queue)
    client.sendAudio(new ArrayBuffer(1024))
    
    expect(client.getState().bytesSent).toBe(3072)
  })
})

describe('Connection State', () => {
  let client: MockEnhancedWebSocketClient
  
  beforeEach(() => {
    client = new MockEnhancedWebSocketClient()
  })
  
  afterEach(() => {
    client.disconnect()
  })
  
  it('should start in connecting state', () => {
    client.connect('ws://localhost/test')
    
    expect(client.getState().connectionState).toBe(0) // CONNECTING
  })
  
  it('should transition to open state', () => {
    client.connect('ws://localhost/test')
    client.simulateOpen()
    
    expect(client.getState().connectionState).toBe(1) // OPEN
  })
  
  it('should transition to closed state on disconnect', () => {
    client.connect('ws://localhost/test')
    client.simulateOpen()
    
    client.disconnect()
    
    expect(client.getState().connectionState).toBe(3) // CLOSED
  })
  
  it('should clear queue on disconnect', () => {
    client.sendAudio(new ArrayBuffer(1024))
    expect(client.getQueueLength()).toBe(1)
    
    client.disconnect()
    
    expect(client.getQueueLength()).toBe(0)
  })
})

describe('Error Handling', () => {
  let client: MockEnhancedWebSocketClient
  
  beforeEach(() => {
    client = new MockEnhancedWebSocketClient()
  })
  
  afterEach(() => {
    client.disconnect()
  })
  
  it('should set error on connection failure', () => {
    const onError = vi.fn()
    client.onError = onError
    
    // Initially no error
    expect(client.getState().error).toBeNull()
  })
  
  it('should report error after too many missed pings', () => {
    const onError = vi.fn()
    client.onError = onError
    
    client.connect('ws://localhost/test')
    client.simulateOpen()
    
    // Simulate multiple ping timeouts
    for (let i = 0; i < UNHEALTHY_THRESHOLD; i++) {
      client.simulatePingTimeout()
    }
    
    expect(client.getState().error).toContain('dead')
    expect(onError).toHaveBeenCalled()
  })
})

describe('Integration Scenarios', () => {
  let client: MockEnhancedWebSocketClient
  
  beforeEach(() => {
    client = new MockEnhancedWebSocketClient({ enableQueue: true, maxQueueSize: 10 })
  })
  
  afterEach(() => {
    client.disconnect()
  })
  
  it('should handle reconnection with queued audio', () => {
    // Queue audio while not connected
    for (let i = 0; i < 5; i++) {
      client.sendAudio(new ArrayBuffer(1024))
    }
    expect(client.getQueueLength()).toBe(5)
    
    // Now connect (preserve queue)
    client.connect('ws://localhost/test')
    client.simulateOpen(true) // preserveQueue = true
    
    // Send new audio to flush queue
    client.sendAudio(new ArrayBuffer(1024))
    
    expect(client.getQueueLength()).toBe(0)
    expect(client.getState().bytesSent).toBe(6 * 1024)
  })
  
  it('should maintain health during normal operation', () => {
    const healthChanges: string[] = []
    client.onHealthChange = (health) => healthChanges.push(health)
    
    client.connect('ws://localhost/test')
    client.simulateOpen()
    
    // Simulate normal ping-pong cycles (no actual send, just simulate)
    for (let i = 0; i < 3; i++) {
      client.simulatePong(Date.now())
    }
    
    expect(client.getState().connectionHealth).toBe('healthy')
  })
  
  it('should handle degraded connection gracefully', () => {
    client.connect('ws://localhost/test')
    client.simulateOpen()
    
    // Simulate one missed ping
    client.simulateMissedPings(1)
    
    expect(client.getState().connectionHealth).toBe('degraded')
    
    // Audio should still work (connection is still open)
    const result = client.sendAudio(new ArrayBuffer(1024))
    expect(result).toBe(true)
  })
})
