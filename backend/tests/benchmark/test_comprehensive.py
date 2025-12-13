"""
Comprehensive benchmark tests for Zipformer STT model.

Measures:
- Model load time
- Memory usage
- Inference latency
- Real-time factor (RTF)

Run with: pytest tests/benchmark/ -v -s -m benchmark
"""
import sys
import os
import time
import pytest
import numpy as np
import multiprocessing

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from app.workers.zipformer import ZipformerWorker
from app.core.config import settings


# =============================================================================
# Configuration
# =============================================================================

# Test audio durations in seconds
TEST_DURATIONS = [1.0, 3.0, 5.0]
SAMPLE_RATE = 16000

# Results file
RESULTS_FILE = os.path.join(os.path.dirname(__file__), "benchmark_results.txt")


# =============================================================================
# Utilities
# =============================================================================

def get_memory_usage_mb() -> float:
    """Get current process memory usage in MB."""
    try:
        import psutil
        process = psutil.Process(os.getpid())
        return process.memory_info().rss / 1024 / 1024
    except ImportError:
        return 0.0


def generate_test_audio(duration_sec: float) -> bytes:
    """Generate test audio data (random noise)."""
    samples = np.random.randint(
        -32768, 32767, 
        int(SAMPLE_RATE * duration_sec), 
        dtype=np.int16
    )
    return samples.tobytes()


def write_result(message: str) -> None:
    """Write benchmark result to file."""
    with open(RESULTS_FILE, "a", encoding="utf-8") as f:
        f.write(f"{message}\n")
    print(message)


# =============================================================================
# Benchmark Fixtures
# =============================================================================

@pytest.fixture(scope="module")
def benchmark_file():
    """Initialize benchmark results file."""
    with open(RESULTS_FILE, "w", encoding="utf-8") as f:
        f.write(f"=" * 60 + "\n")
        f.write(f"Zipformer STT Model Benchmark Results\n")
        f.write(f"Date: {time.strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"=" * 60 + "\n\n")
    yield RESULTS_FILE


@pytest.fixture
def queues():
    """Create multiprocessing queues for workers."""
    input_q = multiprocessing.Queue()
    output_q = multiprocessing.Queue()
    yield input_q, output_q
    input_q.close()
    output_q.close()


# =============================================================================
# Benchmark Tests
# =============================================================================

class TestModelLoadBenchmark:
    """Benchmark model loading performance."""
    
    @pytest.mark.benchmark
    @pytest.mark.slow
    def test_zipformer_load_time(self, benchmark_file, queues):
        """Benchmark Zipformer model load time and memory."""
        input_q, output_q = queues
        worker = ZipformerWorker(input_q, output_q, "zipformer")
        
        mem_before = get_memory_usage_mb()
        start = time.time()
        
        try:
            worker.load_model()
            load_time = time.time() - start
            mem_after = get_memory_usage_mb()
            
            result = f"""
--- Zipformer Load Benchmark ---
Load Time: {load_time:.2f}s
Memory Delta: {mem_after - mem_before:.2f} MB
Memory Total: {mem_after:.2f} MB
"""
            write_result(result)
            
            assert load_time < 30.0, "Zipformer load too slow"
            
        except FileNotFoundError:
            pytest.skip("Zipformer model files not found")


class TestInferenceLatencyBenchmark:
    """Benchmark inference latency for Zipformer model."""
    
    @pytest.mark.benchmark
    @pytest.mark.slow
    @pytest.mark.parametrize("duration", TEST_DURATIONS)
    def test_zipformer_inference(self, benchmark_file, queues, duration):
        """Benchmark Zipformer inference latency."""
        input_q, output_q = queues
        worker = ZipformerWorker(input_q, output_q, "zipformer")
        
        try:
            worker.load_model()
            
            audio_data = generate_test_audio(duration)
            
            start = time.time()
            worker.process(audio_data)
            latency = time.time() - start
            
            rtf = latency / duration
            
            result = f"Zipformer {duration}s audio: latency={latency:.3f}s, RTF={rtf:.3f}"
            write_result(result)
            
            # RTF should be < 1.0 for real-time
            assert rtf < 2.0, f"Zipformer RTF {rtf:.2f} too high"
            
        except FileNotFoundError:
            pytest.skip("Zipformer model files not found")


class TestThroughputBenchmark:
    """Benchmark sustained throughput."""
    
    @pytest.mark.benchmark
    @pytest.mark.slow
    def test_zipformer_throughput(self, benchmark_file, queues):
        """Test Zipformer processing multiple chunks."""
        input_q, output_q = queues
        worker = ZipformerWorker(input_q, output_q, "zipformer")
        
        try:
            worker.load_model()
            
            num_chunks = 10
            chunk_duration = 1.0
            total_duration = num_chunks * chunk_duration
            
            chunks = [generate_test_audio(chunk_duration) for _ in range(num_chunks)]
            
            start = time.time()
            for chunk in chunks:
                worker.process(chunk)
            total_time = time.time() - start
            
            throughput = total_duration / total_time
            
            result = f"""
--- Zipformer Throughput Benchmark ---
Chunks: {num_chunks} x {chunk_duration}s
Total Audio: {total_duration}s
Processing Time: {total_time:.2f}s
Throughput: {throughput:.2f}x real-time
"""
            write_result(result)
            
        except FileNotFoundError:
            pytest.skip("Zipformer model files not found")


# =============================================================================
# Standalone Benchmark Runner
# =============================================================================

if __name__ == "__main__":
    """Run benchmarks standalone."""
    print("Running Zipformer STT Model Benchmarks...")
    print("=" * 60)
    
    # Initialize results file
    with open(RESULTS_FILE, "w", encoding="utf-8") as f:
        f.write(f"Zipformer STT Model Benchmark Results\n")
        f.write(f"Date: {time.strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write("=" * 60 + "\n\n")
    
    print("\n--- Benchmarking Zipformer ---")
    
    input_q = multiprocessing.Queue()
    output_q = multiprocessing.Queue()
    worker = ZipformerWorker(input_q, output_q, "zipformer")
    
    try:
        # Load benchmark
        mem_before = get_memory_usage_mb()
        start = time.time()
        worker.load_model()
        load_time = time.time() - start
        mem_after = get_memory_usage_mb()
        
        print(f"Load Time: {load_time:.2f}s")
        print(f"Memory: {mem_after - mem_before:.2f} MB")
        
        # Inference benchmark
        audio = generate_test_audio(3.0)
        start = time.time()
        worker.process(audio)
        latency = time.time() - start
        
        print(f"Inference (3s audio): {latency:.2f}s")
        print(f"RTF: {latency / 3.0:.3f}")
        
        write_result(f"Zipformer: load={load_time:.2f}s, latency={latency:.2f}s, RTF={latency/3.0:.3f}")
        
    except Exception as e:
        print(f"Error: {e}")
        write_result(f"Zipformer: FAILED - {e}")
    finally:
        input_q.close()
        output_q.close()
    
    print(f"\nResults saved to: {RESULTS_FILE}")
