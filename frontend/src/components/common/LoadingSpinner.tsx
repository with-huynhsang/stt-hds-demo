import { Spin, Flex, Typography } from 'antd'
import type { SpinProps } from 'antd'
import { LoadingOutlined, SyncOutlined } from '@ant-design/icons'

const { Text } = Typography

interface LoadingSpinnerProps extends SpinProps {
  /** Custom loading message */
  message?: string
  /** Full screen overlay mode */
  fullscreen?: boolean
  /** Small inline variant */
  inline?: boolean
}

/**
 * Standard loading spinner with optional message
 * Used for action loading states (saving, processing)
 */
export function LoadingSpinner({ 
  message, 
  fullscreen = false, 
  inline = false,
  ...props 
}: LoadingSpinnerProps) {
  const indicator = <LoadingOutlined style={{ fontSize: inline ? 16 : 24 }} spin />
  
  if (inline) {
    return (
      <Spin indicator={indicator} size="small" {...props}>
        {message && <Text type="secondary" style={{ marginLeft: 8 }}>{message}</Text>}
      </Spin>
    )
  }
  
  if (fullscreen) {
    return (
      <Flex
        justify="center"
        align="center"
        vertical
        gap="small"
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.45)',
          zIndex: 1000,
        }}
      >
        <Spin indicator={indicator} size="large" {...props} />
        {message && (
          <Text style={{ color: '#fff', marginTop: 16 }}>{message}</Text>
        )}
      </Flex>
    )
  }
  
  return (
    <Flex justify="center" align="center" vertical gap="small" style={{ padding: 24 }}>
      <Spin indicator={indicator} {...props} />
      {message && <Text type="secondary">{message}</Text>}
    </Flex>
  )
}

/**
 * Recording-specific loading indicator
 * Shows processing state while audio is being transcribed
 */
export function TranscribingIndicator() {
  return (
    <Flex align="center" gap="small">
      <SyncOutlined spin style={{ color: '#1677ff' }} />
      <Text type="secondary">Đang xử lý...</Text>
    </Flex>
  )
}

/**
 * Model loading indicator
 * Shows when switching models and loading weights
 */
export function ModelLoadingIndicator({ modelName }: { modelName?: string }) {
  return (
    <Flex 
      vertical 
      align="center" 
      gap="small" 
      style={{ padding: '24px 16px' }}
    >
      <Spin indicator={<LoadingOutlined style={{ fontSize: 32 }} spin />} />
      <Text type="secondary">
        {modelName ? `Đang tải model ${modelName}...` : 'Đang tải model...'}
      </Text>
      <Text type="secondary" style={{ fontSize: 12 }}>
        Quá trình này có thể mất vài giây
      </Text>
    </Flex>
  )
}

/**
 * WebSocket connecting indicator
 */
export function ConnectingIndicator() {
  return (
    <Flex align="center" gap="small">
      <Spin size="small" />
      <Text type="secondary">Đang kết nối...</Text>
    </Flex>
  )
}
