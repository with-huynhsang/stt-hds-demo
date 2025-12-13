import logging
import multiprocessing
from abc import ABC, abstractmethod
from typing import Any

# Configure logging for worker processes
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)


class BaseWorker(ABC):
    """
    Abstract base class for AI model workers.
    
    Each worker runs in a separate process and communicates via queues.
    """
    
    def __init__(
        self, 
        input_queue: multiprocessing.Queue, 
        output_queue: multiprocessing.Queue, 
        model_name: str
    ):
        self.input_queue = input_queue
        self.output_queue = output_queue
        self.model_name = model_name
        self.is_running = True
        self.logger = logging.getLogger(self.__class__.__name__)

    @abstractmethod
    def load_model(self) -> None:
        """Load the AI model into memory. Must be implemented by subclasses."""
        pass

    @abstractmethod
    def process(self, audio_data: Any) -> None:
        """Process audio data and put result in output_queue. Must be implemented by subclasses."""
        pass

    def run(self) -> None:
        """Main loop for the worker process."""
        self.logger.info(f"Worker starting...")
        
        try:
            self.load_model()
            self.logger.info("Model loaded successfully")
            
            while self.is_running:
                try:
                    # Get data from input queue with timeout
                    item = self.input_queue.get(timeout=1.0)
                    
                    if item == "STOP":
                        self.logger.info("Received stop signal")
                        self.is_running = False
                        break
                    
                    self.process(item)
                    
                except multiprocessing.queues.Empty:
                    continue
                except Exception as e:
                    self.logger.error(f"Error processing item: {e}", exc_info=True)
                    self.output_queue.put({"error": str(e), "model": self.model_name})
                    
        except Exception as e:
            self.logger.error(f"Fatal error: {e}", exc_info=True)
        finally:
            self.logger.info("Worker stopped")
