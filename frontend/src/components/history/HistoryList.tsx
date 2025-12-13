import { List, Pagination, Empty, Flex, Typography } from 'antd'
import { HistoryOutlined } from '@ant-design/icons'
import type { TranscriptionLog } from '@/client/types.gen'
import { HistoryItem } from './HistoryItem'
import { HistoryItemSkeleton } from '@/components/common'

const { Text } = Typography

export interface HistoryListProps {
  data?: TranscriptionLog[]
  loading?: boolean
  page: number
  pageSize: number
  onPageChange: (page: number, pageSize: number) => void
  onItemClick?: (item: TranscriptionLog) => void
}

/**
 * History list component with pagination
 * Displays transcription history items in a list format
 * 
 * @example
 * ```tsx
 * <HistoryList
 *   data={historyData}
 *   loading={isLoading}
 *   page={currentPage}
 *   pageSize={10}
 *   onPageChange={(page, size) => setPage(page)}
 * />
 * ```
 */
export function HistoryList({
  data,
  loading = false,
  page,
  pageSize,
  onPageChange,
  onItemClick,
}: HistoryListProps) {
  // Loading skeleton
  if (loading && !data) {
    return (
      <Flex vertical gap="middle">
        {Array.from({ length: 5 }).map((_, index) => (
          <HistoryItemSkeleton key={index} />
        ))}
      </Flex>
    )
  }

  // Empty state
  if (!data || data.length === 0) {
    return (
      <Empty
        image={<HistoryOutlined style={{ fontSize: 64, color: '#d9d9d9' }} />}
        description={
          <Flex vertical gap="small" align="center">
            <Text type="secondary">Chưa có lịch sử ghi âm nào</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Bắt đầu ghi âm để xem lịch sử tại đây
            </Text>
          </Flex>
        }
        style={{ 
          padding: '60px 0',
        }}
      />
    )
  }

  return (
    <Flex vertical gap="middle">
      {/* List items */}
      <List
        dataSource={data}
        loading={loading}
        renderItem={(item) => (
          <List.Item style={{ padding: '8px 0', border: 'none' }}>
            <div style={{ width: '100%' }}>
              <HistoryItem
                item={item}
                onClick={onItemClick ? () => onItemClick(item) : undefined}
              />
            </div>
          </List.Item>
        )}
        split={false}
      />

      {/* Pagination */}
      {data.length > 0 && (
        <Flex justify="center" style={{ marginTop: 16 }}>
          <Pagination
            current={page}
            pageSize={pageSize}
            total={data.length >= pageSize ? page * pageSize + pageSize : page * pageSize}
            onChange={onPageChange}
            showSizeChanger
            showQuickJumper
            pageSizeOptions={[5, 10, 20, 50]}
            showTotal={(total, range) => 
              `${range[0]}-${range[1]} của ${total} kết quả`
            }
          />
        </Flex>
      )}
    </Flex>
  )
}
