import { createFileRoute } from '@tanstack/react-router'
import { Typography, App, Flex, Tag, Space, theme, Select, Card } from 'antd'
import { AudioOutlined, LoadingOutlined, CheckCircleOutlined, DisconnectOutlined, SyncOutlined, ApiOutlined, ThunderboltOutlined, CloudSyncOutlined } from '@ant-design/icons'
import { useRecording, useAudioDevices, useModels, useSwitchModel, useModelStatus } from '@/hooks'
import { useAppStore, type ModelId } from '@/stores/app.store'
import { ReadyState } from 'react-use-websocket'
import { RecordButton, AudioWaveform, TranscriptDisplay, TranscriptActions, DeviceSelector, ModerationToggle } from '@/components/recording'
import { GenericError } from '@/components/common'
import { useEffect, useState } from 'react'

const { Title, Text } = Typography

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  const { message } = App.useApp()
  const { token } = theme.useToken()
  
  // Audio devices
  const { selectedDeviceId, selectDevice } = useAudioDevices({ autoRequestPermission: true })
  
  // Model selection
  const { selectedModel, setSelectedModel } = useAppStore()
  const { 
    modelOptions: apiModelOptions, 
    isLoading: isLoadingModels,
    isBufferedModel,
    getExpectedLatency,
  } = useModels()
  
  // Track if we're waiting for model to load after switch
  const [isWaitingForModel, setIsWaitingForModel] = useState(false)
  
  // Model status - poll when switching
  const { statusMessage, refetch: refetchStatus } = useModelStatus({
    enabled: true,
    refetchInterval: isWaitingForModel ? 500 : 0, // Poll every 500ms when switching
  })
  
  // Stop polling when model is ready
  useEffect(() => {
    if (isWaitingForModel && statusMessage === 'ready') {
      setIsWaitingForModel(false)
      message.success(`Model đã sẵn sàng!`)
    }
  }, [isWaitingForModel, statusMessage, message])
  
  const { switchModel, isSwitching } = useSwitchModel({
    onSuccess: (data) => {
      message.info(`Đang load model ${data.current_model}...`)
      setIsWaitingForModel(true)
      // Start polling
      refetchStatus()
    },
    onError: (error) => {
      message.error(`Lỗi chuyển model: ${error.message}`)
      setIsWaitingForModel(false)
    },
  })

  // Fallback options when API is loading
  const modelOptions = apiModelOptions || [
    { value: 'zipformer', label: 'Zipformer (Nhanh)', description: 'Fast streaming', workflowType: 'streaming' as const, expectedLatencyMs: [100, 500] as [number, number], isStreaming: true },
  ]

  const handleModelChange = (value: string) => {
    const modelId = value as ModelId
    setSelectedModel(modelId)
    switchModel(modelId)
  }
  
  const {
    isRecording,
    isConnecting,
    transcript,
    interimText,
    fullTranscript,
    connectionState,
    audioError,
    wsError,
    mediaStream,
    latestModeration,
    startRecording,
    stopRecording,
    clearTranscript,
  } = useRecording({ deviceId: selectedDeviceId || undefined })
  
  // Combined transcript for display and actions (includes interim text)
  const displayTranscript = fullTranscript || transcript || ''

  const handleToggleRecording = async () => {
    try {
      if (isRecording) {
        stopRecording()
        message.info('Đã dừng ghi âm')
      } else {
        await startRecording()
        message.success('Bắt đầu ghi âm...')
      }
    } catch (error) {
      const err = error instanceof Error ? error.message : 'Lỗi không xác định'
      message.error(err)
    }
  }

  // Connection status tag
  const getConnectionTag = () => {
    switch (connectionState) {
      case ReadyState.CONNECTING:
        return <Tag icon={<SyncOutlined spin />} color="processing">Đang kết nối...</Tag>
      case ReadyState.OPEN:
        return <Tag icon={<CheckCircleOutlined />} color="success">Đã kết nối</Tag>
      case ReadyState.CLOSING:
        return <Tag icon={<SyncOutlined spin />} color="warning">Đang ngắt...</Tag>
      case ReadyState.CLOSED:
        return <Tag icon={<DisconnectOutlined />} color="default">Chưa kết nối</Tag>
      default:
        return null
    }
  }
  
  // Model status tag
  const getModelStatusTag = () => {
    if (isSwitching || isWaitingForModel) {
      return <Tag icon={<LoadingOutlined spin />} color="processing">Đang load model...</Tag>
    }
    if (statusMessage === 'loading') {
      return <Tag icon={<LoadingOutlined spin />} color="processing">Đang load model...</Tag>
    }
    if (statusMessage === 'ready') {
      return <Tag icon={<ApiOutlined />} color="success">Model sẵn sàng</Tag>
    }
    return <Tag icon={<ApiOutlined />} color="default">Model chưa khởi tạo</Tag>
  }

  const error = audioError || wsError

  return (
    <main style={{ height: '100%', maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <Flex justify="space-between" align="center" wrap="wrap" gap={12} style={{ marginBottom: token.marginMD }}>
        <div>
          <Title level={3} style={{ margin: 0, marginBottom: 4 }}>
            <AudioOutlined style={{ marginRight: 8 }} />
            Ghi âm giọng nói
          </Title>
        </div>
        <Space wrap>
          {getModelStatusTag()}
          {getConnectionTag()}
        </Space>
      </Flex>

      {/* Error display */}
      {error && (
        <div style={{ marginBottom: token.marginMD }}>
          <GenericError
            error={error}
            onRetry={() => window.location.reload()}
            inline
          />
        </div>
      )}

      {/* Transcript Display - Main Content (Top) */}
      <div style={{ marginBottom: token.marginLG }}>
        <TranscriptDisplay
          transcript={transcript}
          interimText={interimText}
          isRecording={isRecording}
          isConnecting={isConnecting}
          isBufferedModel={isBufferedModel(selectedModel)}
          expectedLatencyMs={getExpectedLatency(selectedModel)}
          minHeight={280}
          maxHeight={450}
          moderationResult={latestModeration}
        />
        
        {/* Transcript Actions */}
        <Flex 
          justify="flex-end" 
          style={{ 
            marginTop: token.marginSM,
          }}
        >
          <TranscriptActions
            transcript={displayTranscript}
            onClear={clearTranscript}
            disabled={isRecording}
          />
        </Flex>
      </div>

      {/* Recording Controls Card */}
      <Card 
        size="small"
        styles={{ body: { padding: token.paddingMD } }}
      >
        <Flex 
          vertical 
          align="center" 
          gap={token.marginMD}
        >
          {/* Model & Device Selectors Row */}
          <Flex 
            wrap="wrap" 
            gap={token.marginSM} 
            justify="center"
            style={{ width: '100%' }}
          >
            {/* Model Selector with workflow badges */}
            <Space size={4}>
              <Text type="secondary" style={{ fontSize: 13 }}>Model:</Text>
              <Select
                value={selectedModel}
                onChange={handleModelChange}
                style={{ minWidth: 200 }}
                size="middle"
                loading={isLoadingModels || isSwitching}
                disabled={isSwitching || isRecording}
                suffixIcon={isSwitching ? <LoadingOutlined spin /> : undefined}
                optionRender={(option) => {
                  const model = modelOptions?.find(m => m.value === option.value)
                  const isStreaming = model?.isStreaming ?? true
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span>{option.label}</span>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                          padding: '1px 6px',
                          borderRadius: 4,
                          backgroundColor: isStreaming ? token.colorSuccessBg : token.colorWarningBg,
                          color: isStreaming ? token.colorSuccess : token.colorWarning,
                          fontSize: 10,
                          fontWeight: 500,
                        }}
                      >
                        {isStreaming ? (
                          <>
                            <ThunderboltOutlined style={{ fontSize: 9 }} />
                            Stream
                          </>
                        ) : (
                          <>
                            <CloudSyncOutlined style={{ fontSize: 9 }} />
                            Buffer
                          </>
                        )}
                      </span>
                    </div>
                  )
                }}
              >
                {modelOptions?.map((model) => (
                  <Select.Option key={model.value} value={model.value}>
                    {model.label}
                  </Select.Option>
                ))}
              </Select>
            </Space>

            {/* Device Selector */}
            <DeviceSelector
              value={selectedDeviceId}
              onChange={selectDevice}
              disabled={isRecording}
              size="middle"
              showRefresh
            />

            {/* Content Moderation Toggle */}
            <ModerationToggle disabled={isRecording} />
          </Flex>

          {/* Record Button */}
          <RecordButton
            isRecording={isRecording}
            isConnecting={isConnecting}
            onClick={handleToggleRecording}
            size={100}
          />

          {/* Status Text */}
          <Text 
            type="secondary" 
            style={{ 
              fontSize: token.fontSize,
            }}
          >
            {isConnecting 
              ? 'Đang kết nối tới server...' 
              : isRecording 
                ? 'Đang ghi âm... Nhấn để dừng' 
                : 'Nhấn để bắt đầu ghi âm'
            }
          </Text>

          {/* Audio Waveform */}
          <div style={{ width: '100%', maxWidth: 400 }}>
            <AudioWaveform
              isActive={isRecording}
              mediaStream={mediaStream}
              barCount={32}
              height={40}
              gap={3}
            />
          </div>
        </Flex>
      </Card>
    </main>
  )
}
