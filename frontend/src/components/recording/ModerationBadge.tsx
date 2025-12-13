import { Tag, Tooltip, theme } from 'antd'
import {
  CheckCircleOutlined,
  WarningOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons'

/**
 * Label types from ViSoBERT-HSD model.
 */
export type ModerationLabel = 'CLEAN' | 'OFFENSIVE' | 'HATE'

export interface ModerationBadgeProps {
  /** The moderation label (CLEAN, OFFENSIVE, or HATE) */
  label: ModerationLabel
  /** Confidence score from 0.0 to 1.0 */
  confidence: number
  /** Display size */
  size?: 'small' | 'default'
  /** Show confidence percentage in badge */
  showConfidence?: boolean
  /** Detected keywords from ViSoBERT-HSD-Span */
  detectedKeywords?: string[]
}

/**
 * Configuration for each label type.
 */
const labelConfig = {
  CLEAN: {
    color: 'success',
    icon: <CheckCircleOutlined />,
    text: 'An toàn',
    textEn: 'Safe',
  },
  OFFENSIVE: {
    color: 'warning',
    icon: <WarningOutlined />,
    text: 'Không phù hợp',
    textEn: 'Offensive',
  },
  HATE: {
    color: 'error',
    icon: <CloseCircleOutlined />,
    text: 'Vi phạm',
    textEn: 'Hate Speech',
  },
} as const

/**
 * Badge component to display content moderation labels.
 * 
 * Shows a colored tag with icon indicating the moderation result:
 * - CLEAN (green): No harmful content
 * - OFFENSIVE (orange): Offensive/vulgar language
 * - HATE (red): Hate speech detected
 * 
 * @example
 * ```tsx
 * <ModerationBadge label="CLEAN" confidence={0.95} />
 * <ModerationBadge label="OFFENSIVE" confidence={0.82} size="default" />
 * <ModerationBadge label="HATE" confidence={0.91} showConfidence detectedKeywords={['từ khóa']} />
 * ```
 */
export function ModerationBadge({
  label,
  confidence,
  size = 'small',
  showConfidence = false,
  detectedKeywords = [],
}: ModerationBadgeProps) {
  const { token } = theme.useToken()
  const config = labelConfig[label]
  const percentText = `${(confidence * 100).toFixed(1)}%`
  const hasKeywords = detectedKeywords.length > 0

  const displayText = size === 'default' 
    ? config.text 
    : showConfidence 
      ? `${label} ${percentText}` 
      : label

  return (
    <Tooltip 
      title={
        <span>
          {config.text} ({config.textEn})
          <br />
          Độ tin cậy: {percentText}
          {hasKeywords && (
            <>
              <br />
              <br />
              <strong>Từ khóa phát hiện:</strong>
              <br />
              {detectedKeywords.map((keyword, index) => (
                <Tag 
                  key={index} 
                  color="warning" 
                  style={{ 
                    margin: '2px 4px 2px 0',
                    fontSize: token.fontSizeSM,
                  }}
                >
                  {keyword}
                </Tag>
              ))}
            </>
          )}
        </span>
      }
    >
      <Tag
        color={config.color}
        icon={config.icon}
        style={{
          marginLeft: token.marginXXS,
          fontSize: size === 'small' ? token.fontSizeSM : token.fontSize,
          cursor: 'help',
        }}
      >
        {displayText}
        {hasKeywords && size === 'default' && (
          <span style={{ marginLeft: 4, opacity: 0.8 }}>
            ({detectedKeywords.length})
          </span>
        )}
      </Tag>
    </Tooltip>
  )
}
