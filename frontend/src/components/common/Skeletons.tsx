import { Skeleton, Card, Flex, Space } from 'antd'

/**
 * Skeleton for Recording page
 * Shows placeholder for record button and transcript area
 */
export function RecordingSkeleton() {
  return (
    <Flex vertical gap="large" align="center" style={{ padding: '32px 0' }}>
      {/* Header skeleton */}
      <Flex justify="space-between" align="center" style={{ width: '100%' }}>
        <Space orientation="vertical" size="small">
          <Skeleton.Input active style={{ width: 200, height: 32 }} />
          <Skeleton.Input active style={{ width: 120, height: 20 }} size="small" />
        </Space>
        <Skeleton.Button active style={{ width: 100 }} />
      </Flex>

      {/* Record button skeleton */}
      <Skeleton.Avatar active size={120} shape="circle" />
      
      {/* Status text */}
      <Skeleton.Input active style={{ width: 180 }} size="small" />
      
      {/* Waveform skeleton */}
      <Skeleton.Input active style={{ width: '100%', maxWidth: 500, height: 48 }} />

      {/* Transcript card skeleton */}
      <Card style={{ width: '100%', maxWidth: 800 }}>
        <Skeleton.Input active style={{ width: 150, marginBottom: 16 }} />
        <Skeleton active paragraph={{ rows: 4 }} />
      </Card>
    </Flex>
  )
}

/**
 * Skeleton for History list item
 */
export function HistoryItemSkeleton() {
  return (
    <Card size="small" style={{ marginBottom: 8 }}>
      <Flex justify="space-between" align="center" style={{ marginBottom: 8 }}>
        <Space>
          <Skeleton.Button active size="small" style={{ width: 80 }} />
          <Skeleton.Button active size="small" style={{ width: 60 }} />
        </Space>
        <Space>
          <Skeleton.Input active size="small" style={{ width: 80 }} />
          <Skeleton.Button active size="small" shape="circle" />
        </Space>
      </Flex>
      <Skeleton active paragraph={{ rows: 2 }} title={false} />
      <Skeleton.Input active size="small" style={{ width: 100, marginTop: 8 }} />
    </Card>
  )
}

/**
 * Skeleton for History page
 * Shows filter bar + list placeholders
 */
export function HistorySkeleton() {
  return (
    <Flex vertical gap="middle">
      {/* Header */}
      <Flex justify="space-between" align="center">
        <Space orientation="vertical" size="small">
          <Skeleton.Input active style={{ width: 200, height: 32 }} />
          <Skeleton.Input active style={{ width: 250, height: 20 }} size="small" />
        </Space>
        <Skeleton.Button active style={{ width: 80 }} />
      </Flex>

      {/* Filters skeleton */}
      <Card size="small">
        <Flex gap="small" wrap="wrap">
          <Skeleton.Input active style={{ width: 250 }} />
          <Skeleton.Input active style={{ width: 180 }} />
          <Skeleton.Input active style={{ width: 250 }} />
        </Flex>
      </Card>

      {/* List skeleton */}
      <Card>
        {Array.from({ length: 5 }).map((_, index) => (
          <HistoryItemSkeleton key={index} />
        ))}
      </Card>
    </Flex>
  )
}

/**
 * Skeleton for sidebar/navigation
 */
export function SidebarSkeleton() {
  return (
    <Flex vertical gap="middle" style={{ padding: 16 }}>
      {/* Logo */}
      <Skeleton.Avatar active size={40} />
      
      {/* Menu items */}
      <Space orientation="vertical" style={{ width: '100%' }}>
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton.Button 
            key={index} 
            active 
            block 
            style={{ height: 40 }} 
          />
        ))}
      </Space>

      {/* Model selector */}
      <Skeleton.Input active style={{ width: '100%' }} />
      
      {/* Theme toggle */}
      <Skeleton.Button active style={{ width: 60 }} />
    </Flex>
  )
}

/**
 * Full page loading skeleton
 */
export function PageLoadingSkeleton() {
  return (
    <Flex 
      justify="center" 
      align="center" 
      style={{ 
        height: '100vh', 
        width: '100%' 
      }}
    >
      <Skeleton.Avatar active size={64} shape="circle" />
    </Flex>
  )
}
