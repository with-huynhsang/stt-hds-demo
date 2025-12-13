"""
Integration tests for SpanDetector unified moderation.

Tests cover:
1. ModelManager span detector management
2. REST API moderation endpoints
3. Label inference from spans
"""
import pytest
from unittest.mock import Mock, patch

from app.core.manager import ModelManager


class TestModelManagerSpanDetector:
    """Tests for ModelManager span detector management methods."""
    
    def test_initial_span_detector_state(self):
        """Test initial state of span detector properties."""
        mgr = ModelManager()
        assert mgr.current_span_detector is None
        assert mgr.moderation_enabled is False
    
    def test_set_moderation_enabled(self):
        """Test toggling moderation enabled flag."""
        mgr = ModelManager()
        assert mgr._moderation_enabled is False
        
        mgr.set_moderation_enabled(True)
        assert mgr._moderation_enabled is True
        
        mgr.set_moderation_enabled(False)
        assert mgr._moderation_enabled is False
    
    def test_moderation_enabled_requires_span_detector(self):
        """Test that moderation_enabled property checks both flag and span detector."""
        mgr = ModelManager()
        
        # Without span detector, moderation_enabled should be False
        mgr._moderation_enabled = True
        assert mgr.moderation_enabled is False  # No span detector running
        
        # With span detector but flag off
        mgr.current_span_detector = "visobert-hsd-span"
        mgr._moderation_enabled = False
        assert mgr.moderation_enabled is False
        
        # With span detector and flag on
        mgr._moderation_enabled = True
        assert mgr.moderation_enabled is True
    
    def test_is_loading_includes_span_detector(self):
        """Test that is_loading includes span detector loading state."""
        mgr = ModelManager()
        assert mgr.is_loading is False
        
        with mgr._loading_lock:
            mgr._loading_span_detector = True
        assert mgr.is_loading is True
        
        with mgr._loading_lock:
            mgr._loading_span_detector = False
        assert mgr.is_loading is False
    
    def test_get_span_detector_queues_no_detector(self):
        """Test get_span_detector_queues when no span detector is running."""
        mgr = ModelManager()
        input_q, output_q = mgr.get_span_detector_queues()
        assert input_q is None
        assert output_q is None
    
    def test_stop_span_detector_when_not_running(self):
        """Test stopping span detector when none is running doesn't raise error."""
        mgr = ModelManager()
        # Should not raise any exception
        mgr.stop_span_detector()
        assert mgr.current_span_detector is None
    
    def test_get_status_with_span_detector_loading(self):
        """Test get_status when span detector is loading."""
        mgr = ModelManager()
        
        with mgr._loading_lock:
            mgr._loading_span_detector = True
        
        assert mgr.get_status() == "loading"
    
    def test_stop_all_models_includes_span_detector(self):
        """Test that stop_all_models also stops span detector."""
        mgr = ModelManager()
        
        # Set up mock span detector
        mgr.current_span_detector = "visobert-hsd-span"
        mgr._moderation_enabled = True
        
        mock_process = Mock()
        mock_process.is_alive.return_value = False
        mock_process.join = Mock()
        
        mock_queue = Mock()
        mock_queue.put_nowait = Mock()
        mock_queue.close = Mock()
        
        mgr.span_detector_process = mock_process
        mgr.span_detector_input_q = mock_queue
        mgr.span_detector_output_q = mock_queue
        
        mgr.stop_all_models()
        
        # Verify span detector was stopped
        assert mgr.current_span_detector is None


class TestModerationEndpoints:
    """Tests for moderation REST API endpoints."""
    
    @pytest.fixture
    def client(self):
        """Create test client."""
        from fastapi.testclient import TestClient
        from main import app
        return TestClient(app)
    
    def test_get_moderation_status(self, client):
        """Test GET /api/v1/moderation/status returns expected fields."""
        response = client.get("/api/v1/moderation/status")
        assert response.status_code == 200
        
        data = response.json()
        assert "enabled" in data
        assert "span_detector_active" in data
        assert "config" in data
        
        config = data["config"]
        assert "default_enabled" in config
        assert "confidence_threshold" in config
        assert "on_final_only" in config
    
    @patch('app.api.endpoints.manager')
    def test_toggle_moderation_enable(self, mock_manager, client):
        """Test POST /api/v1/moderation/toggle?enabled=true."""
        mock_manager.current_span_detector = None
        mock_manager.moderation_requested = True
        mock_manager.start_span_detector = Mock()
        mock_manager.set_moderation_enabled = Mock()
        
        response = client.post("/api/v1/moderation/toggle?enabled=true")
        assert response.status_code == 200
        
        mock_manager.start_span_detector.assert_called_once()
        mock_manager.set_moderation_enabled.assert_called_once_with(True)
    
    @patch('app.api.endpoints.manager')
    def test_toggle_moderation_disable(self, mock_manager, client):
        """Test POST /api/v1/moderation/toggle?enabled=false."""
        mock_manager.moderation_requested = False
        mock_manager.current_span_detector = "visobert-hsd-span"
        mock_manager.set_moderation_enabled = Mock()
        
        response = client.post("/api/v1/moderation/toggle?enabled=false")
        assert response.status_code == 200
        
        mock_manager.set_moderation_enabled.assert_called_once_with(False)


class TestLabelInferenceIntegration:
    """Integration tests for label inference from spans."""
    
    def test_span_detector_worker_creation(self):
        """Test that SpanDetectorWorker can be created."""
        from app.workers.span_detector import SpanDetectorWorker
        import multiprocessing
        
        input_q = multiprocessing.Queue()
        output_q = multiprocessing.Queue()
        
        worker = SpanDetectorWorker(input_q, output_q, "visobert-hsd-span")
        
        assert worker.model_name == "visobert-hsd-span"
        assert worker.input_queue == input_q
        assert worker.output_queue == output_q
        
        # Cleanup
        input_q.close()
        output_q.close()
    
    def test_infer_label_returns_correct_structure(self):
        """Test that _infer_label returns (label, label_id, confidence)."""
        from app.workers.span_detector import SpanDetectorWorker
        import multiprocessing
        
        input_q = multiprocessing.Queue()
        output_q = multiprocessing.Queue()
        
        worker = SpanDetectorWorker(input_q, output_q, "visobert-hsd-span")
        
        # Test empty spans
        label, label_id, confidence = worker._infer_label([])
        assert label == "CLEAN"
        assert label_id == 0
        assert confidence == 1.0
        
        # Test with hate span
        spans = [{"text": "giết", "start": 0, "end": 4}]
        label, label_id, confidence = worker._infer_label(spans)
        assert label == "HATE"
        assert label_id == 2
        assert confidence >= 0.85
        
        # Cleanup
        input_q.close()
        output_q.close()
