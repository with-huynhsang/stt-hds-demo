import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  toggleModerationMutation,
  getModerationStatusQueryKey,
} from '@/client/@tanstack/react-query.gen'
import type { ModerationToggleResponse } from '@/client/types.gen'
import { useAppStore } from '@/stores/app.store'

/**
 * Options for useToggleModeration hook.
 */
export interface UseToggleModerationOptions {
  /**
   * Callback when toggle is successful.
   */
  onSuccess?: (data: ModerationToggleResponse) => void
  /**
   * Callback when toggle fails.
   */
  onError?: (error: Error) => void
}

/**
 * Hook to toggle content moderation on/off.
 * 
 * Automatically syncs with the app store and invalidates the status query.
 * 
 * @example
 * ```tsx
 * const { toggle, isToggling } = useToggleModeration({
 *   onSuccess: (data) => message.success(`Moderation ${data.enabled ? 'enabled' : 'disabled'}`),
 *   onError: (error) => message.error(`Failed: ${error.message}`),
 * })
 * 
 * // Toggle on
 * toggle(true)
 * 
 * // Toggle off
 * toggle(false)
 * ```
 */
export function useToggleModeration(options: UseToggleModerationOptions = {}) {
  const queryClient = useQueryClient()
  const { setModerationEnabled } = useAppStore()

  const mutation = useMutation({
    ...toggleModerationMutation(),
    onSuccess: (data) => {
      // Update local store state
      setModerationEnabled(data.enabled)

      // Invalidate status query to refetch fresh data
      queryClient.invalidateQueries({
        queryKey: getModerationStatusQueryKey(),
      })

      // Call user's onSuccess callback
      options.onSuccess?.(data)
    },
    onError: (error) => {
      options.onError?.(error as Error)
    },
  })

  return {
    /**
     * Toggle moderation on or off.
     * @param enable - Whether to enable (true) or disable (false) moderation
     */
    toggle: (enable: boolean) =>
      mutation.mutate({
        query: { enabled: enable },
      }),
    /** Whether a toggle operation is in progress */
    isToggling: mutation.isPending,
    /** Error from the last mutation (if any) */
    error: mutation.error,
    /** Whether the last mutation was successful */
    isSuccess: mutation.isSuccess,
    /** Reset mutation state */
    reset: mutation.reset,
  }
}
