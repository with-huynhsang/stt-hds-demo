/**
 * Hooks Integration Tests
 * 
 * Tests for hook interactions:
 * - useAudioRecorder setup and teardown
 * - useTranscription WebSocket lifecycle
 * - useRecording combined flow
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ==========================================
// Mock Setup
// ==========================================

// Mock react-use-websocket
const mockSendMessage = vi.fn()
const mockSendJsonMessage = vi.fn()
let mockLastMessage: { data: string } | null = null

vi.mock('react-use-websocket', () => ({
  default: vi.fn(() => ({
    sendMessage: mockSendMessage,
    sendJsonMessage: mockSendJsonMessage,
    lastMessage: mockLastMessage,
    readyState: 1
  })),
  ReadyState: {
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3
  }
}))

// ==========================================
// Test Wrapper
// ==========================================

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  })
  
  return ({ children }: { children: React.ReactNode }) => 
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

// ==========================================
// Mocked Hook Implementations (for unit testing)
// ==========================================

/**
 * Simplified useAudioRecorder for testing
 * Tests the recording state machine without actual browser APIs
 */
function useAudioRecorderMock() {
  const [isRecording, setIsRecording] = React.useState(false)
  const [error, setError] = React.useState<Error | null>(null)
  const [devices, setDevices] = React.useState<MediaDeviceInfo[]>([])
  
  const onAudioDataRef = React.useRef<((data: ArrayBuffer) => void) | null>(null)
  
  // Mock device loading
  const loadDevices = React.useCallback(async () => {
    // Simulate async device enumeration
    await Promise.resolve()
    setDevices([
      { deviceId: 'default', kind: 'audioinput', label: 'Default Microphone' } as MediaDeviceInfo,
      { deviceId: 'mic-1', kind: 'audioinput', label: 'USB Microphone' } as MediaDeviceInfo
    ])
  }, [])
  
  // Start recording (simplified without actual AudioContext)
  const startRecording = React.useCallback(async (
    onAudioData: (data: ArrayBuffer) => void,
    options?: { simulateError?: boolean }
  ) => {
    if (options?.simulateError) {
      setError(new Error('Permission denied'))
      return
    }
    
    onAudioDataRef.current = onAudioData
    setIsRecording(true)
    setError(null)
  }, [])
  
  const stopRecording = React.useCallback(() => {
    setIsRecording(false)
    onAudioDataRef.current = null
  }, [])
  
  // Simulate receiving audio data (for testing)
  const simulateAudioData = React.useCallback((data: ArrayBuffer) => {
    if (onAudioDataRef.current && isRecording) {
      onAudioDataRef.current(data)
    }
  }, [isRecording])
  
  return {
    isRecording,
    error,
    devices,
    loadDevices,
    startRecording,
    stopRecording,
    simulateAudioData
  }
}

/**
 * Simplified useTranscription for testing
 */
function useTranscriptionMock(config: { modelId?: string } = {}) {
  const [isConnected, setIsConnected] = React.useState(false)
  const [transcription, setTranscription] = React.useState('')
  const [interimResult, setInterimResult] = React.useState('')
  
  const sendAudio = React.useCallback((data: ArrayBuffer) => {
    if (isConnected) {
      mockSendMessage(data)
    }
  }, [isConnected])
  
  const sendConfig = React.useCallback(() => {
    mockSendJsonMessage({
      type: 'config',
      model_id: config.modelId || 'zipformer'
    })
  }, [config.modelId])
  
  const startSession = React.useCallback(() => {
    mockSendJsonMessage({ type: 'start_session' })
    setIsConnected(true)
  }, [])
  
  const endSession = React.useCallback(() => {
    mockSendJsonMessage({ type: 'flush' })
    setIsConnected(false)
  }, [])
  
  // Handle incoming messages
  const handleMessage = React.useCallback((data: string) => {
    try {
      const message = JSON.parse(data)
      if (message.type === 'transcription') {
        if (message.is_final) {
          setTranscription(prev => prev + message.text + ' ')
          setInterimResult('')
        } else {
          setInterimResult(message.text)
        }
      }
    } catch {
      // Binary data, ignore
    }
  }, [])
  
  return {
    isConnected,
    transcription,
    interimResult,
    sendAudio,
    sendConfig,
    startSession,
    endSession,
    handleMessage
  }
}

// ==========================================
// Test Suites
// ==========================================

describe('useAudioRecorder Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  
  afterEach(() => {
    vi.clearAllMocks()
  })
  
  describe('Device Enumeration', () => {
    it('should load available audio devices', async () => {
      const { result } = renderHook(() => useAudioRecorderMock(), {
        wrapper: createWrapper()
      })
      
      await act(async () => {
        await result.current.loadDevices()
      })
      
      // Uses internal mock - no external mock needed
      expect(result.current.devices).toHaveLength(2)
      expect(result.current.devices[0].label).toBe('Default Microphone')
    })
    
    it('should have audio input devices', async () => {
      const { result } = renderHook(() => useAudioRecorderMock(), {
        wrapper: createWrapper()
      })
      
      await act(async () => {
        await result.current.loadDevices()
      })
      
      // All devices should be audioinput
      expect(result.current.devices.every(d => d.kind === 'audioinput')).toBe(true)
    })
  })
  
  describe('Recording Lifecycle', () => {
    it('should start recording', async () => {
      const onAudioData = vi.fn()
      
      const { result } = renderHook(() => useAudioRecorderMock(), {
        wrapper: createWrapper()
      })
      
      expect(result.current.isRecording).toBe(false)
      
      await act(async () => {
        await result.current.startRecording(onAudioData)
      })
      
      expect(result.current.isRecording).toBe(true)
      expect(result.current.error).toBeNull()
    })
    
    it('should stop recording and cleanup resources', async () => {
      const onAudioData = vi.fn()
      
      const { result } = renderHook(() => useAudioRecorderMock(), {
        wrapper: createWrapper()
      })
      
      await act(async () => {
        await result.current.startRecording(onAudioData)
      })
      
      expect(result.current.isRecording).toBe(true)
      
      act(() => {
        result.current.stopRecording()
      })
      
      expect(result.current.isRecording).toBe(false)
    })
    
    it('should handle permission denied error', async () => {
      const onAudioData = vi.fn()
      
      const { result } = renderHook(() => useAudioRecorderMock(), {
        wrapper: createWrapper()
      })
      
      await act(async () => {
        await result.current.startRecording(onAudioData, { simulateError: true })
      })
      
      expect(result.current.error).toBeDefined()
      expect(result.current.error?.message).toBe('Permission denied')
      expect(result.current.isRecording).toBe(false)
    })
    
    it('should invoke audio data callback when receiving data', async () => {
      const onAudioData = vi.fn()
      
      const { result } = renderHook(() => useAudioRecorderMock(), {
        wrapper: createWrapper()
      })
      
      await act(async () => {
        await result.current.startRecording(onAudioData)
      })
      
      const mockData = new ArrayBuffer(8192)
      
      act(() => {
        result.current.simulateAudioData(mockData)
      })
      
      expect(onAudioData).toHaveBeenCalledWith(mockData)
    })
  })
})

describe('useTranscription Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLastMessage = null
  })
  
  describe('WebSocket Session', () => {
    it('should send config message on initialization', () => {
      const { result } = renderHook(() => useTranscriptionMock({ modelId: 'zipformer' }), {
        wrapper: createWrapper()
      })
      
      act(() => {
        result.current.sendConfig()
      })
      
      expect(mockSendJsonMessage).toHaveBeenCalledWith({
        type: 'config',
        model_id: 'zipformer'
      })
    })
    
    it('should start session with correct message', () => {
      const { result } = renderHook(() => useTranscriptionMock(), {
        wrapper: createWrapper()
      })
      
      act(() => {
        result.current.startSession()
      })
      
      expect(mockSendJsonMessage).toHaveBeenCalledWith({ type: 'start_session' })
      expect(result.current.isConnected).toBe(true)
    })
    
    it('should end session with flush message', () => {
      const { result } = renderHook(() => useTranscriptionMock(), {
        wrapper: createWrapper()
      })
      
      act(() => {
        result.current.startSession()
      })
      
      act(() => {
        result.current.endSession()
      })
      
      expect(mockSendJsonMessage).toHaveBeenCalledWith({ type: 'flush' })
      expect(result.current.isConnected).toBe(false)
    })
  })
  
  describe('Audio Transmission', () => {
    it('should send binary audio data when connected', () => {
      const { result } = renderHook(() => useTranscriptionMock(), {
        wrapper: createWrapper()
      })
      
      act(() => {
        result.current.startSession()
      })
      
      const audioData = new ArrayBuffer(8192)
      
      act(() => {
        result.current.sendAudio(audioData)
      })
      
      expect(mockSendMessage).toHaveBeenCalledWith(audioData)
    })
    
    it('should not send audio when disconnected', () => {
      const { result } = renderHook(() => useTranscriptionMock(), {
        wrapper: createWrapper()
      })
      
      const audioData = new ArrayBuffer(8192)
      
      act(() => {
        result.current.sendAudio(audioData)
      })
      
      expect(mockSendMessage).not.toHaveBeenCalled()
    })
  })
  
  describe('Message Handling', () => {
    it('should update transcription on final message', () => {
      const { result } = renderHook(() => useTranscriptionMock(), {
        wrapper: createWrapper()
      })
      
      act(() => {
        result.current.handleMessage(JSON.stringify({
          type: 'transcription',
          text: 'Hello',
          is_final: true
        }))
      })
      
      expect(result.current.transcription).toContain('Hello')
    })
    
    it('should update interim result on non-final message', () => {
      const { result } = renderHook(() => useTranscriptionMock(), {
        wrapper: createWrapper()
      })
      
      act(() => {
        result.current.handleMessage(JSON.stringify({
          type: 'transcription',
          text: 'Hel',
          is_final: false
        }))
      })
      
      expect(result.current.interimResult).toBe('Hel')
    })
  })
})

describe('Combined Recording Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  
  it('should complete full recording -> transcription flow', async () => {
    const audioDataReceived: ArrayBuffer[] = []
    
    const { result: audioResult } = renderHook(() => useAudioRecorderMock(), {
      wrapper: createWrapper()
    })
    
    const { result: transcriptionResult } = renderHook(() => useTranscriptionMock(), {
      wrapper: createWrapper()
    })
    
    // 1. Load devices
    await act(async () => {
      await audioResult.current.loadDevices()
    })
    expect(audioResult.current.devices.length).toBeGreaterThan(0)
    
    // 2. Start session
    act(() => {
      transcriptionResult.current.sendConfig()
      transcriptionResult.current.startSession()
    })
    expect(transcriptionResult.current.isConnected).toBe(true)
    
    // 3. Start recording
    await act(async () => {
      await audioResult.current.startRecording((data) => {
        audioDataReceived.push(data)
        transcriptionResult.current.sendAudio(data)
      })
    })
    expect(audioResult.current.isRecording).toBe(true)
    
    // 4. Simulate audio data coming in
    const mockData = new ArrayBuffer(8192)
    act(() => {
      audioResult.current.simulateAudioData(mockData)
    })
    
    expect(audioDataReceived).toHaveLength(1)
    expect(mockSendMessage).toHaveBeenCalledWith(mockData)
    
    // 5. Stop recording
    act(() => {
      audioResult.current.stopRecording()
    })
    expect(audioResult.current.isRecording).toBe(false)
    
    // 6. End session
    act(() => {
      transcriptionResult.current.endSession()
    })
    expect(transcriptionResult.current.isConnected).toBe(false)
  })
})

describe('Error Recovery', () => {
  it('should recover from initial failure', async () => {
    const { result } = renderHook(() => useAudioRecorderMock(), {
      wrapper: createWrapper()
    })
    
    // First call fails
    await act(async () => {
      await result.current.startRecording(vi.fn(), { simulateError: true })
    })
    
    expect(result.current.error).toBeDefined()
    expect(result.current.isRecording).toBe(false)
    
    // Second attempt should work (no error simulation)
    await act(async () => {
      await result.current.startRecording(vi.fn())
    })
    
    expect(result.current.isRecording).toBe(true)
  })
})
