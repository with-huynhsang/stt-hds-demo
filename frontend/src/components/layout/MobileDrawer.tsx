import { Drawer, Menu, Flex, Typography, theme } from 'antd'
import type { MenuProps } from 'antd'
import {
  AudioOutlined,
  HistoryOutlined,
  CloseOutlined,
} from '@ant-design/icons'
import { useNavigate, useLocation } from '@tanstack/react-router'

const { Text } = Typography

interface MobileDrawerProps {
  open: boolean
  onClose: () => void
}

type MenuItem = Required<MenuProps>['items'][number]

const menuItems: MenuItem[] = [
  {
    key: '/',
    icon: <AudioOutlined />,
    label: 'Ghi âm',
  },
  {
    key: '/history',
    icon: <HistoryOutlined />,
    label: 'Lịch sử',
  },
]

/**
 * Mobile navigation drawer
 * Used on screens smaller than lg breakpoint (992px)
 * 
 * @example
 * ```tsx
 * <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
 * ```
 */
export function MobileDrawer({ open, onClose }: MobileDrawerProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { token } = theme.useToken()

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    navigate({ to: key })
    onClose()
  }

  return (
    <Drawer
      title={
        <Flex align="center" gap={8}>
          <AudioOutlined style={{ fontSize: 20, color: token.colorPrimary }} />
          <Text strong>Voice2Text</Text>
        </Flex>
      }
      placement="left"
      onClose={onClose}
      open={open}
      size="default"
      closeIcon={<CloseOutlined />}
      styles={{
        body: { padding: 0 },
      }}
    >
      {/* Navigation Menu */}
      <Menu
        mode="inline"
        selectedKeys={[location.pathname]}
        items={menuItems}
        onClick={handleMenuClick}
        style={{ border: 'none' }}
      />
    </Drawer>
  )
}
