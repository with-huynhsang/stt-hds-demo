/**
 * PCMProcessor - AudioWorklet processor for real-time audio capture
 * 
 * Features:
 * - Proper downsampling from any input sample rate to target 16kHz
 * - Configurable buffer size via processorOptions
 * - Audio level (RMS) calculation for VU meter
 * - Error handling with error reporting via MessagePort
 * - State management (started, stopped, error states)
 * 
 * Messages sent to main thread:
 * - { type: 'audio', buffer: ArrayBuffer } - PCM Int16 audio chunk
 * - { type: 'level', level: number } - RMS audio level (0-1)
 * - { type: 'error', error: string } - Error message
 * - { type: 'state', state: string } - State change notification
 * 
 * Messages received from main thread:
 * - { type: 'stop' } - Stop processing and flush remaining buffer
 * - { type: 'config', bufferSize?: number, targetSampleRate?: number }
 */
class PCMProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super()
    
    // Configuration with defaults
    const processorOptions = options?.processorOptions || {}
    
    // Buffer size in samples at target sample rate (default: 4096 = ~256ms at 16kHz)
    this.bufferSize = processorOptions.bufferSize || 4096
    // Target sample rate for output
    this.targetSampleRate = processorOptions.targetSampleRate || 16000
    
    // Pre-allocate buffers
    this.buffer = new Float32Array(this.bufferSize)
    this.bytesWritten = 0
    
    // State management
    this.state = 'initialized' // 'initialized' | 'running' | 'stopped' | 'error'
    this.isRunning = true
    
    // Downsampling state
    this.inputSampleRate = sampleRate // Global from AudioWorklet scope
    this.resampleRatio = this.inputSampleRate / this.targetSampleRate
    this.resamplePosition = 0 // Fractional position in input stream
    
    // Audio level tracking
    // PERFORMANCE: Increased from 128 to 512 (~32ms at 16kHz)
    // Reduces message port communication by 4x while still providing smooth VU meter
    this.levelUpdateInterval = 512 // Update level every N samples (32ms at 16kHz)
    this.levelSampleCount = 0
    this.levelSum = 0
    
    // Listen for messages from main thread
    this.port.onmessage = this.handleMessage.bind(this)
    
    // Notify main thread of initialization
    this.notifyState('running')
    
    // Log config for debugging
    console.log(`[PCMProcessor] Initialized: input=${this.inputSampleRate}Hz, target=${this.targetSampleRate}Hz, ratio=${this.resampleRatio.toFixed(3)}, buffer=${this.bufferSize}`)
  }

  /**
   * Handle messages from main thread
   */
  handleMessage(event) {
    const { type, bufferSize, targetSampleRate } = event.data || {}
    
    switch (type) {
      case 'stop':
        this.stop()
        break
        
      case 'config':
        // Allow runtime configuration changes
        if (bufferSize && bufferSize > 0) {
          this.bufferSize = bufferSize
          this.buffer = new Float32Array(this.bufferSize)
          this.bytesWritten = 0
        }
        if (targetSampleRate && targetSampleRate > 0) {
          this.targetSampleRate = targetSampleRate
          this.resampleRatio = this.inputSampleRate / this.targetSampleRate
        }
        break
        
      default:
        console.warn(`[PCMProcessor] Unknown message type: ${type}`)
    }
  }

  /**
   * Stop processing and flush remaining buffer
   */
  stop() {
    if (this.bytesWritten > 0) {
      this.flush()
    }
    this.isRunning = false
    this.notifyState('stopped')
  }

  /**
   * Notify main thread of state change
   */
  notifyState(newState) {
    this.state = newState
    try {
      this.port.postMessage({ type: 'state', state: newState })
    } catch (e) {
      // Port might be closed
    }
  }

  /**
   * Report error to main thread
   */
  reportError(error) {
    console.error(`[PCMProcessor] Error: ${error}`)
    this.state = 'error'
    try {
      this.port.postMessage({ type: 'error', error: String(error) })
    } catch (e) {
      // Port might be closed
    }
  }

  /**
   * Main process function - called for each audio render quantum (128 samples)
   */
  process(inputs, outputs, parameters) {
    // Return false to stop processor when stopped
    if (!this.isRunning) {
      return false
    }

    try {
      const input = inputs[0]
      if (!input || !input.length) return true

      const channelData = input[0] // Mono channel
      if (!channelData || channelData.length === 0) return true

      // Process audio with downsampling
      this.processWithDownsampling(channelData)

      return true
    } catch (error) {
      this.reportError(error.message || 'Unknown error in process()')
      return true // Continue running despite error
    }
  }

  /**
   * Process audio data with proper downsampling using linear interpolation
   * 
   * For 48kHz -> 16kHz: ratio = 3, so we take every 3rd sample with interpolation
   * For 44.1kHz -> 16kHz: ratio = 2.75625, fractional resampling needed
   */
  processWithDownsampling(inputData) {
    const inputLength = inputData.length
    
    // If no resampling needed (input is already at target rate)
    if (Math.abs(this.resampleRatio - 1) < 0.001) {
      for (let i = 0; i < inputLength; i++) {
        this.addSample(inputData[i])
      }
      return
    }
    
    // Linear interpolation resampling
    // Walk through input at resampleRatio steps
    while (this.resamplePosition < inputLength) {
      const intPos = Math.floor(this.resamplePosition)
      const fracPos = this.resamplePosition - intPos
      
      // Get surrounding samples for interpolation
      const sample1 = inputData[intPos]
      const sample2 = intPos + 1 < inputLength ? inputData[intPos + 1] : sample1
      
      // Linear interpolation
      const interpolatedSample = sample1 + (sample2 - sample1) * fracPos
      
      this.addSample(interpolatedSample)
      
      // Advance position by resample ratio
      this.resamplePosition += this.resampleRatio
    }
    
    // Wrap position for next buffer
    this.resamplePosition -= inputLength
  }

  /**
   * Add a sample to the buffer and track audio level
   */
  addSample(sample) {
    // Clamp sample to valid range
    const clampedSample = Math.max(-1, Math.min(1, sample))
    
    // Add to buffer
    this.buffer[this.bytesWritten++] = clampedSample
    
    // Track audio level (sum of squares for RMS)
    this.levelSum += clampedSample * clampedSample
    this.levelSampleCount++
    
    // Send level update periodically
    if (this.levelSampleCount >= this.levelUpdateInterval) {
      const rms = Math.sqrt(this.levelSum / this.levelSampleCount)
      this.sendAudioLevel(rms)
      this.levelSum = 0
      this.levelSampleCount = 0
    }
    
    // Flush when buffer is full
    if (this.bytesWritten >= this.bufferSize) {
      this.flush()
    }
  }

  /**
   * Send audio level to main thread for VU meter
   */
  sendAudioLevel(level) {
    try {
      this.port.postMessage({ type: 'level', level })
    } catch (e) {
      // Port might be closed
    }
  }

  /**
   * Flush buffer to main thread as Int16 PCM
   */
  flush() {
    if (this.bytesWritten === 0) return
    
    try {
      const int16Data = new Int16Array(this.bytesWritten)
      
      for (let i = 0; i < this.bytesWritten; i++) {
        const s = this.buffer[i] // Already clamped in addSample
        // Convert Float32 [-1, 1] to Int16 [-32768, 32767]
        // Using proper scaling to avoid overflow at +1
        int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
      }

      // Send to main thread with transferable buffer
      this.port.postMessage(
        { type: 'audio', buffer: int16Data.buffer },
        [int16Data.buffer]
      )
      
      // Reset buffer
      this.bytesWritten = 0
    } catch (error) {
      this.reportError(`Flush error: ${error.message}`)
    }
  }
}

registerProcessor('pcm-processor', PCMProcessor)
