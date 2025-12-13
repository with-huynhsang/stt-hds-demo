import { useQuery } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { getModelsOptions } from '@/client/@tanstack/react-query.gen'
import type { ModelInfo } from '@/client/types.gen'

export interface UseModelsOptions {
  /** Whether to enable the query */
  enabled?: boolean
}

/** Workflow type for model processing */
export type WorkflowType = 'streaming' | 'buffered'

/** Extended model option with workflow metadata */
export interface ModelOption {
  value: string
  label: string
  description: string
  workflowType: WorkflowType
  expectedLatencyMs: [number, number]
  isStreaming: boolean
}

/** Default latency values when API doesn't provide them */
const DEFAULT_LATENCY: Record<WorkflowType, [number, number]> = {
  streaming: [100, 500],
  buffered: [2000, 8000],
}

/**
 * Custom hook for fetching available STT models
 * Uses TanStack Query with auto-generated options from Hey-API
 * 
 * Now includes workflow metadata (streaming vs buffered) and expected latency
 * to help FE provide better UX for different model types.
 * 
 * @example
 * ```tsx
 * const { models, modelOptions, getModelById, isBufferedModel } = useModels()
 * 
 * // Get workflow-aware model options for Select
 * <Select options={modelOptions} />
 * 
 * // Zipformer is a streaming model
 * if (isStreamingModel('zipformer')) {
 *   // Show real-time interim text
 * }
 * ```
 */
export function useModels(options: UseModelsOptions = {}) {
  const { enabled = true } = options

  const query = useQuery({
    ...getModelsOptions(),
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes - models list rarely changes
    refetchOnWindowFocus: false,
  })

  const models = query.data as ModelInfo[] | undefined

  /**
   * Get model by ID
   */
  const getModelById = useCallback(
    (modelId: string): ModelInfo | undefined => {
      return models?.find((m) => m.id === modelId)
    },
    [models]
  )

  /**
   * Get workflow type for a model
   * - streaming: emits is_final=false frequently (Zipformer)
   */
  const getWorkflowType = useCallback(
    (modelId: string): WorkflowType => {
      const model = getModelById(modelId)
      return model?.workflow_type ?? 'streaming'
    },
    [getModelById]
  )

  /**
   * Check if model is buffered (needs special processing indicator)
   */
  const isBufferedModel = useCallback(
    (modelId: string): boolean => {
      return getWorkflowType(modelId) === 'buffered'
    },
    [getWorkflowType]
  )

  /**
   * Check if model is streaming (real-time text updates)
   */
  const isStreamingModel = useCallback(
    (modelId: string): boolean => {
      return getWorkflowType(modelId) === 'streaming'
    },
    [getWorkflowType]
  )

  /**
   * Get expected latency range in milliseconds for a model
   * Returns [minMs, maxMs] tuple
   */
  const getExpectedLatency = useCallback(
    (modelId: string): [number, number] => {
      const model = getModelById(modelId)
      if (model?.expected_latency_ms) {
        return model.expected_latency_ms
      }
      // Fallback based on workflow type
      const workflowType = getWorkflowType(modelId)
      return DEFAULT_LATENCY[workflowType]
    },
    [getModelById, getWorkflowType]
  )

  /**
   * Get recommended timeout for waiting for transcription results
   * Uses 2x max expected latency as buffer
   */
  const getRecommendedTimeout = useCallback(
    (modelId: string): number => {
      const [, maxLatency] = getExpectedLatency(modelId)
      return Math.max(maxLatency * 2, 5000) // At least 5s, or 2x max latency
    },
    [getExpectedLatency]
  )

  /**
   * Enhanced model options with workflow metadata for UI
   */
  const modelOptions = useMemo((): ModelOption[] | undefined => {
    return models?.map((model) => {
      const workflowType = model.workflow_type ?? 'streaming'
      const expectedLatencyMs = model.expected_latency_ms ?? DEFAULT_LATENCY[workflowType]
      
      return {
        value: model.id,
        label: model.name,
        description: model.description,
        workflowType,
        expectedLatencyMs,
        isStreaming: workflowType === 'streaming',
      }
    })
  }, [models])

  return {
    // Data
    models,
    
    // Enhanced model options with workflow info
    modelOptions,
    
    // Helper functions
    getModelById,
    getWorkflowType,
    isBufferedModel,
    isStreamingModel,
    getExpectedLatency,
    getRecommendedTimeout,
    
    // Query states
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    
    // Actions
    refetch: query.refetch,
  }
}
