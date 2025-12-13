"""
Unit tests for ZipformerWorker.

Tests the Zipformer worker's ability to:
- Load sherpa-onnx model
- Process audio data
- Format Vietnamese text
- Handle reset commands
"""
import pytest
from unittest.mock import MagicMock, patch
import sys
import os
import numpy as np

# Add backend to sys.path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from app.workers.zipformer import ZipformerWorker


class TestZipformerWorker:
    """Test suite for ZipformerWorker class."""
    
    @pytest.fixture
    def mock_queues(self):
        """Mock input/output queues."""
        input_q = MagicMock()
        output_q = MagicMock()
        return input_q, output_q

    @pytest.fixture
    def worker(self, mock_queues):
        """Create worker instance with mocked queues."""
        input_q, output_q = mock_queues
        return ZipformerWorker(input_q, output_q, "zipformer")

    @patch("os.path.exists")
    def test_load_model_success(self, mock_exists, worker):
        """Test successful model loading."""
        mock_exists.return_value = True
        
        # Mock sherpa_onnx module
        mock_sherpa = MagicMock()
        mock_recognizer = MagicMock()
        mock_sherpa.OfflineRecognizer.from_transducer.return_value = mock_recognizer
        mock_recognizer.create_stream.return_value = MagicMock()
        
        with patch.dict("sys.modules", {"sherpa_onnx": mock_sherpa}):
            worker.load_model()
        
        # Verify sherpa was called with correct args
        mock_sherpa.OfflineRecognizer.from_transducer.assert_called_once()
        call_kwargs = mock_sherpa.OfflineRecognizer.from_transducer.call_args.kwargs
        assert call_kwargs["decoding_method"] == "greedy_search"
        assert call_kwargs["provider"] == "cpu"
        assert call_kwargs["sample_rate"] == 16000
        assert call_kwargs["num_threads"] == 2
        assert worker.recognizer is not None
        assert worker.stream is not None

    @patch("os.path.exists")
    def test_load_model_missing_files(self, mock_exists, worker):
        """Test error when model files are missing."""
        mock_exists.return_value = False
        
        with patch.dict("sys.modules", {"sherpa_onnx": MagicMock()}):
            with pytest.raises(FileNotFoundError):
                worker.load_model()

    @patch("os.path.exists")
    def test_process_audio(self, mock_exists, worker):
        """Test audio processing flow."""
        mock_exists.return_value = True
        
        # Setup mocked sherpa
        mock_sherpa = MagicMock()
        mock_recognizer = MagicMock()
        mock_stream = MagicMock()
        mock_sherpa.OfflineRecognizer.from_transducer.return_value = mock_recognizer
        mock_recognizer.create_stream.return_value = mock_stream
        
        with patch.dict("sys.modules", {"sherpa_onnx": mock_sherpa}):
            worker.load_model()
        
        # Mock recognition result
        mock_stream.result.text = "xin chào"
        
        # Create dummy audio data (16k samples = 1 second, int16)
        audio_data = bytes(32000)
        
        # Process audio
        worker.process(audio_data)
        
        # Verify stream accepted waveform
        mock_stream.accept_waveform.assert_called_once()
        call_args = mock_stream.accept_waveform.call_args[0]
        assert call_args[0] == 16000  # sample_rate
        
        # Verify decode_stream called
        mock_recognizer.decode_stream.assert_called_once_with(mock_stream)
        
        # Verify output queue received result
        worker.output_queue.put.assert_called_once()
        result = worker.output_queue.put.call_args[0][0]
        assert result["text"] == "Xin chào"  # Formatted
        assert result["is_final"] is False
        assert result["model"] == "zipformer"

    @patch("os.path.exists")
    def test_process_dict_with_audio(self, mock_exists, worker):
        """Test processing dict format with audio data."""
        mock_exists.return_value = True
        
        mock_sherpa = MagicMock()
        mock_recognizer = MagicMock()
        mock_stream = MagicMock()
        mock_sherpa.OfflineRecognizer.from_transducer.return_value = mock_recognizer
        mock_recognizer.create_stream.return_value = mock_stream
        mock_stream.result.text = "test"
        
        with patch.dict("sys.modules", {"sherpa_onnx": mock_sherpa}):
            worker.load_model()
        
        # Send dict with audio
        worker.process({"audio": bytes(16000)})
        
        mock_stream.accept_waveform.assert_called_once()

    @patch("os.path.exists")
    def test_process_reset_command(self, mock_exists, worker):
        """Test reset command creates new stream."""
        mock_exists.return_value = True
        
        mock_sherpa = MagicMock()
        mock_recognizer = MagicMock()
        mock_sherpa.OfflineRecognizer.from_transducer.return_value = mock_recognizer
        
        with patch.dict("sys.modules", {"sherpa_onnx": mock_sherpa}):
            worker.load_model()
            
        # Send reset command
        worker.process({"reset": True})
        
        # Verify create_stream called twice (once during load, once during reset)
        assert mock_recognizer.create_stream.call_count == 2

    @patch("os.path.exists")
    def test_process_reset_with_audio(self, mock_exists, worker):
        """Test reset command followed by audio in same message."""
        mock_exists.return_value = True
        
        mock_sherpa = MagicMock()
        mock_recognizer = MagicMock()
        mock_stream = MagicMock()
        mock_sherpa.OfflineRecognizer.from_transducer.return_value = mock_recognizer
        mock_recognizer.create_stream.return_value = mock_stream
        mock_stream.result.text = "test"
        
        with patch.dict("sys.modules", {"sherpa_onnx": mock_sherpa}):
            worker.load_model()
        
        # Send reset with audio
        worker.process({"reset": True, "audio": bytes(16000)})
        
        # Should reset stream AND process audio
        assert mock_recognizer.create_stream.call_count == 2
        mock_stream.accept_waveform.assert_called_once()

    def test_process_without_model(self, worker):
        """Test process returns early if model not loaded."""
        worker.recognizer = None
        worker.process(bytes(16000))
        
        # Should not put anything in queue
        worker.output_queue.put.assert_not_called()


class TestVietnameseTextFormatting:
    """Test Vietnamese text formatting."""
    
    @pytest.fixture
    def worker(self, mock_queues):
        """Create worker instance."""
        input_q = MagicMock()
        output_q = MagicMock()
        return ZipformerWorker(input_q, output_q, "zipformer")
    
    def test_format_uppercase_to_sentence_case(self, worker):
        """Test converting uppercase to sentence case."""
        assert worker.format_vietnamese_text("XIN CHÀO") == "Xin chào"
    
    def test_format_mixed_case(self, worker):
        """Test formatting mixed case text."""
        assert worker.format_vietnamese_text("tôi LÀ người VIỆT nam") == "Tôi là người việt nam"
    
    def test_format_empty_string(self, worker):
        """Test formatting empty string."""
        assert worker.format_vietnamese_text("") == ""
    
    def test_format_single_char(self, worker):
        """Test formatting single character."""
        assert worker.format_vietnamese_text("a") == "A"
        assert worker.format_vietnamese_text("A") == "A"
    
    def test_format_already_correct(self, worker):
        """Test text that's already correctly formatted."""
        assert worker.format_vietnamese_text("Xin chào") == "Xin chào"
    
    def test_format_lowercase(self, worker):
        """Test all lowercase input."""
        assert worker.format_vietnamese_text("xin chào việt nam") == "Xin chào việt nam"
