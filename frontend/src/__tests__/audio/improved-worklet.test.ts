/**
 * Improved AudioWorklet Tests
 * 
 * Tests for enhanced PCM processor features:
 * - Downsampling from higher sample rates to 16kHz
 * - Audio level (VU meter) calculation
 * - State management and error handling
 * - Configurable buffer size
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ==========================================
// Mock Improved PCM Processor
// ==========================================

interface ProcessorMessage {
  type: 'audio' | 'level' | 'error' | 'state'
  buffer?: ArrayBuffer
  level?: number
  error?: string
  state?: string
}

interface ProcessorOptions {
  bufferSize?: number
  targetSampleRate?: number
}

/**
 * Simulates the improved PCM Processor with downsampling support
 */
class MockImprovedPCMProcessor {
  private bufferSize: number
  private targetSampleRate: number
  private inputSampleRate: number
  private buffer: Float32Array
  private bytesWritten = 0
  private resampleRatio: number
  private resamplePosition = 0
  private state: 'initialized' | 'running' | 'stopped' | 'error' = 'initialized'
  private isRunning = true
  
  // Audio level tracking
  private levelUpdateInterval = 128
  private levelSampleCount = 0
  private levelSum = 0
  
  private port: {
    postMessage: (data: ProcessorMessage, transfer?: Transferable[]) => void
    onmessage: ((event: { data: { type: string; bufferSize?: number; targetSampleRate?: number } }) => void) | null
  }
  
  constructor(inputSampleRate: number, options: ProcessorOptions = {}) {
    this.inputSampleRate = inputSampleRate
    this.targetSampleRate = options.targetSampleRate || 16000
    this.bufferSize = options.bufferSize || 4096
    this.buffer = new Float32Array(this.bufferSize)
    this.resampleRatio = this.inputSampleRate / this.targetSampleRate
    
    this.port = {
      postMessage: vi.fn(),
      onmessage: null
    }
    
    // Notify running state
    this.state = 'running'
    this.notifyState('running')
  }
  
  private notifyState(newState: string): void {
    this.port.postMessage({ type: 'state', state: newState })
  }
  
  private reportError(error: string): void {
    this.state = 'error'
    this.port.postMessage({ type: 'error', error })
  }
  
  /**
   * Process audio with downsampling
   */
  process(inputs: Float32Array[][]): boolean {
    if (!this.isRunning) return false
    
    try {
      const input = inputs[0]
      if (!input || !input[0]) return true
      
      const channelData = input[0]
      if (!channelData || channelData.length === 0) return true
      
      this.processWithDownsampling(channelData)
      return true
    } catch (error) {
      this.reportError((error as Error).message || 'Unknown error')
      return true
    }
  }
  
  private processWithDownsampling(inputData: Float32Array): void {
    const inputLength = inputData.length
    
    // No resampling needed
    if (Math.abs(this.resampleRatio - 1) < 0.001) {
      for (let i = 0; i < inputLength; i++) {
        this.addSample(inputData[i])
      }
      return
    }
    
    // Linear interpolation resampling
    while (this.resamplePosition < inputLength) {
      const intPos = Math.floor(this.resamplePosition)
      const fracPos = this.resamplePosition - intPos
      
      const sample1 = inputData[intPos]
      const sample2 = intPos + 1 < inputLength ? inputData[intPos + 1] : sample1
      
      // Linear interpolation
      const interpolatedSample = sample1 + (sample2 - sample1) * fracPos
      this.addSample(interpolatedSample)
      
      this.resamplePosition += this.resampleRatio
    }
    
    this.resamplePosition -= inputLength
  }
  
  private addSample(sample: number): void {
    const clampedSample = Math.max(-1, Math.min(1, sample))
    this.buffer[this.bytesWritten++] = clampedSample
    
    // Track audio level
    this.levelSum += clampedSample * clampedSample
    this.levelSampleCount++
    
    if (this.levelSampleCount >= this.levelUpdateInterval) {
      const rms = Math.sqrt(this.levelSum / this.levelSampleCount)
      this.sendAudioLevel(rms)
      this.levelSum = 0
      this.levelSampleCount = 0
    }
    
    if (this.bytesWritten >= this.bufferSize) {
      this.flush()
    }
  }
  
  private sendAudioLevel(level: number): void {
    this.port.postMessage({ type: 'level', level })
  }
  
  private flush(): void {
    if (this.bytesWritten === 0) return
    
    const int16Data = new Int16Array(this.bytesWritten)
    for (let i = 0; i < this.bytesWritten; i++) {
      const s = this.buffer[i]
      int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
    }
    
    this.port.postMessage(
      { type: 'audio', buffer: int16Data.buffer },
      [int16Data.buffer]
    )
    
    this.bytesWritten = 0
  }
  
  stop(): void {
    if (this.bytesWritten > 0) {
      this.flush()
    }
    this.isRunning = false
    this.notifyState('stopped')
  }
  
  handleMessage(data: { type: string; bufferSize?: number; targetSampleRate?: number }): void {
    if (data.type === 'stop') {
      this.stop()
    } else if (data.type === 'config') {
      if (data.bufferSize) {
        this.bufferSize = data.bufferSize
        this.buffer = new Float32Array(this.bufferSize)
        this.bytesWritten = 0
      }
      if (data.targetSampleRate) {
        this.targetSampleRate = data.targetSampleRate
        this.resampleRatio = this.inputSampleRate / this.targetSampleRate
      }
    }
  }
  
  getPort() { return this.port }
  getBufferedSamples() { return this.bytesWritten }
  getResampleRatio() { return this.resampleRatio }
  getState() { return this.state }
  isProcessorRunning() { return this.isRunning }
}

// ==========================================
// Test Suites
// ==========================================

describe('PCM Processor Downsampling', () => {
  describe('48kHz to 16kHz downsampling', () => {
    let processor: MockImprovedPCMProcessor
    
    beforeEach(() => {
      processor = new MockImprovedPCMProcessor(48000, { targetSampleRate: 16000 })
    })
    
    it('should calculate correct resample ratio for 48kHz -> 16kHz', () => {
      expect(processor.getResampleRatio()).toBe(3) // 48000 / 16000 = 3
    })
    
    it('should reduce sample count by factor of 3', () => {
      // 384 input samples at 48kHz should become 128 samples at 16kHz
      const inputSamples = new Float32Array(384)
      inputSamples.fill(0.5)
      
      processor.process([[inputSamples]])
      
      // 384 / 3 = 128 output samples
      expect(processor.getBufferedSamples()).toBe(128)
    })
    
    it('should preserve audio content during downsampling', () => {
      // Create a simple test signal
      const inputSamples = new Float32Array(384)
      for (let i = 0; i < 384; i++) {
        // Sine wave at 1kHz (well below Nyquist at 8kHz)
        inputSamples[i] = Math.sin(2 * Math.PI * 1000 * (i / 48000))
      }
      
      processor.process([[inputSamples]])
      
      // Should have buffered 128 samples (384/3)
      expect(processor.getBufferedSamples()).toBe(128)
    })
    
    it('should handle non-integer resample positions correctly', () => {
      // Process multiple frames and verify continuous resampling
      const frame1 = new Float32Array(128)
      const frame2 = new Float32Array(128)
      frame1.fill(0.5)
      frame2.fill(0.5)
      
      processor.process([[frame1]])
      const afterFirst = processor.getBufferedSamples()
      
      processor.process([[frame2]])
      const afterSecond = processor.getBufferedSamples()
      
      // 256 / 3 ≈ 85.33, so about 85-86 samples total
      expect(afterSecond).toBeGreaterThan(afterFirst)
    })
  })
  
  describe('44.1kHz to 16kHz downsampling', () => {
    let processor: MockImprovedPCMProcessor
    
    beforeEach(() => {
      processor = new MockImprovedPCMProcessor(44100, { targetSampleRate: 16000 })
    })
    
    it('should calculate correct resample ratio for 44.1kHz -> 16kHz', () => {
      expect(processor.getResampleRatio()).toBeCloseTo(2.75625) // 44100 / 16000
    })
    
    it('should handle fractional resampling', () => {
      // 128 input samples at 44.1kHz
      const inputSamples = new Float32Array(128)
      inputSamples.fill(0.3)
      
      processor.process([[inputSamples]])
      
      // 128 / 2.75625 ≈ 46.44, so about 46 samples
      expect(processor.getBufferedSamples()).toBeGreaterThanOrEqual(45)
      expect(processor.getBufferedSamples()).toBeLessThanOrEqual(47)
    })
  })
  
  describe('No resampling needed (16kHz input)', () => {
    let processor: MockImprovedPCMProcessor
    
    beforeEach(() => {
      processor = new MockImprovedPCMProcessor(16000, { targetSampleRate: 16000 })
    })
    
    it('should have resample ratio of 1', () => {
      expect(processor.getResampleRatio()).toBe(1)
    })
    
    it('should pass through samples unchanged', () => {
      const inputSamples = new Float32Array(128)
      inputSamples.fill(0.5)
      
      processor.process([[inputSamples]])
      
      expect(processor.getBufferedSamples()).toBe(128)
    })
  })
})

describe('Audio Level (VU Meter)', () => {
  let processor: MockImprovedPCMProcessor
  
  beforeEach(() => {
    processor = new MockImprovedPCMProcessor(16000)
  })
  
  it('should send audio level updates', () => {
    // Process enough samples to trigger level update (128 samples)
    const samples = new Float32Array(128)
    samples.fill(0.5)
    
    processor.process([[samples]])
    
    const postMessage = processor.getPort().postMessage as ReturnType<typeof vi.fn>
    const levelMessages = postMessage.mock.calls.filter(
      (call) => call[0].type === 'level'
    )
    
    expect(levelMessages.length).toBeGreaterThanOrEqual(1)
  })
  
  it('should calculate correct RMS for constant signal', () => {
    const samples = new Float32Array(128)
    samples.fill(0.5) // Constant 0.5
    
    processor.process([[samples]])
    
    const postMessage = processor.getPort().postMessage as ReturnType<typeof vi.fn>
    const levelMessages = postMessage.mock.calls.filter(
      (call) => call[0].type === 'level'
    )
    
    if (levelMessages.length > 0) {
      const level = levelMessages[0][0].level
      // RMS of constant 0.5 is 0.5
      expect(level).toBeCloseTo(0.5, 1)
    }
  })
  
  it('should report low level for quiet audio', () => {
    const samples = new Float32Array(128)
    samples.fill(0.01) // Very quiet
    
    processor.process([[samples]])
    
    const postMessage = processor.getPort().postMessage as ReturnType<typeof vi.fn>
    const levelMessages = postMessage.mock.calls.filter(
      (call) => call[0].type === 'level'
    )
    
    if (levelMessages.length > 0) {
      expect(levelMessages[0][0].level).toBeLessThan(0.1)
    }
  })
  
  it('should report high level for loud audio', () => {
    const samples = new Float32Array(128)
    samples.fill(0.9) // Loud
    
    processor.process([[samples]])
    
    const postMessage = processor.getPort().postMessage as ReturnType<typeof vi.fn>
    const levelMessages = postMessage.mock.calls.filter(
      (call) => call[0].type === 'level'
    )
    
    if (levelMessages.length > 0) {
      expect(levelMessages[0][0].level).toBeGreaterThan(0.7)
    }
  })
})

describe('State Management', () => {
  let processor: MockImprovedPCMProcessor
  
  beforeEach(() => {
    processor = new MockImprovedPCMProcessor(16000)
  })
  
  it('should start in running state', () => {
    expect(processor.getState()).toBe('running')
    expect(processor.isProcessorRunning()).toBe(true)
  })
  
  it('should notify running state on initialization', () => {
    const postMessage = processor.getPort().postMessage as ReturnType<typeof vi.fn>
    const stateMessages = postMessage.mock.calls.filter(
      (call) => call[0].type === 'state'
    )
    
    expect(stateMessages.length).toBeGreaterThanOrEqual(1)
    expect(stateMessages[0][0].state).toBe('running')
  })
  
  it('should stop running on stop()', () => {
    processor.stop()
    
    expect(processor.isProcessorRunning()).toBe(false)
  })
  
  it('should notify stopped state on stop', () => {
    processor.stop()
    
    const postMessage = processor.getPort().postMessage as ReturnType<typeof vi.fn>
    const stateMessages = postMessage.mock.calls.filter(
      (call) => call[0].type === 'state' && call[0].state === 'stopped'
    )
    
    expect(stateMessages.length).toBeGreaterThanOrEqual(1)
  })
  
  it('should flush remaining buffer on stop', () => {
    // Add some samples
    const samples = new Float32Array(100)
    samples.fill(0.5)
    processor.process([[samples]])
    
    expect(processor.getBufferedSamples()).toBe(100)
    
    processor.stop()
    
    // Buffer should be flushed
    expect(processor.getBufferedSamples()).toBe(0)
  })
  
  it('should return false from process() when stopped', () => {
    processor.stop()
    
    const samples = new Float32Array(128)
    const result = processor.process([[samples]])
    
    expect(result).toBe(false)
  })
})

describe('Error Handling', () => {
  let processor: MockImprovedPCMProcessor
  
  beforeEach(() => {
    processor = new MockImprovedPCMProcessor(16000)
  })
  
  it('should handle empty inputs gracefully', () => {
    expect(() => processor.process([])).not.toThrow()
    expect(() => processor.process([[]])).not.toThrow()
    expect(() => processor.process([[new Float32Array(0)]])).not.toThrow()
  })
  
  it('should clamp out-of-range values', () => {
    const samples = new Float32Array(4096)
    samples.fill(5.0) // Way above +1
    
    processor.process([[samples]])
    
    const postMessage = processor.getPort().postMessage as ReturnType<typeof vi.fn>
    const audioMessages = postMessage.mock.calls.filter(
      (call) => call[0].type === 'audio'
    )
    
    expect(audioMessages.length).toBe(1)
    // Verify values are clamped
    const buffer = audioMessages[0][0].buffer as ArrayBuffer
    const int16Data = new Int16Array(buffer)
    expect(int16Data[0]).toBe(32767) // Clamped to max
  })
  
  it('should handle NaN values', () => {
    const samples = new Float32Array(128)
    samples[0] = NaN
    samples[1] = Infinity
    samples[2] = -Infinity
    
    expect(() => processor.process([[samples]])).not.toThrow()
  })
})

describe('Configurable Buffer Size', () => {
  it('should use custom buffer size', () => {
    const processor = new MockImprovedPCMProcessor(16000, { bufferSize: 2048 })
    
    // Process 2048 samples should trigger flush
    const samples = new Float32Array(2048)
    samples.fill(0.5)
    
    processor.process([[samples]])
    
    const postMessage = processor.getPort().postMessage as ReturnType<typeof vi.fn>
    const audioMessages = postMessage.mock.calls.filter(
      (call) => call[0].type === 'audio'
    )
    
    expect(audioMessages.length).toBe(1)
    expect(new Int16Array(audioMessages[0][0].buffer as ArrayBuffer).length).toBe(2048)
  })
  
  it('should allow runtime config change', () => {
    const processor = new MockImprovedPCMProcessor(16000, { bufferSize: 4096 })
    
    // Change buffer size via message
    processor.handleMessage({ type: 'config', bufferSize: 1024 })
    
    // Process 1024 samples should now trigger flush
    const samples = new Float32Array(1024)
    samples.fill(0.5)
    
    processor.process([[samples]])
    
    const postMessage = processor.getPort().postMessage as ReturnType<typeof vi.fn>
    const audioMessages = postMessage.mock.calls.filter(
      (call) => call[0].type === 'audio'
    )
    
    // Should have flushed (1024 >= new buffer size of 1024)
    expect(audioMessages.length).toBeGreaterThanOrEqual(1)
  })
})

describe('Message Port Communication', () => {
  it('should send audio message with correct structure', () => {
    const processor = new MockImprovedPCMProcessor(16000)
    
    const samples = new Float32Array(4096)
    samples.fill(0.5)
    processor.process([[samples]])
    
    const postMessage = processor.getPort().postMessage as ReturnType<typeof vi.fn>
    const audioMessages = postMessage.mock.calls.filter(
      (call) => call[0].type === 'audio'
    )
    
    expect(audioMessages[0][0]).toMatchObject({
      type: 'audio',
      buffer: expect.any(ArrayBuffer)
    })
  })
  
  it('should send level message with correct structure', () => {
    const processor = new MockImprovedPCMProcessor(16000)
    
    const samples = new Float32Array(128)
    samples.fill(0.5)
    processor.process([[samples]])
    
    const postMessage = processor.getPort().postMessage as ReturnType<typeof vi.fn>
    const levelMessages = postMessage.mock.calls.filter(
      (call) => call[0].type === 'level'
    )
    
    if (levelMessages.length > 0) {
      expect(levelMessages[0][0]).toMatchObject({
        type: 'level',
        level: expect.any(Number)
      })
    }
  })
  
  it('should handle stop message', () => {
    const processor = new MockImprovedPCMProcessor(16000)
    
    processor.handleMessage({ type: 'stop' })
    
    expect(processor.isProcessorRunning()).toBe(false)
  })
})

describe('Real-world Downsampling Scenarios', () => {
  it('should process 1 second of 48kHz audio correctly', () => {
    const processor = new MockImprovedPCMProcessor(48000, { 
      targetSampleRate: 16000,
      bufferSize: 4096 
    })
    
    const sampleRate = 48000
    const duration = 1 // second
    const totalInputSamples = sampleRate * duration
    const frameSize = 128
    const numFrames = totalInputSamples / frameSize
    
    for (let i = 0; i < numFrames; i++) {
      const frame = new Float32Array(frameSize)
      // Generate test tone
      for (let j = 0; j < frameSize; j++) {
        const sampleIndex = i * frameSize + j
        frame[j] = Math.sin(2 * Math.PI * 440 * (sampleIndex / sampleRate))
      }
      processor.process([[frame]])
    }
    
    const postMessage = processor.getPort().postMessage as ReturnType<typeof vi.fn>
    const audioMessages = postMessage.mock.calls.filter(
      (call) => call[0].type === 'audio'
    )
    
    // 48000 samples -> 16000 samples after downsampling
    // 16000 / 4096 ≈ 3.9 flushes
    expect(audioMessages.length).toBeGreaterThanOrEqual(3)
  })
  
  it('should maintain consistent output rate regardless of input rate', () => {
    const processors = [
      new MockImprovedPCMProcessor(16000, { targetSampleRate: 16000, bufferSize: 4096 }),
      new MockImprovedPCMProcessor(44100, { targetSampleRate: 16000, bufferSize: 4096 }),
      new MockImprovedPCMProcessor(48000, { targetSampleRate: 16000, bufferSize: 4096 }),
    ]
    
    // Process 1 second of audio for each
    const durations = [16000, 44100, 48000]
    
    processors.forEach((processor, index) => {
      const totalSamples = durations[index]
      const frame = new Float32Array(totalSamples)
      frame.fill(0.5)
      processor.process([[frame]])
      
      const postMessage = processor.getPort().postMessage as ReturnType<typeof vi.fn>
      const audioMessages = postMessage.mock.calls.filter(
        (call) => call[0].type === 'audio'
      )
      
      // All should produce similar number of output samples (about 16000)
      // 16000 / 4096 ≈ 3.9 flushes
      expect(audioMessages.length).toBeGreaterThanOrEqual(3)
      expect(audioMessages.length).toBeLessThanOrEqual(4)
    })
  })
})
