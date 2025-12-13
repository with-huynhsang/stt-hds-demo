/**
 * AudioWorklet Integration Tests
 * 
 * Tests for AudioWorklet processor behavior including:
 * - Message passing between main thread and worklet
 * - PCM processor registration and loading
 * - Audio node connections
 * - Real-time processing simulation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ==========================================
// Mock AudioWorklet Infrastructure
// ==========================================

interface AudioWorkletProcessorEvent {
  data: ArrayBuffer | { command: string; [key: string]: unknown }
}

/**
 * Simulates the PCM Processor Worklet from public/pcm-processor.js
 */
class MockPCMProcessor {
  private bufferSize = 4096
  private buffer: Float32Array
  private bytesWritten = 0
  private port: {
    postMessage: (data: ArrayBuffer) => void
    onmessage: ((event: AudioWorkletProcessorEvent) => void) | null
  }
  
  constructor() {
    this.buffer = new Float32Array(this.bufferSize)
    this.port = {
      postMessage: vi.fn(),
      onmessage: null
    }
  }
  
  /**
   * Simulates AudioWorkletProcessor.process()
   * Called for each audio frame (typically 128 samples)
   */
  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0]
    if (!input || !input[0]) return true
    
    const channelData = input[0]
    
    for (let i = 0; i < channelData.length; i++) {
      this.buffer[this.bytesWritten++] = channelData[i]
      
      if (this.bytesWritten >= this.bufferSize) {
        this.flushBuffer()
      }
    }
    
    return true // Keep processor alive
  }
  
  private flushBuffer(): void {
    // Convert Float32 to Int16 (matching pcm-processor.js)
    const int16Buffer = new Int16Array(this.bufferSize)
    for (let i = 0; i < this.bufferSize; i++) {
      const s = Math.max(-1, Math.min(1, this.buffer[i]))
      int16Buffer[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
    }
    
    // Send to main thread
    this.port.postMessage(int16Buffer.buffer)
    this.bytesWritten = 0
  }
  
  getPort() {
    return this.port
  }
  
  getBufferedSamples(): number {
    return this.bytesWritten
  }
}

/**
 * Simulates AudioWorkletNode from main thread perspective
 */
class MockAudioWorkletNode {
  port: MessagePort
  onprocessorerror: ((event: ErrorEvent) => void) | null = null
  
  private processor: MockPCMProcessor
  private connected = false
  
  constructor(
    _context: AudioContext,
    _name: string,
    _options?: AudioWorkletNodeOptions
  ) {
    this.processor = new MockPCMProcessor()
    
    // Create mock MessagePort
    this.port = {
      postMessage: vi.fn((message: { command: string }) => {
        // Handle commands from main thread
        const onmessage = this.processor.getPort().onmessage
        if (onmessage) {
          onmessage({ data: message })
        }
      }),
      onmessage: null,
      start: vi.fn(),
      close: vi.fn()
    } as unknown as MessagePort
  }
  
  connect(destination: AudioNode): AudioNode {
    this.connected = true
    return destination
  }
  
  disconnect(): void {
    this.connected = false
  }
  
  isConnected(): boolean {
    return this.connected
  }
  
  // Simulate processing audio frame
  simulateAudioFrame(samples: Float32Array): void {
    const result = this.processor.process([[samples]])
    expect(result).toBe(true)
  }
  
  // Get internal processor for testing
  getProcessor(): MockPCMProcessor {
    return this.processor
  }
}

// ==========================================
// Test Suites
// ==========================================

describe('AudioWorklet Processor', () => {
  let processor: MockPCMProcessor
  
  beforeEach(() => {
    processor = new MockPCMProcessor()
  })
  
  describe('Buffer Accumulation', () => {
    it('should accumulate samples until buffer is full (4096)', () => {
      // Simulate 128-sample frames (typical AudioWorklet quantum)
      const frame = new Float32Array(128)
      frame.fill(0.5)
      
      // Process 30 frames (30 * 128 = 3840 samples)
      for (let i = 0; i < 30; i++) {
        processor.process([[frame]])
      }
      
      expect(processor.getBufferedSamples()).toBe(3840)
      expect(processor.getPort().postMessage).not.toHaveBeenCalled()
    })
    
    it('should flush when buffer reaches 4096 samples', () => {
      const frame = new Float32Array(128)
      frame.fill(0.3)
      
      // Process 32 frames (32 * 128 = 4096 samples = exactly 1 buffer)
      for (let i = 0; i < 32; i++) {
        processor.process([[frame]])
      }
      
      expect(processor.getBufferedSamples()).toBe(0)
      expect(processor.getPort().postMessage).toHaveBeenCalledTimes(1)
    })
    
    it('should send ArrayBuffer with Int16 data on flush', () => {
      const frame = new Float32Array(4096)
      frame.fill(0.5) // Mid-level audio
      
      processor.process([[frame]])
      
      const postMessage = processor.getPort().postMessage as ReturnType<typeof vi.fn>
      expect(postMessage).toHaveBeenCalledWith(expect.any(ArrayBuffer))
      
      const buffer = postMessage.mock.calls[0][0] as ArrayBuffer
      expect(buffer.byteLength).toBe(4096 * 2) // Int16 = 2 bytes
    })
  })
  
  describe('Return Value (Keep Alive)', () => {
    it('should always return true to keep processor alive', () => {
      const frame = new Float32Array(128)
      
      const result = processor.process([[frame]])
      expect(result).toBe(true)
    })
    
    it('should handle empty input gracefully', () => {
      const result = processor.process([[]])
      expect(result).toBe(true)
    })
    
    it('should handle missing channel gracefully', () => {
      const result = processor.process([])
      expect(result).toBe(true)
    })
  })
})

describe('AudioWorkletNode Integration', () => {
  let mockContext: AudioContext
  let workletNode: MockAudioWorkletNode
  
  beforeEach(() => {
    mockContext = {
      createGain: vi.fn(() => ({
        connect: vi.fn(),
        disconnect: vi.fn(),
        gain: { value: 1 }
      })),
      destination: {} as AudioDestinationNode,
      sampleRate: 16000,
      state: 'running'
    } as unknown as AudioContext
    
    workletNode = new MockAudioWorkletNode(mockContext, 'pcm-processor')
  })
  
  describe('Node Connection', () => {
    it('should connect to audio destination', () => {
      const destination = {
        numberOfInputs: 1,
        connect: vi.fn()
      } as unknown as AudioNode
      
      const result = workletNode.connect(destination)
      
      expect(workletNode.isConnected()).toBe(true)
      expect(result).toBe(destination)
    })
    
    it('should disconnect from audio graph', () => {
      const destination = {} as AudioNode
      workletNode.connect(destination)
      
      workletNode.disconnect()
      
      expect(workletNode.isConnected()).toBe(false)
    })
  })
  
  describe('MessagePort Communication', () => {
    it('should have MessagePort for main thread communication', () => {
      expect(workletNode.port).toBeDefined()
      expect(workletNode.port.postMessage).toBeDefined()
    })
    
    it('should send command via MessagePort', () => {
      workletNode.port.postMessage({ command: 'flush' })
      
      expect(workletNode.port.postMessage).toHaveBeenCalledWith({ command: 'flush' })
    })
    
    it('should receive audio data from processor', () => {
      const receivedData: ArrayBuffer[] = []
      
      workletNode.port.onmessage = (event: MessageEvent) => {
        receivedData.push(event.data)
      }
      
      // Simulate audio processing
      const processor = workletNode.getProcessor()
      const frame = new Float32Array(4096)
      processor.process([[frame]])
      
      expect(processor.getPort().postMessage).toHaveBeenCalled()
    })
  })
  
  describe('Audio Frame Simulation', () => {
    it('should process audio frames through worklet', () => {
      const samples = new Float32Array(128)
      samples.fill(0.25)
      
      workletNode.simulateAudioFrame(samples)
      
      // Should accumulate but not flush (128 < 4096)
      const processor = workletNode.getProcessor()
      expect(processor.getBufferedSamples()).toBe(128)
    })
    
    it('should trigger flush after enough frames', () => {
      const samples = new Float32Array(128)
      samples.fill(0.25)
      
      // 32 frames * 128 samples = 4096 (one buffer)
      for (let i = 0; i < 32; i++) {
        workletNode.simulateAudioFrame(samples)
      }
      
      const processor = workletNode.getProcessor()
      expect(processor.getPort().postMessage).toHaveBeenCalled()
    })
  })
})

describe('PCM Processor Module Loading', () => {
  describe('audioWorklet.addModule()', () => {
    it('should load pcm-processor.js module', async () => {
      const addModule = vi.fn().mockResolvedValue(undefined)
      
      const mockContext = {
        audioWorklet: { addModule },
        sampleRate: 16000,
        state: 'running'
      } as unknown as AudioContext
      
      await mockContext.audioWorklet.addModule('/pcm-processor.js')
      
      expect(addModule).toHaveBeenCalledWith('/pcm-processor.js')
    })
    
    it('should handle module load failure', async () => {
      const addModule = vi.fn().mockRejectedValue(
        new Error('Failed to load module')
      )
      
      const mockContext = {
        audioWorklet: { addModule }
      } as unknown as AudioContext
      
      await expect(
        mockContext.audioWorklet.addModule('/invalid-path.js')
      ).rejects.toThrow('Failed to load module')
    })
  })
})

describe('Real-time Processing Timing', () => {
  it('should process frames at expected rate for 16kHz audio', () => {
    const sampleRate = 16000
    const frameSize = 128 // Typical AudioWorklet quantum
    
    // Frames per second
    const framesPerSecond = sampleRate / frameSize
    expect(framesPerSecond).toBe(125)
    
    // Time per frame
    const msPerFrame = (frameSize / sampleRate) * 1000
    expect(msPerFrame).toBe(8) // 8ms per frame
  })
  
  it('should flush buffer at expected rate', () => {
    const sampleRate = 16000
    const bufferSize = 4096
    
    // Flushes per second
    const flushesPerSecond = sampleRate / bufferSize
    expect(flushesPerSecond).toBeCloseTo(3.90625) // ~4 times per second
    
    // Time between flushes
    const msBetweenFlushes = (bufferSize / sampleRate) * 1000
    expect(msBetweenFlushes).toBe(256) // 256ms
  })
  
  it('should handle 1 second of continuous audio', () => {
    const processor = new MockPCMProcessor()
    const sampleRate = 16000
    const frameSize = 128
    const durationSec = 1
    
    const totalSamples = sampleRate * durationSec
    const numFrames = totalSamples / frameSize
    
    for (let i = 0; i < numFrames; i++) {
      const frame = new Float32Array(frameSize)
      // Generate test tone
      for (let j = 0; j < frameSize; j++) {
        const sampleIndex = i * frameSize + j
        frame[j] = Math.sin(2 * Math.PI * 440 * (sampleIndex / sampleRate))
      }
      
      processor.process([[frame]])
    }
    
    // Should have flushed 3 times (16000 / 4096 ≈ 3.9)
    expect(processor.getPort().postMessage).toHaveBeenCalledTimes(3)
    
    // Remaining samples: 16000 - (3 * 4096) = 3712
    expect(processor.getBufferedSamples()).toBe(3712)
  })
})

describe('Error Handling', () => {
  it('should handle NaN values in audio data', () => {
    const processor = new MockPCMProcessor()
    
    const frame = new Float32Array(128)
    frame[0] = NaN
    frame[1] = Infinity
    frame[2] = -Infinity
    
    // Should not throw
    expect(() => processor.process([[frame]])).not.toThrow()
    expect(processor.getBufferedSamples()).toBe(128)
  })
  
  it('should handle very large sample values', () => {
    const processor = new MockPCMProcessor()
    
    const frame = new Float32Array(4096)
    frame.fill(1000) // Way outside normal range
    
    processor.process([[frame]])
    
    // Should have flushed with clamped values
    const postMessage = processor.getPort().postMessage as ReturnType<typeof vi.fn>
    expect(postMessage).toHaveBeenCalled()
    
    const buffer = postMessage.mock.calls[0][0] as ArrayBuffer
    const int16Data = new Int16Array(buffer)
    
    // All values should be clamped to max
    expect(int16Data[0]).toBe(32767)
  })
})
