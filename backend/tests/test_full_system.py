"""
Full system tests for model loading.

These tests verify that all models can be loaded correctly.
They require the model files to be present in models_storage/.

Run with: pytest tests/test_full_system.py -v -s
"""
import pytest
import multiprocessing
import sys
import os

# Add backend to sys.path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.workers.zipformer import ZipformerWorker


class TestModelLoading:
    """Test that all models can be loaded successfully."""
    
    @pytest.fixture
    def queues(self):
        """Create multiprocessing queues."""
        input_q = multiprocessing.Queue()
        output_q = multiprocessing.Queue()
        yield input_q, output_q
        input_q.close()
        output_q.close()

    @pytest.mark.asyncio
    async def test_zipformer_loading(self, queues):
        """Test Zipformer model loading."""
        print("\n🔄 Testing Zipformer Loading...")
        input_q, output_q = queues
        worker = ZipformerWorker(input_q, output_q, "zipformer")
        
        try:
            worker.load_model()
            assert worker.recognizer is not None
            assert worker.stream is not None
            print("✅ Zipformer loaded successfully.")
        except FileNotFoundError as e:
            pytest.skip(f"Zipformer model files not found: {e}")
        except Exception as e:
            pytest.fail(f"Zipformer failed to load: {e}")


class TestWorkerInheritance:
    """Test that workers properly inherit from BaseWorker."""
    
    def test_all_workers_have_required_methods(self):
        """Verify all workers implement required abstract methods."""
        from app.workers.base import BaseWorker
        
        workers = [ZipformerWorker]
        
        for worker_cls in workers:
            assert issubclass(worker_cls, BaseWorker)
            # Check abstract methods are implemented
            assert hasattr(worker_cls, 'load_model')
            assert hasattr(worker_cls, 'process')
            assert callable(getattr(worker_cls, 'load_model'))
            assert callable(getattr(worker_cls, 'process'))


class TestConflictCheck:
    """Check for resource conflicts."""
    
    def test_no_hardcoded_absolute_paths(self):
        """Verify no hardcoded absolute paths in worker files."""
        import inspect
        
        workers = [ZipformerWorker]
        
        for worker_cls in workers:
            source = inspect.getsource(worker_cls)
            # Check for common hardcoded path patterns
            assert 'C:\\' not in source, f"{worker_cls.__name__} has hardcoded Windows path"
            assert '/home/' not in source, f"{worker_cls.__name__} has hardcoded Unix path"
            assert 'd:\\voice2text' not in source.lower(), f"{worker_cls.__name__} has hardcoded project path"
    
    def test_models_use_settings_path(self):
        """Verify workers use settings.MODEL_STORAGE_PATH."""
        import inspect
        
        workers = [ZipformerWorker]
        
        for worker_cls in workers:
            source = inspect.getsource(worker_cls)
            # Should import and use settings
            assert 'settings' in source, f"{worker_cls.__name__} should use settings"
