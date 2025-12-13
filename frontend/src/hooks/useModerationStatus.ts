import { useQuery } from '@tanstack/react-query'
import { getModerationStatusOptions } from '@/client/@tanstack/react-query.gen'

/**
 * Options for useModerationStatus hook.
 */
export interface UseModerationStatusOptions {
  /**
   * Whether the query should be enabled.
   * @default true
   */
  enabled?: boolean
  /**
   * Polling interval in milliseconds. Set to 0 to disable polling.
   * @default 0
   */
  refetchInterval?: number
}

/**
 * Hook to get the current status of content moderation.
 * 
 * Uses unified span detector (ViSoBERT-HSD-Span) for both span detection and label inference.
 * 
 * @example
 * ```tsx
 * const { isEnabled, isSpanDetectorActive, isLoading } = useModerationStatus()
 * 
 * // With polling (useful when detector is loading)
 * const { isEnabled, isLoading, refetch } = useModerationStatus({
 *   refetchInterval: 1000, // Poll every second
 * })
 * ```
 */
export function useModerationStatus(options: UseModerationStatusOptions = {}) {
  const { enabled = true, refetchInterval = 0 } = options

  const query = useQuery({
    ...getModerationStatusOptions(),
    enabled,
    refetchInterval: refetchInterval > 0 ? refetchInterval : undefined,
  })

  return {
    /** The full status object from the API */
    status: query.data,
    /** Whether content moderation is currently enabled */
    isEnabled: query.data?.enabled ?? false,
    /** Whether the span detector model is loaded and ready */
    isSpanDetectorActive: query.data?.span_detector_active ?? false,
    /** Moderation configuration */
    config: query.data?.config ?? null,
    /** Whether the query is loading */
    isLoading: query.isLoading,
    /** Whether the query is fetching (including background refetch) */
    isFetching: query.isFetching,
    /** Query error (if any) */
    error: query.error,
    /** Refetch function */
    refetch: query.refetch,
  }
}
