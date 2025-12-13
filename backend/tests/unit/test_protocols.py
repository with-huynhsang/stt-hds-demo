"""
Unit tests for content moderation protocol schemas.
"""
import pytest
from pydantic import ValidationError

from app.models.protocols import (
    ContentModeration,
    ModerationResult,
    ModerationConfig,
    ModerationStatus,
    ModerationToggleResponse,
    TranscriptionResult,
    WebSocketConfig
)


class TestContentModerationSchema:
    """Tests for ContentModeration schema."""
    
    def test_valid_clean_label(self):
        """Test valid CLEAN label."""
        result = ContentModeration(
            label="CLEAN",
            label_id=0,
            confidence=0.95,
            is_flagged=False
        )
        assert result.label == "CLEAN"
        assert result.label_id == 0
        assert result.confidence == 0.95
        assert result.is_flagged is False
    
    def test_valid_offensive_label(self):
        """Test valid OFFENSIVE label."""
        result = ContentModeration(
            label="OFFENSIVE",
            label_id=1,
            confidence=0.87,
            is_flagged=True
        )
        assert result.label == "OFFENSIVE"
        assert result.label_id == 1
        assert result.is_flagged is True
    
    def test_valid_hate_label(self):
        """Test valid HATE label."""
        result = ContentModeration(
            label="HATE",
            label_id=2,
            confidence=0.92,
            is_flagged=True
        )
        assert result.label == "HATE"
        assert result.label_id == 2
    
    def test_invalid_label(self):
        """Test that invalid label raises validation error."""
        with pytest.raises(ValidationError):
            ContentModeration(
                label="INVALID",
                label_id=0,
                confidence=0.5,
                is_flagged=False
            )
    
    def test_invalid_label_id_range(self):
        """Test that label_id outside 0-2 raises error."""
        with pytest.raises(ValidationError):
            ContentModeration(
                label="CLEAN",
                label_id=5,  # Invalid
                confidence=0.5,
                is_flagged=False
            )
    
    def test_invalid_confidence_range(self):
        """Test that confidence outside 0-1 raises error."""
        with pytest.raises(ValidationError):
            ContentModeration(
                label="CLEAN",
                label_id=0,
                confidence=1.5,  # Invalid
                is_flagged=False
            )
    
    def test_negative_confidence(self):
        """Test that negative confidence raises error."""
        with pytest.raises(ValidationError):
            ContentModeration(
                label="CLEAN",
                label_id=0,
                confidence=-0.1,  # Invalid
                is_flagged=False
            )


class TestModerationResultSchema:
    """Tests for ModerationResult schema."""
    
    def test_valid_moderation_result(self):
        """Test valid moderation result."""
        result = ModerationResult(
            request_id="abc123",
            label="OFFENSIVE",
            label_id=1,
            confidence=0.85,
            is_flagged=True,
            latency_ms=25.5
        )
        assert result.type == "moderation"
        assert result.request_id == "abc123"
        assert result.latency_ms == 25.5
    
    def test_type_is_always_moderation(self):
        """Test that type field defaults to 'moderation'."""
        result = ModerationResult(
            label="CLEAN",
            label_id=0,
            confidence=0.9,
            is_flagged=False,
            latency_ms=20.0
        )
        assert result.type == "moderation"
    
    def test_optional_request_id(self):
        """Test that request_id is optional."""
        result = ModerationResult(
            label="CLEAN",
            label_id=0,
            confidence=0.9,
            is_flagged=False,
            latency_ms=20.0
        )
        assert result.request_id is None


class TestModerationConfigSchema:
    """Tests for ModerationConfig schema."""
    
    def test_valid_config(self):
        """Test valid moderation config."""
        config = ModerationConfig(
            default_enabled=True,
            confidence_threshold=0.7,
            on_final_only=True
        )
        assert config.default_enabled is True
        assert config.confidence_threshold == 0.7
        assert config.on_final_only is True
    
    def test_invalid_threshold(self):
        """Test that confidence_threshold must be 0-1."""
        with pytest.raises(ValidationError):
            ModerationConfig(
                default_enabled=True,
                confidence_threshold=1.5,  # Invalid
                on_final_only=True
            )


class TestModerationStatusSchema:
    """Tests for ModerationStatus schema."""
    
    def test_full_status(self):
        """Test full moderation status."""
        status = ModerationStatus(
            enabled=True,
            current_detector="visobert-hsd",
            loading_detector=None,
            config=ModerationConfig(
                default_enabled=True,
                confidence_threshold=0.7,
                on_final_only=True
            )
        )
        assert status.enabled is True
        assert status.current_detector == "visobert-hsd"
        assert status.loading_detector is None
    
    def test_loading_state(self):
        """Test status when detector is loading."""
        status = ModerationStatus(
            enabled=False,
            current_detector=None,
            loading_detector="visobert-hsd",
            config=ModerationConfig(
                default_enabled=True,
                confidence_threshold=0.7,
                on_final_only=True
            )
        )
        assert status.loading_detector == "visobert-hsd"


class TestModerationToggleResponseSchema:
    """Tests for ModerationToggleResponse schema."""
    
    def test_enabled_response(self):
        """Test toggle response when enabled."""
        response = ModerationToggleResponse(
            enabled=True,
            current_detector="visobert-hsd"
        )
        assert response.enabled is True
        assert response.current_detector == "visobert-hsd"
    
    def test_disabled_response(self):
        """Test toggle response when disabled."""
        response = ModerationToggleResponse(
            enabled=False,
            current_detector="visobert-hsd"  # Detector still running
        )
        assert response.enabled is False
        assert response.current_detector == "visobert-hsd"


class TestTranscriptionResultSchema:
    """Tests for TranscriptionResult schema with moderation."""
    
    def test_transcription_without_moderation(self):
        """Test transcription result without moderation."""
        result = TranscriptionResult(
            text="Xin chào",
            is_final=False,
            model="zipformer"
        )
        assert result.text == "Xin chào"
        assert result.content_moderation is None
    
    def test_transcription_with_moderation(self):
        """Test transcription result with moderation."""
        result = TranscriptionResult(
            text="Xin chào các bạn",
            is_final=True,
            model="zipformer",
            workflow_type="streaming",
            latency_ms=45.2,
            content_moderation=ContentModeration(
                label="CLEAN",
                label_id=0,
                confidence=0.95,
                is_flagged=False
            )
        )
        assert result.is_final is True
        assert result.content_moderation is not None
        assert result.content_moderation.label == "CLEAN"
    
    def test_transcription_with_flagged_content(self):
        """Test transcription result with flagged content."""
        result = TranscriptionResult(
            text="...",
            is_final=True,
            model="zipformer",
            content_moderation=ContentModeration(
                label="HATE",
                label_id=2,
                confidence=0.92,
                is_flagged=True
            )
        )
        assert result.content_moderation.is_flagged is True
        assert result.content_moderation.label == "HATE"


class TestWebSocketConfigSchema:
    """Tests for WebSocketConfig schema with moderation option."""
    
    def test_default_config(self):
        """Test default WebSocket config."""
        config = WebSocketConfig()
        assert config.type == "config"
        assert config.model == "zipformer"
        assert config.sample_rate == 16000
        assert config.moderation is True  # Default enabled
    
    def test_moderation_disabled(self):
        """Test WebSocket config with moderation disabled."""
        config = WebSocketConfig(
            model="zipformer",
            moderation=False
        )
        assert config.moderation is False
    
    def test_custom_config(self):
        """Test custom WebSocket config."""
        config = WebSocketConfig(
            type="config",
            model="zipformer",
            sample_rate=16000,
            moderation=True
        )
        assert config.moderation is True
