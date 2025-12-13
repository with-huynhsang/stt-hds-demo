import os
import time
import numpy as np

from app.workers.base import BaseWorker
from app.core.config import settings


class ZipformerWorker(BaseWorker):
    """Worker for Zipformer (RNN-T) model using sherpa-onnx.
    
    Zipformer is a streaming RNN-T model that produces incremental results.
    To avoid flooding the client with duplicate results, we only send updates
    when the transcription text actually changes.
    """
    
    def load_model(self):
        import sherpa_onnx
        
        # Use settings for model path
        base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../"))
        model_dir = os.path.join(base_dir, settings.MODEL_STORAGE_PATH, "zipformer", "hynt-zipformer-30M-6000h")
        
        tokens = os.path.join(model_dir, "tokens.txt")
        encoder = os.path.join(model_dir, "encoder-epoch-20-avg-10.int8.onnx")
        decoder = os.path.join(model_dir, "decoder-epoch-20-avg-10.int8.onnx")
        joiner = os.path.join(model_dir, "joiner-epoch-20-avg-10.int8.onnx")

        if not os.path.exists(encoder):
            raise FileNotFoundError(f"Model files not found in {model_dir}")

        self.logger.info(f"Loading model from {model_dir}")

        try:
            recognizer = sherpa_onnx.OfflineRecognizer.from_transducer(
                tokens=tokens,
                encoder=encoder,
                decoder=decoder,
                joiner=joiner,
                num_threads=2,
                sample_rate=16000,
                feature_dim=80,
                decoding_method="greedy_search",
                provider="cpu",
            )
            
            self.recognizer = recognizer
            self.stream = recognizer.create_stream()
            self.last_text = ""  # Track last sent text for deduplication
            self.logger.info("Zipformer model loaded successfully")
            
        except Exception as e:
            self.logger.error(f"Failed to load Zipformer model: {e}", exc_info=True)
            self.recognizer = None
            raise

    def format_vietnamese_text(self, text: str) -> str:
        """Convert text to Sentence case."""
        if not text:
            return ""
        text = text.lower()
        if text:
            text = text[0].upper() + text[1:]
        return text

    def process(self, item):
        if not self.recognizer:
            return

        force_output = False
        
        if isinstance(item, dict):
            audio_data = item.get("audio")
            if item.get("reset"):
                self.logger.debug("Resetting stream for new session")
                self.stream = self.recognizer.create_stream()
                self.last_text = ""  # Reset deduplication tracker
                if not audio_data:
                    return
            if item.get("flush"):
                # Force output remaining result and reset stream
                self.logger.info("Flush signal received - outputting final result")
                force_output = True
        else:
            audio_data = item

        if audio_data:
            # Start timing for latency measurement
            start_time = time.perf_counter()
            
            # Convert bytes (int16) to float32 normalized
            samples = np.frombuffer(audio_data, dtype=np.int16)
            samples = samples.astype(np.float32) / 32768.0
            
            self.stream.accept_waveform(16000, samples)
            self.recognizer.decode_stream(self.stream)
            
            # Calculate processing latency
            latency_ms = (time.perf_counter() - start_time) * 1000
            
            raw_text = self.stream.result.text
            formatted_text = self.format_vietnamese_text(raw_text)
            
            # Only send result if text has actually changed (deduplication)
            if formatted_text and formatted_text != self.last_text:
                self.last_text = formatted_text
                result = {
                    "text": formatted_text,
                    "is_final": False,
                    "model": "zipformer",
                    "workflow_type": "streaming",  # Streaming = text contains full transcription
                    "latency_ms": round(latency_ms, 2)
                }
                
                self.output_queue.put(result)
        
        # Handle flush: output final result and reset stream
        if force_output:
            raw_text = self.stream.result.text
            formatted_text = self.format_vietnamese_text(raw_text)
            
            if formatted_text:
                result = {
                    "text": formatted_text,
                    "is_final": True,  # Mark as final on flush
                    "model": "zipformer",
                    "workflow_type": "streaming",  # Streaming = text contains full transcription
                    "latency_ms": 0
                }
                self.output_queue.put(result)
                self.logger.info(f"Flush output: '{formatted_text[:50]}...'")
            
            # Reset stream and last_text to prevent accumulation in next session
            self.stream = self.recognizer.create_stream()
            self.last_text = ""
            self.logger.debug("Stream reset after flush")
