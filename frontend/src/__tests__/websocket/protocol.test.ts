/**
 * WebSocket Real-time Communication Tests
 * 
 * Tests for WebSocket protocol compliance with backend:
 * - Connection lifecycle
 * - Binary audio message handling
 * - JSON control messages
 * - Transcription response handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ==========================================
// WebSocket Protocol Constants
// ==========================================

const WS_ENDPOINT = '/api/v1/transcription/stream'

const MessageTypes = {
  // Client -> Server
  CONFIG: 'config',
  START_SESSION: 'start_session',
  FLUSH: 'flush',
  
  // Server -> Client
  TRANSCRIPTION: 'transcription',
  SESSION_STARTED: 'session_started',
  ERROR: 'error',
  SESSION_ENDED: 'session_ended'
} as const

interface ConfigMessage {
  type: 'config'
  model_id: string
  sample_rate?: number
  language?: string
}

interface TranscriptionResponse {
  type: 'transcription'
  text: string
  is_final: boolean
  start_time?: number
  end_time?: number
  confidence?: number
}

interface ErrorResponse {
  type: 'error'
  message: string
  code?: string
}

// ==========================================
// Mock WebSocket Server
// ==========================================

class MockWebSocketServer {
  private connections: MockWebSocket[] = []
  private messageHandlers: Map<string, (ws: MockWebSocket, data: unknown) => void> = new Map()
  
  constructor() {
    this.setupDefaultHandlers()
  }
  
  private setupDefaultHandlers(): void {
    // Handle config
    this.messageHandlers.set(MessageTypes.CONFIG, (_ws, data) => {
      const config = data as ConfigMessage
      // Validate and echo back acknowledgment
      if (config.model_id) {
        // Config accepted silently
      }
    })
    
    // Handle start_session
    this.messageHandlers.set(MessageTypes.START_SESSION, (ws) => {
      ws.receive({
        type: MessageTypes.SESSION_STARTED,
        session_id: `session-${Date.now()}`
      })
    })
    
    // Handle flush
    this.messageHandlers.set(MessageTypes.FLUSH, (ws) => {
      ws.receive({
        type: MessageTypes.SESSION_ENDED
      })
    })
  }
  
  connect(ws: MockWebSocket): void {
    this.connections.push(ws)
    ws.readyState = 1 // OPEN
    ws.dispatchEvent('open', {})
  }
  
  disconnect(ws: MockWebSocket): void {
    const index = this.connections.indexOf(ws)
    if (index > -1) {
      this.connections.splice(index, 1)
    }
    ws.readyState = 3 // CLOSED
    ws.dispatchEvent('close', { code: 1000, reason: 'Normal closure' })
  }
  
  handleMessage(ws: MockWebSocket, data: string | ArrayBuffer): void {
    if (typeof data === 'string') {
      try {
        const message = JSON.parse(data)
        const handler = this.messageHandlers.get(message.type)
        if (handler) {
          handler(ws, message)
        }
      } catch {
        ws.receive({
          type: MessageTypes.ERROR,
          message: 'Invalid JSON'
        })
      }
    } else {
      // Binary audio data - simulate transcription after short delay
      setTimeout(() => {
        ws.receive({
          type: MessageTypes.TRANSCRIPTION,
          text: 'mock transcript',
          is_final: false
        })
      }, 10)
    }
  }
  
  // Simulate sending final transcription
  sendFinalTranscription(ws: MockWebSocket, text: string): void {
    ws.receive({
      type: MessageTypes.TRANSCRIPTION,
      text,
      is_final: true,
      confidence: 0.95
    })
  }
  
  // Simulate error
  sendError(ws: MockWebSocket, message: string, code?: string): void {
    ws.receive({
      type: MessageTypes.ERROR,
      message,
      code
    })
  }
}

class MockWebSocket {
  url: string
  readyState = 0 // CONNECTING
  
  onopen: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  
  private server: MockWebSocketServer
  private sentMessages: (string | ArrayBuffer)[] = []
  
  constructor(url: string, server: MockWebSocketServer) {
    this.url = url
    this.server = server
    
    // Simulate connection
    setTimeout(() => {
      this.server.connect(this)
    }, 0)
  }
  
  send(data: string | ArrayBuffer): void {
    if (this.readyState !== 1) {
      throw new Error('WebSocket is not open')
    }
    this.sentMessages.push(data)
    this.server.handleMessage(this, data)
  }
  
  close(_code?: number, _reason?: string): void {
    this.server.disconnect(this)
  }
  
  // Called by server to send message to client
  receive(data: unknown): void {
    if (this.onmessage) {
      const message = typeof data === 'string' ? data : JSON.stringify(data)
      this.onmessage(new MessageEvent('message', { data: message }))
    }
  }
  
  dispatchEvent(type: string, data: unknown): void {
    if (type === 'open' && this.onopen) {
      this.onopen(new Event('open'))
    } else if (type === 'close' && this.onclose) {
      this.onclose(new CloseEvent('close', data as CloseEventInit))
    } else if (type === 'error' && this.onerror) {
      this.onerror(new Event('error'))
    }
  }
  
  getSentMessages(): (string | ArrayBuffer)[] {
    return this.sentMessages
  }
}

// ==========================================
// Test Suites
// ==========================================

describe('WebSocket Protocol', () => {
  let server: MockWebSocketServer
  
  beforeEach(() => {
    server = new MockWebSocketServer()
    vi.useFakeTimers()
  })
  
  afterEach(() => {
    vi.useRealTimers()
  })
  
  describe('Connection Lifecycle', () => {
    it('should establish connection successfully', async () => {
      const ws = new MockWebSocket(WS_ENDPOINT, server)
      const onOpen = vi.fn()
      ws.onopen = onOpen
      
      vi.runAllTimers()
      
      expect(ws.readyState).toBe(1) // OPEN
      expect(onOpen).toHaveBeenCalled()
    })
    
    it('should close connection cleanly', async () => {
      const ws = new MockWebSocket(WS_ENDPOINT, server)
      const onClose = vi.fn()
      ws.onclose = onClose
      
      vi.runAllTimers()
      
      ws.close(1000, 'Normal closure')
      
      expect(ws.readyState).toBe(3) // CLOSED
      expect(onClose).toHaveBeenCalled()
    })
    
    it('should prevent sending when not connected', () => {
      const ws = new MockWebSocket(WS_ENDPOINT, server)
      // Before connection established
      
      expect(() => ws.send('test')).toThrow('WebSocket is not open')
    })
  })
  
  describe('Config Message', () => {
    it('should send config with model_id', async () => {
      const ws = new MockWebSocket(WS_ENDPOINT, server)
      vi.runAllTimers()
      
      const config: ConfigMessage = {
        type: 'config',
        model_id: 'zipformer',
        sample_rate: 16000
      }
      
      ws.send(JSON.stringify(config))
      
      const sent = ws.getSentMessages()
      expect(sent).toHaveLength(1)
      expect(JSON.parse(sent[0] as string)).toEqual(config)
    })
    
    it('should accept valid config silently', async () => {
      const ws = new MockWebSocket(WS_ENDPOINT, server)
      const onMessage = vi.fn()
      ws.onmessage = onMessage
      
      vi.runAllTimers()
      
      ws.send(JSON.stringify({
        type: 'config',
        model_id: 'zipformer'
      }))
      
      vi.runAllTimers()
      
      // Config doesn't send response
      expect(onMessage).not.toHaveBeenCalled()
    })
  })
  
  describe('Session Messages', () => {
    it('should receive session_started after start_session', async () => {
      const ws = new MockWebSocket(WS_ENDPOINT, server)
      const responses: unknown[] = []
      
      ws.onmessage = (event) => {
        responses.push(JSON.parse(event.data))
      }
      
      vi.runAllTimers()
      
      ws.send(JSON.stringify({ type: 'start_session' }))
      vi.runAllTimers()
      
      expect(responses).toHaveLength(1)
      expect(responses[0]).toMatchObject({
        type: 'session_started'
      })
    })
    
    it('should receive session_ended after flush', async () => {
      const ws = new MockWebSocket(WS_ENDPOINT, server)
      const responses: unknown[] = []
      
      ws.onmessage = (event) => {
        responses.push(JSON.parse(event.data))
      }
      
      vi.runAllTimers()
      
      // Start session first
      ws.send(JSON.stringify({ type: 'start_session' }))
      vi.runAllTimers()
      
      // Then flush
      ws.send(JSON.stringify({ type: 'flush' }))
      vi.runAllTimers()
      
      expect(responses).toHaveLength(2)
      expect(responses[1]).toMatchObject({
        type: 'session_ended'
      })
    })
  })
  
  describe('Binary Audio Messages', () => {
    it('should send binary audio data', async () => {
      const ws = new MockWebSocket(WS_ENDPOINT, server)
      vi.runAllTimers()
      
      // Create PCM audio chunk
      const audioData = new Int16Array(4096).buffer
      ws.send(audioData)
      
      const sent = ws.getSentMessages()
      expect(sent).toHaveLength(1)
      expect(sent[0]).toBeInstanceOf(ArrayBuffer)
      expect((sent[0] as ArrayBuffer).byteLength).toBe(8192) // 4096 * 2
    })
    
    it('should receive transcription after sending audio', async () => {
      const ws = new MockWebSocket(WS_ENDPOINT, server)
      const responses: TranscriptionResponse[] = []
      
      ws.onmessage = (event) => {
        responses.push(JSON.parse(event.data))
      }
      
      vi.runAllTimers()
      
      ws.send(new ArrayBuffer(1024))
      vi.runAllTimers()
      
      expect(responses).toHaveLength(1)
      expect(responses[0].type).toBe('transcription')
      expect(responses[0].is_final).toBe(false)
    })
  })
  
  describe('Transcription Responses', () => {
    it('should handle interim transcription', async () => {
      const ws = new MockWebSocket(WS_ENDPOINT, server)
      let lastTranscription: TranscriptionResponse | null = null
      
      ws.onmessage = (event) => {
        lastTranscription = JSON.parse(event.data)
      }
      
      vi.runAllTimers()
      
      ws.send(new ArrayBuffer(1024))
      vi.runAllTimers()
      
      expect(lastTranscription).toMatchObject({
        type: 'transcription',
        is_final: false
      })
    })
    
    it('should handle final transcription', async () => {
      const ws = new MockWebSocket(WS_ENDPOINT, server)
      let lastTranscription: TranscriptionResponse | null = null
      
      ws.onmessage = (event) => {
        lastTranscription = JSON.parse(event.data)
      }
      
      vi.runAllTimers()
      
      // Server sends final transcription
      server.sendFinalTranscription(ws, 'Xin chào thế giới')
      
      expect(lastTranscription).toMatchObject({
        type: 'transcription',
        text: 'Xin chào thế giới',
        is_final: true,
        confidence: 0.95
      })
    })
  })
  
  describe('Error Handling', () => {
    it('should handle server error message', async () => {
      const ws = new MockWebSocket(WS_ENDPOINT, server)
      let lastError: ErrorResponse | null = null
      
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data)
        if (msg.type === 'error') {
          lastError = msg
        }
      }
      
      vi.runAllTimers()
      
      server.sendError(ws, 'Model not found', 'MODEL_NOT_FOUND')
      
      expect(lastError).toMatchObject({
        type: 'error',
        message: 'Model not found',
        code: 'MODEL_NOT_FOUND'
      })
    })
    
    it('should handle invalid JSON gracefully', async () => {
      const ws = new MockWebSocket(WS_ENDPOINT, server)
      let lastError: ErrorResponse | null = null
      
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data)
        if (msg.type === 'error') {
          lastError = msg
        }
      }
      
      vi.runAllTimers()
      
      ws.send('not valid json {')
      vi.runAllTimers()
      
      expect(lastError).toMatchObject({
        type: 'error',
        message: 'Invalid JSON'
      })
    })
  })
})

describe('WebSocket Message Sequence', () => {
  let server: MockWebSocketServer
  
  beforeEach(() => {
    server = new MockWebSocketServer()
    vi.useFakeTimers()
  })
  
  afterEach(() => {
    vi.useRealTimers()
  })
  
  it('should follow correct message sequence for transcription', async () => {
    const ws = new MockWebSocket(WS_ENDPOINT, server)
    const sentMessages: string[] = []
    const originalSend = ws.send.bind(ws)
    
    ws.send = (data: string | ArrayBuffer) => {
      if (typeof data === 'string') {
        sentMessages.push(data)
      } else {
        sentMessages.push('[binary]')
      }
      originalSend(data)
    }
    
    vi.runAllTimers()
    
    // 1. Send config
    ws.send(JSON.stringify({ type: 'config', model_id: 'zipformer' }))
    
    // 2. Start session
    ws.send(JSON.stringify({ type: 'start_session' }))
    
    // 3. Send audio chunks
    ws.send(new ArrayBuffer(4096))
    ws.send(new ArrayBuffer(4096))
    ws.send(new ArrayBuffer(4096))
    
    // 4. Flush
    ws.send(JSON.stringify({ type: 'flush' }))
    
    expect(sentMessages).toHaveLength(6)
    expect(JSON.parse(sentMessages[0])).toMatchObject({ type: 'config' })
    expect(JSON.parse(sentMessages[1])).toMatchObject({ type: 'start_session' })
    expect(sentMessages[2]).toBe('[binary]')
    expect(sentMessages[3]).toBe('[binary]')
    expect(sentMessages[4]).toBe('[binary]')
    expect(JSON.parse(sentMessages[5])).toMatchObject({ type: 'flush' })
  })
})

describe('WebSocket Performance', () => {
  let server: MockWebSocketServer
  
  beforeEach(() => {
    server = new MockWebSocketServer()
  })
  
  it('should handle rapid message sending', async () => {
    vi.useRealTimers()
    
    const ws = new MockWebSocket(WS_ENDPOINT, server)
    
    // Wait for connection
    await new Promise(resolve => setTimeout(resolve, 10))
    
    const messageCount = 100
    const start = performance.now()
    
    for (let i = 0; i < messageCount; i++) {
      ws.send(new ArrayBuffer(1024))
    }
    
    const duration = performance.now() - start
    
    expect(ws.getSentMessages()).toHaveLength(messageCount)
    // Should send 100 messages in under 100ms
    expect(duration).toBeLessThan(100)
  })
  
  it('should track message latency', async () => {
    vi.useRealTimers()
    
    const ws = new MockWebSocket(WS_ENDPOINT, server)
    const latencies: number[] = []
    
    // Wait for connection
    await new Promise(resolve => setTimeout(resolve, 10))
    
    // Measure multiple round trips
    for (let i = 0; i < 5; i++) {
      const start = performance.now()
      
      await new Promise<void>(resolve => {
        ws.onmessage = () => {
          latencies.push(performance.now() - start)
          resolve()
        }
        ws.send(new ArrayBuffer(1024))
      })
    }
    
    // All latencies should be very low in mocked environment
    expect(latencies).toHaveLength(5)
    latencies.forEach(l => expect(l).toBeLessThan(50))
  })
})
