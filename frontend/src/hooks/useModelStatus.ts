import { useQuery } from '@tanstack/react-query'
import { getModelStatusOptions } from '@/client/@tanstack/react-query.gen'
import type { ModelStatus } from '@/client/types.gen'

export interface UseModelStatusOptions {
  /** Whether to enable the query */
  enabled?: boolean
  /** Refetch interval in milliseconds (default: 0 = disabled) */
  refetchInterval?: number
}

/**
 * Custom hook for fetching current model status
 * Uses TanStack Query with auto-generated options from Hey-API
 * 
 * @example
 * ```tsx
 * const { status, isLoaded, currentModel } = useModelStatus({
 *   refetchInterval: 5000 // Poll every 5 seconds
 * })
 * 
 * if (!isLoaded) {
 *   return <ModelLoadingIndicator modelName={currentModel} />
 * }
 * ```
 */
export function useModelStatus(options: UseModelStatusOptions = {}) {
  const { enabled = true, refetchInterval = 0 } = options

  const query = useQuery({
    ...getModelStatusOptions(),
    enabled,
    staleTime: 10000, // 10 seconds
    refetchInterval: refetchInterval > 0 ? refetchInterval : undefined,
    refetchOnWindowFocus: true,
  })

  const data = query.data as ModelStatus | undefined

  return {
    // Data
    status: data,
    currentModel: data?.current_model ?? null,
    isLoaded: data?.is_loaded ?? false,
    statusMessage: data?.status ?? 'unknown',
    
    // Query states
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    
    // Actions
    refetch: query.refetch,
  }
}
