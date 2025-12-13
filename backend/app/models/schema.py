from typing import Optional, List
from datetime import datetime, timezone
from sqlmodel import SQLModel, Field, Column, JSON
from pydantic import field_serializer


class TranscriptionLog(SQLModel, table=True):
    """
    Database model for storing transcription history.
    
    Each record represents a transcription session (one recording session).
    Includes moderation data (label, detected keywords, etc.) when content moderation is enabled.
    """
    __tablename__ = "transcription_logs"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: str = Field(index=True, description="Unique session identifier")
    model_id: str = Field(index=True, description="Model used for transcription")
    content: str = Field(description="Transcribed text content")
    latency_ms: float = Field(default=0.0, description="Processing latency in milliseconds")
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        index=True,
        description="Timestamp of creation"
    )
    
    # Content Moderation fields
    moderation_label: Optional[str] = Field(
        default=None, 
        index=True,
        description="Moderation label: CLEAN, OFFENSIVE, or HATE"
    )
    moderation_confidence: Optional[float] = Field(
        default=None,
        description="Confidence score of moderation (0.0 to 1.0)"
    )
    is_flagged: Optional[bool] = Field(
        default=None,
        index=True,
        description="Whether the content was flagged by moderation"
    )
    detected_keywords: Optional[List[str]] = Field(
        default=None,
        sa_column=Column(JSON),
        description="List of detected bad/offensive keywords in the text"
    )

    @field_serializer('created_at')
    def serialize_datetime(self, value: datetime) -> str:
        """Serialize datetime to ISO 8601 format with Z suffix."""
        if value is None:
            return None
        # Ensure UTC timezone and format with Z suffix
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.strftime('%Y-%m-%dT%H:%M:%SZ')
