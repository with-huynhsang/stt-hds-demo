/**
 * Audio Chunking & Format Conversion Tests
 * 
 * Tests for:
 * - Float32 to Int16 PCM conversion (matching pcm-processor.js)
 * - Audio buffer chunking logic
 * - Downsampling simulation
 * - Binary data handling for WebSocket transmission
 */

import { describe, it, expect } from 'vitest'

// ==========================================
// PCM Processor Logic (matching pcm-processor.js)
// ==========================================

/**
 * Convert Float32 audio samples to Int16 PCM format
 * This is the same algorithm used in pcm-processor.js
 * 
 * @param float32Array - Input audio data (-1.0 to 1.0)
 * @returns Int16Array - PCM data (-32768 to 32767)
 */
function float32ToInt16(float32Array: Float32Array): Int16Array {
  const int16Array = new Int16Array(float32Array.length)
  
  for (let i = 0; i < float32Array.length; i++) {
    // Clamp value to [-1, 1] range
    const s = Math.max(-1, Math.min(1, float32Array[i]))
    // Convert to Int16 range
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
  }
  
  return int16Array
}

/**
 * Convert Int16 PCM back to Float32 (for testing/verification)
 */
function int16ToFloat32(int16Array: Int16Array): Float32Array {
  const float32Array = new Float32Array(int16Array.length)
  
  for (let i = 0; i < int16Array.length; i++) {
    const sample = int16Array[i]
    float32Array[i] = sample < 0 ? sample / 0x8000 : sample / 0x7FFF
  }
  
  return float32Array
}

/**
 * Simulate the PCM Processor buffer logic
 */
class PCMProcessorSimulator {
  private bufferSize: number
  private buffer: Float32Array
  private bytesWritten = 0
  private onFlush: (data: ArrayBuffer) => void
  
  constructor(bufferSize = 4096, onFlush: (data: ArrayBuffer) => void) {
    this.bufferSize = bufferSize
    this.buffer = new Float32Array(bufferSize)
    this.onFlush = onFlush
  }
  
  process(channelData: Float32Array): void {
    for (let i = 0; i < channelData.length; i++) {
      this.buffer[this.bytesWritten++] = channelData[i]
      
      if (this.bytesWritten >= this.bufferSize) {
        this.flush()
      }
    }
  }
  
  flush(): void {
    if (this.bytesWritten === 0) return
    
    const int16Data = new Int16Array(this.bytesWritten)
    for (let i = 0; i < this.bytesWritten; i++) {
      const s = Math.max(-1, Math.min(1, this.buffer[i]))
      int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
    }
    
    this.onFlush(int16Data.buffer)
    this.bytesWritten = 0
  }
  
  getBufferedSamples(): number {
    return this.bytesWritten
  }
}

// ==========================================
// Test Suites
// ==========================================

describe('Audio Format Conversion', () => {
  describe('Float32 to Int16 Conversion', () => {
    it('should convert silence (0.0) correctly', () => {
      const input = new Float32Array([0, 0, 0, 0])
      const output = float32ToInt16(input)
      
      expect(output).toBeInstanceOf(Int16Array)
      expect(output.length).toBe(4)
      expect(Array.from(output)).toEqual([0, 0, 0, 0])
    })
    
    it('should convert maximum positive value (1.0) correctly', () => {
      const input = new Float32Array([1.0])
      const output = float32ToInt16(input)
      
      expect(output[0]).toBe(32767) // 0x7FFF
    })
    
    it('should convert maximum negative value (-1.0) correctly', () => {
      const input = new Float32Array([-1.0])
      const output = float32ToInt16(input)
      
      expect(output[0]).toBe(-32768) // -0x8000
    })
    
    it('should clamp values outside [-1, 1] range', () => {
      const input = new Float32Array([1.5, -1.5, 2.0, -2.0])
      const output = float32ToInt16(input)
      
      expect(output[0]).toBe(32767)  // Clamped to max
      expect(output[1]).toBe(-32768) // Clamped to min
      expect(output[2]).toBe(32767)
      expect(output[3]).toBe(-32768)
    })
    
    it('should handle mid-range values correctly', () => {
      const input = new Float32Array([0.5, -0.5, 0.25, -0.25])
      const output = float32ToInt16(input)
      
      // 0.5 * 32767 ≈ 16383
      expect(output[0]).toBeCloseTo(16383, -1)
      // -0.5 * 32768 = -16384
      expect(output[1]).toBeCloseTo(-16384, -1)
    })
    
    it('should preserve array length', () => {
      const sizes = [128, 256, 512, 1024, 4096]
      
      for (const size of sizes) {
        const input = new Float32Array(size)
        const output = float32ToInt16(input)
        expect(output.length).toBe(size)
      }
    })
    
    it('should handle typical audio waveform (sine wave)', () => {
      const sampleRate = 16000
      const frequency = 440 // A4 note
      const duration = 0.01 // 10ms
      const numSamples = Math.floor(sampleRate * duration)
      
      const input = new Float32Array(numSamples)
      for (let i = 0; i < numSamples; i++) {
        input[i] = Math.sin(2 * Math.PI * frequency * (i / sampleRate))
      }
      
      const output = float32ToInt16(input)
      
      // All values should be within Int16 range
      for (let i = 0; i < output.length; i++) {
        expect(output[i]).toBeGreaterThanOrEqual(-32768)
        expect(output[i]).toBeLessThanOrEqual(32767)
      }
    })
  })
  
  describe('Int16 to Float32 Conversion (Reverse)', () => {
    it('should be approximately reversible', () => {
      const original = new Float32Array([0.5, -0.5, 0.25, -0.25, 1.0, -1.0])
      const int16 = float32ToInt16(original)
      const restored = int16ToFloat32(int16)
      
      // Should be within 0.1% tolerance (quantization error)
      for (let i = 0; i < original.length; i++) {
        expect(restored[i]).toBeCloseTo(original[i], 3)
      }
    })
  })
  
  describe('Binary Data Size', () => {
    it('should produce correct byte size (Int16 = 2 bytes per sample)', () => {
      const numSamples = 1000
      const input = new Float32Array(numSamples)
      const output = float32ToInt16(input)
      
      // ArrayBuffer should be numSamples * 2 bytes
      expect(output.buffer.byteLength).toBe(numSamples * 2)
    })
    
    it('should reduce size by 50% compared to Float32', () => {
      const numSamples = 4096
      const float32 = new Float32Array(numSamples)
      const int16 = float32ToInt16(float32)
      
      const float32Size = float32.buffer.byteLength // 4 bytes per sample
      const int16Size = int16.buffer.byteLength     // 2 bytes per sample
      
      expect(int16Size).toBe(float32Size / 2)
    })
  })
})

describe('Audio Chunking (PCM Processor)', () => {
  describe('Buffer Management', () => {
    it('should accumulate samples until buffer is full', () => {
      const bufferSize = 4096
      const flushedChunks: ArrayBuffer[] = []
      
      const processor = new PCMProcessorSimulator(bufferSize, (data) => {
        flushedChunks.push(data)
      })
      
      // Send less than buffer size
      const smallChunk = new Float32Array(128) // AudioWorklet typical frame size
      processor.process(smallChunk)
      
      expect(flushedChunks.length).toBe(0) // No flush yet
      expect(processor.getBufferedSamples()).toBe(128)
    })
    
    it('should flush when buffer is full', () => {
      const bufferSize = 256
      const flushedChunks: ArrayBuffer[] = []
      
      const processor = new PCMProcessorSimulator(bufferSize, (data) => {
        flushedChunks.push(data)
      })
      
      // Send exactly buffer size
      const chunk = new Float32Array(256)
      processor.process(chunk)
      
      expect(flushedChunks.length).toBe(1)
      expect(processor.getBufferedSamples()).toBe(0)
    })
    
    it('should handle multiple flushes from large input', () => {
      const bufferSize = 128
      const flushedChunks: ArrayBuffer[] = []
      
      const processor = new PCMProcessorSimulator(bufferSize, (data) => {
        flushedChunks.push(data)
      })
      
      // Send 5x buffer size
      const largeChunk = new Float32Array(640)
      processor.process(largeChunk)
      
      expect(flushedChunks.length).toBe(5)
      expect(processor.getBufferedSamples()).toBe(0)
    })
    
    it('should handle partial buffer with remainder', () => {
      const bufferSize = 128
      const flushedChunks: ArrayBuffer[] = []
      
      const processor = new PCMProcessorSimulator(bufferSize, (data) => {
        flushedChunks.push(data)
      })
      
      // Send 1.5x buffer size (128 + 64)
      const chunk = new Float32Array(192)
      processor.process(chunk)
      
      expect(flushedChunks.length).toBe(1)
      expect(processor.getBufferedSamples()).toBe(64) // Remaining in buffer
    })
    
    it('should accumulate across multiple process calls', () => {
      const bufferSize = 256
      const flushedChunks: ArrayBuffer[] = []
      
      const processor = new PCMProcessorSimulator(bufferSize, (data) => {
        flushedChunks.push(data)
      })
      
      // Simulate multiple AudioWorklet frames
      for (let i = 0; i < 10; i++) {
        processor.process(new Float32Array(128))
      }
      
      // 10 * 128 = 1280 samples → 5 flushes of 256
      expect(flushedChunks.length).toBe(5)
      expect(processor.getBufferedSamples()).toBe(0)
    })
  })
  
  describe('Flushed Data Format', () => {
    it('should output ArrayBuffer with Int16 data', () => {
      const bufferSize = 64
      const flushedChunks: ArrayBuffer[] = []
      
      const processor = new PCMProcessorSimulator(bufferSize, (data) => {
        flushedChunks.push(data)
      })
      
      const input = new Float32Array(64)
      input.fill(0.5)
      processor.process(input)
      
      expect(flushedChunks.length).toBe(1)
      
      const outputBuffer = flushedChunks[0]
      expect(outputBuffer).toBeInstanceOf(ArrayBuffer)
      expect(outputBuffer.byteLength).toBe(64 * 2) // Int16 = 2 bytes
      
      // Verify data
      const int16View = new Int16Array(outputBuffer)
      expect(int16View[0]).toBeCloseTo(16383, -1) // 0.5 * 32767
    })
  })
  
  describe('Chunk Timing (at 16kHz)', () => {
    it('should calculate correct chunk duration', () => {
      const sampleRate = 16000
      const bufferSize = 4096
      
      // Duration = samples / sampleRate
      const durationMs = (bufferSize / sampleRate) * 1000
      
      expect(durationMs).toBe(256) // 256ms per chunk
    })
    
    it('should emit chunks at expected intervals', () => {
      const sampleRate = 16000
      const bufferSize = 4096
      const simulatedDuration = 1000 // 1 second
      const totalSamples = sampleRate * (simulatedDuration / 1000)
      
      let flushCount = 0
      const processor = new PCMProcessorSimulator(bufferSize, () => {
        flushCount++
      })
      
      // Simulate 1 second of audio in 128-sample frames
      const frameSize = 128
      const numFrames = totalSamples / frameSize
      
      for (let i = 0; i < numFrames; i++) {
        processor.process(new Float32Array(frameSize))
      }
      
      // 16000 samples / 4096 buffer = ~3.9 flushes
      expect(flushCount).toBe(Math.floor(totalSamples / bufferSize))
    })
  })
})

describe('Downsampling Simulation', () => {
  /**
   * Simple decimation downsampling (for testing purposes)
   * Real implementation uses linear interpolation
   */
  function downsample(
    input: Float32Array, 
    inputRate: number, 
    outputRate: number
  ): Float32Array {
    const ratio = inputRate / outputRate
    const outputLength = Math.floor(input.length / ratio)
    const output = new Float32Array(outputLength)
    
    for (let i = 0; i < outputLength; i++) {
      const srcIndex = Math.floor(i * ratio)
      output[i] = input[srcIndex]
    }
    
    return output
  }
  
  it('should downsample from 48kHz to 16kHz (3:1)', () => {
    const inputRate = 48000
    const outputRate = 16000
    const durationSec = 0.1 // 100ms
    
    const inputSamples = inputRate * durationSec // 4800 samples
    const input = new Float32Array(inputSamples)
    
    // Generate sine wave
    for (let i = 0; i < inputSamples; i++) {
      input[i] = Math.sin(2 * Math.PI * 440 * (i / inputRate))
    }
    
    const output = downsample(input, inputRate, outputRate)
    
    // 4800 / 3 = 1600 samples
    expect(output.length).toBe(1600)
  })
  
  it('should downsample from 44.1kHz to 16kHz', () => {
    const inputRate = 44100
    const outputRate = 16000
    const durationSec = 0.1
    
    const inputSamples = Math.floor(inputRate * durationSec) // 4410
    const input = new Float32Array(inputSamples)
    
    const output = downsample(input, inputRate, outputRate)
    
    // 4410 / 2.75625 ≈ 1600
    expect(output.length).toBe(Math.floor(inputSamples / (inputRate / outputRate)))
  })
  
  it('should preserve amplitude after downsampling', () => {
    const input = new Float32Array([1.0, 0.5, 0.0, -0.5, -1.0, -0.5, 0.0, 0.5])
    const output = downsample(input, 48000, 16000)
    
    // All values should still be in [-1, 1] range
    for (let i = 0; i < output.length; i++) {
      expect(output[i]).toBeGreaterThanOrEqual(-1)
      expect(output[i]).toBeLessThanOrEqual(1)
    }
  })
})

describe('Binary Data Message (WebSocket)', () => {
  it('should create valid ArrayBuffer for WebSocket transmission', () => {
    const audioSamples = new Float32Array(1024)
    audioSamples.fill(0.3)
    
    const pcmData = float32ToInt16(audioSamples)
    const buffer = pcmData.buffer
    
    // Should be transferable via WebSocket
    expect(buffer).toBeInstanceOf(ArrayBuffer)
    expect(buffer.byteLength).toBe(2048) // 1024 * 2
  })
  
  it('should maintain data integrity through ArrayBuffer transfer', () => {
    const original = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5])
    const int16 = float32ToInt16(original)
    
    // Simulate transfer (create new view from same buffer)
    const transferred = new Int16Array(int16.buffer.slice(0))
    
    expect(transferred.length).toBe(int16.length)
    for (let i = 0; i < transferred.length; i++) {
      expect(transferred[i]).toBe(int16[i])
    }
  })
  
  it('should handle empty audio data', () => {
    const empty = new Float32Array(0)
    const output = float32ToInt16(empty)
    
    expect(output.length).toBe(0)
    expect(output.buffer.byteLength).toBe(0)
  })
  
  it('should calculate correct bandwidth usage', () => {
    const sampleRate = 16000
    const bitsPerSample = 16
    
    // Bandwidth = sampleRate * bitsPerSample (mono)
    const bitsPerSecond = sampleRate * bitsPerSample
    const kilobitsPerSecond = bitsPerSecond / 1000
    const kiloBytesPerSecond = kilobitsPerSecond / 8
    
    expect(kilobitsPerSecond).toBe(256) // 256 kbps
    expect(kiloBytesPerSecond).toBe(32) // 32 KB/s
  })
})
