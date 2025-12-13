import { useRef, useEffect } from 'react'
import { Typography, Card, Empty, Spin, theme } from 'antd'
import { AudioOutlined, LoadingOutlined, CloudSyncOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { cn } from '@/lib/utils'
import { ModerationBadge, type ModerationLabel } from './ModerationBadge'
import { KeywordHighlight } from './KeywordHighlight'

const { Text, Paragraph } = Typography

export interface TranscriptDisplayProps {
  /**
   * The finalized transcript text
   */
  transcript: string
  /**
   * Interim (not yet finalized) text being processed
   */
  interimText?: string
  /**
   * Whether transcription is currently active
   */
  isRecording?: boolean
  /**
   * Whether the system is connecting
   */
  isConnecting?: boolean
  /**
   * Whether the model is buffered (processes in batches)
   * When true, shows "Processing..." instead of interim text
   */
  isBufferedModel?: boolean
  /**
   * Expected latency range in milliseconds [min, max]
   * Used to show estimated wait time for buffered models
   */
  expectedLatencyMs?: [number, number]
  /**
   * Whether to auto-scroll to bottom on new content
   * @default true
   */
  autoScroll?: boolean
  /**
   * Minimum height of the transcript area
   * @default 200
   */
  minHeight?: number
  /**
   * Maximum height of the transcript area (enables scrolling)
   * @default 400
   */
  maxHeight?: number
  /**
   * Placeholder text when no transcript
   * @default 'Press the record button to start transcribing...'
   */
  placeholder?: string
  /**
   * Additional CSS class name
   */
  className?: string
  /**
   * Latest moderation result from ViSoBERT-HSD
   */
  moderationResult?: {
    label: ModerationLabel
    confidence: number
    is_flagged: boolean
    detected_keywords?: string[]
  } | null
  /**
   * Whether to highlight detected keywords in transcript
   * Only applies when moderationResult has detected_keywords
   * @default true
   */
  showKeywordHighlight?: boolean
}

/**
 * Real-time transcript display component
 * Shows finalized text and interim (in-progress) text with distinct styling
 * 
 * For streaming models (Zipformer): Shows real-time interim text
 * 
 * @example
 * ```tsx
 * <TranscriptDisplay
 *   transcript={transcript}
 *   interimText={interimText}
 *   isRecording={isRecording}
 *   isBufferedModel={false}
 *   expectedLatencyMs={getExpectedLatency('zipformer')}
 * />
 * ```
 */
export function TranscriptDisplay({
  transcript,
  interimText,
  isRecording = false,
  isConnecting = false,
  isBufferedModel = false,
  expectedLatencyMs,
  autoScroll = true,
  minHeight = 200,
  maxHeight = 400,
  placeholder = 'Nhấn nút ghi âm để bắt đầu chuyển đổi giọng nói...',
  className,
  moderationResult,
  showKeywordHighlight = true,
}: TranscriptDisplayProps) {
  const { token } = theme.useToken()
  const contentRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when content changes
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [transcript, interimText, autoScroll])

  const hasContent = transcript.trim() || interimText?.trim()
  
  // Format latency for display
  const formatLatency = (ms: [number, number]) => {
    const [min, max] = ms
    if (max < 1000) return `${min}-${max}ms`
    return `${(min / 1000).toFixed(1)}-${(max / 1000).toFixed(1)}s`
  }

  return (
    <Card
      className={cn('transcript-display', className)}
      styles={{
        body: {
          padding: 0,
        },
      }}
      role="region"
      aria-label="Kết quả chuyển đổi giọng nói"
      aria-live="polite"
      aria-atomic="false"
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: `${token.paddingSM}px ${token.padding}px`,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AudioOutlined style={{ color: token.colorPrimary }} />
          <Text strong>Nội dung chuyển đổi</Text>
          {/* Moderation badge - show when result is available */}
          {moderationResult && (
            <ModerationBadge 
              label={moderationResult.label} 
              confidence={moderationResult.confidence}
              detectedKeywords={moderationResult.detected_keywords}
            />
          )}
          {/* Workflow type indicator */}
          {isRecording && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 8px',
                borderRadius: token.borderRadiusSM,
                backgroundColor: isBufferedModel ? token.colorWarningBg : token.colorSuccessBg,
                color: isBufferedModel ? token.colorWarning : token.colorSuccess,
                fontSize: 11,
                fontWeight: 500,
              }}
            >
              {isBufferedModel ? (
                <>
                  <CloudSyncOutlined style={{ fontSize: 10 }} />
                  Buffered
                </>
              ) : (
                <>
                  <ThunderboltOutlined style={{ fontSize: 10 }} />
                  Streaming
                </>
              )}
            </span>
          )}
        </div>
        
        {isRecording && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: token.colorError,
                animation: 'pulse 1.5s ease-in-out infinite',
              }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              Đang ghi âm...
            </Text>
          </div>
        )}
        
        {isConnecting && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Spin indicator={<LoadingOutlined style={{ fontSize: 12 }} spin />} size="small" />
            <Text type="secondary" style={{ fontSize: 12 }}>
              Đang kết nối...
            </Text>
          </div>
        )}
      </div>

      {/* Content area */}
      <div
        ref={scrollRef}
        style={{
          minHeight,
          maxHeight,
          overflowY: 'auto',
          padding: token.padding,
        }}
      >
        {!hasContent ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <Text type="secondary">
                {isConnecting ? 'Đang chuẩn bị...' : placeholder}
              </Text>
            }
            style={{
              minHeight: minHeight - 48,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}
          />
        ) : (
          <div ref={contentRef}>
            {/* Finalized transcript */}
            {transcript && (
              <Paragraph
                style={{
                  margin: 0,
                  marginBottom: interimText ? token.marginXS : 0,
                  fontSize: token.fontSizeLG,
                  lineHeight: 1.8,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {showKeywordHighlight && 
                 moderationResult?.detected_keywords && 
                 moderationResult.detected_keywords.length > 0 ? (
                  <KeywordHighlight
                    text={transcript}
                    keywords={moderationResult.detected_keywords}
                    showTooltip={true}
                  />
                ) : (
                  transcript
                )}
              </Paragraph>
            )}
            
            {/* Interim text (in-progress) - Different display for streaming vs buffered */}
            {isRecording && !interimText && isBufferedModel && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: token.marginSM,
                  padding: token.paddingLG,
                  marginTop: transcript ? token.marginSM : 0,
                  backgroundColor: token.colorBgContainer,
                  borderRadius: token.borderRadius,
                  border: `1px dashed ${token.colorBorder}`,
                }}
              >
                <Spin indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />} />
                <div style={{ textAlign: 'center' }}>
                  <Text type="secondary" style={{ fontSize: token.fontSize }}>
                    Đang xử lý âm thanh...
                  </Text>
                  {expectedLatencyMs && (
                    <div>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        Thời gian chờ: {formatLatency(expectedLatencyMs)}
                      </Text>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* Streaming interim text */}
            {interimText && (
              <Text
                style={{
                  fontSize: token.fontSizeLG,
                  lineHeight: 1.8,
                  color: token.colorTextSecondary,
                  fontStyle: 'italic',
                  opacity: 0.8,
                }}
              >
                {interimText}
                {/* Blinking cursor */}
                <span
                  style={{
                    display: 'inline-block',
                    width: 2,
                    height: '1em',
                    backgroundColor: token.colorPrimary,
                    marginLeft: 2,
                    verticalAlign: 'text-bottom',
                    animation: 'blink 1s step-end infinite',
                  }}
                />
              </Text>
            )}
          </div>
        )}
      </div>

      {/* CSS for animations */}
      <style>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.5;
            transform: scale(0.9);
          }
        }
        
        @keyframes blink {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0;
          }
        }
        
        .transcript-display .ant-card-body {
          height: 100%;
        }
      `}</style>
    </Card>
  )
}
