import { memo } from 'react'
import { Badge, Tooltip, Typography, Spin } from 'antd'
import { CloudOutlined, CloudSyncOutlined, DisconnectOutlined } from '@ant-design/icons'
import { useHealthCheck } from '@/hooks'

const { Text } = Typography

export interface ServerStatusProps {
  /** Show text label */
  showLabel?: boolean
  /** Size of the status indicator */
  size?: 'small' | 'default'
}

/**
 * Server status indicator component
 * Shows if backend server is healthy and reachable
 * 
 * @example
 * ```tsx
 * <ServerStatus showLabel />
 * ```
 */
export function ServerStatus({ showLabel = false, size = 'default' }: ServerStatusProps) {
  const { isHealthy, isChecking, isError, refetch } = useHealthCheck({
    refetchInterval: 30000, // Check every 30 seconds
  })

  const getStatus = () => {
    if (isChecking && !isHealthy && !isError) {
      return {
        status: 'processing' as const,
        text: 'Đang kiểm tra...',
        icon: <CloudSyncOutlined spin />,
        color: '#1890ff',
      }
    }
    if (isHealthy) {
      return {
        status: 'success' as const,
        text: 'Server hoạt động',
        icon: <CloudOutlined />,
        color: '#52c41a',
      }
    }
    if (isError) {
      return {
        status: 'error' as const,
        text: 'Server không phản hồi',
        icon: <DisconnectOutlined />,
        color: '#ff4d4f',
      }
    }
    return {
      status: 'default' as const,
      text: 'Chưa kết nối',
      icon: <CloudOutlined />,
      color: '#d9d9d9',
    }
  }

  const { status, text, icon, color } = getStatus()

  const indicator = (
    <Badge 
      status={status} 
      text={showLabel ? (
        <Text 
          style={{ 
            fontSize: size === 'small' ? 11 : 12,
            color,
          }}
        >
          {text}
        </Text>
      ) : undefined}
    />
  )

  return (
    <Tooltip 
      title={
        <div>
          <div>{text}</div>
          {isError && (
            <div style={{ fontSize: 11, marginTop: 4 }}>
              Nhấn để thử lại kết nối
            </div>
          )}
        </div>
      }
    >
      <span 
        onClick={isError ? () => refetch() : undefined}
        style={{ 
          cursor: isError ? 'pointer' : 'default',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <span style={{ color, fontSize: size === 'small' ? 12 : 14 }}>
          {isChecking && !isHealthy ? <Spin size="small" /> : icon}
        </span>
        {indicator}
      </span>
    </Tooltip>
  )
}

export const MemoizedServerStatus = memo(ServerStatus)
