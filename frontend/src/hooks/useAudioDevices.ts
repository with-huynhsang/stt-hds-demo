import { useState, useEffect, useCallback, useRef } from 'react'

export interface AudioDevice {
  deviceId: string
  label: string
  groupId: string
}

export interface UseAudioDevicesOptions {
  /** Auto-request permission on mount */
  autoRequestPermission?: boolean
  /** Callback when device list changes */
  onDevicesChange?: (devices: AudioDevice[]) => void
}

/**
 * Custom hook for managing audio input devices
 * Detects available microphones and handles device changes
 * 
 * @example
 * ```tsx
 * const { devices, selectedDeviceId, selectDevice, refreshDevices } = useAudioDevices()
 * ```
 */
export function useAudioDevices(options: UseAudioDevicesOptions = {}) {
  const { autoRequestPermission = false, onDevicesChange } = options

  const [devices, setDevices] = useState<AudioDevice[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('')
  const [hasPermission, setHasPermission] = useState<boolean | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Ref for callback to avoid stale closure
  const onDevicesChangeRef = useRef(onDevicesChange)
  onDevicesChangeRef.current = onDevicesChange

  /**
   * Request microphone permission
   */
  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      setIsLoading(true)
      setError(null)

      // Request microphone access to get permission
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      
      // Stop all tracks immediately (we just need permission)
      stream.getTracks().forEach(track => track.stop())
      
      setHasPermission(true)
      return true
    } catch (err) {
      const errorMessage = err instanceof DOMException 
        ? err.name === 'NotAllowedError'
          ? 'Quyền truy cập microphone bị từ chối'
          : err.name === 'NotFoundError'
            ? 'Không tìm thấy microphone'
            : 'Lỗi khi yêu cầu quyền microphone'
        : 'Lỗi không xác định'
      
      setError(errorMessage)
      setHasPermission(false)
      return false
    } finally {
      setIsLoading(false)
    }
  }, [])

  /**
   * Get list of audio input devices
   */
  const getDevices = useCallback(async (): Promise<AudioDevice[]> => {
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices()
      
      const audioInputs = allDevices
        .filter(device => device.kind === 'audioinput')
        .map(device => ({
          deviceId: device.deviceId,
          label: device.label || `Microphone ${device.deviceId.slice(0, 8)}`,
          groupId: device.groupId,
        }))

      return audioInputs
    } catch (err) {
      console.error('[AudioDevices] Failed to enumerate devices:', err)
      return []
    }
  }, [])

  /**
   * Refresh device list
   */
  const refreshDevices = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      // Check if we need permission first
      const devicesBefore = await getDevices()
      
      // If device labels are empty, we need permission
      const needsPermission = devicesBefore.length > 0 && 
        devicesBefore.every(d => d.label.startsWith('Microphone ') && d.label.length < 20)

      if (needsPermission && hasPermission !== true) {
        const granted = await requestPermission()
        if (!granted) {
          setDevices(devicesBefore)
          return
        }
      }

      // Get devices again (with labels if permission granted)
      const devicesAfter = await getDevices()
      setDevices(devicesAfter)

      // Set default device if not selected
      if (!selectedDeviceId && devicesAfter.length > 0) {
        // Prefer 'default' device or first one
        const defaultDevice = devicesAfter.find(d => d.deviceId === 'default') || devicesAfter[0]
        setSelectedDeviceId(defaultDevice.deviceId)
      }

      // Notify callback
      onDevicesChangeRef.current?.(devicesAfter)
    } catch (err) {
      setError('Không thể lấy danh sách thiết bị')
      console.error('[AudioDevices] Error refreshing devices:', err)
    } finally {
      setIsLoading(false)
    }
  }, [getDevices, hasPermission, requestPermission, selectedDeviceId])

  /**
   * Select a specific device
   */
  const selectDevice = useCallback((deviceId: string) => {
    const device = devices.find(d => d.deviceId === deviceId)
    if (device) {
      setSelectedDeviceId(deviceId)
      // Persist selection
      try {
        localStorage.setItem('voice2text-selected-device', deviceId)
      } catch {
        // Ignore storage errors
      }
    }
  }, [devices])

  /**
   * Get currently selected device info
   */
  const selectedDevice = devices.find(d => d.deviceId === selectedDeviceId) || null

  // Listen for device changes
  useEffect(() => {
    const handleDeviceChange = () => {
      console.log('[AudioDevices] Device change detected')
      refreshDevices()
    }

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange)
    
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange)
    }
  }, [refreshDevices])

  // Initial load
  useEffect(() => {
    // Try to restore selected device from storage
    try {
      const savedDeviceId = localStorage.getItem('voice2text-selected-device')
      if (savedDeviceId) {
        setSelectedDeviceId(savedDeviceId)
      }
    } catch {
      // Ignore storage errors
    }

    // Auto request permission or just get devices
    if (autoRequestPermission) {
      requestPermission().then(() => refreshDevices())
    } else {
      refreshDevices()
    }
  }, [autoRequestPermission, requestPermission, refreshDevices])

  return {
    // Device list
    devices,
    selectedDeviceId,
    selectedDevice,

    // State
    hasPermission,
    isLoading,
    error,

    // Actions
    selectDevice,
    refreshDevices,
    requestPermission,
  }
}
