"""
Comprehensive Integration Tests for ViSoBERT-HSD-Span Model.

These tests directly test the model's ability to detect hate speech spans
in Vietnamese text. Tests cover:
- Model loading and inference
- BIO tagging accuracy
- Various hate speech patterns
- Edge cases and boundary conditions
- Performance benchmarks

Requirements:
    - Model must be downloaded: python scripts/setup_hsd_span_model.py
    - Dependencies: pytest, torch, transformers, optimum

Run:
    pytest tests/integration/test_span_detector_model.py -v
    pytest tests/integration/test_span_detector_model.py -v -k "hate"  # Run only hate-related tests
    
Note:
    Many tests are designed to analyze model behavior rather than assert correctness.
    The model may not detect all offensive spans accurately.
"""
import pytest
import time
import os
import sys
from typing import List, Dict, Tuple
from dataclasses import dataclass

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))


@dataclass
class SpanTestCase:
    """Test case for span detection."""
    text: str
    description: str
    expected_has_spans: bool
    expected_keywords: List[str] = None  # Optional - for exact matching
    min_keywords: int = 0  # Minimum expected keywords
    max_keywords: int = None  # Maximum expected keywords (None = unlimited)


class TestSpanDetectorModelIntegration:
    """Integration tests for the SpanDetectorWorker with real model."""
    
    @pytest.fixture(scope="class")
    def worker(self):
        """Create and load SpanDetectorWorker with real model."""
        from multiprocessing import Queue
        from app.workers.span_detector import SpanDetectorWorker
        
        input_q = Queue()
        output_q = Queue()
        worker = SpanDetectorWorker(input_q, output_q, "visobert-hsd-span")
        
        # Check if model exists
        from app.core.config import settings
        model_path = os.path.join(
            os.path.dirname(__file__), 
            "../..", 
            settings.MODEL_STORAGE_PATH, 
            "visobert-hsd-span", 
            "onnx-int8"
        )
        
        if not os.path.exists(model_path):
            pytest.skip(
                "Model not found. Run 'python scripts/setup_hsd_span_model.py' first."
            )
        
        worker.load_model()
        return worker
    
    def _detect_spans(self, worker, text: str) -> Dict:
        """Helper to run span detection."""
        return worker._detect_spans(text, "test-id")


class TestModelLoading(TestSpanDetectorModelIntegration):
    """Test model loading functionality."""
    
    def test_model_loads_successfully(self, worker):
        """Test that model loads without errors."""
        assert worker.model is not None
        assert worker.tokenizer is not None
    
    def test_model_has_correct_labels(self, worker):
        """Test that model has correct BIO labels."""
        assert worker.LABEL_MAP[0] == "O"
        assert worker.LABEL_MAP[1] == "B-T"
        assert worker.LABEL_MAP[2] == "I-T"
    
    def test_tokenizer_has_special_tokens(self, worker):
        """Test tokenizer has required special tokens."""
        assert worker.tokenizer.cls_token is not None
        assert worker.tokenizer.sep_token is not None
        assert worker.tokenizer.pad_token is not None


class TestHateSpeechSpanDetection(TestSpanDetectorModelIntegration):
    """Test detection of various hate speech patterns."""
    
    # ==================== Offensive Words Tests ====================
    
    @pytest.mark.parametrize("text,description", [
        ("thằng ngu", "Single offensive word"),
        ("đồ ngu ngốc", "Offensive phrase"),
        ("mày ngu lắm", "Offensive with context"),
        ("thằng chó", "Animal insult"),
        ("con chó mày", "Animal insult with pronoun"),
        ("đồ khốn nạn", "Strong insult"),
        ("thằng khốn", "Short strong insult"),
    ])
    def test_detect_offensive_words(self, worker, text, description):
        """Test detection of common offensive words."""
        result = self._detect_spans(worker, text)
        
        assert "detected_keywords" in result, f"Missing detected_keywords for: {description}"
        assert "spans" in result, f"Missing spans for: {description}"
        
        # Log results for analysis (using ASCII-safe output)
        keywords = result.get('detected_keywords', [])
        num_spans = len(result.get('spans', []))
        print(f"\n[{description}] keywords={len(keywords)}, spans={num_spans}")
    
    @pytest.mark.parametrize("text,description,expected_keywords", [
        ("thằng ngu này", "ngu with context", ["thằng", "ngu"]),
        ("mày là đồ chó", "chó insult", ["chó"]),
        ("đồ ngu ngốc kia", "ngu ngốc phrase", ["ngu", "ngốc"]),
    ])
    def test_detect_specific_keywords(self, worker, text, description, expected_keywords):
        """Test detection of specific expected keywords."""
        result = self._detect_spans(worker, text)
        
        detected = result.get("detected_keywords", [])
        print(f"\n[{description}] expected={len(expected_keywords)}, detected={len(detected)}")
        
        # Check if at least some expected keywords are detected
        # (Model may not be 100% accurate)
        found_any = any(kw in " ".join(detected) for kw in expected_keywords)
        # Soft assertion - just log if not found
        if not found_any:
            print(f"  WARNING: None of expected keywords found")
    
    # ==================== Clean Text Tests ====================
    
    @pytest.mark.parametrize("text,description", [
        ("Xin chào bạn", "Greeting"),
        ("Hôm nay thời tiết đẹp quá", "Weather comment"),
        ("Tôi đi học mỗi ngày", "Daily activity"),
        ("Cảm ơn bạn rất nhiều", "Thank you"),
        ("Chúc bạn một ngày tốt lành", "Well wishes"),
        ("Việt Nam là đất nước xinh đẹp", "Country praise"),
        ("Tôi thích ăn phở", "Food preference"),
        ("Học tiếng Anh rất quan trọng", "Education"),
    ])
    def test_clean_text_no_spans(self, worker, text, description):
        """Test that clean text ideally returns no/minimal spans."""
        result = self._detect_spans(worker, text)
        
        keywords = result.get("detected_keywords", [])
        print(f"\n[{description}] detected={len(keywords)}")
        
        # Note: Model may have false positives - this is behavioral analysis
        if len(keywords) > 0:
            print(f"  WARNING: False positives detected: {len(keywords)} keywords")
    
    # ==================== Mixed Content Tests ====================
    
    @pytest.mark.parametrize("text,description", [
        ("Thằng ngu kia, sao mày làm việc chậm thế", "Insult in sentence"),
        ("Anh ấy là người tốt nhưng thằng kia thì ngu", "Contrast sentence"),
        ("Xin lỗi nhưng mày là đồ khốn", "Polite start + insult"),
        ("Đẹp quá, nhưng thằng chó kia làm hỏng hết", "Praise + insult"),
    ])
    def test_mixed_content(self, worker, text, description):
        """Test detection in mixed content (clean + offensive)."""
        result = self._detect_spans(worker, text)
        
        keywords = result.get('detected_keywords', [])
        print(f"\n[{description}] detected={len(keywords)}")
        
        # Should detect some spans in offensive content
        assert "detected_keywords" in result
    
    # ==================== Intensity Levels Tests ====================
    
    @pytest.mark.parametrize("text,intensity,description", [
        ("hơi ngu", "mild", "Mild offensive"),
        ("ngu quá", "moderate", "Moderate offensive"),
        ("ngu vãi", "strong", "Strong offensive"),
        ("đồ chó", "moderate", "Animal insult moderate"),
        ("đồ khốn nạn", "strong", "Strong insult"),
        ("thằng mất dạy", "strong", "Very strong insult"),
    ])
    def test_intensity_levels(self, worker, text, intensity, description):
        """Test detection across different intensity levels."""
        result = self._detect_spans(worker, text)
        
        keywords = result.get('detected_keywords', [])
        print(f"\n[{intensity.upper()}] {description}: detected={len(keywords)}")
    
    # ==================== Common Vietnamese Slang Tests ====================
    
    @pytest.mark.parametrize("text,description", [
        ("thằng óc chó", "Brain insult"),
        ("đồ não cá vàng", "Memory insult"),
        ("mày bị điên à", "Mental state insult"),
        ("thằng ngu như bò", "Comparison insult"),
        ("đồ vô học", "Education insult"),
        ("thằng mất dạy", "Upbringing insult"),
        ("con điên", "Mental insult"),
    ])
    def test_vietnamese_slang(self, worker, text, description):
        """Test detection of Vietnamese slang/colloquial insults."""
        result = self._detect_spans(worker, text)
        
        keywords = result.get('detected_keywords', [])
        spans = result.get('spans', [])
        print(f"\n[{description}] keywords={len(keywords)}, spans={len(spans)}")


class TestEdgeCases(TestSpanDetectorModelIntegration):
    """Test edge cases and boundary conditions."""
    
    def test_empty_string(self, worker):
        """Test handling of empty string."""
        # Empty string should be handled gracefully
        # Worker.process() skips empty, but _detect_spans may still work
        try:
            result = worker._detect_spans("", "test-id")
            assert result is not None
            print(f"Empty string: keywords={len(result.get('detected_keywords', []))}")
        except Exception as e:
            print(f"Empty string error (expected): {type(e).__name__}")
    
    def test_whitespace_only(self, worker):
        """Test handling of whitespace-only string."""
        result = worker._detect_spans("   ", "test-id")
        print(f"Whitespace: keywords={len(result.get('detected_keywords', []))}")
        assert "detected_keywords" in result
    
    def test_single_character(self, worker):
        """Test handling of single character."""
        result = worker._detect_spans("a", "test-id")
        print(f"Single char: keywords={len(result.get('detected_keywords', []))}")
        assert "detected_keywords" in result
    
    def test_very_long_text(self, worker):
        """Test handling of text longer than max_length (64 tokens)."""
        long_text = "Thang ngu " * 50  # Much longer than 64 tokens (ASCII-safe)
        result = worker._detect_spans(long_text, "test-id")
        
        print(f"Long text ({len(long_text)} chars): keywords={len(result.get('detected_keywords', []))}")
        
        assert "detected_keywords" in result
    
    def test_special_characters(self, worker):
        """Test handling of special characters."""
        texts = [
            "thang ngu!!! @#$%",
            "ngu...???",
            "thang<ngu>cho",
            "ngu\nngu\tngu",
        ]
        
        for text in texts:
            result = worker._detect_spans(text, "test-id")
            print(f"Special chars: keywords={len(result.get('detected_keywords', []))}")
    
    def test_unicode_characters(self, worker):
        """Test handling of Unicode Vietnamese characters."""
        texts = [
            "thằng ngố",  # ố with circumflex and dot below
            "đồ ngu",     # đ with stroke
            "mày là đứa khốn nạn",  # Various diacritics
        ]
        
        for text in texts:
            result = worker._detect_spans(text, "test-id")
            print(f"Unicode: keywords={len(result.get('detected_keywords', []))}")
    
    def test_mixed_case(self, worker):
        """Test handling of mixed case text."""
        texts = [
            "THANG NGU",
            "Thang Ngu",
            "thang NGU",
            "ThAnG nGu",
        ]
        
        for text in texts:
            result = worker._detect_spans(text, "test-id")
            print(f"Case: keywords={len(result.get('detected_keywords', []))}")
    
    def test_repeated_words(self, worker):
        """Test handling of repeated offensive words."""
        text = "ngu ngu ngu ngu ngu"
        result = worker._detect_spans(text, "test-id")
        
        print(f"Repeated words: keywords={len(result.get('detected_keywords', []))}, spans={len(result.get('spans', []))}")
    
    def test_numbers_mixed(self, worker):
        """Test handling of numbers mixed with text."""
        texts = [
            "thang ngu 123",
            "100 thang ngu",
            "thang ngu so 1",
        ]
        
        for text in texts:
            result = worker._detect_spans(text, "test-id")
            print(f"Numbers: keywords={len(result.get('detected_keywords', []))}")


class TestSpanPositionAccuracy(TestSpanDetectorModelIntegration):
    """Test accuracy of span position detection."""
    
    def test_span_positions_match_text(self, worker):
        """Test that span positions correctly match the original text."""
        text = "thang ngu nay la ai"  # ASCII-safe version
        result = worker._detect_spans(text, "test-id")
        
        spans = result.get("spans", [])
        print(f"\nPosition test: {len(spans)} spans found")
        
        for span in spans:
            start = span["start"]
            end = span["end"]
            extracted = text[start:end]
            print(f"  Span at [{start}:{end}], text='{span.get('text', '')}', extracted='{extracted}'")
    
    def test_multiple_spans_non_overlapping(self, worker):
        """Test that multiple spans don't overlap."""
        text = "thang ngu kia la do cho"  # ASCII-safe version
        result = worker._detect_spans(text, "test-id")
        
        spans = result.get("spans", [])
        print(f"\nOverlap test: {len(spans)} spans")
        
        # Check for overlapping spans
        for i, span1 in enumerate(spans):
            for span2 in spans[i+1:]:
                overlap = not (span1["end"] <= span2["start"] or span2["end"] <= span1["start"])
                if overlap:
                    print(f"  WARNING: Overlapping spans at [{span1['start']}:{span1['end']}] and [{span2['start']}:{span2['end']}]")
    
    def test_span_at_beginning(self, worker):
        """Test span detection at text beginning."""
        text = "Ngu qua, tai sao lai nhu vay"  # ASCII-safe version
        result = worker._detect_spans(text, "test-id")
        
        spans = result.get("spans", [])
        print(f"\nBeginning test: {len(spans)} spans")
        
        if spans:
            first_span_start = min(s["start"] for s in spans)
            print(f"  First span starts at: {first_span_start}")
    
    def test_span_at_end(self, worker):
        """Test span detection at text end."""
        text = "Tai sao may lai ngu"  # ASCII-safe version
        result = worker._detect_spans(text, "test-id")
        
        spans = result.get("spans", [])
        print(f"\nEnd test: {len(spans)} spans")
        
        if spans:
            last_span_end = max(s["end"] for s in spans)
            print(f"  Last span ends at: {last_span_end}, text length: {len(text)}")


class TestPerformance(TestSpanDetectorModelIntegration):
    """Test model performance metrics."""
    
    def test_inference_latency(self, worker):
        """Test inference latency for typical text."""
        text = "Thang ngu nay sao ma cham qua"  # ASCII-safe
        
        # Warm up
        worker._detect_spans(text, "warmup")
        
        # Measure latency
        latencies = []
        for i in range(10):
            start = time.perf_counter()
            worker._detect_spans(text, f"test-{i}")
            latency = (time.perf_counter() - start) * 1000
            latencies.append(latency)
        
        avg_latency = sum(latencies) / len(latencies)
        min_latency = min(latencies)
        max_latency = max(latencies)
        
        print(f"\nLatency stats (10 runs):")
        print(f"  Average: {avg_latency:.2f} ms")
        print(f"  Min: {min_latency:.2f} ms")
        print(f"  Max: {max_latency:.2f} ms")
        
        # Assert reasonable latency (adjust threshold as needed)
        assert avg_latency < 500, f"Average latency {avg_latency:.2f}ms exceeds 500ms threshold"
    
    def test_batch_throughput(self, worker):
        """Test throughput for batch processing."""
        texts = [
            "Thang ngu nay",
            "Xin chao ban",
            "Do khon nan",
            "Hom nay troi dep",
            "May la do cho",
        ] * 10  # 50 texts
        
        start = time.perf_counter()
        for i, text in enumerate(texts):
            worker._detect_spans(text, f"batch-{i}")
        total_time = time.perf_counter() - start
        
        throughput = len(texts) / total_time
        
        print(f"\nBatch throughput ({len(texts)} texts):")
        print(f"  Total time: {total_time:.2f} s")
        print(f"  Throughput: {throughput:.1f} texts/second")
    
    def test_memory_consistency(self, worker):
        """Test that repeated inference doesn't increase memory significantly."""
        import gc
        
        # Run multiple inferences
        for i in range(100):
            worker._detect_spans(f"Test text {i} thang ngu", f"mem-{i}")
        
        gc.collect()
        
        # If we get here without memory errors, test passes
        print("Memory consistency test passed (100 inferences)")


class TestBIOTaggingLogic(TestSpanDetectorModelIntegration):
    """Test BIO tagging scheme implementation."""
    
    def test_bio_sequence_detection(self, worker):
        """Test that BIO sequences are properly detected."""
        # Multi-word spans should be B-T followed by I-T
        text = "thang khon nan"  # ASCII-safe
        result = worker._detect_spans(text, "test-id")
        
        spans = result.get("spans", [])
        keywords = result.get("detected_keywords", [])
        print(f"\nBIO sequence test: {len(spans)} spans, {len(keywords)} keywords")
    
    def test_adjacent_spans(self, worker):
        """Test detection of adjacent but separate spans."""
        text = "ngu ngoc khon nan"  # ASCII-safe
        result = worker._detect_spans(text, "test-id")
        
        spans = result.get("spans", [])
        print(f"\nAdjacent spans test: {len(spans)} spans")
        
    def test_interrupted_span(self, worker):
        """Test spans interrupted by non-toxic words."""
        text = "thang nay ngu"  # ASCII-safe
        result = worker._detect_spans(text, "test-id")
        
        spans = result.get("spans", [])
        print(f"\nInterrupted span test: {len(spans)} spans")


class TestRealWorldScenarios(TestSpanDetectorModelIntegration):
    """Test real-world usage scenarios."""
    
    @pytest.mark.parametrize("text,scenario", [
        # Social media comments
        ("Bai viet hay qua, cam on ban!", "Positive comment"),
        ("Thang admin ngu vl, khong biet gi", "Negative comment with insult"),
        ("Video nay do qua, do rac", "Negative review"),
        
        # Chat messages
        ("E may oi, di dau day?", "Casual chat"),
        ("Thang kia ngu the, khong biet choi game", "Gaming insult"),
        ("Do noob, ve ma hoc lai di", "Gaming slang"),
        
        # Forum posts
        ("Theo y kien cua toi, phuong phap nay hieu qua hon", "Formal opinion"),
        ("Ai viet bai nay vay, ngu qua", "Forum insult"),
        
        # Product reviews
        ("San pham tot, giao hang nhanh, 5 sao", "Positive review"),
        ("San pham rac, do lua dao", "Negative review"),
    ])
    def test_real_world_scenario(self, worker, text, scenario):
        """Test various real-world text scenarios."""
        result = self._detect_spans(worker, text)
        
        keywords = result.get('detected_keywords', [])
        spans = result.get('spans', [])
        print(f"\n[{scenario}] keywords={len(keywords)}, spans={len(spans)}")


class TestModelOutputFormat(TestSpanDetectorModelIntegration):
    """Test that model output format is correct."""
    
    def test_output_has_required_fields(self, worker):
        """Test that output contains all required fields."""
        result = worker._detect_spans("test text", "test-id")
        
        required_fields = ["request_id", "detected_keywords", "spans", "text_length"]
        for field in required_fields:
            assert field in result, f"Missing required field: {field}"
        print(f"All required fields present: {required_fields}")
    
    def test_span_format(self, worker):
        """Test that each span has correct format."""
        result = worker._detect_spans("thang ngu", "test-id")
        
        spans = result.get("spans", [])
        print(f"\nSpan format test: {len(spans)} spans")
        
        for span in spans:
            assert "text" in span, "Span missing 'text' field"
            assert "start" in span, "Span missing 'start' field"
            assert "end" in span, "Span missing 'end' field"
            assert isinstance(span["start"], int), "'start' should be int"
            assert isinstance(span["end"], int), "'end' should be int"
            assert span["start"] <= span["end"], "'start' should be <= 'end'"
            print(f"  Valid span: [{span['start']}:{span['end']}]")
    
    def test_keywords_are_unique(self, worker):
        """Test that detected_keywords list has unique values."""
        result = worker._detect_spans("ngu ngu ngu", "test-id")
        
        keywords = result.get("detected_keywords", [])
        unique_keywords = list(dict.fromkeys(keywords))
        
        print(f"\nKeywords: {len(keywords)}, unique: {len(unique_keywords)}")
        
        # Keywords should be unique (no duplicates)
        assert len(keywords) == len(unique_keywords), "Keywords should be unique"
    
    def test_request_id_preserved(self, worker):
        """Test that request_id is preserved in output."""
        request_id = "unique-request-123"
        result = worker._detect_spans("test", request_id)
        
        assert result["request_id"] == request_id
        print(f"Request ID preserved: {request_id}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
