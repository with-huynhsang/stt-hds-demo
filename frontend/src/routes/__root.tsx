import { Suspense } from 'react'
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { AppLayout } from '@/components/layout'
import { PageLoadingSkeleton } from '@/components/common'

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  return (
    <AppLayout>
      <Suspense fallback={<PageLoadingSkeleton />}>
        <Outlet />
      </Suspense>
      {import.meta.env.DEV && <TanStackRouterDevtools />}
    </AppLayout>
  )
}
