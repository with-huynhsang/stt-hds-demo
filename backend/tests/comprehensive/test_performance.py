"""
End-to-End Performance and Stress Tests

These tests verify:
1. Real-time performance metrics
2. Latency measurements
3. Throughput under load
4. Memory stability over time
5. Concurrent connection handling

Run with: pytest tests/comprehensive/test_performance.py -v -s -m slow
"""
import pytest
import numpy as np
import multiprocessing
import time
import sys
import os
import threading
from unittest.mock import patch, MagicMock
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from fastapi.testclient import TestClient
from main import app


class TestRealTimePerformance:
    """Test real-time performance requirements."""
    
    SAMPLE_RATE = 16000
    CHUNK_SIZE = 4096  # Frontend default
    CHUNK_DURATION_MS = (CHUNK_SIZE / SAMPLE_RATE) * 1000  # ~256ms
    
    @pytest.fixture
    def loaded_worker(self):
        """Create and load Zipformer worker."""
        from app.workers.zipformer import ZipformerWorker
        
        input_q = multiprocessing.Queue()
        output_q = multiprocessing.Queue()
        worker = ZipformerWorker(input_q, output_q, "zipformer")
        
        try:
            worker.load_model()
        except FileNotFoundError:
            pytest.skip("Model files not found")
        
        yield worker
        input_q.close()
        output_q.close()
    
    @pytest.mark.slow
    def test_single_chunk_latency(self, loaded_worker):
        """Measure latency for processing a single chunk."""
        chunk = np.random.randint(-500, 500, self.CHUNK_SIZE, dtype=np.int16).tobytes()
        
        latencies = []
        for _ in range(20):
            start = time.perf_counter()
            loaded_worker.process(chunk)
            latency = (time.perf_counter() - start) * 1000
            latencies.append(latency)
        
        avg_latency = sum(latencies) / len(latencies)
        p95_latency = sorted(latencies)[int(len(latencies) * 0.95)]
        max_latency = max(latencies)
        
        print(f"\n📊 Single chunk latency ({self.CHUNK_SIZE} samples):")
        print(f"   Average: {avg_latency:.2f}ms")
        print(f"   P95: {p95_latency:.2f}ms")
        print(f"   Max: {max_latency:.2f}ms")
        print(f"   Chunk duration: {self.CHUNK_DURATION_MS:.0f}ms")
        
        # Must be faster than real-time
        assert avg_latency < self.CHUNK_DURATION_MS, \
            f"Processing too slow: {avg_latency:.1f}ms > {self.CHUNK_DURATION_MS}ms"
    
    @pytest.mark.slow
    def test_sustained_processing_latency(self, loaded_worker):
        """Measure latency over sustained processing (30s simulation)."""
        duration_s = 5  # 5 seconds for faster test
        chunks_needed = int((duration_s * 1000) / self.CHUNK_DURATION_MS)
        
        latencies = []
        start_time = time.perf_counter()
        
        for _ in range(chunks_needed):
            chunk = np.random.randint(-500, 500, self.CHUNK_SIZE, dtype=np.int16).tobytes()
            
            chunk_start = time.perf_counter()
            loaded_worker.process(chunk)
            latency = (time.perf_counter() - chunk_start) * 1000
            latencies.append(latency)
        
        total_time = time.perf_counter() - start_time
        real_time_factor = total_time / duration_s
        
        avg_latency = sum(latencies) / len(latencies)
        p99_latency = sorted(latencies)[int(len(latencies) * 0.99)]
        
        print(f"\n📊 Sustained processing ({duration_s}s simulation):")
        print(f"   Chunks processed: {chunks_needed}")
        print(f"   Total time: {total_time:.2f}s")
        print(f"   Real-time factor: {real_time_factor:.2f}x")
        print(f"   Avg latency: {avg_latency:.2f}ms")
        print(f"   P99 latency: {p99_latency:.2f}ms")
        
        # Must process faster than real-time
        assert real_time_factor < 1.0, \
            f"Processing slower than real-time: {real_time_factor:.2f}x"
    
    @pytest.mark.slow
    def test_latency_consistency(self, loaded_worker):
        """Test latency variance (jitter)."""
        chunk = np.random.randint(-500, 500, self.CHUNK_SIZE, dtype=np.int16).tobytes()
        
        latencies = []
        for _ in range(50):
            start = time.perf_counter()
            loaded_worker.process(chunk)
            latency = (time.perf_counter() - start) * 1000
            latencies.append(latency)
        
        avg = sum(latencies) / len(latencies)
        variance = sum((x - avg) ** 2 for x in latencies) / len(latencies)
        std_dev = variance ** 0.5
        jitter = std_dev / avg * 100  # as percentage
        
        print(f"\n📊 Latency consistency:")
        print(f"   Avg: {avg:.2f}ms")
        print(f"   Std Dev: {std_dev:.2f}ms")
        print(f"   Jitter: {jitter:.1f}%")
        
        # Jitter should be under 50%
        assert jitter < 50, f"Jitter too high: {jitter:.1f}%"


class TestThroughput:
    """Test throughput under various loads."""
    
    @pytest.fixture
    def loaded_worker(self):
        from app.workers.zipformer import ZipformerWorker
        
        input_q = multiprocessing.Queue()
        output_q = multiprocessing.Queue()
        worker = ZipformerWorker(input_q, output_q, "zipformer")
        
        try:
            worker.load_model()
        except FileNotFoundError:
            pytest.skip("Model files not found")
        
        yield worker
        input_q.close()
        output_q.close()
    
    @pytest.mark.slow
    def test_throughput_small_chunks(self, loaded_worker):
        """Measure throughput with small chunks."""
        chunk_size = 1024
        num_chunks = 100
        
        chunk = np.random.randint(-500, 500, chunk_size, dtype=np.int16).tobytes()
        
        start = time.perf_counter()
        for _ in range(num_chunks):
            loaded_worker.process(chunk)
        elapsed = time.perf_counter() - start
        
        total_samples = chunk_size * num_chunks
        samples_per_sec = total_samples / elapsed
        audio_duration = total_samples / 16000
        throughput_factor = audio_duration / elapsed
        
        print(f"\n📊 Small chunk throughput ({chunk_size} samples):")
        print(f"   Chunks: {num_chunks}")
        print(f"   Time: {elapsed:.2f}s")
        print(f"   Samples/sec: {samples_per_sec:.0f}")
        print(f"   Throughput: {throughput_factor:.2f}x real-time")
    
    @pytest.mark.slow
    def test_throughput_large_chunks(self, loaded_worker):
        """Measure throughput with large chunks."""
        chunk_size = 16000  # 1 second
        num_chunks = 10
        
        chunk = np.random.randint(-500, 500, chunk_size, dtype=np.int16).tobytes()
        
        start = time.perf_counter()
        for _ in range(num_chunks):
            loaded_worker.process(chunk)
        elapsed = time.perf_counter() - start
        
        total_samples = chunk_size * num_chunks
        audio_duration = total_samples / 16000
        throughput_factor = audio_duration / elapsed
        
        print(f"\n📊 Large chunk throughput ({chunk_size} samples):")
        print(f"   Chunks: {num_chunks}")
        print(f"   Audio duration: {audio_duration}s")
        print(f"   Processing time: {elapsed:.2f}s")
        print(f"   Throughput: {throughput_factor:.2f}x real-time")
        
        assert throughput_factor > 1.0, "Cannot process in real-time"


class TestMemoryStability:
    """Test memory stability over extended operation."""
    
    @pytest.mark.slow
    def test_memory_stability_during_processing(self):
        """Test memory doesn't grow unbounded during processing."""
        try:
            import psutil
        except ImportError:
            pytest.skip("psutil not installed")
        
        from app.workers.zipformer import ZipformerWorker
        
        input_q = multiprocessing.Queue()
        output_q = multiprocessing.Queue()
        worker = ZipformerWorker(input_q, output_q, "zipformer")
        
        try:
            worker.load_model()
        except FileNotFoundError:
            pytest.skip("Model files not found")
        
        process = psutil.Process()
        
        # Record initial memory
        initial_mem = process.memory_info().rss / (1024 * 1024)
        
        # Process many chunks
        chunk = np.random.randint(-500, 500, 4096, dtype=np.int16).tobytes()
        
        memory_readings = []
        for i in range(100):
            worker.process(chunk)
            
            if i % 20 == 0:
                current_mem = process.memory_info().rss / (1024 * 1024)
                memory_readings.append(current_mem)
        
        final_mem = process.memory_info().rss / (1024 * 1024)
        mem_growth = final_mem - initial_mem
        
        print(f"\n📊 Memory stability:")
        print(f"   Initial: {initial_mem:.1f} MB")
        print(f"   Final: {final_mem:.1f} MB")
        print(f"   Growth: {mem_growth:.1f} MB")
        print(f"   Readings: {[f'{m:.1f}MB' for m in memory_readings]}")
        
        # Memory growth should be minimal (under 100MB)
        assert mem_growth < 100, f"Memory leak detected: {mem_growth}MB growth"
        
        input_q.close()
        output_q.close()
    
    @pytest.mark.slow
    def test_queue_memory_cleanup(self):
        """Test that output queue doesn't accumulate indefinitely."""
        from app.workers.zipformer import ZipformerWorker
        
        input_q = multiprocessing.Queue()
        output_q = multiprocessing.Queue()
        worker = ZipformerWorker(input_q, output_q, "zipformer")
        
        try:
            worker.load_model()
        except FileNotFoundError:
            pytest.skip("Model files not found")
        
        chunk = np.random.randint(-500, 500, 4096, dtype=np.int16).tobytes()
        
        # Process and drain queue periodically
        for i in range(50):
            worker.process(chunk)
            
            # Drain queue every 10 iterations
            if i % 10 == 0:
                count = 0
                while not output_q.empty():
                    output_q.get_nowait()
                    count += 1
                print(f"   Iteration {i}: drained {count} items")
        
        # Final drain
        final_count = 0
        while not output_q.empty():
            output_q.get_nowait()
            final_count += 1
        
        print(f"\n✅ Queue draining works, final items: {final_count}")
        
        input_q.close()
        output_q.close()


class TestConcurrency:
    """Test concurrent connection handling."""
    
    @pytest.fixture
    def client(self):
        return TestClient(app)
    
    @pytest.fixture
    def mock_manager(self):
        with patch("app.api.endpoints.manager") as mock:
            input_q = MagicMock()
            output_q = MagicMock()
            output_q.empty.return_value = True
            mock.get_queues.return_value = (input_q, output_q)
            mock.active_processes = {"zipformer": MagicMock()}
            yield mock
    
    def test_sequential_connections(self, client, mock_manager):
        """Test sequential WebSocket connections."""
        for i in range(5):
            with client.websocket_connect("/ws/transcribe") as ws:
                ws.send_json({"type": "config", "model": "zipformer"})
                ws.send_bytes(np.zeros(1000, dtype=np.int16).tobytes())
            print(f"   Connection {i + 1} completed")
        
        print("\n✅ Sequential connections handled")
    
    def test_rapid_reconnection(self, client, mock_manager):
        """Test rapid connect/disconnect cycles."""
        for i in range(10):
            with client.websocket_connect("/ws/transcribe") as ws:
                ws.send_json({"type": "config", "model": "zipformer"})
            # Immediate disconnect and reconnect
        
        print("\n✅ Rapid reconnection handled")


class TestStressConditions:
    """Test behavior under stress conditions."""
    
    @pytest.fixture
    def loaded_worker(self):
        from app.workers.zipformer import ZipformerWorker
        
        input_q = multiprocessing.Queue()
        output_q = multiprocessing.Queue()
        worker = ZipformerWorker(input_q, output_q, "zipformer")
        
        try:
            worker.load_model()
        except FileNotFoundError:
            pytest.skip("Model files not found")
        
        yield worker
        input_q.close()
        output_q.close()
    
    @pytest.mark.slow
    def test_burst_processing(self, loaded_worker):
        """Test handling of burst of audio data."""
        # Simulate 5 seconds of audio arriving at once
        total_samples = 16000 * 5
        audio = np.random.randint(-500, 500, total_samples, dtype=np.int16).tobytes()
        
        start = time.perf_counter()
        loaded_worker.process(audio)
        elapsed = time.perf_counter() - start
        
        print(f"\n📊 Burst processing (5s audio):")
        print(f"   Processing time: {elapsed:.2f}s")
        print(f"   Real-time factor: {elapsed / 5:.2f}x")
        
        assert elapsed < 5, "Cannot process burst in real-time"
    
    @pytest.mark.slow
    def test_alternating_silence_and_speech(self, loaded_worker):
        """Test performance with alternating silence/speech pattern."""
        silence = np.zeros(4096, dtype=np.int16).tobytes()
        speech = np.random.randint(-10000, 10000, 4096, dtype=np.int16).tobytes()
        
        latencies = []
        
        for i in range(40):
            chunk = silence if i % 2 == 0 else speech
            
            start = time.perf_counter()
            loaded_worker.process(chunk)
            latency = (time.perf_counter() - start) * 1000
            latencies.append(latency)
        
        silence_latencies = latencies[::2]
        speech_latencies = latencies[1::2]
        
        avg_silence = sum(silence_latencies) / len(silence_latencies)
        avg_speech = sum(speech_latencies) / len(speech_latencies)
        
        print(f"\n📊 Alternating pattern performance:")
        print(f"   Avg silence latency: {avg_silence:.2f}ms")
        print(f"   Avg speech latency: {avg_speech:.2f}ms")
    
    @pytest.mark.slow
    def test_long_running_session(self, loaded_worker):
        """Simulate a long running session (60s)."""
        duration_s = 10  # Shortened for test
        chunk_size = 4096
        chunk_duration_ms = (chunk_size / 16000) * 1000
        num_chunks = int((duration_s * 1000) / chunk_duration_ms)
        
        start = time.perf_counter()
        
        for _ in range(num_chunks):
            chunk = np.random.randint(-500, 500, chunk_size, dtype=np.int16).tobytes()
            loaded_worker.process(chunk)
        
        loaded_worker.flush()
        
        elapsed = time.perf_counter() - start
        
        print(f"\n📊 Long session simulation ({duration_s}s audio):")
        print(f"   Chunks: {num_chunks}")
        print(f"   Processing time: {elapsed:.2f}s")
        print(f"   Real-time factor: {elapsed / duration_s:.2f}x")
        
        # Collect all results
        results = []
        while not loaded_worker.output_queue.empty():
            results.append(loaded_worker.output_queue.get_nowait())
        
        print(f"   Transcription segments: {len(results)}")


class TestEdgeCasePerformance:
    """Test performance in edge cases."""
    
    @pytest.fixture
    def loaded_worker(self):
        from app.workers.zipformer import ZipformerWorker
        
        input_q = multiprocessing.Queue()
        output_q = multiprocessing.Queue()
        worker = ZipformerWorker(input_q, output_q, "zipformer")
        
        try:
            worker.load_model()
        except FileNotFoundError:
            pytest.skip("Model files not found")
        
        yield worker
        input_q.close()
        output_q.close()
    
    @pytest.mark.slow
    def test_maximum_amplitude_audio(self, loaded_worker):
        """Test processing maximum amplitude audio."""
        max_audio = np.full(4096, 32767, dtype=np.int16).tobytes()
        
        start = time.perf_counter()
        loaded_worker.process(max_audio)
        latency = (time.perf_counter() - start) * 1000
        
        print(f"\n📊 Max amplitude processing: {latency:.2f}ms")
    
    @pytest.mark.slow
    def test_minimum_amplitude_audio(self, loaded_worker):
        """Test processing minimum amplitude audio."""
        min_audio = np.full(4096, -32768, dtype=np.int16).tobytes()
        
        start = time.perf_counter()
        loaded_worker.process(min_audio)
        latency = (time.perf_counter() - start) * 1000
        
        print(f"\n📊 Min amplitude processing: {latency:.2f}ms")
    
    @pytest.mark.slow
    def test_dc_offset_audio(self, loaded_worker):
        """Test processing audio with DC offset."""
        # Audio centered at 10000 instead of 0
        dc_audio = np.full(4096, 10000, dtype=np.int16).tobytes()
        
        start = time.perf_counter()
        loaded_worker.process(dc_audio)
        latency = (time.perf_counter() - start) * 1000
        
        print(f"\n📊 DC offset processing: {latency:.2f}ms")
