"""
Span Detector Worker
=====================
Worker for ViSoBERT-HSD-Span hate speech span detection using ONNX Runtime.

This worker uses a Token Classification model (BIO tagging) to detect the specific
toxic spans within text that has been flagged by the hate speech classifier.

Model:
    - Name: visolex/visobert-hsd-span
    - Labels: O (0), B-T (1), I-T (2)
    - Max Length: 64 tokens
    - Dataset: ViHOS (Vietnamese Hate and Offensive Spans)

Example:
    Input: "thằng ngu này sao mà chậm quá"
    Output: [{"text": "thằng ngu", "start": 0, "end": 9}]
"""
import os
import time
import logging
from typing import Any, Dict, List, Optional, Tuple

from app.workers.base import BaseWorker
from app.core.config import settings


class SpanDetectorWorker(BaseWorker):
    """Worker for ViSoBERT-HSD-Span hate speech span detection using ONNX Runtime.
    
    This worker loads the quantized INT8 ONNX model for optimal performance.
    Falls back to FP32 ONNX if INT8 is not available.
    
    BIO Tagging Scheme:
        - O (0): Outside of toxic span
        - B-T (1): Beginning of toxic span
        - I-T (2): Inside of toxic span (continuation)
        
    Hybrid Detection:
        Uses model predictions + rule-based fallback for common Vietnamese
        offensive phrases that the model may miss.
    """
    
    # Label mapping for BIO scheme
    LABEL_MAP = {
        0: "O",     # Outside
        1: "B-T",   # Beginning of toxic span
        2: "I-T"    # Inside toxic span
    }
    
    # Minimum text length to process (skip very short texts)
    MIN_TEXT_LENGTH = 3
    
    # Maximum sequence length (model trained with this constraint)
    MAX_SEQUENCE_LENGTH = 64
    
    # Fallback bad word/phrase patterns for hybrid detection
    # These are common Vietnamese offensive phrases the model may miss
    # Format: list of phrases (will match case-insensitively)
    FALLBACK_BAD_PHRASES = [
        # Two-word offensive phrases (with diacritics)
        "thằng chó", "con chó", "đồ chó", "thằng ngu", "con ngu", "đồ ngu",
        "thằng khốn", "con khốn", "đồ khốn", "thằng điên", "con điên", "đồ điên",
        "thằng súc sinh", "con súc sinh", "đồ súc sinh",
        "thằng đần", "con đần", "đồ đần", "thằng ngốc", "con ngốc", "đồ ngốc",
        "thằng hèn", "con hèn", "đồ hèn", "thằng nát", "con nát", "đồ nát",
        # Two-word offensive phrases (WITHOUT diacritics - for ASR output)
        "thang cho", "con cho", "do cho", "thang ngu", "con ngu", "do ngu",
        "thang khon", "con khon", "do khon", "thang dien", "con dien", "do dien",
        "thang suc sinh", "con suc sinh", "do suc sinh",
        "thang dan", "con dan", "do dan", "thang ngoc", "con ngoc", "do ngoc",
        # Vulgar phrases (with diacritics)
        "con cặc", "cái cặc", "đồ cặc", "thằng cặc",
        "con đĩ", "đồ đĩ", "thằng đĩ",
        "con lồn", "cái lồn", "đồ lồn",
        # Vulgar phrases (WITHOUT diacritics)
        "con cac", "cai cac", "do cac", "thang cac",
        "con di", "do di", "thang di",
        "con lon", "cai lon", "do lon",
        # Single offensive words (with diacritics)
        "địt", "đụ", "đéo", "vãi", "vl", "vcl", "đmm", "đkm", "clm",
        "cặc", "lồn", "đĩ", "cave", "điếm",
        # Single offensive words (WITHOUT diacritics)
        "dit", "du", "deo", "vai", "cac", "lon", "di", "diem",
    ]
    
    # =====================================================================
    # LABEL INFERENCE CONFIGURATION
    # Used to infer moderation label (CLEAN/OFFENSIVE/HATE) from detected spans
    # =====================================================================
    
    # Moderation label mapping (for unified label inference)
    MODERATION_LABEL_MAP = {
        0: "CLEAN",
        1: "OFFENSIVE",
        2: "HATE"
    }
    
    # HATE indicators - severe/violent language that warrants HATE classification
    # These words indicate severe toxicity, violence, or extreme hate speech
    SEVERE_HATE_INDICATORS = [
        # Violence-related (with diacritics)
        "giết", "chết", "hiếp", "cưỡng", "đâm", "chém", "thiêu", "đốt",
        # Violence-related (without diacritics for ASR)
        "giet", "chet", "hiep", "cuong", "dam", "chem", "thieu", "dot",
        # Extreme vulgar (with diacritics)
        "địt", "đụ", "hiếp dâm", "cưỡng hiếp",
        # Extreme vulgar (without diacritics)
        "dit", "du", "hiep dam", "cuong hiep",
        # Discriminatory terms
        "súc sinh", "suc sinh", "súc vật", "suc vat",
        # Slurs and extreme insults
        "thằng chó", "con chó", "đồ chó",
        "thang cho", "con cho", "do cho",
    ]
    
    # OFFENSIVE indicators - mild/moderate toxicity
    # These words are offensive but less severe than HATE
    MILD_OFFENSIVE_INDICATORS = [
        # Mild insults (with diacritics)
        "ngu", "điên", "khùng", "đần", "ngốc", "hèn", "nát",
        # Mild insults (without diacritics)
        "dien", "khung", "dan", "ngoc", "hen", "nat",
        # Abbreviations
        "vl", "vcl", "đmm", "đkm", "clm",
        "dmm", "dkm",
        # Mild vulgar (with diacritics)
        "vãi", "đéo", "cặc", "lồn",
        # Mild vulgar (without diacritics)
        "vai", "deo", "cac", "lon",
    ]
    
    def __init__(self, input_queue, output_queue, model_name: str = "visobert-hsd-span"):
        super().__init__(input_queue, output_queue, model_name)
        self.tokenizer = None
        self.model = None
    
    def load_model(self) -> None:
        """Load ONNX model and tokenizer.
        
        Prefers INT8 quantized model for better performance.
        Falls back to FP32 ONNX if INT8 is not available.
        """
        from optimum.onnxruntime import ORTModelForTokenClassification
        from transformers import AutoTokenizer
        
        # Get model paths
        base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../"))
        model_base = os.path.join(base_dir, settings.MODEL_STORAGE_PATH, "visobert-hsd-span")
        
        int8_path = os.path.join(model_base, "onnx-int8")
        onnx_path = os.path.join(model_base, "onnx")
        
        # Prefer INT8 quantized model
        if os.path.exists(int8_path) and os.listdir(int8_path):
            model_path = int8_path
            # INT8 quantized model uses 'model_quantized.onnx' filename
            file_name = "model_quantized.onnx"
            self.logger.info(f"Loading INT8 quantized span detector from {model_path}")
        elif os.path.exists(onnx_path) and os.listdir(onnx_path):
            model_path = onnx_path
            file_name = "model.onnx"
            self.logger.info(f"Loading FP32 ONNX span detector from {model_path}")
        else:
            raise FileNotFoundError(
                f"ViSoBERT-HSD-Span model not found. "
                f"Please run 'python scripts/setup_hsd_span_model.py' to download and convert the model."
            )
        
        # Load tokenizer
        self.tokenizer = AutoTokenizer.from_pretrained(model_path)
        
        # Load ONNX model with correct file name
        self.model = ORTModelForTokenClassification.from_pretrained(
            model_path,
            file_name=file_name,
            provider="CPUExecutionProvider"
        )
        
        self.logger.info(f"ViSoBERT-HSD-Span model loaded successfully from {model_path}")
    
    def process(self, item: Any) -> None:
        """Process text item and output span detection result.
        
        Args:
            item: Dictionary with 'text' and optional 'request_id'
        """
        if not item or not isinstance(item, dict):
            return
        
        text = item.get("text", "")
        request_id = item.get("request_id")
        
        # Skip empty or very short texts
        if not text or len(text.strip()) < self.MIN_TEXT_LENGTH:
            return
        
        start_time = time.perf_counter()
        
        try:
            result = self._detect_spans(text, request_id)
            result["latency_ms"] = round((time.perf_counter() - start_time) * 1000, 2)
            self.output_queue.put(result)
            
        except Exception as e:
            self.logger.error(f"Span detection error: {e}", exc_info=True)
            self.output_queue.put({
                "request_id": request_id,
                "error": str(e),
                "detected_keywords": [],
                "spans": []
            })
    
    def _detect_spans(self, text: str, request_id: Optional[str] = None) -> Dict:
        """Detect toxic spans in text using BIO tagging.
        
        Args:
            text: Text to analyze
            request_id: Optional request ID for tracking
            
        Returns:
            Result dictionary with detected_keywords and spans
        """
        import torch
        
        # Tokenize input with offset mapping for character-level extraction
        inputs = self.tokenizer(
            text,
            return_tensors="pt",
            truncation=True,
            max_length=self.MAX_SEQUENCE_LENGTH,
            padding="max_length",
            return_offsets_mapping=True
        )
        
        # Extract offset mapping before inference (not needed by model)
        offset_mapping = inputs.pop("offset_mapping")[0].tolist()
        
        # Run inference
        outputs = self.model(**inputs)
        logits = outputs.logits
        
        # Get predictions
        predictions = logits.argmax(dim=-1)[0].tolist()
        
        # Get attention mask to identify valid tokens
        attention_mask = inputs["attention_mask"][0].tolist()
        
        # Extract spans using BIO logic from model
        model_spans = self._extract_spans(text, predictions, offset_mapping, attention_mask)
        
        # Get fallback spans from rule-based detection
        fallback_spans = self._fallback_detect_spans(text)
        
        # Merge model and fallback spans (model takes priority)
        spans = self._merge_spans(model_spans, fallback_spans)
        
        # Extract unique keywords (preserve order of appearance)
        detected_keywords = list(dict.fromkeys([s["text"] for s in spans]))
        
        # Infer moderation label from detected spans
        # This replaces the separate ViSoBERT-HSD classification model
        label, label_id, confidence = self._infer_label(spans)
        
        return {
            "request_id": request_id,
            # Moderation classification (inferred from detected spans)
            "label": label,
            "label_id": label_id,
            "confidence": round(confidence, 4),
            "is_flagged": label_id > 0,  # True for OFFENSIVE or HATE
            # Span detection results
            "detected_keywords": detected_keywords,
            "spans": spans,
            "text_length": len(text)
        }
    
    def _extract_spans(
        self,
        text: str,
        predictions: List[int],
        offset_mapping: List[Tuple[int, int]],
        attention_mask: List[int]
    ) -> List[Dict[str, any]]:
        """Extract span text from BIO predictions.
        
        BIO Logic:
            - B-T (1): Start a new toxic span
            - I-T (2): Continue the current toxic span
            - O (0): End current span (if any)
        
        Args:
            text: Original input text
            predictions: List of predicted label IDs (0=O, 1=B-T, 2=I-T)
            offset_mapping: List of (start, end) character offsets
            attention_mask: List indicating valid tokens (1) vs padding (0)
            
        Returns:
            List of span dictionaries with text, start, end
        """
        spans = []
        current_span_start = None
        current_span_end = None
        
        for idx, (pred, offsets, mask) in enumerate(zip(predictions, offset_mapping, attention_mask)):
            # Skip padding tokens
            if mask == 0:
                continue
                
            start, end = offsets
            
            # Skip special tokens (CLS, SEP, PAD have offset (0, 0))
            if start == 0 and end == 0:
                continue
            
            label = self.LABEL_MAP.get(pred, "O")
            
            if label == "B-T":
                # Start new span - first save current span if exists
                if current_span_start is not None:
                    span_text = text[current_span_start:current_span_end].strip()
                    if span_text:
                        spans.append({
                            "text": span_text,
                            "start": current_span_start,
                            "end": current_span_end
                        })
                # Start new span
                current_span_start = start
                current_span_end = end
                
            elif label == "I-T":
                # Continue span
                if current_span_start is not None:
                    # Extend current span
                    current_span_end = end
                else:
                    # I-T without B-T, treat as B-T (recovery)
                    current_span_start = start
                    current_span_end = end
                    
            else:  # O
                # End current span if exists
                if current_span_start is not None:
                    span_text = text[current_span_start:current_span_end].strip()
                    if span_text:
                        spans.append({
                            "text": span_text,
                            "start": current_span_start,
                            "end": current_span_end
                        })
                    current_span_start = None
                    current_span_end = None
        
        # Don't forget last span if text ends with toxic content
        if current_span_start is not None:
            span_text = text[current_span_start:current_span_end].strip()
            if span_text:
                spans.append({
                    "text": span_text,
                    "start": current_span_start,
                    "end": current_span_end
                })
        
        # Filter out likely false positives from model
        spans = self._filter_model_spans(spans)
        
        return spans

    def _filter_model_spans(self, spans: List[Dict[str, any]]) -> List[Dict[str, any]]:
        """Filter model spans to reduce false positives.
        
        The model sometimes marks common words as toxic. We filter by:
        1. Checking if span text matches known offensive patterns
        2. Checking if span text contains any known offensive word
        
        Args:
            spans: Model-detected spans
            
        Returns:
            Filtered list of spans
        """
        filtered = []
        
        # Create lowercase set of known bad words/phrases
        known_bad = set(word.lower() for word in self.FALLBACK_BAD_PHRASES)
        
        for span in spans:
            span_text_lower = span["text"].lower()
            
            # Keep if exact match with known bad phrase
            if span_text_lower in known_bad:
                filtered.append(span)
                continue
            
            # Keep if any known bad word is contained in span
            for bad_word in known_bad:
                if bad_word in span_text_lower or span_text_lower in bad_word:
                    filtered.append(span)
                    break
        
        return filtered

    def _fallback_detect_spans(self, text: str) -> List[Dict[str, any]]:
        """Rule-based fallback detection for common Vietnamese bad words.
        
        This supplements the model which may miss some common phrases.
        Uses case-insensitive matching with word boundaries.
        
        Args:
            text: Original input text
            
        Returns:
            List of span dictionaries with text, start, end
        """
        import re
        
        spans = []
        text_lower = text.lower()
        
        # Sort by length (longest first) to match multi-word phrases first
        sorted_words = sorted(self.FALLBACK_BAD_PHRASES, key=len, reverse=True)
        
        # Track which positions are already covered
        covered_positions = set()
        
        for bad_word in sorted_words:
            bad_word_lower = bad_word.lower()
            
            # Use word boundary matching where possible
            # \b doesn't work well with Vietnamese, use lookahead/lookbehind for spaces
            pattern = rf'(?:^|(?<=\s)){re.escape(bad_word_lower)}(?=\s|$)'
            
            for match in re.finditer(pattern, text_lower):
                start = match.start()
                end = match.end()
                
                # Check if this position is already covered
                position_range = set(range(start, end))
                if position_range & covered_positions:
                    continue
                
                # Mark positions as covered
                covered_positions.update(position_range)
                
                # Get original text (preserve case)
                original_text = text[start:end]
                
                spans.append({
                    "text": original_text,
                    "start": start,
                    "end": end
                })
        
        # Sort by position
        spans.sort(key=lambda x: x["start"])
        
        return spans

    def _merge_spans(
        self,
        model_spans: List[Dict[str, any]],
        fallback_spans: List[Dict[str, any]]
    ) -> List[Dict[str, any]]:
        """Merge model-detected spans with fallback spans intelligently.
        
        Strategy:
        1. If a fallback span is LONGER and covers a model span, use fallback
        2. If model span is longer or equal, keep model span
        3. Non-overlapping spans are kept from both sources
        
        Args:
            model_spans: Spans detected by the model
            fallback_spans: Spans detected by rule-based fallback
            
        Returns:
            Merged list of spans, sorted by position
        """
        if not fallback_spans:
            return model_spans
        if not model_spans:
            return fallback_spans
        
        # Track which model spans to replace
        model_spans_to_keep = list(model_spans)
        fallback_spans_to_add = []
        
        for fb_span in fallback_spans:
            fb_start, fb_end = fb_span["start"], fb_span["end"]
            fb_range = set(range(fb_start, fb_end))
            
            # Check overlap with each model span
            overlapping_model_spans = []
            for i, m_span in enumerate(model_spans_to_keep):
                m_start, m_end = m_span["start"], m_span["end"]
                m_range = set(range(m_start, m_end))
                
                if fb_range & m_range:  # Has overlap
                    overlapping_model_spans.append((i, m_span, len(m_range)))
            
            if not overlapping_model_spans:
                # No overlap, add fallback span
                fallback_spans_to_add.append(fb_span)
            else:
                # Check if fallback span is longer than all overlapping model spans
                fb_len = len(fb_range)
                all_model_shorter = all(fb_len > m_len for _, _, m_len in overlapping_model_spans)
                
                if all_model_shorter:
                    # Fallback is longer, replace model spans with fallback
                    # Remove overlapping model spans
                    indices_to_remove = set(i for i, _, _ in overlapping_model_spans)
                    model_spans_to_keep = [
                        s for i, s in enumerate(model_spans_to_keep)
                        if i not in indices_to_remove
                    ]
                    fallback_spans_to_add.append(fb_span)
        
        # Merge and sort
        merged = model_spans_to_keep + fallback_spans_to_add
        merged.sort(key=lambda x: x["start"])
        
        return merged

    def _infer_label(self, spans: List[Dict[str, any]]) -> Tuple[str, int, float]:
        """Infer moderation label from detected toxic spans.
        
        This method replaces the separate ViSoBERT-HSD model by inferring
        the classification label directly from the detected spans.
        
        Classification Logic:
            - No spans detected → CLEAN (0) with 1.0 confidence
            - Spans contain severe/violent words → HATE (2) with 0.90 confidence
            - Spans contain mild offensive words → OFFENSIVE (1) with 0.85 confidence
            - Has spans but no matched indicators → OFFENSIVE (1) with 0.80 confidence
        
        Args:
            spans: List of detected span dictionaries with 'text', 'start', 'end'
            
        Returns:
            Tuple of (label_str, label_id, confidence)
            - label_str: "CLEAN", "OFFENSIVE", or "HATE"
            - label_id: 0, 1, or 2
            - confidence: float between 0.0 and 1.0
        """
        # No spans = clean text
        if not spans:
            return ("CLEAN", 0, 1.0)
        
        # Collect all span texts (lowercase for matching)
        span_texts = [s["text"].lower() for s in spans]
        combined_text = " ".join(span_texts)
        
        # Check for severe HATE indicators first
        for indicator in self.SEVERE_HATE_INDICATORS:
            indicator_lower = indicator.lower()
            # Check if indicator appears in any span text
            for span_text in span_texts:
                if indicator_lower in span_text or span_text in indicator_lower:
                    return ("HATE", 2, 0.90)
        
        # Check for mild OFFENSIVE indicators
        for indicator in self.MILD_OFFENSIVE_INDICATORS:
            indicator_lower = indicator.lower()
            for span_text in span_texts:
                if indicator_lower in span_text or span_text in indicator_lower:
                    return ("OFFENSIVE", 1, 0.85)
        
        # Has spans but no specific matched indicator
        # Default to OFFENSIVE with lower confidence
        return ("OFFENSIVE", 1, 0.80)
