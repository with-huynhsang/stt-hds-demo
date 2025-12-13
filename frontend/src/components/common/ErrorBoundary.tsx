import { Component, type ReactNode } from 'react'
import { Result, Button, Typography } from 'antd'
import { WarningOutlined } from '@ant-design/icons'

const { Paragraph, Text } = Typography

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: React.ErrorInfo | null
}

/**
 * Error Boundary component to catch JavaScript errors anywhere in child component tree.
 * Displays a fallback UI instead of crashing the whole app.
 * 
 * Usage:
 * ```tsx
 * <ErrorBoundary>
 *   <App />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Update state so the next render shows the fallback UI
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error to console (or send to error reporting service)
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    this.setState({ errorInfo })
  }

  handleReload = () => {
    window.location.reload()
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    })
  }

  render() {
    const { hasError, error, errorInfo } = this.state
    const { children, fallback } = this.props

    if (hasError) {
      // Custom fallback provided
      if (fallback) {
        return fallback
      }

      // Default fallback UI
      return (
        <div className="min-h-screen flex items-center justify-center p-8">
          <Result
            status="error"
            icon={<WarningOutlined />}
            title="Đã xảy ra lỗi"
            subTitle="Ứng dụng đã gặp sự cố. Vui lòng thử lại hoặc liên hệ hỗ trợ."
            extra={[
              <Button type="primary" key="reload" onClick={this.handleReload}>
                Tải lại trang
              </Button>,
              <Button key="reset" onClick={this.handleReset}>
                Thử lại
              </Button>,
            ]}
          >
            {import.meta.env.DEV && error && (
              <div className="mt-4 text-left">
                <Paragraph>
                  <Text strong className="text-red-500">
                    {error.name}: {error.message}
                  </Text>
                </Paragraph>
                {errorInfo && (
                  <Paragraph>
                    <pre className="text-xs bg-gray-100 dark:bg-gray-800 p-4 rounded overflow-auto max-h-48">
                      {errorInfo.componentStack}
                    </pre>
                  </Paragraph>
                )}
              </div>
            )}
          </Result>
        </div>
      )
    }

    return children
  }
}
