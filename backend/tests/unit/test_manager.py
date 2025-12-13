"""
Unit tests for ModelManager.

Tests the manager's ability to:
- Start and stop model worker processes
- Handle valid/invalid model names
- Manage queues and process lifecycle
"""
import pytest
from unittest.mock import MagicMock, patch
import sys
import os

# Add backend to sys.path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from app.core.manager import ModelManager, manager


class TestModelManager:
    """Test suite for ModelManager class."""
    
    @pytest.fixture
    def fresh_manager(self):
        """Create a fresh manager instance for each test."""
        return ModelManager()
    
    def test_valid_models_constant(self, fresh_manager):
        """Test that VALID_MODELS contains expected models."""
        expected = ["zipformer"]
        assert fresh_manager.VALID_MODELS == expected
    
    def test_initial_state(self, fresh_manager):
        """Test manager starts with empty state."""
        assert fresh_manager.active_processes == {}
        assert fresh_manager.input_queues == {}
        assert fresh_manager.output_queues == {}
        assert fresh_manager.current_model is None
    
    @patch("app.core.manager.multiprocessing.Process")
    @patch("app.core.manager.ModelManager._get_worker_class")
    def test_start_model_zipformer(self, mock_get_worker, mock_process_cls, fresh_manager):
        """Test starting Zipformer model worker."""
        # Setup mock worker class and instance
        mock_worker_cls = MagicMock()
        mock_worker_instance = MagicMock()
        mock_worker_cls.return_value = mock_worker_instance
        mock_get_worker.return_value = mock_worker_cls
        
        # Setup mock process
        mock_process_instance = MagicMock()
        mock_process_instance.pid = 12345
        mock_process_cls.return_value = mock_process_instance
        
        # Start model
        fresh_manager.start_model("zipformer")
        
        # Verify worker created with correct args
        mock_worker_cls.assert_called_once()
        args = mock_worker_cls.call_args[0]
        assert args[2] == "zipformer"  # model_name
        
        # Verify process created with daemon=True and started
        mock_process_cls.assert_called_once()
        call_kwargs = mock_process_cls.call_args.kwargs
        assert call_kwargs.get("daemon") is True
        mock_process_instance.start.assert_called_once()
        
        # Verify state updated
        assert "zipformer" in fresh_manager.active_processes
        assert "zipformer" in fresh_manager.input_queues
        assert "zipformer" in fresh_manager.output_queues
        assert fresh_manager.current_model == "zipformer"
    
    def test_start_invalid_model(self, fresh_manager):
        """Test that invalid model name raises ValueError."""
        with pytest.raises(ValueError) as excinfo:
            fresh_manager.start_model("invalid-model")
        assert "Unknown model" in str(excinfo.value)

    def test_start_whisper_model_invalid(self, fresh_manager):
        """Test that faster-whisper model is no longer valid."""
        with pytest.raises(ValueError) as excinfo:
            fresh_manager.start_model("faster-whisper")
        assert "Unknown model" in str(excinfo.value)

    def test_start_hkab_model_invalid(self, fresh_manager):
        """Test that hkab model is no longer valid."""
        with pytest.raises(ValueError) as excinfo:
            fresh_manager.start_model("hkab")
        assert "Unknown model" in str(excinfo.value)
    
    @patch("app.core.manager.multiprocessing.Process")
    @patch("app.core.manager.ModelManager._get_worker_class")
    def test_start_model_no_worker_class(self, mock_get_worker, mock_process_cls, fresh_manager):
        """Test error when worker class not found."""
        mock_get_worker.return_value = None
        
        with pytest.raises(ValueError) as excinfo:
            fresh_manager.start_model("zipformer")
        assert "No worker implementation" in str(excinfo.value)
    
    @patch("app.core.manager.multiprocessing.Process")
    @patch("app.core.manager.ModelManager._get_worker_class")
    def test_start_model_idempotent(self, mock_get_worker, mock_process_cls, fresh_manager):
        """Test that starting same model twice doesn't create duplicate processes."""
        mock_worker_cls = MagicMock()
        mock_get_worker.return_value = mock_worker_cls
        
        mock_process = MagicMock()
        mock_process_cls.return_value = mock_process
        
        # Start model twice
        fresh_manager.start_model("zipformer")
        fresh_manager.start_model("zipformer")
        
        # Process should only be created once
        assert mock_process_cls.call_count == 1
    
    @patch("app.core.manager.ModelManager._get_worker_class")
    def test_stop_model(self, mock_get_worker, fresh_manager):
        """Test stopping a running model."""
        mock_worker_cls = MagicMock()
        mock_get_worker.return_value = mock_worker_cls
        
        with patch("app.core.manager.multiprocessing.Process") as mock_process_cls:
            mock_process_instance = MagicMock()
            mock_process_instance.is_alive.return_value = False
            mock_process_cls.return_value = mock_process_instance
            
            # Start then stop
            fresh_manager.start_model("zipformer")
            fresh_manager.stop_current_model()
            
            # Verify cleanup
            assert "zipformer" not in fresh_manager.active_processes
            assert "zipformer" not in fresh_manager.input_queues
            assert "zipformer" not in fresh_manager.output_queues
            assert fresh_manager.current_model is None
            mock_process_instance.join.assert_called()
    
    @patch("app.core.manager.multiprocessing.Process")
    @patch("app.core.manager.ModelManager._get_worker_class")
    def test_get_queues(self, mock_get_worker, mock_process_cls, fresh_manager):
        """Test getting queues for running model."""
        mock_worker_cls = MagicMock()
        mock_get_worker.return_value = mock_worker_cls
        
        mock_process = MagicMock()
        mock_process_cls.return_value = mock_process
        
        fresh_manager.start_model("zipformer")
        
        input_q, output_q = fresh_manager.get_queues("zipformer")
        assert input_q is not None
        assert output_q is not None
    
    def test_get_queues_wrong_model(self, fresh_manager):
        """Test getting queues for non-running model returns None."""
        input_q, output_q = fresh_manager.get_queues("zipformer")
        assert input_q is None
        assert output_q is None
    
    def test_get_worker_class_zipformer(self, fresh_manager):
        """Test _get_worker_class returns correct class for zipformer."""
        with patch.dict("sys.modules", {"app.workers.zipformer": MagicMock()}):
            from app.workers.zipformer import ZipformerWorker
            worker_cls = fresh_manager._get_worker_class("zipformer")
            assert worker_cls is not None
    
    def test_get_worker_class_unknown(self, fresh_manager):
        """Test _get_worker_class returns None for unknown model."""
        worker_cls = fresh_manager._get_worker_class("unknown")
        assert worker_cls is None


class TestGlobalManager:
    """Test the global manager singleton."""
    
    def test_manager_is_model_manager(self):
        """Test that global manager is a ModelManager instance."""
        assert isinstance(manager, ModelManager)
