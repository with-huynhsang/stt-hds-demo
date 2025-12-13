import { memo } from 'react'
import { Button, Tooltip } from 'antd'
import { AudioOutlined, StopOutlined, LoadingOutlined } from '@ant-design/icons'
import { cn } from '@/lib/utils'

export interface RecordButtonProps {
  /** Whether recording is in progress */
  isRecording: boolean
  /** Whether connecting to server */
  isConnecting?: boolean
  /** Whether button is disabled */
  disabled?: boolean
  /** Click handler */
  onClick: () => void
  /** Button size in pixels */
  size?: number
  /** Optional className */
  className?: string
}

/**
 * Animated record button with pulse effect when recording
 * 
 * @example
 * ```tsx
 * <RecordButton 
 *   isRecording={isRecording}
 *   onClick={handleToggleRecording}
 * />
 * ```
 */
export function RecordButton({
  isRecording,
  isConnecting = false,
  disabled = false,
  onClick,
  size = 100,
  className,
}: RecordButtonProps) {
  const getIcon = () => {
    if (isConnecting) {
      return <LoadingOutlined style={{ fontSize: size * 0.4 }} />
    }
    if (isRecording) {
      return <StopOutlined style={{ fontSize: size * 0.4 }} />
    }
    return <AudioOutlined style={{ fontSize: size * 0.4 }} />
  }

  const getTooltip = () => {
    if (isConnecting) return 'Đang kết nối...'
    if (isRecording) return 'Nhấn để dừng ghi âm'
    return 'Nhấn để bắt đầu ghi âm'
  }

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)}>
      {/* Pulse rings when recording */}
      {isRecording && (
        <>
          <span
            className="absolute rounded-full bg-red-400 opacity-75 animate-ping"
            style={{
              width: size * 1.2,
              height: size * 1.2,
              animationDuration: '1.5s',
            }}
          />
          <span
            className="absolute rounded-full bg-red-300 opacity-50 animate-ping"
            style={{
              width: size * 1.4,
              height: size * 1.4,
              animationDuration: '2s',
              animationDelay: '0.5s',
            }}
          />
        </>
      )}

      <Tooltip title={getTooltip()} placement="bottom">
        <Button
          type={isRecording ? 'default' : 'primary'}
          danger={isRecording}
          shape="circle"
          icon={getIcon()}
          onClick={onClick}
          disabled={disabled || isConnecting}
          style={{
            width: size,
            height: size,
            zIndex: 1,
          }}
          className={cn(
            'transition-all duration-300 shadow-lg hover:shadow-xl',
            isRecording && 'animate-pulse',
            !isRecording && !isConnecting && 'hover:scale-105',
          )}
          aria-label={isRecording ? 'Dừng ghi âm' : 'Bắt đầu ghi âm'}
        />
      </Tooltip>
    </div>
  )
}

// Memoize component to prevent unnecessary re-renders
export const MemoizedRecordButton = memo(RecordButton)
