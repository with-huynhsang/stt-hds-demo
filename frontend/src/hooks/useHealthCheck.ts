import { useQuery } from '@tanstack/react-query'
import { healthCheckOptions } from '@/client/@tanstack/react-query.gen'

export interface UseHealthCheckOptions {
  /** Whether to enable the query */
  enabled?: boolean
  /** Refetch interval in milliseconds (default: 30000 = 30 seconds) */
  refetchInterval?: number
}

/**
 * Custom hook for checking backend health status
 * Uses TanStack Query with auto-generated options from Hey-API
 * 
 * @example
 * ```tsx
 * const { isHealthy, isChecking, error } = useHealthCheck({
 *   refetchInterval: 60000 // Check every minute
 * })
 * 
 * if (!isHealthy) {
 *   return <ServerOfflineIndicator />
 * }
 * ```
 */
export function useHealthCheck(options: UseHealthCheckOptions = {}) {
  const { enabled = true, refetchInterval = 30000 } = options

  const query = useQuery({
    ...healthCheckOptions(),
    enabled,
    staleTime: 10000, // 10 seconds
    refetchInterval: refetchInterval > 0 ? refetchInterval : undefined,
    refetchOnWindowFocus: true,
    retry: 2,
    retryDelay: 1000,
  })

  return {
    // Data
    isHealthy: query.isSuccess,
    
    // Query states
    isChecking: query.isLoading || query.isFetching,
    isError: query.isError,
    error: query.error,
    
    // Actions
    refetch: query.refetch,
  }
}
