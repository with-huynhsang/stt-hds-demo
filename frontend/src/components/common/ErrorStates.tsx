import { Result, Button, Typography, Alert, Flex, Card } from 'antd'
import { 
  WifiOutlined, 
  LockOutlined, 
  ExclamationCircleOutlined,
  ReloadOutlined,
  WarningOutlined,
  ApiOutlined,
  AudioOutlined,
  DisconnectOutlined,
} from '@ant-design/icons'
import type { ReactNode } from 'react'

const { Text, Paragraph } = Typography

interface ErrorDisplayProps {
  /** Error title */
  title?: string
  /** Error description/message */
  message?: string
  /** Custom action buttons */
  extra?: ReactNode
  /** Whether to show as inline alert vs full page */
  inline?: boolean
  /** Retry callback */
  onRetry?: () => void
}

/**
 * Network error display
 * Used when API calls fail due to network issues
 */
export function NetworkError({ 
  title = 'Lỗi kết nối mạng',
  message = 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối mạng của bạn.',
  onRetry,
  inline = false,
  extra,
}: ErrorDisplayProps) {
  if (inline) {
    return (
      <Alert
        message={title}
        description={message}
        type="error"
        showIcon
        icon={<WifiOutlined />}
        action={onRetry && (
          <Button size="small" onClick={onRetry} icon={<ReloadOutlined />}>
            Thử lại
          </Button>
        )}
      />
    )
  }

  return (
    <Result
      status="error"
      icon={<WifiOutlined style={{ color: '#ff4d4f' }} />}
      title={title}
      subTitle={message}
      extra={extra || (onRetry && (
        <Button type="primary" onClick={onRetry} icon={<ReloadOutlined />}>
          Thử lại
        </Button>
      ))}
    />
  )
}

/**
 * Microphone permission error display
 * Used when browser denies microphone access
 */
export function PermissionError({
  title = 'Cần quyền truy cập microphone',
  message = 'Ứng dụng cần quyền truy cập microphone để ghi âm. Vui lòng cho phép trong cài đặt trình duyệt.',
  onRetry,
  inline = false,
  extra,
}: ErrorDisplayProps) {
  const instructions = (
    <Card size="small" style={{ marginTop: 16, textAlign: 'left' }}>
      <Text strong>Cách bật quyền microphone:</Text>
      <ol style={{ marginTop: 8, paddingLeft: 20 }}>
        <li>Nhấn vào biểu tượng khóa 🔒 trên thanh địa chỉ</li>
        <li>Tìm mục "Microphone"</li>
        <li>Chọn "Cho phép" (Allow)</li>
        <li>Tải lại trang</li>
      </ol>
    </Card>
  )

  if (inline) {
    return (
      <Alert
        message={title}
        description={
          <div>
            <Paragraph>{message}</Paragraph>
            {instructions}
          </div>
        }
        type="warning"
        showIcon
        icon={<LockOutlined />}
        action={onRetry && (
          <Button size="small" onClick={onRetry} icon={<ReloadOutlined />}>
            Thử lại
          </Button>
        )}
      />
    )
  }

  return (
    <Result
      status="warning"
      icon={<LockOutlined style={{ color: '#faad14' }} />}
      title={title}
      subTitle={message}
      extra={
        <Flex vertical gap="middle" align="center">
          {instructions}
          {extra || (onRetry && (
            <Button type="primary" onClick={onRetry} icon={<ReloadOutlined />}>
              Thử lại
            </Button>
          ))}
        </Flex>
      }
    />
  )
}

/**
 * Server error display
 * Used when backend returns 500 or other server errors
 */
export function ServerError({
  title = 'Lỗi máy chủ',
  message = 'Máy chủ đang gặp sự cố. Vui lòng thử lại sau.',
  onRetry,
  inline = false,
  extra,
}: ErrorDisplayProps) {
  if (inline) {
    return (
      <Alert
        message={title}
        description={message}
        type="error"
        showIcon
        icon={<ApiOutlined />}
        action={onRetry && (
          <Button size="small" onClick={onRetry} icon={<ReloadOutlined />}>
            Thử lại
          </Button>
        )}
      />
    )
  }

  return (
    <Result
      status="500"
      title={title}
      subTitle={message}
      extra={extra || (onRetry && (
        <Button type="primary" onClick={onRetry} icon={<ReloadOutlined />}>
          Thử lại
        </Button>
      ))}
    />
  )
}

/**
 * WebSocket connection error display
 * Used when WebSocket fails to connect or disconnects unexpectedly
 */
export function WebSocketError({
  title = 'Mất kết nối WebSocket',
  message = 'Kết nối thời gian thực bị gián đoạn. Đang thử kết nối lại...',
  onRetry,
  inline = false,
  extra,
}: ErrorDisplayProps) {
  if (inline) {
    return (
      <Alert
        message={title}
        description={message}
        type="warning"
        showIcon
        icon={<DisconnectOutlined />}
        action={onRetry && (
          <Button size="small" onClick={onRetry} icon={<ReloadOutlined />}>
            Kết nối lại
          </Button>
        )}
      />
    )
  }

  return (
    <Result
      status="warning"
      icon={<DisconnectOutlined style={{ color: '#faad14' }} />}
      title={title}
      subTitle={message}
      extra={extra || (onRetry && (
        <Button type="primary" onClick={onRetry} icon={<ReloadOutlined />}>
          Kết nối lại
        </Button>
      ))}
    />
  )
}

/**
 * Audio recording error display
 * Used when audio recording fails
 */
export function AudioError({
  title = 'Lỗi ghi âm',
  message = 'Không thể ghi âm. Vui lòng kiểm tra microphone và thử lại.',
  onRetry,
  inline = false,
  extra,
}: ErrorDisplayProps) {
  if (inline) {
    return (
      <Alert
        message={title}
        description={message}
        type="error"
        showIcon
        icon={<AudioOutlined />}
        action={onRetry && (
          <Button size="small" onClick={onRetry} icon={<ReloadOutlined />}>
            Thử lại
          </Button>
        )}
      />
    )
  }

  return (
    <Result
      status="error"
      icon={<AudioOutlined style={{ color: '#ff4d4f' }} />}
      title={title}
      subTitle={message}
      extra={extra || (onRetry && (
        <Button type="primary" onClick={onRetry} icon={<ReloadOutlined />}>
          Thử lại
        </Button>
      ))}
    />
  )
}

/**
 * Not found error display
 * Used for 404 pages or missing resources
 */
export function NotFoundError({
  title = 'Không tìm thấy',
  message = 'Trang hoặc nội dung bạn tìm kiếm không tồn tại.',
  extra,
}: Omit<ErrorDisplayProps, 'onRetry' | 'inline'>) {
  return (
    <Result
      status="404"
      title={title}
      subTitle={message}
      extra={extra || (
        <Button type="primary" onClick={() => window.location.href = '/'}>
          Về trang chủ
        </Button>
      )}
    />
  )
}

/**
 * Generic error display component
 * Adapts error type based on error code or message
 */
export function GenericError({
  error,
  onRetry,
  inline = false,
}: {
  error: Error | string | { code?: number; message?: string }
  onRetry?: () => void
  inline?: boolean
}) {
  // Parse error
  let errorMessage = ''
  let errorCode: number | undefined

  if (typeof error === 'string') {
    errorMessage = error
  } else if (error instanceof Error) {
    errorMessage = error.message
  } else {
    errorMessage = error.message || 'Đã xảy ra lỗi không xác định'
    errorCode = error.code
  }

  // Determine error type based on code or message
  const isNetworkError = 
    errorMessage.toLowerCase().includes('network') ||
    errorMessage.toLowerCase().includes('fetch') ||
    errorMessage.toLowerCase().includes('kết nối')
  
  const isPermissionError = 
    errorMessage.toLowerCase().includes('permission') ||
    errorMessage.toLowerCase().includes('denied') ||
    errorMessage.toLowerCase().includes('quyền')

  const isServerError = 
    errorCode === 500 || 
    errorCode === 502 ||
    errorCode === 503 ||
    errorMessage.toLowerCase().includes('server')

  if (isNetworkError) {
    return <NetworkError message={errorMessage} onRetry={onRetry} inline={inline} />
  }

  if (isPermissionError) {
    return <PermissionError message={errorMessage} onRetry={onRetry} inline={inline} />
  }

  if (isServerError) {
    return <ServerError message={errorMessage} onRetry={onRetry} inline={inline} />
  }

  // Default error display
  if (inline) {
    return (
      <Alert
        message="Lỗi"
        description={errorMessage}
        type="error"
        showIcon
        icon={<ExclamationCircleOutlined />}
        action={onRetry && (
          <Button size="small" onClick={onRetry} icon={<ReloadOutlined />}>
            Thử lại
          </Button>
        )}
      />
    )
  }

  return (
    <Result
      status="error"
      icon={<WarningOutlined style={{ color: '#ff4d4f' }} />}
      title="Đã xảy ra lỗi"
      subTitle={errorMessage}
      extra={onRetry && (
        <Button type="primary" onClick={onRetry} icon={<ReloadOutlined />}>
          Thử lại
        </Button>
      )}
    />
  )
}
