/**
 * Latency & Performance Tests
 * 
 * Tests for:
 * - WebSocket message latency
 * - Audio processing throughput
 * - End-to-end transcription latency
 * - Performance benchmarks
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ==========================================
// Performance Measurement Utilities
// ==========================================

interface LatencyMeasurement {
  startTime: number
  endTime?: number
  duration?: number
  label: string
}

class LatencyTracker {
  private measurements: Map<string, LatencyMeasurement> = new Map()
  private completed: LatencyMeasurement[] = []
  
  start(label: string): void {
    this.measurements.set(label, {
      startTime: performance.now(),
      label
    })
  }
  
  end(label: string): number {
    const measurement = this.measurements.get(label)
    if (!measurement) {
      throw new Error(`No measurement started for: ${label}`)
    }
    
    measurement.endTime = performance.now()
    measurement.duration = measurement.endTime - measurement.startTime
    this.completed.push(measurement)
    this.measurements.delete(label)
    
    return measurement.duration
  }
  
  getStats(): {
    min: number
    max: number
    avg: number
    p50: number
    p95: number
    p99: number
    count: number
  } {
    const durations = this.completed
      .filter(m => m.duration !== undefined)
      .map(m => m.duration!)
      .sort((a, b) => a - b)
    
    if (durations.length === 0) {
      return { min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0, count: 0 }
    }
    
    const sum = durations.reduce((a, b) => a + b, 0)
    
    return {
      min: durations[0],
      max: durations[durations.length - 1],
      avg: sum / durations.length,
      p50: durations[Math.floor(durations.length * 0.5)],
      p95: durations[Math.floor(durations.length * 0.95)] || durations[durations.length - 1],
      p99: durations[Math.floor(durations.length * 0.99)] || durations[durations.length - 1],
      count: durations.length
    }
  }
  
  reset(): void {
    this.measurements.clear()
    this.completed = []
  }
}

/**
 * Simulates WebSocket message round-trip
 */
class MockWebSocketWithLatency {
  onmessage: ((event: MessageEvent) => void) | null = null
  private latencyMs: number
  private jitterMs: number
  
  constructor(latencyMs = 50, jitterMs = 10) {
    this.latencyMs = latencyMs
    this.jitterMs = jitterMs
  }
  
  send(data: ArrayBuffer | string): void {
    // Simulate network latency + server processing
    const actualLatency = this.latencyMs + (Math.random() - 0.5) * 2 * this.jitterMs
    
    setTimeout(() => {
      if (this.onmessage) {
        const response = typeof data === 'string' 
          ? JSON.stringify({ type: 'ack', echo: data })
          : JSON.stringify({ type: 'transcription', text: 'mock result' })
        
        this.onmessage(new MessageEvent('message', { data: response }))
      }
    }, actualLatency)
  }
  
  setLatency(ms: number): void {
    this.latencyMs = ms
  }
  
  setJitter(ms: number): void {
    this.jitterMs = ms
  }
}

// ==========================================
// Test Suites
// ==========================================

describe('Latency Measurement', () => {
  let tracker: LatencyTracker
  
  beforeEach(() => {
    tracker = new LatencyTracker()
    vi.useFakeTimers()
  })
  
  afterEach(() => {
    vi.useRealTimers()
  })
  
  describe('LatencyTracker', () => {
    it('should measure single operation latency', () => {
      tracker.start('test-op')
      
      vi.advanceTimersByTime(100)
      
      const duration = tracker.end('test-op')
      expect(duration).toBeGreaterThanOrEqual(100)
    })
    
    it('should calculate statistics correctly', () => {
      // Simulate 10 measurements with known values
      for (let i = 1; i <= 10; i++) {
        tracker.start(`op-${i}`)
        vi.advanceTimersByTime(i * 10) // 10, 20, 30, ..., 100ms
        tracker.end(`op-${i}`)
      }
      
      const stats = tracker.getStats()
      
      expect(stats.count).toBe(10)
      expect(stats.min).toBeGreaterThanOrEqual(10)
      expect(stats.max).toBeGreaterThanOrEqual(100)
    })
    
    it('should track multiple concurrent operations', () => {
      tracker.start('op-a')
      vi.advanceTimersByTime(10)
      
      tracker.start('op-b')
      vi.advanceTimersByTime(20)
      
      const durationA = tracker.end('op-a')
      
      vi.advanceTimersByTime(30)
      const durationB = tracker.end('op-b')
      
      expect(durationA).toBeGreaterThanOrEqual(30) // 10 + 20
      expect(durationB).toBeGreaterThanOrEqual(50) // 20 + 30
    })
    
    it('should throw for unstarted measurement', () => {
      expect(() => tracker.end('unknown')).toThrow('No measurement started for: unknown')
    })
  })
})

describe('WebSocket Message Latency', () => {
  describe('Round-trip Time', () => {
    it('should measure message round-trip time', async () => {
      const ws = new MockWebSocketWithLatency(50, 0) // Fixed 50ms latency
      const tracker = new LatencyTracker()
      
      const promise = new Promise<number>((resolve) => {
        ws.onmessage = () => {
          const duration = tracker.end('rtt')
          resolve(duration)
        }
      })
      
      tracker.start('rtt')
      ws.send('ping')
      
      // Use real timers for setTimeout in mock
      vi.useRealTimers()
      
      const rtt = await promise
      expect(rtt).toBeGreaterThanOrEqual(50)
      expect(rtt).toBeLessThan(100) // Should be close to 50ms
    })
    
    it('should handle network jitter', async () => {
      const ws = new MockWebSocketWithLatency(50, 20) // 50ms ± 20ms
      const measurements: number[] = []
      
      vi.useRealTimers()
      
      for (let i = 0; i < 10; i++) {
        const rtt = await new Promise<number>((resolve) => {
          const start = performance.now()
          
          ws.onmessage = () => {
            resolve(performance.now() - start)
          }
          
          ws.send(`msg-${i}`)
        })
        
        measurements.push(rtt)
      }
      
      // All measurements should be within expected range (30-70ms)
      for (const m of measurements) {
        expect(m).toBeGreaterThanOrEqual(30)
        expect(m).toBeLessThan(100)
      }
      
      // Should have some variance due to jitter
      const min = Math.min(...measurements)
      const max = Math.max(...measurements)
      expect(max - min).toBeGreaterThan(0) // Some variance expected
    })
  })
  
  describe('Binary Message Latency', () => {
    it('should measure audio chunk transmission time', async () => {
      const ws = new MockWebSocketWithLatency(30, 5)
      vi.useRealTimers()
      
      const audioChunk = new Int16Array(4096).buffer // 8KB audio chunk
      
      const rtt = await new Promise<number>((resolve) => {
        const start = performance.now()
        
        ws.onmessage = () => {
          resolve(performance.now() - start)
        }
        
        ws.send(audioChunk)
      })
      
      // Binary message should have similar latency to text
      expect(rtt).toBeGreaterThanOrEqual(25)
      expect(rtt).toBeLessThan(100)
    })
  })
})

describe('Audio Processing Throughput', () => {
  describe('PCM Conversion Speed', () => {
    function float32ToInt16(input: Float32Array): Int16Array {
      const output = new Int16Array(input.length)
      for (let i = 0; i < input.length; i++) {
        const s = Math.max(-1, Math.min(1, input[i]))
        output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
      }
      return output
    }
    
    it('should convert 1 second of audio under 10ms', () => {
      vi.useRealTimers()
      
      const sampleRate = 16000
      const samples = new Float32Array(sampleRate)
      
      // Generate test data
      for (let i = 0; i < sampleRate; i++) {
        samples[i] = Math.sin(2 * Math.PI * 440 * (i / sampleRate))
      }
      
      const start = performance.now()
      const output = float32ToInt16(samples)
      const duration = performance.now() - start
      
      expect(output.length).toBe(sampleRate)
      expect(duration).toBeLessThan(10) // Should be very fast
    })
    
    it('should handle 10 seconds of audio efficiently', () => {
      vi.useRealTimers()
      
      const sampleRate = 16000
      const durationSec = 10
      const samples = new Float32Array(sampleRate * durationSec)
      
      const start = performance.now()
      const output = float32ToInt16(samples)
      const elapsed = performance.now() - start
      
      expect(output.length).toBe(160000)
      expect(elapsed).toBeLessThan(50) // Should still be fast
      
      // Calculate throughput
      const throughputKHz = (sampleRate * durationSec) / elapsed
      expect(throughputKHz).toBeGreaterThan(1000) // > 1MHz throughput
    })
  })
  
  describe('Chunk Processing Rate', () => {
    it('should process chunks faster than real-time', () => {
      vi.useRealTimers()
      
      const chunkSize = 4096
      const numChunks = 100
      const realTimePerChunkMs = (chunkSize / 16000) * 1000 // ~256ms
      
      let totalProcessingTime = 0
      
      for (let i = 0; i < numChunks; i++) {
        const chunk = new Float32Array(chunkSize)
        
        const start = performance.now()
        
        // Simulate processing (conversion + buffering)
        const int16 = new Int16Array(chunkSize)
        for (let j = 0; j < chunkSize; j++) {
          int16[j] = Math.floor(chunk[j] * 32767)
        }
        
        totalProcessingTime += performance.now() - start
      }
      
      const avgProcessingMs = totalProcessingTime / numChunks
      
      // Processing should be MUCH faster than real-time
      expect(avgProcessingMs).toBeLessThan(realTimePerChunkMs / 10)
    })
  })
})

describe('End-to-End Latency Simulation', () => {
  interface TranscriptionResponse {
    text: string
    latencyMs: number
    processingMs: number
  }
  
  /**
   * Simulates full transcription pipeline latency
   */
  async function simulateTranscriptionLatency(
    audioMs: number,
    networkLatencyMs: number,
    serverProcessingMs: number
  ): Promise<TranscriptionResponse> {
    const startTime = performance.now()
    
    // 1. Audio capture delay (buffer fill time)
    await delay(audioMs)
    
    // 2. Network transmission
    await delay(networkLatencyMs)
    
    // 3. Server processing (model inference)
    await delay(serverProcessingMs)
    
    // 4. Response transmission
    await delay(networkLatencyMs)
    
    return {
      text: 'Transcription result',
      latencyMs: performance.now() - startTime,
      processingMs: serverProcessingMs
    }
  }
  
  function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
  
  beforeEach(() => {
    vi.useRealTimers()
  })
  
  it('should meet target latency for real-time transcription', async () => {
    // Realistic values:
    // - Audio buffer: 256ms (4096 samples at 16kHz)
    // - Network RTT: 50ms each way
    // - Server processing: 100ms
    
    const result = await simulateTranscriptionLatency(
      256,  // Audio buffer
      50,   // Network one-way
      100   // Server processing
    )
    
    // Total expected: 256 + 50 + 100 + 50 = 456ms
    expect(result.latencyMs).toBeGreaterThanOrEqual(400)
    expect(result.latencyMs).toBeLessThan(600)
  })
  
  it('should identify latency breakdown', async () => {
    const bufferMs = 256
    const networkMs = 30
    const processingMs = 50
    
    const result = await simulateTranscriptionLatency(
      bufferMs,
      networkMs,
      processingMs
    )
    
    // Minimum possible latency
    const minLatency = bufferMs + (2 * networkMs) + processingMs
    expect(result.latencyMs).toBeGreaterThanOrEqual(minLatency * 0.9)
    
    // Latency breakdown
    const latencyBudget = {
      buffer: bufferMs / result.latencyMs,
      network: (2 * networkMs) / result.latencyMs,
      processing: processingMs / result.latencyMs
    }
    
    // Buffer should be largest contributor
    expect(latencyBudget.buffer).toBeGreaterThan(0.5)
  })
})

describe('Performance Benchmarks', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })
  
  describe('Memory Efficiency', () => {
    it('should not leak memory during chunk processing', () => {
      const initialHeap = process.memoryUsage?.().heapUsed || 0
      
      // Process many chunks
      for (let i = 0; i < 1000; i++) {
        const chunk = new Float32Array(4096)
        const output = new Int16Array(4096)
        
        for (let j = 0; j < chunk.length; j++) {
          output[j] = Math.floor(chunk[j] * 32767)
        }
      }
      
      // Force GC if available
      if (global.gc) {
        global.gc()
      }
      
      const finalHeap = process.memoryUsage?.().heapUsed || 0
      const heapGrowth = finalHeap - initialHeap
      
      // Should not grow significantly (allowing for some overhead)
      // Check using optional chaining since memory API might not be available
      if (typeof process.memoryUsage === 'function') {
        expect(heapGrowth).toBeLessThan(10 * 1024 * 1024) // < 10MB
      }
    })
  })
  
  describe('Real-Time Factor', () => {
    it('should process faster than real-time (RTF < 1.0)', () => {
      const sampleRate = 16000
      const audioDurationSec = 5
      const totalSamples = sampleRate * audioDurationSec
      const chunkSize = 4096
      const numChunks = Math.ceil(totalSamples / chunkSize)
      
      const start = performance.now()
      
      for (let i = 0; i < numChunks; i++) {
        const chunk = new Float32Array(chunkSize)
        // Simulate conversion
        new Int16Array(chunkSize).forEach((_, j) => chunk[j] * 32767)
      }
      
      const processingTime = performance.now() - start
      const realTimeMs = audioDurationSec * 1000
      const rtf = processingTime / realTimeMs
      
      // RTF should be very small (processing much faster than real-time)
      expect(rtf).toBeLessThan(0.01) // Less than 1% of real-time
    })
  })
})

describe('Latency Optimization Verification', () => {
  it('should use appropriate buffer size for latency vs quality tradeoff', () => {
    // Smaller buffer = lower latency but more overhead
    // Larger buffer = higher latency but more efficient
    
    const bufferSizes = [512, 1024, 2048, 4096, 8192]
    const sampleRate = 16000
    
    const latencies = bufferSizes.map(size => ({
      bufferSize: size,
      latencyMs: (size / sampleRate) * 1000,
      chunksPerSecond: sampleRate / size
    }))
    
    // Default 4096 buffer analysis
    const defaultBuffer = latencies.find(l => l.bufferSize === 4096)!
    
    expect(defaultBuffer.latencyMs).toBe(256) // 256ms latency
    expect(defaultBuffer.chunksPerSecond).toBeCloseTo(3.9, 1) // ~4 chunks/sec
    
    // Verify it's a reasonable tradeoff
    // Not too low (too much overhead) or too high (too much latency)
    expect(defaultBuffer.latencyMs).toBeGreaterThanOrEqual(100)
    expect(defaultBuffer.latencyMs).toBeLessThanOrEqual(500)
  })
})
