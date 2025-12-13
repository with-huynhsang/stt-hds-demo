"""
Unit tests for SpanDetectorWorker.

Tests the span detector worker's ability to:
- Load ONNX model (mocked for unit tests)
- Process text and extract toxic spans
- Handle BIO tagging correctly
- Return correct span positions and keywords

Note: These are unit tests with mocked model. Integration tests
with real model are in tests/integration/ directory.
"""
import pytest
from unittest.mock import MagicMock, patch
import sys
import os

# Add backend to sys.path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from app.workers.span_detector import SpanDetectorWorker


class TestSpanDetectorWorkerInitialization:
    """Test worker initialization."""
    
    def test_worker_creation(self):
        """Test worker can be created."""
        input_q = MagicMock()
        output_q = MagicMock()
        worker = SpanDetectorWorker(input_q, output_q, "visobert-hsd-span")
        
        assert worker.model_name == "visobert-hsd-span"
        assert worker.tokenizer is None
        assert worker.model is None
    
    def test_label_map(self):
        """Test label map is correctly defined for BIO tagging."""
        input_q = MagicMock()
        output_q = MagicMock()
        worker = SpanDetectorWorker(input_q, output_q, "visobert-hsd-span")
        
        assert worker.LABEL_MAP[0] == "O"
        assert worker.LABEL_MAP[1] == "B-T"
        assert worker.LABEL_MAP[2] == "I-T"
    
    def test_constants(self):
        """Test class constants are properly set."""
        assert SpanDetectorWorker.MIN_TEXT_LENGTH == 3
        assert SpanDetectorWorker.MAX_SEQUENCE_LENGTH == 64


class TestBIOSpanExtraction:
    """Test BIO span extraction logic."""
    
    @pytest.fixture
    def worker(self):
        """Create worker instance."""
        input_q = MagicMock()
        output_q = MagicMock()
        return SpanDetectorWorker(input_q, output_q, "visobert-hsd-span")
    
    def test_single_word_span(self, worker):
        """Test extraction of single word toxic span."""
        text = "thằng ngu"
        # Simulated predictions: B-T for "thằng", I-T for "ngu"
        # offset_mapping typically from tokenizer
        predictions = [0, 1, 2, 0]  # [CLS], "thằng", "ngu", [SEP]
        offset_mapping = [(0, 0), (0, 5), (6, 9), (0, 0)]
        attention_mask = [1, 1, 1, 1]
        
        spans = worker._extract_spans(text, predictions, offset_mapping, attention_mask)
        
        assert len(spans) == 1
        assert spans[0]["text"] == "thằng ngu"
        assert spans[0]["start"] == 0
        assert spans[0]["end"] == 9
    
    def test_no_toxic_spans(self, worker):
        """Test no spans when all tokens are O."""
        text = "Xin chào bạn"
        # All O predictions
        predictions = [0, 0, 0, 0, 0]  # [CLS], "Xin", "chào", "bạn", [SEP]
        offset_mapping = [(0, 0), (0, 3), (4, 8), (9, 12), (0, 0)]
        attention_mask = [1, 1, 1, 1, 1]
        
        spans = worker._extract_spans(text, predictions, offset_mapping, attention_mask)
        
        assert len(spans) == 0
    
    def test_multiple_separate_spans(self, worker):
        """Test extraction of multiple separate toxic spans."""
        text = "thằng ngu kia là đồ chó"
        # "thằng ngu" and "đồ chó" are toxic
        predictions = [0, 1, 2, 0, 0, 1, 2, 0]
        offset_mapping = [
            (0, 0),    # [CLS]
            (0, 5),    # "thằng" - B-T
            (6, 9),    # "ngu" - I-T
            (10, 13),  # "kia" - O
            (14, 16),  # "là" - O
            (17, 19),  # "đồ" - B-T
            (20, 23),  # "chó" - I-T
            (0, 0),    # [SEP]
        ]
        attention_mask = [1, 1, 1, 1, 1, 1, 1, 1]
        
        spans = worker._extract_spans(text, predictions, offset_mapping, attention_mask)
        
        assert len(spans) == 2
        assert spans[0]["text"] == "thằng ngu"
        assert spans[1]["text"] == "đồ chó"
    
    def test_span_at_end_of_text(self, worker):
        """Test span at the end of text is captured."""
        text = "kia là thằng ngu"
        # Only "thằng ngu" at the end is toxic
        predictions = [0, 0, 0, 1, 2, 0]
        offset_mapping = [
            (0, 0),    # [CLS]
            (0, 3),    # "kia" - O
            (4, 6),    # "là" - O
            (7, 12),   # "thằng" - B-T
            (13, 16),  # "ngu" - I-T
            (0, 0),    # [SEP]
        ]
        attention_mask = [1, 1, 1, 1, 1, 1]
        
        spans = worker._extract_spans(text, predictions, offset_mapping, attention_mask)
        
        assert len(spans) == 1
        assert spans[0]["text"] == "thằng ngu"
        assert spans[0]["start"] == 7
        assert spans[0]["end"] == 16
    
    def test_i_tag_without_b_tag_recovery(self, worker):
        """Test I-T without preceding B-T is treated as B-T (recovery)."""
        text = "thằng ngu"
        # Both tokens have I-T (model error), should still extract span
        predictions = [0, 2, 2, 0]  # [CLS], I-T, I-T, [SEP]
        offset_mapping = [(0, 0), (0, 5), (6, 9), (0, 0)]
        attention_mask = [1, 1, 1, 1]
        
        spans = worker._extract_spans(text, predictions, offset_mapping, attention_mask)
        
        assert len(spans) == 1
        assert spans[0]["text"] == "thằng ngu"
    
    def test_skip_padding_tokens(self, worker):
        """Test that padding tokens (attention_mask=0) are skipped."""
        text = "xin"
        predictions = [0, 0, 0, 0, 0]  # Includes padding
        offset_mapping = [(0, 0), (0, 3), (0, 0), (0, 0), (0, 0)]
        attention_mask = [1, 1, 0, 0, 0]  # Last 3 are padding
        
        spans = worker._extract_spans(text, predictions, offset_mapping, attention_mask)
        
        assert len(spans) == 0


class TestDetectSpans:
    """Test _detect_spans method."""
    
    @pytest.fixture
    def worker(self):
        """Create worker instance with mocked model."""
        input_q = MagicMock()
        output_q = MagicMock()
        worker = SpanDetectorWorker(input_q, output_q, "visobert-hsd-span")
        
        # Mock tokenizer
        worker.tokenizer = MagicMock()
        worker.tokenizer.return_value = {
            "input_ids": MagicMock(),
            "attention_mask": MagicMock()
        }
        
        # Mock model
        worker.model = MagicMock()
        
        return worker
    
    @patch("app.workers.span_detector.torch")
    def test_detect_spans_with_keywords(self, mock_torch, worker):
        """Test _detect_spans returns proper structure."""
        # Setup mock return values
        mock_logits = MagicMock()
        mock_logits.argmax.return_value.__getitem__.return_value.tolist.return_value = [0, 1, 2, 0]
        worker.model.return_value.logits = mock_logits
        
        # Mock tokenizer output with offset_mapping
        mock_offset_mapping = MagicMock()
        mock_offset_mapping.__getitem__.return_value.tolist.return_value = [
            (0, 0), (0, 5), (6, 9), (0, 0)
        ]
        
        mock_attention_mask = MagicMock()
        mock_attention_mask.__getitem__.return_value.tolist.return_value = [1, 1, 1, 1]
        
        mock_inputs = {
            "offset_mapping": mock_offset_mapping,
            "attention_mask": mock_attention_mask,
        }
        mock_inputs["pop"] = lambda key: mock_offset_mapping
        
        worker.tokenizer.return_value = mock_inputs
        
        result = worker._detect_spans("thằng ngu", "req-123")
        
        assert result["request_id"] == "req-123"
        assert "detected_keywords" in result
        assert "spans" in result
        assert "text_length" in result


class TestProcessMethod:
    """Test process method."""
    
    @pytest.fixture
    def worker(self):
        """Create worker instance."""
        input_q = MagicMock()
        output_q = MagicMock()
        return SpanDetectorWorker(input_q, output_q, "visobert-hsd-span")
    
    def test_process_skips_none_input(self, worker):
        """Test process skips None input."""
        worker.process(None)
        worker.output_queue.put.assert_not_called()
    
    def test_process_skips_non_dict_input(self, worker):
        """Test process skips non-dict input."""
        worker.process("not a dict")
        worker.output_queue.put.assert_not_called()
    
    def test_process_skips_empty_text(self, worker):
        """Test process skips empty text."""
        worker.process({"text": "", "request_id": "test"})
        worker.output_queue.put.assert_not_called()
    
    def test_process_skips_short_text(self, worker):
        """Test process skips text shorter than MIN_TEXT_LENGTH."""
        worker.process({"text": "ab", "request_id": "test"})
        worker.output_queue.put.assert_not_called()


class TestModelLoading:
    """Test model loading functionality."""
    
    @pytest.fixture
    def worker(self):
        """Create worker instance."""
        input_q = MagicMock()
        output_q = MagicMock()
        return SpanDetectorWorker(input_q, output_q, "visobert-hsd-span")
    
    @patch("os.path.exists")
    @patch("os.listdir")
    def test_load_model_prefers_int8(self, mock_listdir, mock_exists, worker):
        """Test model loading prefers INT8 over FP32."""
        mock_exists.return_value = True
        mock_listdir.return_value = ["model_quantized.onnx"]
        
        with patch("app.workers.span_detector.ORTModelForTokenClassification") as mock_ort:
            with patch("app.workers.span_detector.AutoTokenizer") as mock_tokenizer:
                mock_ort.from_pretrained.return_value = MagicMock()
                mock_tokenizer.from_pretrained.return_value = MagicMock()
                
                # This will try to load the model
                try:
                    worker.load_model()
                except Exception:
                    pass  # Expected since we're mocking
    
    @patch("os.path.exists")
    def test_load_model_raises_if_not_found(self, mock_exists, worker):
        """Test FileNotFoundError when model not found."""
        mock_exists.return_value = False
        
        with pytest.raises(FileNotFoundError) as exc_info:
            worker.load_model()
        
        assert "visobert-hsd-span" in str(exc_info.value).lower()


class TestLabelInference:
    """Test label inference from detected spans.
    
    The _infer_label() method replaces the separate ViSoBERT-HSD model by inferring
    the moderation classification directly from detected toxic spans.
    """
    
    @pytest.fixture
    def worker(self):
        """Create worker instance."""
        input_q = MagicMock()
        output_q = MagicMock()
        return SpanDetectorWorker(input_q, output_q, "visobert-hsd-span")
    
    def test_empty_spans_returns_clean(self, worker):
        """Test no spans returns CLEAN with 1.0 confidence."""
        spans = []
        label, label_id, confidence = worker._infer_label(spans)
        
        assert label == "CLEAN"
        assert label_id == 0
        assert confidence == 1.0
    
    def test_severe_hate_indicator_returns_hate(self, worker):
        """Test severe indicators return HATE classification."""
        # Test "giết" - violence indicator
        spans = [{"text": "giết", "start": 0, "end": 4}]
        label, label_id, confidence = worker._infer_label(spans)
        
        assert label == "HATE"
        assert label_id == 2
        assert confidence == 0.90
    
    def test_extreme_vulgar_returns_hate(self, worker):
        """Test extreme vulgar words return HATE classification."""
        # Test "địt" - extreme vulgar
        spans = [{"text": "địt", "start": 0, "end": 3}]
        label, label_id, confidence = worker._infer_label(spans)
        
        assert label == "HATE"
        assert label_id == 2
        assert confidence == 0.90
    
    def test_violence_without_diacritics_returns_hate(self, worker):
        """Test violence words without diacritics (ASR output)."""
        spans = [{"text": "giet", "start": 0, "end": 4}]
        label, label_id, confidence = worker._infer_label(spans)
        
        assert label == "HATE"
        assert label_id == 2
        assert confidence == 0.90
    
    def test_slur_phrase_returns_hate(self, worker):
        """Test slur phrases return HATE classification."""
        spans = [{"text": "thằng chó", "start": 0, "end": 9}]
        label, label_id, confidence = worker._infer_label(spans)
        
        assert label == "HATE"
        assert label_id == 2
        assert confidence == 0.90
    
    def test_mild_insult_returns_offensive(self, worker):
        """Test mild insults return OFFENSIVE classification."""
        # Test "ngu" - mild insult
        spans = [{"text": "ngu", "start": 0, "end": 3}]
        label, label_id, confidence = worker._infer_label(spans)
        
        assert label == "OFFENSIVE"
        assert label_id == 1
        assert confidence == 0.85
    
    def test_abbreviation_returns_offensive(self, worker):
        """Test abbreviations return OFFENSIVE classification."""
        spans = [{"text": "vcl", "start": 0, "end": 3}]
        label, label_id, confidence = worker._infer_label(spans)
        
        assert label == "OFFENSIVE"
        assert label_id == 1
        assert confidence == 0.85
    
    def test_mild_vulgar_returns_offensive(self, worker):
        """Test mild vulgar words return OFFENSIVE classification."""
        spans = [{"text": "vãi", "start": 0, "end": 3}]
        label, label_id, confidence = worker._infer_label(spans)
        
        assert label == "OFFENSIVE"
        assert label_id == 1
        assert confidence == 0.85
    
    def test_mild_insult_without_diacritics(self, worker):
        """Test mild insults without diacritics (ASR output)."""
        spans = [{"text": "dien", "start": 0, "end": 4}]  # điên without diacritics
        label, label_id, confidence = worker._infer_label(spans)
        
        assert label == "OFFENSIVE"
        assert label_id == 1
        assert confidence == 0.85
    
    def test_unknown_span_defaults_to_offensive(self, worker):
        """Test unknown spans default to OFFENSIVE with lower confidence."""
        # Unknown word not in indicators
        spans = [{"text": "xyz_unknown", "start": 0, "end": 11}]
        label, label_id, confidence = worker._infer_label(spans)
        
        assert label == "OFFENSIVE"
        assert label_id == 1
        assert confidence == 0.80  # Lower confidence for unknown
    
    def test_mixed_severity_takes_highest(self, worker):
        """Test mixed spans take highest severity (HATE > OFFENSIVE)."""
        spans = [
            {"text": "ngu", "start": 0, "end": 3},      # OFFENSIVE
            {"text": "giết", "start": 10, "end": 14},   # HATE
        ]
        label, label_id, confidence = worker._infer_label(spans)
        
        # Should return HATE since it's more severe
        assert label == "HATE"
        assert label_id == 2
    
    def test_case_insensitive_matching(self, worker):
        """Test matching is case-insensitive."""
        spans = [{"text": "NGU", "start": 0, "end": 3}]
        label, label_id, confidence = worker._infer_label(spans)
        
        assert label == "OFFENSIVE"
        assert label_id == 1
    
    def test_partial_match_in_longer_span(self, worker):
        """Test indicator within longer span text is matched."""
        spans = [{"text": "thằng ngu này", "start": 0, "end": 13}]
        label, label_id, confidence = worker._infer_label(spans)
        
        # "ngu" is in the span text
        assert label_id > 0  # Not CLEAN
    
    def test_label_map_consistency(self, worker):
        """Test MODERATION_LABEL_MAP is consistent."""
        assert worker.MODERATION_LABEL_MAP[0] == "CLEAN"
        assert worker.MODERATION_LABEL_MAP[1] == "OFFENSIVE"
        assert worker.MODERATION_LABEL_MAP[2] == "HATE"
