import { memo, useMemo } from 'react'
import { Tooltip, theme } from 'antd'

export interface KeywordHighlightProps {
  /** Text content to highlight */
  text: string
  /** Keywords to highlight */
  keywords: string[]
  /** Maximum text length (for preview, will truncate with ...) */
  maxLength?: number
  /** Whether to show tooltip on keywords */
  showTooltip?: boolean
  /** Additional CSS class name */
  className?: string
}

/**
 * Escapes special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Truncates text to specified length, adding ellipsis if needed.
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength) + '...'
}

/**
 * Highlights detected keywords in text content.
 * Uses soft background color from Ant Design theme tokens to mark keywords.
 * 
 * Features:
 * - Case-insensitive keyword matching
 * - Vietnamese text support
 * - Optional tooltip on highlighted keywords
 * - Text truncation for preview mode
 * 
 * @example
 * ```tsx
 * <KeywordHighlight 
 *   text="This is some offensive text here"
 *   keywords={["offensive"]}
 * />
 * 
 * <KeywordHighlight 
 *   text={longText}
 *   keywords={["keyword1", "keyword2"]}
 *   maxLength={200}
 *   showTooltip={false}
 * />
 * ```
 */
export const KeywordHighlight = memo(function KeywordHighlight({
  text,
  keywords,
  maxLength,
  showTooltip = true,
  className,
}: KeywordHighlightProps) {
  const { token } = theme.useToken()

  // Memoize the highlighted parts to avoid recalculating on every render
  const highlightedContent = useMemo(() => {
    // If no keywords, just return the text (possibly truncated)
    if (!keywords?.length || !text) {
      return <span>{maxLength ? truncate(text, maxLength) : text}</span>
    }

    // Prepare text for display
    const displayText = maxLength ? truncate(text, maxLength) : text

    // Build regex pattern for all keywords (case-insensitive, word boundaries for Vietnamese)
    // Using capturing group to keep the matched text in split result
    const pattern = new RegExp(
      `(${keywords.map(escapeRegex).join('|')})`,
      'gi'
    )

    // Split text by keywords, keeping the matched parts
    const parts = displayText.split(pattern)

    // Style for highlighted keywords
    const highlightStyle: React.CSSProperties = {
      backgroundColor: token.colorWarningBg,
      color: token.colorWarningText,
      padding: '0 3px',
      borderRadius: token.borderRadiusXS,
      fontWeight: 500,
      borderBottom: `2px solid ${token.colorWarningBorder}`,
    }

    return (
      <span className={className}>
        {parts.map((part, index) => {
          // Check if this part matches any keyword (case-insensitive)
          const isKeyword = keywords.some(
            kw => kw.toLowerCase() === part.toLowerCase()
          )

          if (isKeyword) {
            const highlightedMark = (
              <mark key={index} style={highlightStyle}>
                {part}
              </mark>
            )

            return showTooltip ? (
              <Tooltip key={index} title="Từ khóa vi phạm được phát hiện">
                {highlightedMark}
              </Tooltip>
            ) : (
              highlightedMark
            )
          }

          return <span key={index}>{part}</span>
        })}
      </span>
    )
  }, [text, keywords, maxLength, showTooltip, token, className])

  return highlightedContent
})
