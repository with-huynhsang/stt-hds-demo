import { useQuery } from '@tanstack/react-query'
import { getHistoryOptions } from '@/client/@tanstack/react-query.gen'
import type { TranscriptionLog } from '@/client/types.gen'

export interface HistoryFilters {
  search?: string
  model?: string
  startDate?: string
  endDate?: string
  page?: number
  limit?: number
}

export interface UseHistoryOptions {
  filters?: HistoryFilters
  enabled?: boolean
}

/**
 * Custom hook for fetching transcription history with filters
 * Uses TanStack Query for caching and automatic refetching
 * 
 * @example
 * ```tsx
 * const { data, isLoading, error } = useHistory({
 *   filters: { model: 'zipformer', page: 1, limit: 10 }
 * })
 * ```
 */
export function useHistory(options: UseHistoryOptions = {}) {
  const { filters = {}, enabled = true } = options

  const queryOptions = getHistoryOptions({
    query: {
      page: filters.page ?? 1,
      limit: filters.limit ?? 10,
      search: filters.search || undefined,
      model: filters.model || undefined,
      start_date: filters.startDate || undefined,
      end_date: filters.endDate || undefined,
    },
  })

  const query = useQuery({
    ...queryOptions,
    enabled,
    staleTime: 30000, // 30 seconds
    refetchOnWindowFocus: false,
  })

  return {
    // Data
    data: query.data as TranscriptionLog[] | undefined,
    
    // Query states
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    
    // Actions
    refetch: query.refetch,
  }
}
