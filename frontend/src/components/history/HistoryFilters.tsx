import { Input, Select, DatePicker, Button, Flex } from 'antd'
import { SearchOutlined, FilterOutlined, ClearOutlined } from '@ant-design/icons'
import type { Dayjs } from 'dayjs'
import { useModels } from '@/hooks'
import { useMemo } from 'react'

const { RangePicker } = DatePicker

export interface HistoryFiltersValue {
  search?: string
  model?: string
  dateRange?: [Dayjs, Dayjs] | null
}

export interface HistoryFiltersProps {
  value: HistoryFiltersValue
  onChange: (value: HistoryFiltersValue) => void
  onClear: () => void
  loading?: boolean
}

/**
 * Filters component for history list
 * Includes search input, model select, and date range picker
 * 
 * @example
 * ```tsx
 * <HistoryFilters
 *   value={filters}
 *   onChange={setFilters}
 *   onClear={handleClear}
 * />
 * ```
 */
export function HistoryFilters({
  value,
  onChange,
  onClear,
  loading = false,
}: HistoryFiltersProps) {
  // Fetch models from API
  const { models, isLoading: isLoadingModels } = useModels()
  
  // Build model options dynamically from API
  const modelOptions = useMemo(() => {
    const options = [{ value: '', label: 'Tất cả models' }]
    if (models) {
      models.forEach(model => {
        options.push({ value: model.id, label: model.name })
      })
    }
    return options
  }, [models])
  const handleSearchChange = (search: string) => {
    onChange({ ...value, search })
  }

  const handleModelChange = (model: string) => {
    onChange({ ...value, model })
  }

  const handleDateRangeChange = (dateRange: [Dayjs, Dayjs] | null) => {
    onChange({ ...value, dateRange })
  }

  const hasFilters = Boolean(value.search || value.model || value.dateRange)

  return (
    <Flex wrap="wrap" gap="small" align="center">
      {/* Search Input */}
      <Input
        placeholder="Tìm kiếm nội dung..."
        prefix={<SearchOutlined />}
        value={value.search || ''}
        onChange={(e) => handleSearchChange(e.target.value)}
        allowClear
        style={{ width: 250 }}
        disabled={loading}
      />

      {/* Model Filter */}
      <Select
        placeholder="Chọn model"
        value={value.model || ''}
        onChange={handleModelChange}
        options={modelOptions}
        style={{ width: 180 }}
        suffixIcon={<FilterOutlined />}
        disabled={loading}
        loading={isLoadingModels}
      />

      {/* Date Range Picker */}
      <RangePicker
        value={value.dateRange}
        onChange={(dates) => handleDateRangeChange(dates as [Dayjs, Dayjs] | null)}
        placeholder={['Từ ngày', 'Đến ngày']}
        format="DD/MM/YYYY"
        disabled={loading}
        allowClear
      />

      {/* Clear Filters Button */}
      {hasFilters && (
        <Button 
          icon={<ClearOutlined />} 
          onClick={onClear}
          disabled={loading}
        >
          Xóa bộ lọc
        </Button>
      )}
    </Flex>
  )
}
