// Hooks barrel export

// Audio & Recording
export { useAudioRecorder, type AudioRecorderState, type UseAudioRecorderOptions } from './useAudioRecorder'
export { useTranscription, type TranscriptionState, type UseTranscriptionOptions, type ModerationResult, type ModerationLabel } from './useTranscription'
export { useRecording, type UseRecordingOptions } from './useRecording'
export { useAudioDevices, type AudioDevice, type UseAudioDevicesOptions } from './useAudioDevices'

// API Integration - REST
export { useHistory, type HistoryFilters, type UseHistoryOptions } from './useHistory'
export { useModels, type UseModelsOptions } from './useModels'
export { useModelStatus, type UseModelStatusOptions } from './useModelStatus'
export { useSwitchModel, type UseSwitchModelOptions, type ModelId } from './useSwitchModel'
export { useHealthCheck, type UseHealthCheckOptions } from './useHealthCheck'

// Content Moderation
export { useModerationStatus, type UseModerationStatusOptions } from './useModerationStatus'
export { useToggleModeration, type UseToggleModerationOptions } from './useToggleModeration'
