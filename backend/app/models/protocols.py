from typing import Optional, Literal, List
from pydantic import BaseModel, Field


class ModelInfo(BaseModel):
    """Information about an available STT model."""
    id: str
    name: str
    description: str
    # Workflow type helps FE understand how the model outputs results
    # streaming: outputs is_final=false frequently, is_final=true on flush (Zipformer)
    workflow_type: Literal["streaming", "buffered"] = "streaming"
    # Expected latency range in ms (for UI feedback)
    expected_latency_ms: tuple[int, int] = (100, 500)


class ModelStatus(BaseModel):
    """Current status of the model system."""
    current_model: Optional[str] = None
    is_loaded: bool
    status: str  # "ready" | "idle" | "loading"


class SwitchModelResponse(BaseModel):
    """Response for model switch operation."""
    status: str
    current_model: str


# ========== Content Moderation Schemas ==========

class ContentModeration(BaseModel):
    """Content moderation result inferred from ViSoBERT-HSD-Span detector.
    
    Labels are inferred from detected hate speech spans:
    - CLEAN (0): No toxic spans detected
    - OFFENSIVE (1): Mild offensive language detected (ngu, điên, vl, etc.)
    - HATE (2): Severe hate speech detected (giết, hiếp, địt, etc.)
    """
    label: Literal["CLEAN", "OFFENSIVE", "HATE"]
    label_id: int = Field(ge=0, le=2, description="Label ID: 0=CLEAN, 1=OFFENSIVE, 2=HATE")
    confidence: float = Field(ge=0.0, le=1.0, description="Confidence score (0-1)")
    is_flagged: bool = Field(description="True if label is OFFENSIVE or HATE")


class ModerationResult(BaseModel):
    """Full moderation result sent via WebSocket as separate message."""
    type: Literal["moderation"] = "moderation"
    request_id: Optional[str] = None
    label: Literal["CLEAN", "OFFENSIVE", "HATE"]
    label_id: int = Field(ge=0, le=2)
    confidence: float = Field(ge=0.0, le=1.0)
    is_flagged: bool
    latency_ms: float = Field(ge=0, description="Inference latency in milliseconds")
    # New field: List of detected bad keywords in the text
    detected_keywords: List[str] = Field(
        default_factory=list, 
        description="List of detected bad/offensive keywords found in the text"
    )


class ModerationConfig(BaseModel):
    """Configuration for content moderation feature."""
    default_enabled: bool = Field(description="Whether moderation is enabled by default")
    confidence_threshold: float = Field(
        ge=0.0, le=1.0, 
        description="Minimum confidence to consider a result valid"
    )
    on_final_only: bool = Field(description="Only run moderation on is_final=True results")


class ModerationStatus(BaseModel):
    """Current status of content moderation feature.
    
    Now uses unified span detector (ViSoBERT-HSD-Span) for both 
    span detection and label inference.
    """
    enabled: bool = Field(description="Whether content moderation is currently enabled")
    span_detector_active: bool = Field(
        default=False, 
        description="Whether the span detector model is loaded and ready"
    )
    config: ModerationConfig


class ModerationToggleResponse(BaseModel):
    """Response for moderation toggle operation."""
    enabled: bool
    span_detector_active: bool = Field(default=False)


# ========== Transcription Schemas ==========

class TranscriptionResult(BaseModel):
    """Real-time transcription result sent via WebSocket.
    
    For streaming workflow (Zipformer):
    - is_final=False: Intermediate results, may change
    - is_final=True: Final result for current segment
    
    content_moderation is included only when:
    - is_final=True
    - Moderation is enabled
    - Moderation result is available
    """
    text: str
    is_final: bool
    model: str
    workflow_type: Literal["streaming", "buffered"] = "streaming"
    latency_ms: Optional[float] = None
    # Content moderation result (optional - only on is_final=True if enabled)
    content_moderation: Optional[ContentModeration] = None


class WebSocketConfig(BaseModel):
    """Configuration message for WebSocket connection."""
    type: str = "config"
    model: str = "zipformer"
    sample_rate: int = 16000
    # Content moderation settings
    moderation: bool = True  # Enable/disable moderation for this session
