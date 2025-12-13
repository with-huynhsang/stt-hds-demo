import { Switch, Space, Tag, Tooltip, theme } from 'antd'
import { SafetyOutlined, LoadingOutlined } from '@ant-design/icons'
import { useModerationStatus } from '@/hooks/useModerationStatus'
import { useToggleModeration } from '@/hooks/useToggleModeration'
import { App } from 'antd'

export interface ModerationToggleProps {
  /** Disable the toggle (e.g., during recording) */
  disabled?: boolean
  /** Show compact version (just switch, no label) */
  compact?: boolean
  /** Custom size for the switch */
  size?: 'small' | 'default'
}

/**
 * Toggle component for enabling/disabling content moderation.
 * 
 * Displays a switch with status badge showing whether moderation is active.
 * Automatically syncs with backend API and local store.
 * 
 * @example
 * ```tsx
 * // Full version with label and status
 * <ModerationToggle />
 * 
 * // Compact version (just switch)
 * <ModerationToggle compact />
 * 
 * // Disabled during recording
 * <ModerationToggle disabled={isRecording} />
 * ```
 */
export function ModerationToggle({
  disabled = false,
  compact = false,
  size = 'small',
}: ModerationToggleProps) {
  const { token } = theme.useToken()
  const { message } = App.useApp()
  
  const { 
    isEnabled, 
    isSpanDetectorActive, 
    isLoading, 
    isFetching,
  } = useModerationStatus()
  
  const { toggle, isToggling } = useToggleModeration({
    onSuccess: (data) => {
      message.success(
        data.enabled 
          ? 'Đã bật kiểm duyệt nội dung' 
          : 'Đã tắt kiểm duyệt nội dung'
      )
    },
    onError: (error) => {
      message.error(`Lỗi: ${error.message}`)
    },
  })

  const handleChange = (checked: boolean) => {
    toggle(checked)
  }

  const isLoadingState = isLoading || isToggling || isFetching
  const isDetectorLoading = isEnabled && !isSpanDetectorActive

  // Tooltip content
  const tooltipContent = (
    <span>
      Kiểm duyệt nội dung (Content Moderation)
      {isSpanDetectorActive && (
        <>
          <br />
          Model: ViSoBERT-HSD-Span
        </>
      )}
      {isDetectorLoading && (
        <>
          <br />
          Đang tải model...
        </>
      )}
    </span>
  )

  if (compact) {
    return (
      <Tooltip title={tooltipContent}>
        <Switch
          checked={isEnabled}
          onChange={handleChange}
          loading={isLoadingState}
          disabled={disabled || isDetectorLoading}
          size={size}
          checkedChildren={<SafetyOutlined />}
          unCheckedChildren={<SafetyOutlined />}
        />
      </Tooltip>
    )
  }

  return (
    <Space size={token.marginXS}>
      <Tooltip title={tooltipContent}>
        <Space size={4}>
          <SafetyOutlined style={{ color: isEnabled ? token.colorPrimary : token.colorTextSecondary }} />
          <Switch
            checked={isEnabled}
            onChange={handleChange}
            loading={isLoadingState}
            disabled={disabled || isDetectorLoading}
            size={size}
          />
        </Space>
      </Tooltip>
      
      {isEnabled && !isDetectorLoading && (
        <Tag 
          color="blue" 
          icon={<SafetyOutlined />}
          style={{ margin: 0 }}
        >
          Moderation
        </Tag>
      )}
      
      {isDetectorLoading && (
        <Tag 
          color="processing" 
          icon={<LoadingOutlined spin />}
          style={{ margin: 0 }}
        >
          Loading...
        </Tag>
      )}
    </Space>
  )
}
