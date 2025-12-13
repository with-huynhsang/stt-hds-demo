/**
 * Vitest Test Setup
 * 
 * Configures the test environment with:
 * - DOM testing utilities
 * - Browser API mocks (WebSocket, AudioContext, MediaDevices)
 * - MSW for API mocking
 */

import '@testing-library/jest-dom'
import { beforeAll, afterAll, afterEach, vi } from 'vitest'

// ==========================================
// Mock Browser APIs not available in jsdom
// ==========================================

/**
 * Mock MediaStream for getUserMedia
 */
class MockMediaStream {
  private tracks: MockMediaStreamTrack[] = []
  
  constructor() {
    this.tracks = [new MockMediaStreamTrack()]
  }
  
  getTracks() {
    return this.tracks
  }
  
  getAudioTracks() {
    return this.tracks.filter(t => t.kind === 'audio')
  }
  
  addTrack(track: MockMediaStreamTrack) {
    this.tracks.push(track)
  }
}

class MockMediaStreamTrack {
  kind = 'audio'
  id = 'mock-track-id'
  enabled = true
  readyState: 'live' | 'ended' = 'live'
  
  stop() {
    this.readyState = 'ended'
  }
}

/**
 * Mock MediaDevices API
 */
const mockMediaDevices = {
  getUserMedia: vi.fn().mockResolvedValue(new MockMediaStream()),
  enumerateDevices: vi.fn().mockResolvedValue([
    {
      deviceId: 'default',
      kind: 'audioinput',
      label: 'Default Microphone',
      groupId: 'default-group',
    },
    {
      deviceId: 'mic-1',
      kind: 'audioinput', 
      label: 'USB Microphone',
      groupId: 'usb-group',
    },
  ]),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
}

Object.defineProperty(navigator, 'mediaDevices', {
  value: mockMediaDevices,
  writable: true,
})

/**
 * Mock AudioContext and AudioWorklet
 */
class MockAudioContext {
  state: 'suspended' | 'running' | 'closed' = 'suspended'
  sampleRate = 16000
  destination = { channelCount: 2 }
  audioWorklet = {
    addModule: vi.fn().mockResolvedValue(undefined),
  }
  
  createMediaStreamSource = vi.fn().mockReturnValue({
    connect: vi.fn(),
    disconnect: vi.fn(),
  })
  
  createAnalyser = vi.fn().mockReturnValue({
    fftSize: 256,
    frequencyBinCount: 128,
    smoothingTimeConstant: 0.8,
    getByteFrequencyData: vi.fn((array: Uint8Array) => {
      // Fill with mock frequency data
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256)
      }
    }),
    connect: vi.fn(),
    disconnect: vi.fn(),
  })
  
  resume = vi.fn().mockResolvedValue(undefined)
  suspend = vi.fn().mockResolvedValue(undefined)
  close = vi.fn().mockResolvedValue(undefined)
}

class MockAudioWorkletNode {
  port = {
    onmessage: null as ((event: MessageEvent) => void) | null,
    postMessage: vi.fn(),
  }
  
  connect = vi.fn()
  disconnect = vi.fn()
  
  constructor(_context: MockAudioContext, _name: string) {}
}

// @ts-expect-error - Mock global
globalThis.AudioContext = MockAudioContext
// @ts-expect-error - Mock global
globalThis.AudioWorkletNode = MockAudioWorkletNode
// @ts-expect-error - Mock global
globalThis.MediaStream = MockMediaStream

/**
 * Mock WebSocket for testing
 */
class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  
  url: string
  readyState = MockWebSocket.CONNECTING
  binaryType: 'blob' | 'arraybuffer' = 'blob'
  
  onopen: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  
  private messageQueue: Array<string | ArrayBuffer> = []
  
  constructor(url: string, _protocols?: string | string[]) {
    this.url = url
    
    // Simulate connection delay
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN
      this.onopen?.(new Event('open'))
    }, 50)
  }
  
  send(data: string | ArrayBuffer | Blob) {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open')
    }
    this.messageQueue.push(data as string | ArrayBuffer)
  }
  
  close(code = 1000, reason = '') {
    this.readyState = MockWebSocket.CLOSING
    setTimeout(() => {
      this.readyState = MockWebSocket.CLOSED
      this.onclose?.(new CloseEvent('close', { code, reason }))
    }, 10)
  }
  
  // Test helper: simulate receiving a message
  _receiveMessage(data: string | object) {
    const messageData = typeof data === 'object' ? JSON.stringify(data) : data
    this.onmessage?.(new MessageEvent('message', { data: messageData }))
  }
  
  // Test helper: get sent messages
  _getSentMessages() {
    return this.messageQueue
  }
}

// @ts-expect-error - Mock global
globalThis.WebSocket = MockWebSocket

/**
 * Mock ResizeObserver
 */
class MockResizeObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}

globalThis.ResizeObserver = MockResizeObserver

/**
 * Mock requestAnimationFrame
 */
globalThis.requestAnimationFrame = vi.fn((cb) => {
  return setTimeout(cb, 16) as unknown as number
})

globalThis.cancelAnimationFrame = vi.fn((id) => {
  clearTimeout(id)
})

/**
 * Mock localStorage
 */
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}
Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
})

/**
 * Mock clipboard API
 */
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: vi.fn().mockResolvedValue(undefined),
    readText: vi.fn().mockResolvedValue(''),
  },
  writable: true,
})

/**
 * Mock URL.createObjectURL and revokeObjectURL
 */
URL.createObjectURL = vi.fn(() => 'blob:mock-url')
URL.revokeObjectURL = vi.fn()

// ==========================================
// Test Lifecycle Hooks
// ==========================================

beforeAll(() => {
  // Setup before all tests
})

afterEach(() => {
  // Reset all mocks after each test
  vi.clearAllMocks()
})

afterAll(() => {
  // Cleanup after all tests
})

// ==========================================
// Export mocks for test usage
// ==========================================

export {
  MockMediaStream,
  MockMediaStreamTrack,
  MockAudioContext,
  MockAudioWorkletNode,
  MockWebSocket,
  mockMediaDevices,
}
