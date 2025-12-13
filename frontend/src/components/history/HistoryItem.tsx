import { memo, useState, useRef, useEffect, useCallback } from 'react'
import { Card, Typography, Tag, Space, Flex, Tooltip, Button, App } from 'antd'
import { 
  CopyOutlined, 
  ClockCircleOutlined,
  CheckOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/vi'
import type { TranscriptionLog } from '@/client/types.gen'
import { ModerationBadge, type ModerationLabel } from '../recording/ModerationBadge'
import { KeywordHighlight } from '../recording/KeywordHighlight'

// Setup dayjs
dayjs.extend(relativeTime)
dayjs.locale('vi')

const { Text } = Typography

export interface HistoryItemProps {
  item: TranscriptionLog
  onClick?: () => void
}

// Model color mapping
const MODEL_COLORS: Record<string, string> = {
  'zipformer': 'blue',
}

/**
 * Single history item card component
 * Displays model, date, content preview, and latency
 * 
 * @example
 * ```tsx
 * <HistoryItem 
 *   item={transcriptionLog}
 *   onClick={() => handleClick(item)}
 * />
 * ```
 */
export function HistoryItem({ item, onClick }: HistoryItemProps) {
  const { message } = App.useApp()
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [isTruncated, setIsTruncated] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  const modelColor = MODEL_COLORS[item.model_id] || 'default'
  const createdAt = dayjs(item.created_at)
  const relativeDate = createdAt.fromNow()
  const fullDate = createdAt.format('DD/MM/YYYY HH:mm:ss')

  // Check if content is actually truncated (overflow)
  // Only check when NOT expanded to get the initial state
  const checkTruncation = useCallback(() => {
    if (contentRef.current && !expanded) {
      const element = contentRef.current
      // Check if scrollHeight > clientHeight means text is overflowing
      // We need a small tolerance for rounding errors
      const isOverflowing = element.scrollHeight > element.clientHeight + 1
      setIsTruncated(isOverflowing)
    }
  }, [expanded])

  // Check truncation on mount and when content changes
  useEffect(() => {
    // Small delay to ensure DOM is rendered with CSS applied
    const timer = setTimeout(checkTruncation, 100)
    return () => clearTimeout(timer)
  }, [item.content, checkTruncation])

  // Re-check on window resize
  useEffect(() => {
    window.addEventListener('resize', checkTruncation)
    return () => window.removeEventListener('resize', checkTruncation)
  }, [checkTruncation])

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    
    try {
      await navigator.clipboard.writeText(item.content)
      setCopied(true)
      message.success('Đã sao chép')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      message.error('Không thể sao chép')
    }
  }

  const handleToggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation()
    setExpanded(!expanded)
  }

  // Format latency
  const formatLatency = (ms?: number) => {
    if (!ms) return null
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(2)}s`
  }

  return (
    <Card
      hoverable={Boolean(onClick)}
      onClick={onClick}
      size="small"
      styles={{
        body: {
          padding: 16,
        },
      }}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      } : undefined}
      role={onClick ? 'button' : undefined}
      aria-label={`Bản ghi ${item.model_id} - ${relativeDate}`}
    >
      {/* Header: Model tag + Date */}
      <Flex justify="space-between" align="center" style={{ marginBottom: 8 }}>
        <Space size="small">
          <Tag color={modelColor}>{item.model_id}</Tag>
          {/* Moderation badge - show when moderation result is available */}
          {item.moderation_label && (
            <ModerationBadge
              label={item.moderation_label as ModerationLabel}
              confidence={item.moderation_confidence ?? 0}
              detectedKeywords={item.detected_keywords ?? []}
              size="small"
            />
          )}
          {(item.latency_ms ?? 0) > 0 && (
            <Tooltip title="Độ trễ xử lý">
              <Tag icon={<ThunderboltOutlined />} color="cyan">
                {formatLatency(item.latency_ms)}
              </Tag>
            </Tooltip>
          )}
        </Space>
        
        <Space size="small">
          <Tooltip title={fullDate}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              <ClockCircleOutlined style={{ marginRight: 4 }} />
              {relativeDate}
            </Text>
          </Tooltip>
          
          <Tooltip title="Sao chép nội dung">
            <Button
              type="text"
              size="small"
              icon={copied ? <CheckOutlined style={{ color: '#52c41a' }} /> : <CopyOutlined />}
              onClick={handleCopy}
              aria-label="Sao chép nội dung vào clipboard"
            />
          </Tooltip>
        </Space>
      </Flex>

      {/* Content - expandable with keyword highlighting */}
      {item.content ? (
        <div>
          <div
            ref={contentRef}
            style={{
              overflow: 'hidden',
              display: expanded ? 'block' : '-webkit-box',
              WebkitLineClamp: expanded ? 'unset' : 3,
              WebkitBoxOrient: 'vertical',
              fontSize: 14,
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            {/* Highlight keywords if flagged and has keywords */}
            {item.is_flagged && item.detected_keywords && item.detected_keywords.length > 0 ? (
              <KeywordHighlight
                text={item.content}
                keywords={item.detected_keywords}
                showTooltip={true}
              />
            ) : (
              item.content
            )}
          </div>
          {/* Show toggle button only if content was truncated */}
          {isTruncated && (
            <Button 
              type="link" 
              size="small" 
              onClick={handleToggleExpand}
              style={{ padding: 0, height: 'auto', marginTop: 4 }}
            >
              {expanded ? 'Thu gọn' : 'Xem thêm...'}
            </Button>
          )}
        </div>
      ) : (
        <Text type="secondary" italic>Không có nội dung</Text>
      )}

      {/* Session ID (full) */}
      <Text 
        type="secondary" 
        style={{ 
          fontSize: 11, 
          marginTop: 8, 
          display: 'block',
          fontFamily: 'monospace',
        }}
      >
        ID: {item.session_id}
      </Text>
    </Card>
  )
}

// Memoized version to prevent unnecessary re-renders in lists
export const MemoizedHistoryItem = memo(HistoryItem, (prevProps, nextProps) => {
  return prevProps.item.id === nextProps.item.id 
    && prevProps.item.content === nextProps.item.content
})
