import { createFileRoute } from '@tanstack/react-router'
import { Typography, Card, Flex, theme, App } from 'antd'
import { HistoryOutlined, ReloadOutlined } from '@ant-design/icons'
import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useHistory } from '@/hooks'
import { HistoryFilters, HistoryList } from '@/components/history'
import { NetworkError } from '@/components/common'
import type { HistoryFiltersValue } from '@/components/history'
import type { TranscriptionLog } from '@/client/types.gen'

const { Title, Text } = Typography

export const Route = createFileRoute('/history')({
  component: HistoryPage,
})

function HistoryPage() {
  const { token } = theme.useToken()
  const { message: messageApi } = App.useApp()
  
  // Pagination state
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  
  // Filter state (for input display)
  const [filters, setFilters] = useState<HistoryFiltersValue>({
    search: '',
    model: '',
    dateRange: null,
  })
  
  // Debounced search value (for API call)
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  
  // Debounce search input
  useEffect(() => {
    // Clear previous timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }
    
    // Set new timer
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedSearch(filters.search || '')
    }, 500) // 500ms debounce
    
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [filters.search])

  // Convert filters to API format (uses debounced search)
  const apiFilters = useMemo(() => {
    // Convert dateRange to ISO 8601 datetime format with timezone
    // start_date: beginning of day (00:00:00Z)
    // end_date: end of day (23:59:59Z)
    const startDate = filters.dateRange?.[0]
      ? filters.dateRange[0].startOf('day').toISOString()
      : undefined
    const endDate = filters.dateRange?.[1]
      ? filters.dateRange[1].endOf('day').toISOString()
      : undefined

    return {
      page,
      limit: pageSize,
      search: debouncedSearch || undefined,
      model: filters.model || undefined,
      startDate,
      endDate,
    }
  }, [page, pageSize, debouncedSearch, filters.model, filters.dateRange])

  // Fetch history data
  const { data, isLoading, isFetching, isError, error, refetch } = useHistory({
    filters: apiFilters,
  })
  
  // Helper to extract error message
  const getErrorMessage = useCallback((err: unknown): string => {
    if (!err) return 'Không thể tải lịch sử ghi âm'
    
    // Check if it's an Error object
    if (err instanceof Error) {
      return err.message
    }
    
    // Check if it's HttpValidationError (from Zod validation)
    if (typeof err === 'object' && err !== null) {
      const errorObj = err as Record<string, unknown>
      
      // Handle validation errors array (Zod format)
      if (Array.isArray(errorObj.detail)) {
        const validationErrors = errorObj.detail as Array<{ message?: string; path?: string[] }>
        const messages = validationErrors.map(e => {
          if (e.path?.includes('start_date') || e.path?.includes('end_date')) {
            return 'Định dạng ngày không hợp lệ'
          }
          return e.message || 'Lỗi validation'
        })
        return [...new Set(messages)].join('. ')
      }
      
      // Handle standard error format
      if (typeof errorObj.message === 'string') {
        return errorObj.message
      }
      if (typeof errorObj.detail === 'string') {
        return errorObj.detail
      }
    }
    
    return 'Không thể tải lịch sử ghi âm'
  }, [])
  
  // Show toast when error occurs
  useEffect(() => {
    if (isError && error) {
      const errorMessage = getErrorMessage(error)
      messageApi.error(errorMessage)
    }
  }, [isError, error, getErrorMessage, messageApi])
  
  // Reset to page 1 when debounced search changes
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch])

  // Handle filter changes
  const handleFilterChange = useCallback((newFilters: HistoryFiltersValue) => {
    const searchChanged = newFilters.search !== filters.search
    setFilters(newFilters)
    // Only reset page immediately for non-search filters
    // Search will reset page after debounce via useEffect above
    if (!searchChanged) {
      setPage(1)
    }
  }, [filters.search])

  // Clear all filters
  const handleClearFilters = useCallback(() => {
    setFilters({
      search: '',
      model: '',
      dateRange: null,
    })
    setDebouncedSearch('')
    setPage(1)
  }, [])

  // Handle pagination
  const handlePageChange = useCallback((newPage: number, newPageSize: number) => {
    setPage(newPage)
    setPageSize(newPageSize)
  }, [])

  // Handle item click (could open modal or navigate to detail)
  const handleItemClick = useCallback((item: TranscriptionLog) => {
    console.log('Clicked item:', item)
    // TODO: Open detail modal or navigate
  }, [])

  return (
    <main style={{ height: '100%' }}>
      {/* Header */}
      <Flex 
        justify="space-between" 
        align="center" 
        style={{ marginBottom: token.marginLG }}
      >
        <div>
          <Title level={2} style={{ margin: 0, marginBottom: token.marginXS }}>
            <HistoryOutlined style={{ marginRight: token.marginSM }} />
            Lịch sử ghi âm
          </Title>
          <Text type="secondary">
            Xem lại và tìm kiếm các bản ghi âm đã thực hiện
          </Text>
        </div>
        
        {/* Refresh button */}
        <Flex 
          align="center" 
          gap="small"
          onClick={() => refetch()}
          style={{ cursor: 'pointer' }}
        >
          <ReloadOutlined spin={isFetching} />
          <Text type="secondary" style={{ fontSize: 12 }}>
            Làm mới
          </Text>
        </Flex>
      </Flex>

      {/* Error display */}
      {isError && (
        <div style={{ marginBottom: token.marginMD }}>
          <NetworkError
            message={getErrorMessage(error)}
            onRetry={() => refetch()}
            inline
          />
        </div>
      )}

      {/* Filters */}
      <Card 
        size="small" 
        style={{ marginBottom: token.marginMD }}
        styles={{ body: { padding: token.paddingSM } }}
      >
        <HistoryFilters
          value={filters}
          onChange={handleFilterChange}
          onClear={handleClearFilters}
          loading={isLoading}
        />
      </Card>

      {/* History List */}
      <Card>
        <HistoryList
          data={data}
          loading={isLoading || isFetching}
          page={page}
          pageSize={pageSize}
          onPageChange={handlePageChange}
          onItemClick={handleItemClick}
        />
      </Card>
    </main>
  )
}
