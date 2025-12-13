import { defineConfig } from '@hey-api/openapi-ts'

export default defineConfig({
  input: 'http://localhost:8000/openapi.json',
  output: {
    path: 'src/client',
    format: 'prettier',
  },
  plugins: [
    '@hey-api/client-fetch',
    '@hey-api/typescript',
    {
      name: '@hey-api/sdk',
      validator: true,
    },
    // Zod 4 (default, no compatibilityVersion needed)
    'zod',
    {
      name: '@tanstack/react-query',
      queryOptions: true,
      infiniteQueryOptions: true,
    },
  ],
})
