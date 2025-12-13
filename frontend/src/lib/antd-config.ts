import type { ThemeConfig } from 'antd'

// Re-export ThemeConfig for use in other files
export type { ThemeConfig }

/**
 * Ant Design 6.0 Theme Configuration
 * - CSS-in-JS with design tokens
 * - Light mode only
 * - Component-level customization
 */

// Light theme configuration
export const lightTheme: ThemeConfig = {
  token: {
    // Primary color - blue
    colorPrimary: '#1677ff',
    
    // Border radius
    borderRadius: 6,
    
    // Font settings
    fontSize: 14,
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif",
    
    // Control height
    controlHeight: 32,
  },
  components: {
    Button: {
      algorithm: true, // Enable algorithm for derived colors
    },
    Input: {
      algorithm: true,
    },
    Select: {
      algorithm: true,
    },
    Menu: {
      algorithm: true,
    },
  },
}

// Export default theme
export const defaultTheme = lightTheme
