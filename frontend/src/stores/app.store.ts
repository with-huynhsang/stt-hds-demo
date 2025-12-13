import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'

export type ModelId = 'zipformer'

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'

interface AppState {
  // Selected model
  selectedModel: ModelId
  setSelectedModel: (model: ModelId) => void

  // Selected audio device
  selectedDeviceId: string
  setSelectedDeviceId: (deviceId: string) => void

  // Recording state
  isRecording: boolean
  setIsRecording: (isRecording: boolean) => void

  // WebSocket connection state
  connectionState: ConnectionState
  setConnectionState: (state: ConnectionState) => void

  // Current transcription session
  sessionId: string | null
  setSessionId: (sessionId: string | null) => void

  // Current transcript text
  currentTranscript: string
  setCurrentTranscript: (text: string) => void
  appendTranscript: (text: string) => void
  clearTranscript: () => void

  // Interim text (not finalized)
  interimText: string
  setInterimText: (text: string) => void

  // Error state
  error: string | null
  setError: (error: string | null) => void
  clearError: () => void

  // Sidebar collapsed state
  sidebarCollapsed: boolean
  setSidebarCollapsed: (collapsed: boolean) => void

  // Content moderation state
  moderationEnabled: boolean
  setModerationEnabled: (enabled: boolean) => void
}

export const useAppStore = create<AppState>()(
  devtools(
    persist(
      (set) => ({
        // Default values
        selectedModel: 'zipformer',
        setSelectedModel: (model) => set({ selectedModel: model }),

        selectedDeviceId: '',
        setSelectedDeviceId: (deviceId) => set({ selectedDeviceId: deviceId }),

        isRecording: false,
        setIsRecording: (isRecording) => set({ isRecording }),

        connectionState: 'disconnected',
        setConnectionState: (connectionState) => set({ connectionState }),

        sessionId: null,
        setSessionId: (sessionId) => set({ sessionId }),

        currentTranscript: '',
        setCurrentTranscript: (text) => set({ currentTranscript: text }),
        appendTranscript: (text) =>
          set((state) => ({
            currentTranscript: state.currentTranscript 
              ? `${state.currentTranscript} ${text}`
              : text,
          })),
        clearTranscript: () => set({ currentTranscript: '', interimText: '' }),

        interimText: '',
        setInterimText: (interimText) => set({ interimText }),

        error: null,
        setError: (error) => set({ error }),
        clearError: () => set({ error: null }),

        sidebarCollapsed: false,
        setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),

        moderationEnabled: false,
        setModerationEnabled: (moderationEnabled) => set({ moderationEnabled }),
      }),
      {
        name: 'voice2text-storage',
        partialize: (state) => ({
          selectedModel: state.selectedModel,
          sidebarCollapsed: state.sidebarCollapsed,
          selectedDeviceId: state.selectedDeviceId,
          moderationEnabled: state.moderationEnabled,
        }),
      }
    )
  )
)
