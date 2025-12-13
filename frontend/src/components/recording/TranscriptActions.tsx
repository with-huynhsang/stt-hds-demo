import { Button, Space, Tooltip, App, Popconfirm } from 'antd'
import { 
  CopyOutlined, 
  DeleteOutlined, 
  DownloadOutlined,
  CheckOutlined,
} from '@ant-design/icons'
import { useState } from 'react'

export interface TranscriptActionsProps {
  /**
   * The transcript text to act upon
   */
  transcript: string
  /**
   * Callback when clear is requested
   */
  onClear: () => void
  /**
   * Whether the actions should be disabled
   */
  disabled?: boolean
  /**
   * Size of the buttons
   * @default 'middle'
   */
  size?: 'small' | 'middle' | 'large'
  /**
   * Layout orientation
   * @default 'horizontal'
   */
  orientation?: 'horizontal' | 'vertical'
  /**
   * Additional CSS class name
   */
  className?: string
}

/**
 * Action buttons for transcript manipulation
 * Provides copy to clipboard, clear, and download functionality
 * 
 * @example
 * ```tsx
 * <TranscriptActions
 *   transcript={transcript}
 *   onClear={clearTranscript}
 *   disabled={!transcript}
 * />
 * ```
 */
export function TranscriptActions({
  transcript,
  onClear,
  disabled = false,
  size = 'middle',
  orientation = 'horizontal',
  className,
}: TranscriptActionsProps) {
  const { message } = App.useApp()
  const [copied, setCopied] = useState(false)

  const hasContent = Boolean(transcript.trim())
  const isDisabled = disabled || !hasContent

  /**
   * Copy transcript to clipboard
   */
  const handleCopy = async () => {
    if (!transcript.trim()) return

    try {
      await navigator.clipboard.writeText(transcript)
      setCopied(true)
      message.success('Đã sao chép vào clipboard')
      
      // Reset copied state after 2 seconds
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
      message.error('Không thể sao chép. Vui lòng thử lại.')
    }
  }

  /**
   * Download transcript as text file
   */
  const handleDownload = () => {
    if (!transcript.trim()) return

    try {
      // Create blob with transcript content
      const blob = new Blob([transcript], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)

      // Create temporary link and trigger download
      const link = document.createElement('a')
      link.href = url
      link.download = `transcript-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.txt`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      // Cleanup URL
      URL.revokeObjectURL(url)

      message.success('Đã tải xuống file transcript')
    } catch (error) {
      console.error('Failed to download:', error)
      message.error('Không thể tải xuống. Vui lòng thử lại.')
    }
  }

  /**
   * Clear the transcript
   */
  const handleClear = () => {
    onClear()
    message.info('Đã xóa nội dung')
  }

  return (
    <Space 
      orientation={orientation} 
      size="small" 
      className={className}
    >
      {/* Copy Button */}
      <Tooltip title="Sao chép vào clipboard">
        <Button
          type="text"
          icon={copied ? <CheckOutlined /> : <CopyOutlined />}
          onClick={handleCopy}
          disabled={isDisabled}
          size={size}
          style={copied ? { color: '#52c41a' } : undefined}
        >
          {orientation === 'horizontal' ? null : 'Sao chép'}
        </Button>
      </Tooltip>

      {/* Download Button */}
      <Tooltip title="Tải xuống dạng file .txt">
        <Button
          type="text"
          icon={<DownloadOutlined />}
          onClick={handleDownload}
          disabled={isDisabled}
          size={size}
        >
          {orientation === 'horizontal' ? null : 'Tải xuống'}
        </Button>
      </Tooltip>

      {/* Clear Button with confirmation */}
      <Popconfirm
        title="Xóa nội dung?"
        description="Bạn có chắc muốn xóa toàn bộ nội dung đã chuyển đổi?"
        onConfirm={handleClear}
        okText="Xóa"
        cancelText="Hủy"
        okButtonProps={{ danger: true }}
        disabled={isDisabled}
      >
        <Tooltip title="Xóa nội dung">
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            disabled={isDisabled}
            size={size}
          >
            {orientation === 'horizontal' ? null : 'Xóa'}
          </Button>
        </Tooltip>
      </Popconfirm>
    </Space>
  )
}
