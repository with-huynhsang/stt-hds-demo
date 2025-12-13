import { useState } from 'react'
import { Layout, Menu, Flex, Typography, theme, Grid, Button } from 'antd'
import type { MenuProps } from 'antd'
import {
  AudioOutlined,
  HistoryOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MenuOutlined,
} from '@ant-design/icons'
import { useNavigate, useLocation } from '@tanstack/react-router'
import { MobileDrawer } from './MobileDrawer'
import { ServerStatus } from '@/components/common'

const { Sider, Content, Header } = Layout
const { Text } = Typography
const { useToken } = theme
const { useBreakpoint } = Grid

interface AppLayoutProps {
  children: React.ReactNode
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

export function AppLayout({ children }: AppLayoutProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const { token } = useToken()
  const screens = useBreakpoint()
  
  // Check if on mobile (smaller than lg breakpoint - 992px)
  const isMobile = !screens.lg

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    navigate({ to: key })
    if (isMobile) {
      setMobileDrawerOpen(false)
    }
  }

  const handleBreakpoint = (broken: boolean) => {
    setCollapsed(broken)
  }

  // Mobile Layout with Header + Drawer
  if (isMobile) {
    return (
      <Layout style={{ minHeight: '100vh', background: token.colorBgLayout }}>
        {/* Mobile Header */}
        <Header
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 10,
            width: '100%',
            padding: '0 16px',
            background: token.colorBgContainer,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: 56,
          }}
        >
          <Button
            type="text"
            icon={<MenuOutlined />}
            onClick={() => setMobileDrawerOpen(true)}
            aria-label="Mở menu"
          />
          <Flex align="center" gap={8}>
            <AudioOutlined style={{ fontSize: 20, color: token.colorPrimary }} />
            <Text strong style={{ fontSize: 16 }}>Voice2Text</Text>
          </Flex>
          <ServerStatus size="small" />
        </Header>

        {/* Mobile Drawer */}
        <MobileDrawer
          open={mobileDrawerOpen}
          onClose={() => setMobileDrawerOpen(false)}
        />

        {/* Mobile Content */}
        <Content
          style={{
            padding: token.padding,
            minHeight: 'calc(100vh - 56px)',
            background: token.colorBgLayout,
          }}
        >
          {children}
        </Content>
      </Layout>
    )
  }

  // Desktop Layout with Sidebar
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        breakpoint="lg"
        onBreakpoint={handleBreakpoint}
        trigger={null}
        width={200}
        collapsedWidth={72}
        style={{
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          height: '100vh',
          background: token.colorBgContainer,
          borderRight: `1px solid ${token.colorBorderSecondary}`,
          overflow: 'auto',
          zIndex: 10,
        }}
      >
        {/* Logo / App Title */}
        <Flex
          align="center"
          justify={collapsed ? 'center' : 'flex-start'}
          gap={10}
          style={{ 
            height: 64, 
            padding: collapsed ? 0 : '0 20px',
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          <AudioOutlined style={{ fontSize: 24, color: token.colorPrimary }} />
          {!collapsed && (
            <Text strong style={{ fontSize: 16, color: token.colorText }}>
              Voice2Text
            </Text>
          )}
        </Flex>

        {/* Navigation Menu */}
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={handleMenuClick}
          style={{ 
            border: 'none',
            marginTop: 8,
            background: 'transparent',
          }}
        />

        {/* Collapse Toggle Button at Bottom */}
        <Flex
          vertical
          gap={12}
          style={{
            position: 'absolute',
            bottom: 16,
            left: 0,
            right: 0,
            padding: '0 16px',
          }}
        >
          {/* Server Status */}
          <Flex justify="center">
            <ServerStatus showLabel={!collapsed} size="small" />
          </Flex>
          
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            style={{ 
              width: '100%',
              color: token.colorTextSecondary,
            }}
          >
            {!collapsed && 'Thu gọn'}
          </Button>
        </Flex>
      </Sider>

      {/* Main Content */}
      <Layout
        style={{
          marginLeft: collapsed ? 72 : 200,
          transition: 'margin-left 0.2s',
          background: token.colorBgLayout,
        }}
      >
        <Content 
          style={{
            padding: 24,
            minHeight: '100vh',
            background: token.colorBgLayout,
          }}
        >
          {children}
        </Content>
      </Layout>
    </Layout>
  )
}
