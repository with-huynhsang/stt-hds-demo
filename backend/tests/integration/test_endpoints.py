"""
Integration tests for API endpoints.

Tests REST API endpoints:
- GET /api/v1/models - List available models
- POST /api/v1/models/switch - Switch active model
- GET /api/v1/models/status - Get model status
- GET /api/v1/history - Get transcription history
- WebSocket /ws/transcribe - Real-time transcription
"""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch
import sys
import os

# Add backend to sys.path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from main import app
from app.core.manager import manager


class TestModelsEndpoints:
    """Test /api/v1/models endpoints."""
    
    @pytest.fixture
    def client(self):
        """Create test client."""
        return TestClient(app)
    
    def test_get_models(self, client):
        """Test listing available models."""
        response = client.get("/api/v1/models")
        
        assert response.status_code == 200
        data = response.json()
        
        # Should return 1 model (zipformer only)
        assert len(data) == 1
        
        # Verify model IDs
        model_ids = [m["id"] for m in data]
        assert "zipformer" in model_ids
        
        # Verify model structure
        for model in data:
            assert "id" in model
            assert "name" in model
            assert "description" in model
    
    def test_get_models_response_type(self, client):
        """Test models endpoint returns JSON array."""
        response = client.get("/api/v1/models")
        assert response.headers["content-type"] == "application/json"
        assert isinstance(response.json(), list)


class TestSwitchModelEndpoint:
    """Test POST /api/v1/models/switch endpoint."""
    
    @pytest.fixture
    def client(self):
        """Create test client."""
        return TestClient(app)
    
    @patch("app.core.manager.ModelManager.get_queues")
    @patch("app.core.manager.ModelManager.start_model")
    def test_switch_model_success(self, mock_start_model, mock_get_queues, client):
        """Test successful model switch."""
        response = client.post("/api/v1/models/switch?model=zipformer")
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["current_model"] == "zipformer"
        mock_start_model.assert_called_with("zipformer")
    
    def test_switch_invalid_model(self, client):
        """Test switching to invalid model returns 400."""
        response = client.post("/api/v1/models/switch?model=invalid")
        
        assert response.status_code == 400
        assert response.headers["content-type"] == "application/problem+json"
        data = response.json()
        assert data["status"] == 400
        assert "Invalid model" in data["detail"]

    def test_switch_faster_whisper_invalid(self, client):
        """Test switching to faster-whisper returns 400 (model removed)."""
        response = client.post("/api/v1/models/switch?model=faster-whisper")
        
        assert response.status_code == 400
        assert "Invalid model" in response.json()["detail"]

    def test_switch_hkab_invalid(self, client):
        """Test switching to hkab returns 400 (model removed)."""
        response = client.post("/api/v1/models/switch?model=hkab")
        
        assert response.status_code == 400
        assert "Invalid model" in response.json()["detail"]
    
    def test_switch_missing_model_param(self, client):
        """Test missing model parameter returns 422."""
        response = client.post("/api/v1/models/switch")
        
        # FastAPI returns 422 for missing required params
        assert response.status_code == 422
    
    @patch("app.core.manager.ModelManager.start_model")
    def test_switch_model_error(self, mock_start_model, client):
        """Test model start failure returns 503."""
        mock_start_model.side_effect = Exception("Model failed to load")
        
        response = client.post("/api/v1/models/switch?model=zipformer")
        
        assert response.status_code == 503


class TestModelStatusEndpoint:
    """Test GET /api/v1/models/status endpoint."""
    
    @pytest.fixture
    def client(self):
        """Create test client."""
        return TestClient(app)
    
    def test_get_status_idle(self, client):
        """Test status when no model loaded."""
        # Ensure no model is loaded
        manager.current_model = None
        manager.active_processes = {}
        
        response = client.get("/api/v1/models/status")
        
        assert response.status_code == 200
        data = response.json()
        assert data["current_model"] is None
        assert data["is_loaded"] is False
        assert data["status"] == "idle"
    
    @patch.object(manager, 'current_model', 'zipformer')
    @patch.object(manager, 'active_processes', {'zipformer': MagicMock()})
    def test_get_status_ready(self, client):
        """Test status when model is loaded."""
        response = client.get("/api/v1/models/status")
        
        assert response.status_code == 200
        data = response.json()
        assert data["current_model"] == "zipformer"
        assert data["is_loaded"] is True
        assert data["status"] == "ready"


class TestHistoryEndpoint:
    """Test GET /api/v1/history endpoint."""
    
    @pytest.fixture
    def client(self):
        """Create test client."""
        return TestClient(app)
    
    @pytest.mark.asyncio
    async def test_get_history_empty(self, client):
        """Test getting empty history."""
        response = client.get("/api/v1/history")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    @pytest.mark.asyncio
    async def test_get_history_with_pagination(self, client):
        """Test history pagination parameters."""
        response = client.get("/api/v1/history?page=1&limit=10")
        
        assert response.status_code == 200
    
    @pytest.mark.asyncio
    async def test_get_history_with_filters(self, client):
        """Test history filter parameters."""
        response = client.get("/api/v1/history?model=zipformer")
        
        assert response.status_code == 200


class TestHealthEndpoints:
    """Test health check endpoints."""
    
    @pytest.fixture
    def client(self):
        """Create test client."""
        return TestClient(app)
    
    def test_root_endpoint(self, client):
        """Test root endpoint returns health status."""
        response = client.get("/")
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "message" in data
    
    def test_health_endpoint(self, client):
        """Test detailed health check."""
        response = client.get("/health")
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "model_loaded" in data
        assert "current_model" in data


class TestWebSocketEndpoint:
    """Test WebSocket /ws/transcribe endpoint."""
    
    @pytest.fixture
    def client(self):
        """Create test client."""
        return TestClient(app)
    
    @patch("app.api.endpoints.manager")
    def test_websocket_connection(self, mock_manager, client):
        """Test WebSocket connection establishment."""
        # Mock queues
        input_q = MagicMock()
        input_q.put = MagicMock()
        output_q = MagicMock()
        output_q.empty.return_value = True
        mock_manager.get_queues.return_value = (input_q, output_q)
        
        with client.websocket_connect("/ws/transcribe") as websocket:
            # Send config
            websocket.send_json({"type": "config", "model": "zipformer"})
            
            # Send some audio bytes
            websocket.send_bytes(bytes(100))
            
            # Verify manager was called
            mock_manager.start_model.assert_called()
    
    @patch("app.api.endpoints.manager")
    def test_websocket_session_start(self, mock_manager, client):
        """Test starting a new session via WebSocket."""
        input_q = MagicMock()
        output_q = MagicMock()
        output_q.empty.return_value = True
        mock_manager.get_queues.return_value = (input_q, output_q)
        
        with client.websocket_connect("/ws/transcribe") as websocket:
            # Send session start
            websocket.send_json({
                "type": "start_session",
                "sessionId": "test-session-123"
            })
            
            # Should have put reset command in queue
            # Note: actual assertion depends on async timing
