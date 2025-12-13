import type { ReactNode } from 'react'
import { ConfigProvider, App } from 'antd'
import type { MessageInstance } from 'antd/es/message/interface'
import type { NotificationInstance } from 'antd/es/notification/interface'
import type { ModalStaticFunctions } from 'antd/es/modal/confirm'
import enUS from 'antd/locale/en_US'
import viVN from 'antd/locale/vi_VN'
import { defaultTheme, type ThemeConfig } from './antd-config'

interface AntdProviderProps {
  children: ReactNode
  locale?: 'en' | 'vi'
  theme?: ThemeConfig
}

/**
 * Ant Design Provider
 * - ConfigProvider: Global theme & locale configuration
 * - App component: Context for message, notification, modal static methods
 * 
 * Usage:
 * ```tsx
 * import { App } from 'antd'
 * 
 * function MyComponent() {
 *   const { message, notification, modal } = App.useApp()
 *   
 *   const handleClick = () => {
 *     message.success('Hello!')
 *     notification.info({ message: 'Info', description: 'Description' })
 *     modal.confirm({ title: 'Confirm?', content: 'Are you sure?' })
 *   }
 * }
 * ```
 */

// Static instances for use outside of React components
let staticMessage: MessageInstance
let staticNotification: NotificationInstance
let staticModal: Omit<ModalStaticFunctions, 'warn'>

export function getStaticInstance() {
  return { message: staticMessage, notification: staticNotification, modal: staticModal }
}

function StaticInstanceProvider({ children }: { children: ReactNode }) {
  const { message, notification, modal } = App.useApp()
  staticMessage = message
  staticNotification = notification
  staticModal = modal
  return <>{children}</>
}

export function AntdProvider({ 
  children, 
  locale = 'vi',
  theme: customTheme 
}: AntdProviderProps) {
  const currentTheme = customTheme ?? defaultTheme
  const currentLocale = locale === 'vi' ? viVN : enUS

  return (
    <ConfigProvider
      theme={currentTheme}
      locale={currentLocale}
      componentSize="middle"
    >
      <App
        message={{
          maxCount: 3,
          duration: 3,
        }}
        notification={{
          placement: 'topRight',
          duration: 4,
          maxCount: 3,
        }}
      >
        <StaticInstanceProvider>
          {children}
        </StaticInstanceProvider>
      </App>
    </ConfigProvider>
  )
}

export { App }
export type { ThemeConfig }
