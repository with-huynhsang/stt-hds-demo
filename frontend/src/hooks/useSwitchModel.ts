import { useMutation, useQueryClient } from '@tanstack/react-query'
import { switchModelMutation, getModelStatusQueryKey } from '@/client/@tanstack/react-query.gen'
import type { SwitchModelResponse } from '@/client/types.gen'

export type ModelId = 'zipformer'

export interface UseSwitchModelOptions {
  /** Callback when model switch is successful */
  onSuccess?: (data: SwitchModelResponse) => void
  /** Callback when model switch fails */
  onError?: (error: Error) => void
}

/**
 * Custom hook for switching the active model
 * Uses TanStack Query mutation with auto-generated options from Hey-API
 * 
 * @example
 * ```tsx
 * const { switchModel, isSwitching } = useSwitchModel({
 *   onSuccess: (data) => {
 *     message.success(`Switched to ${data.current_model}`)
 *   },
 *   onError: (error) => {
 *     message.error(`Failed to switch: ${error.message}`)
 *   }
 * })
 * 
 * const handleModelChange = (modelId: ModelId) => {
 *   switchModel(modelId)
 * }
 * ```
 */
export function useSwitchModel(options: UseSwitchModelOptions = {}) {
  const { onSuccess, onError } = options
  const queryClient = useQueryClient()

  const mutation = useMutation({
    ...switchModelMutation(),
    onSuccess: (data) => {
      // Invalidate model status query to refetch
      queryClient.invalidateQueries({
        queryKey: getModelStatusQueryKey(),
      })
      
      onSuccess?.(data as SwitchModelResponse)
    },
    onError: (error) => {
      onError?.(error as Error)
    },
  })

  return {
    // Actions
    switchModel: (modelId: ModelId) => {
      mutation.mutate({
        query: { model: modelId },
      })
    },
    
    // Async version for await
    switchModelAsync: async (modelId: ModelId) => {
      return mutation.mutateAsync({
        query: { model: modelId },
      })
    },
    
    // Mutation states
    isSwitching: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
    
    // Response data from last successful switch
    data: mutation.data as SwitchModelResponse | undefined,
    
    // Reset mutation state
    reset: mutation.reset,
  }
}
