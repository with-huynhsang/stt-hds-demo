import logging
import multiprocessing
import threading
from typing import Dict, Optional, Tuple
from app.workers.base import BaseWorker

logger = logging.getLogger(__name__)


class ModelManager:
    """
    Manages AI model worker processes using multiprocessing.
    
    Each model runs in a separate process to avoid GIL limitations
    and ensure CPU-bound inference doesn't block the event loop.
    
    Supports two types of workers:
    - STT models (zipformer): Speech-to-text transcription
    - Span detector (visobert-hsd-span): Content moderation with span extraction
      (Unified moderation - infers label from detected spans)
    
    Note: ViSoBERT-HSD (separate classification model) has been removed.
    Label inference is now done directly in SpanDetectorWorker.
    """
    
    VALID_MODELS = ["zipformer"]
    VALID_SPAN_DETECTORS = ["visobert-hsd-span"]
    
    def __init__(self):
        # STT model resources
        self.active_processes: Dict[str, multiprocessing.Process] = {}
        self.input_queues: Dict[str, multiprocessing.Queue] = {}
        self.output_queues: Dict[str, multiprocessing.Queue] = {}
        self.current_model: Optional[str] = None
        
        # Span detector resources (unified moderation - span extraction + label inference)
        self.span_detector_process: Optional[multiprocessing.Process] = None
        self.span_detector_input_queue: Optional[multiprocessing.Queue] = None
        self.span_detector_output_queue: Optional[multiprocessing.Queue] = None
        self.current_span_detector: Optional[str] = None
        
        # Initialize from settings - actual moderation only works when detector is loaded
        from app.core.config import settings
        self._moderation_enabled: bool = settings.ENABLE_CONTENT_MODERATION
        
        # Track loading state
        self._loading_model: Optional[str] = None
        self._loading_span_detector: Optional[str] = None
        self._loading_lock = threading.Lock()

    @property
    def is_loading(self) -> bool:
        """Check if a model or detector is currently being loaded."""
        with self._loading_lock:
            return (
                self._loading_model is not None 
                or self._loading_span_detector is not None
            )

    @property
    def loading_model(self) -> Optional[str]:
        """Get the name of the model currently being loaded."""
        with self._loading_lock:
            return self._loading_model

    @property
    def loading_span_detector(self) -> Optional[str]:
        """Get the name of the span detector currently being loaded."""
        with self._loading_lock:
            return self._loading_span_detector

    @property
    def moderation_enabled(self) -> bool:
        """Check if content moderation is currently enabled and running."""
        return self._moderation_enabled and self.current_span_detector is not None

    @property
    def moderation_requested(self) -> bool:
        """Check if moderation is requested by user (regardless of detector state)."""
        return self._moderation_enabled

    def get_status(self) -> str:
        """Get the current status of the model manager."""
        with self._loading_lock:
            if self._loading_model or self._loading_span_detector:
                return "loading"
            elif self.current_model and self.current_model in self.active_processes:
                return "ready"
            else:
                return "idle"

    def start_model(self, model_name: str) -> None:
        """Start a model worker process."""
        if model_name not in self.VALID_MODELS:
            raise ValueError(f"Unknown model: {model_name}. Valid options: {self.VALID_MODELS}")
            
        if self.current_model == model_name and model_name in self.active_processes:
            logger.debug(f"Model {model_name} already running")
            return

        # Set loading state
        with self._loading_lock:
            self._loading_model = model_name

        try:
            self.stop_current_model()

            logger.info(f"Starting model: {model_name}")
            input_q = multiprocessing.Queue(maxsize=100)  # Limit queue size
            output_q = multiprocessing.Queue(maxsize=100)
            
            worker_class = self._get_worker_class(model_name)
            if not worker_class:
                raise ValueError(f"No worker implementation for model: {model_name}")
            
            worker = worker_class(input_q, output_q, model_name)
            
            process = multiprocessing.Process(target=worker.run, daemon=True)
            process.start()
            
            self.active_processes[model_name] = process
            self.input_queues[model_name] = input_q
            self.output_queues[model_name] = output_q
            self.current_model = model_name
            
            logger.info(f"Model {model_name} started (PID: {process.pid})")
        finally:
            # Clear loading state
            with self._loading_lock:
                self._loading_model = None

    def stop_current_model(self) -> None:
        """Stop the currently running model worker."""
        if not self.current_model or self.current_model not in self.active_processes:
            return
            
        model_name = self.current_model
        logger.info(f"Stopping model: {model_name}")
        
        # Send stop signal
        if model_name in self.input_queues:
            try:
                self.input_queues[model_name].put_nowait("STOP")
            except Exception as e:
                logger.warning(f"Could not send stop signal: {e}")
        
        # Wait for graceful shutdown
        process = self.active_processes[model_name]
        process.join(timeout=10)
        
        if process.is_alive():
            logger.warning(f"Model {model_name} did not stop gracefully, terminating")
            process.terminate()
            process.join(timeout=5)
            
            if process.is_alive():
                logger.error(f"Model {model_name} still alive after terminate, killing")
                process.kill()
        
        # Cleanup
        self._cleanup_model(model_name)
        self.current_model = None
        logger.info(f"Model {model_name} stopped")

    def stop_all_models(self) -> None:
        """Stop all running model workers and detectors."""
        # Stop STT models
        for model_name in list(self.active_processes.keys()):
            self.current_model = model_name
            self.stop_current_model()
        # Stop span detector (unified moderation)
        self.stop_span_detector()

    def preload_all_models(self) -> None:
        """Pre-load all models on startup for faster first request.
        
        This eliminates cold-start latency by loading:
        - Zipformer STT model
        - ViSoBERT-HSD-Span detector (unified moderation with label inference)
        """
        logger.info("Pre-loading all models for faster startup...")
        
        # Load STT model
        try:
            self.start_model("zipformer")
            logger.info("✓ Zipformer model pre-loaded")
        except Exception as e:
            logger.error(f"✗ Failed to pre-load Zipformer: {e}")
        
        # Load span detector (now handles both span extraction AND label inference)
        try:
            self.start_span_detector("visobert-hsd-span")
            logger.info("✓ ViSoBERT-HSD-Span detector pre-loaded (unified moderation)")
        except Exception as e:
            logger.error(f"✗ Failed to pre-load ViSoBERT-HSD-Span: {e}")
        
        logger.info("All models pre-loaded successfully!")

    def get_queues(self, model_name: str) -> Tuple[Optional[multiprocessing.Queue], Optional[multiprocessing.Queue]]:
        """Get input and output queues for a model."""
        if model_name != self.current_model:
            return None, None
        return self.input_queues.get(model_name), self.output_queues.get(model_name)

    def set_moderation_enabled(self, enabled: bool) -> None:
        """Enable or disable content moderation without stopping the detector."""
        self._moderation_enabled = enabled
        logger.info(f"Content moderation {'enabled' if enabled else 'disabled'}")

    def _cleanup_model(self, model_name: str) -> None:
        """Clean up resources for a model."""
        if model_name in self.active_processes:
            del self.active_processes[model_name]
        if model_name in self.input_queues:
            try:
                self.input_queues[model_name].close()
            except Exception:
                pass
            del self.input_queues[model_name]
        if model_name in self.output_queues:
            try:
                self.output_queues[model_name].close()
            except Exception:
                pass
            del self.output_queues[model_name]

    def _get_worker_class(self, model_name: str):
        """Get the worker class for a model name (lazy import)."""
        if model_name == "zipformer":
            from app.workers.zipformer import ZipformerWorker
            return ZipformerWorker
        return None

    # ========== Span Detector Management Methods ==========
    
    def start_span_detector(self, detector_name: str = "visobert-hsd-span") -> None:
        """Start the span detector worker process for extracting toxic keywords.
        
        The span detector uses visobert-hsd-span model with BIO tagging to
        identify the specific toxic spans within flagged text.
        """
        if detector_name not in self.VALID_SPAN_DETECTORS:
            raise ValueError(f"Unknown span detector: {detector_name}. Valid options: {self.VALID_SPAN_DETECTORS}")
        
        if self.current_span_detector == detector_name and self.span_detector_process is not None:
            logger.debug(f"Span detector {detector_name} already running")
            return
        
        # Set loading state
        with self._loading_lock:
            self._loading_span_detector = detector_name
        
        try:
            # Stop any existing span detector first
            self.stop_span_detector()
            
            logger.info(f"Starting span detector: {detector_name}")
            input_q = multiprocessing.Queue(maxsize=100)
            output_q = multiprocessing.Queue(maxsize=100)
            
            span_detector_class = self._get_span_detector_class(detector_name)
            if not span_detector_class:
                raise ValueError(f"No worker implementation for span detector: {detector_name}")
            
            worker = span_detector_class(input_q, output_q, detector_name)
            
            process = multiprocessing.Process(target=worker.run, daemon=True)
            process.start()
            
            self.span_detector_process = process
            self.span_detector_input_queue = input_q
            self.span_detector_output_queue = output_q
            self.current_span_detector = detector_name
            
            logger.info(f"Span detector {detector_name} started (PID: {process.pid})")
        finally:
            # Clear loading state
            with self._loading_lock:
                self._loading_span_detector = None

    def stop_span_detector(self) -> None:
        """Stop the currently running span detector worker."""
        if not self.current_span_detector or self.span_detector_process is None:
            return
        
        detector_name = self.current_span_detector
        logger.info(f"Stopping span detector: {detector_name}")
        
        # Send stop signal
        if self.span_detector_input_queue is not None:
            try:
                self.span_detector_input_queue.put_nowait("STOP")
            except Exception as e:
                logger.warning(f"Could not send stop signal to span detector: {e}")
        
        # Wait for graceful shutdown
        process = self.span_detector_process
        process.join(timeout=10)
        
        if process.is_alive():
            logger.warning(f"Span detector {detector_name} did not stop gracefully, terminating")
            process.terminate()
            process.join(timeout=5)
            
            if process.is_alive():
                logger.error(f"Span detector {detector_name} still alive after terminate, killing")
                process.kill()
        
        # Cleanup
        self._cleanup_span_detector()
        logger.info(f"Span detector {detector_name} stopped")

    def get_span_detector_queues(self) -> Tuple[Optional[multiprocessing.Queue], Optional[multiprocessing.Queue]]:
        """Get input and output queues for the span detector."""
        if not self.current_span_detector:
            return None, None
        return self.span_detector_input_queue, self.span_detector_output_queue

    def _cleanup_span_detector(self) -> None:
        """Clean up resources for the span detector."""
        if self.span_detector_input_queue is not None:
            try:
                self.span_detector_input_queue.close()
            except Exception:
                pass
            self.span_detector_input_queue = None
        
        if self.span_detector_output_queue is not None:
            try:
                self.span_detector_output_queue.close()
            except Exception:
                pass
            self.span_detector_output_queue = None
        
        self.span_detector_process = None
        self.current_span_detector = None

    def _get_span_detector_class(self, detector_name: str):
        """Get the span detector worker class for a detector name (lazy import)."""
        if detector_name == "visobert-hsd-span":
            from app.workers.span_detector import SpanDetectorWorker
            return SpanDetectorWorker
        return None


# Global manager instance
manager = ModelManager()
