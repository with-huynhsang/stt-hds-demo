import { memo, useEffect } from 'react'
import { Select, Space, Button, Typography, Tooltip, Badge } from 'antd'
import { AudioOutlined, ReloadOutlined, SettingOutlined } from '@ant-design/icons'
import { useAudioDevices, type AudioDevice } from '@/hooks'

const { Text } = Typography

export interface DeviceSelectorProps {
  /** Currently selected device ID */
  value?: string
  /** Callback when device selection changes */
  onChange?: (deviceId: string) => void
  /** Whether the selector is disabled (e.g., during recording) */
  disabled?: boolean
  /** Size of the select component */
  size?: 'small' | 'middle' | 'large'
  /** Show refresh button */
  showRefresh?: boolean
  /** Placeholder text */
  placeholder?: string
  /** Style overrides */
  style?: React.CSSProperties
  /** Show compact version (icon only button that opens dropdown) */
  compact?: boolean
}

/**
 * Audio device selector component
 * Allows users to select their preferred microphone
 */
export const DeviceSelector = memo(function DeviceSelector({
  value,
  onChange,
  disabled = false,
  size = 'middle',
  showRefresh = true,
  placeholder = 'Chọn microphone...',
  style,
  compact = false,
}: DeviceSelectorProps) {
  const {
    devices,
    selectedDeviceId,
    isLoading,
    error,
    hasPermission,
    selectDevice,
    refreshDevices,
    requestPermission,
  } = useAudioDevices()

  // Sync external value with internal state
  const currentValue = value ?? selectedDeviceId

  // Handle device change
  const handleChange = (deviceId: string) => {
    selectDevice(deviceId)
    onChange?.(deviceId)
  }

  // Auto-refresh on mount if we have permission
  useEffect(() => {
    if (hasPermission && devices.length === 0) {
      refreshDevices()
    }
  }, [hasPermission, devices.length, refreshDevices])

  // Format device options for Select
  const deviceOptions = devices.map((device: AudioDevice) => ({
    value: device.deviceId,
    label: (
      <Space size="small">
        <AudioOutlined />
        <span>{device.label}</span>
        {device.deviceId === 'default' && (
          <Badge 
            count="Mặc định" 
            style={{ 
              backgroundColor: '#52c41a',
              fontSize: 10,
            }} 
          />
        )}
      </Space>
    ),
  }))

  // Request permission if not granted
  if (hasPermission === false) {
    return (
      <Button
        icon={<AudioOutlined />}
        onClick={requestPermission}
        loading={isLoading}
        size={size}
        style={style}
      >
        Cho phép microphone
      </Button>
    )
  }

  // Show error state
  if (error) {
    return (
      <Tooltip title={error}>
        <Button
          icon={<AudioOutlined />}
          danger
          onClick={refreshDevices}
          size={size}
          style={style}
        >
          Lỗi - Thử lại
        </Button>
      </Tooltip>
    )
  }

  // Compact mode - just icon button with dropdown
  if (compact) {
    return (
      <Select
        value={currentValue || undefined}
        onChange={handleChange}
        options={deviceOptions}
        disabled={disabled || isLoading}
        loading={isLoading}
        placeholder={placeholder}
        size={size}
        style={{ minWidth: 200, ...style }}
        suffixIcon={<SettingOutlined />}
        showSearch={false}
        dropdownRender={(menu) => (
          <>
            {menu}
            {showRefresh && (
              <div style={{ padding: '8px', borderTop: '1px solid #f0f0f0' }}>
                <Button
                  type="text"
                  icon={<ReloadOutlined />}
                  onClick={refreshDevices}
                  loading={isLoading}
                  size="small"
                  block
                >
                  Làm mới danh sách
                </Button>
              </div>
            )}
          </>
        )}
      />
    )
  }

  return (
    <Space.Compact style={style}>
      <Select
        value={currentValue || undefined}
        onChange={handleChange}
        options={deviceOptions}
        disabled={disabled || isLoading}
        loading={isLoading}
        placeholder={placeholder}
        size={size}
        style={{ minWidth: 200 }}
        showSearch={false}
        notFoundContent={
          <div style={{ padding: '8px', textAlign: 'center' }}>
            <Text type="secondary">Không tìm thấy thiết bị</Text>
            <br />
            <Button
              type="link"
              size="small"
              onClick={requestPermission}
              loading={isLoading}
            >
              Yêu cầu quyền truy cập
            </Button>
          </div>
        }
      />
      {showRefresh && (
        <Tooltip title="Làm mới danh sách thiết bị">
          <Button
            icon={<ReloadOutlined spin={isLoading} />}
            onClick={refreshDevices}
            disabled={disabled || isLoading}
            size={size}
          />
        </Tooltip>
      )}
    </Space.Compact>
  )
})

export default DeviceSelector
