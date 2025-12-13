import { client } from '@/client/client.gen'

// Configure the API client
export function setupApiClient() {
  client.setConfig({
    baseUrl: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  })
}

// Re-export everything from client for convenience
export * from '@/client'
export { client }
export * from '@/client/@tanstack/react-query.gen'
