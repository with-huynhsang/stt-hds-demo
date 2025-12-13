import { useRef, useEffect, useState, useCallback } from 'react'
import { theme } from 'antd'

export interface AudioWaveformProps {
  /**
   * Whether the waveform is currently active (showing live audio)
   */
  isActive: boolean
  /**
   * Number of bars to display
   * @default 32
   */
  barCount?: number
  /**
   * Width of the visualization container
   * @default '100%'
   */
  width?: string | number
  /**
   * Height of the visualization container
   * @default 64
   */
  height?: number
  /**
   * Gap between bars in pixels
   * @default 2
   */
  gap?: number
  /**
   * Border radius for bars
   * @default 2
   */
  barRadius?: number
  /**
   * MediaStream to analyze (required when active)
   */
  mediaStream?: MediaStream | null
  /**
   * Additional CSS class name
   */
  className?: string
}

/**
 * Audio waveform visualization component using Web Audio AnalyserNode
 * Displays real-time audio levels as animated bars
 * 
 * @example
 * ```tsx
 * <AudioWaveform 
 *   isActive={isRecording} 
 *   mediaStream={stream}
 *   barCount={24}
 *   height={48}
 * />
 * ```
 */
export function AudioWaveform({
  isActive,
  barCount = 32,
  width = '100%',
  height = 64,
  gap = 2,
  barRadius = 2,
  mediaStream,
  className,
}: AudioWaveformProps) {
  const { token } = theme.useToken()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const animationRef = useRef<number>(0)
  const lastDrawTimeRef = useRef<number>(0)
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 0, height })
  
  // PERFORMANCE: Target 30fps instead of 60fps for waveform animation
  // Reduces CPU usage by 50% with minimal visual impact
  const TARGET_FPS = 30
  const FRAME_INTERVAL = 1000 / TARGET_FPS

  // Create or get audio context and analyser
  const setupAnalyser = useCallback(() => {
    if (!mediaStream) return null

    try {
      // Create audio context if not exists
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext()
      }

      const audioContext = audioContextRef.current

      // Create analyser node
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256 // Smaller = less detail but faster
      analyser.smoothingTimeConstant = 0.8 // Smoother animations

      // Create source from media stream
      const source = audioContext.createMediaStreamSource(mediaStream)
      source.connect(analyser)
      // Note: Don't connect analyser to destination (no playback)

      analyserRef.current = analyser
      sourceRef.current = source

      return analyser
    } catch (error) {
      console.error('Failed to setup audio analyser:', error)
      return null
    }
  }, [mediaStream])

  // Cleanup audio nodes
  const cleanupAnalyser = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = 0
    }

    if (sourceRef.current) {
      sourceRef.current.disconnect()
      sourceRef.current = null
    }

    analyserRef.current = null
  }, [])

  // Draw waveform
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const analyser = analyserRef.current
    if (!canvas || !analyser) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)
    analyser.getByteFrequencyData(dataArray)

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Calculate bar dimensions
    const totalGaps = (barCount - 1) * gap
    const barWidth = (canvas.width - totalGaps) / barCount
    const maxBarHeight = canvas.height - 4 // Leave some padding

    // Sample data for bars
    const samplesPerBar = Math.floor(bufferLength / barCount)

    for (let i = 0; i < barCount; i++) {
      // Get average value for this bar
      let sum = 0
      for (let j = 0; j < samplesPerBar; j++) {
        const index = i * samplesPerBar + j
        sum += dataArray[index] || 0
      }
      const average = sum / samplesPerBar

      // Calculate bar height (normalize to 0-1, then scale)
      const normalizedValue = average / 255
      const barHeight = Math.max(4, normalizedValue * maxBarHeight) // Min height of 4px

      // Calculate position
      const x = i * (barWidth + gap)
      const y = (canvas.height - barHeight) / 2

      // Draw bar with gradient
      const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight)
      
      if (normalizedValue > 0.7) {
        // High volume - red to orange
        gradient.addColorStop(0, token.colorError)
        gradient.addColorStop(1, token.colorWarning)
      } else if (normalizedValue > 0.4) {
        // Medium volume - orange to primary
        gradient.addColorStop(0, token.colorWarning)
        gradient.addColorStop(1, token.colorPrimary)
      } else {
        // Low volume - primary color
        gradient.addColorStop(0, token.colorPrimary)
        gradient.addColorStop(1, token.colorPrimaryBg)
      }

      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.roundRect(x, y, barWidth, barHeight, barRadius)
      ctx.fill()
    }

    // Continue animation with throttling
    animationRef.current = requestAnimationFrame(drawWithThrottle)
  }, [barCount, gap, barRadius, token])

  // PERFORMANCE: Throttled draw function to limit to TARGET_FPS
  const drawWithThrottle = useCallback(() => {
    const now = performance.now()
    const elapsed = now - lastDrawTimeRef.current
    
    if (elapsed >= FRAME_INTERVAL) {
      lastDrawTimeRef.current = now - (elapsed % FRAME_INTERVAL)
      draw()
    } else {
      // Schedule next frame check
      animationRef.current = requestAnimationFrame(drawWithThrottle)
    }
  }, [draw, FRAME_INTERVAL])

  // Draw idle state (static small bars)
  const drawIdle = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const totalGaps = (barCount - 1) * gap
    const barWidth = (canvas.width - totalGaps) / barCount
    const idleHeight = 4

    ctx.fillStyle = token.colorBorder

    for (let i = 0; i < barCount; i++) {
      const x = i * (barWidth + gap)
      const y = (canvas.height - idleHeight) / 2

      ctx.beginPath()
      ctx.roundRect(x, y, barWidth, idleHeight, barRadius)
      ctx.fill()
    }
  }, [barCount, gap, barRadius, token])

  // Handle resize
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const container = canvas.parentElement
    if (!container) return

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: containerWidth } = entry.contentRect
        setCanvasDimensions({ width: containerWidth, height })
      }
    })

    resizeObserver.observe(container)
    
    // Initial size
    setCanvasDimensions({ width: container.clientWidth, height })

    return () => resizeObserver.disconnect()
  }, [height])

  // Update canvas size
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    canvas.width = canvasDimensions.width
    canvas.height = canvasDimensions.height
  }, [canvasDimensions])

  // Start/stop visualization
  useEffect(() => {
    if (isActive && mediaStream) {
      const analyser = setupAnalyser()
      if (analyser) {
        // Use throttled draw to reduce CPU usage
        lastDrawTimeRef.current = performance.now()
        drawWithThrottle()
      }
    } else {
      cleanupAnalyser()
      drawIdle()
    }

    return () => {
      cleanupAnalyser()
    }
  }, [isActive, mediaStream, setupAnalyser, cleanupAnalyser, drawWithThrottle, drawIdle])

  // Draw idle on mount
  useEffect(() => {
    if (!isActive) {
      drawIdle()
    }
  }, [canvasDimensions, drawIdle, isActive])

  return (
    <div
      className={className}
      style={{
        width,
        height,
        position: 'relative',
      }}
      role="img"
      aria-label={isActive ? 'Đang hiển thị sóng âm thanh' : 'Sóng âm thanh không hoạt động'}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
        }}
        aria-hidden="true"
      />
    </div>
  )
}
