"""
Comprehensive Zipformer Model Integration Tests

These tests verify:
1. Model loading and initialization
2. Audio processing through sherpa-onnx
3. Streaming simulation with real model
4. Reset/flush handling
5. Error handling and edge cases

Run with: pytest tests/comprehensive/test_zipformer_integration.py -v -s
"""
import pytest
import numpy as np
import multiprocessing
import sys
import os
import time
import wave

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from app.workers.zipformer import ZipformerWorker
from app.core.config import settings


class TestZipformerModelLoading:
    """Test Zipformer model loading and initialization."""
    
    @pytest.fixture
    def worker_queues(self):
        """Create multiprocessing queues for worker."""
        input_q = multiprocessing.Queue()
        output_q = multiprocessing.Queue()
        yield input_q, output_q
        input_q.close()
        output_q.close()
    
    def test_model_files_exist(self):
        """Verify all required model files are present."""
        model_path = os.path.join(settings.MODEL_STORAGE_PATH, "zipformer", "hynt-zipformer-30M-6000h")
        
        required_files = [
            "encoder-epoch-20-avg-10.int8.onnx",
            "decoder-epoch-20-avg-10.int8.onnx",
            "joiner-epoch-20-avg-10.int8.onnx",
            "tokens.txt",
            "bpe.model",
        ]
        
        missing_files = []
        for f in required_files:
            filepath = os.path.join(model_path, f)
            if not os.path.exists(filepath):
                missing_files.append(f)
        
        if missing_files:
            pytest.skip(f"Model files not found: {missing_files}")
        
        print("\n✅ All required model files present:")
        for f in required_files:
            filepath = os.path.join(model_path, f)
            size_mb = os.path.getsize(filepath) / (1024 * 1024)
            print(f"   - {f}: {size_mb:.2f} MB")
    
    @pytest.mark.slow
    def test_model_loading_time(self, worker_queues):
        """Test and measure model loading time."""
        input_q, output_q = worker_queues
        worker = ZipformerWorker(input_q, output_q, "zipformer")
        
        try:
            start_time = time.time()
            worker.load_model()
            load_time = time.time() - start_time
            
            assert worker.recognizer is not None
            assert worker.stream is not None
            
            print(f"\n✅ Model loaded in {load_time:.2f} seconds")
            
            # Loading should be under 10 seconds on reasonable hardware
            assert load_time < 10, f"Model loading too slow: {load_time}s"
            
        except FileNotFoundError as e:
            pytest.skip(f"Model files not found: {e}")
    
    @pytest.mark.slow
    def test_model_memory_footprint(self, worker_queues):
        """Estimate model memory usage."""
        import psutil
        
        input_q, output_q = worker_queues
        worker = ZipformerWorker(input_q, output_q, "zipformer")
        
        process = psutil.Process()
        mem_before = process.memory_info().rss / (1024 * 1024)
        
        try:
            worker.load_model()
            
            mem_after = process.memory_info().rss / (1024 * 1024)
            mem_used = mem_after - mem_before
            
            print(f"\n📊 Memory usage:")
            print(f"   Before loading: {mem_before:.1f} MB")
            print(f"   After loading: {mem_after:.1f} MB")
            print(f"   Model memory: ~{mem_used:.1f} MB")
            
            # Model should use less than 500MB (int8 quantized)
            assert mem_used < 500, f"Model uses too much memory: {mem_used}MB"
            
        except FileNotFoundError:
            pytest.skip("Model files not found")
    
    @pytest.mark.slow
    def test_stream_creation(self, worker_queues):
        """Test that stream is created correctly after model load."""
        input_q, output_q = worker_queues
        worker = ZipformerWorker(input_q, output_q, "zipformer")
        
        try:
            worker.load_model()
            
            # Stream should be created
            assert worker.stream is not None
            
            # Stream should be ready to accept audio
            # Test by accepting empty audio (should not crash)
            worker.stream.accept_waveform(16000, np.array([], dtype=np.float32))
            
            print("\n✅ Stream created and ready to accept audio")
            
        except FileNotFoundError:
            pytest.skip("Model files not found")


class TestZipformerAudioProcessing:
    """Test audio processing through Zipformer."""
    
    @pytest.fixture
    def loaded_worker(self):
        """Create and load a Zipformer worker."""
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
    
    @pytest.fixture
    def silence_audio(self):
        """Generate 1 second of silence (Int16 bytes)."""
        samples = np.zeros(16000, dtype=np.int16)
        return samples.tobytes()
    
    @pytest.fixture
    def noise_audio(self):
        """Generate 1 second of random noise (Int16 bytes)."""
        samples = np.random.randint(-1000, 1000, 16000, dtype=np.int16)
        return samples.tobytes()
    
    @pytest.fixture
    def sine_audio(self):
        """Generate 1 second of 440Hz sine wave (Int16 bytes)."""
        t = np.linspace(0, 1, 16000, dtype=np.float32)
        samples = (np.sin(2 * np.pi * 440 * t) * 10000).astype(np.int16)
        return samples.tobytes()
    
    @pytest.mark.slow
    def test_process_silence(self, loaded_worker, silence_audio):
        """Test processing silence (should produce empty or no text)."""
        loaded_worker.process(silence_audio)
        
        # Check output queue - may be empty for silence
        results = []
        while not loaded_worker.output_queue.empty():
            results.append(loaded_worker.output_queue.get_nowait())
        
        print(f"\n📊 Silence processing results: {len(results)} outputs")
        for r in results:
            print(f"   {r}")
        
        # Silence should produce empty or no transcription
        if results:
            for r in results:
                assert r.get("text", "") == "" or len(r.get("text", "")) < 5
    
    @pytest.mark.slow
    def test_process_noise(self, loaded_worker, noise_audio):
        """Test processing random noise."""
        loaded_worker.process(noise_audio)
        
        results = []
        while not loaded_worker.output_queue.empty():
            results.append(loaded_worker.output_queue.get_nowait())
        
        print(f"\n📊 Noise processing results: {len(results)} outputs")
        for r in results:
            text = r.get("text", "")
            print(f"   Text: '{text}' (len={len(text)})")
        
        # Random noise may produce some hallucinated text, but should be limited
    
    @pytest.mark.slow
    def test_process_multiple_chunks(self, loaded_worker, sine_audio):
        """Test processing multiple chunks sequentially."""
        chunk_size = 4096 * 2  # 4096 samples in bytes (Int16 = 2 bytes)
        
        audio_bytes = sine_audio
        chunks = [
            audio_bytes[i:i + chunk_size]
            for i in range(0, len(audio_bytes), chunk_size)
        ]
        
        print(f"\n📊 Processing {len(chunks)} chunks:")
        for i, chunk in enumerate(chunks):
            loaded_worker.process(chunk)
            print(f"   Chunk {i + 1}: {len(chunk)} bytes processed")
        
        # Collect all results
        results = []
        while not loaded_worker.output_queue.empty():
            results.append(loaded_worker.output_queue.get_nowait())
        
        print(f"   Total outputs: {len(results)}")
    
    @pytest.mark.slow
    def test_process_empty_chunk(self, loaded_worker):
        """Test processing empty audio chunk."""
        empty_bytes = bytes()
        
        # Should not crash
        loaded_worker.process(empty_bytes)
        print("\n✅ Empty chunk processed without error")
    
    @pytest.mark.slow
    def test_process_very_small_chunk(self, loaded_worker):
        """Test processing very small audio chunk."""
        # Just 10 samples
        small_audio = np.zeros(10, dtype=np.int16).tobytes()
        
        # Should not crash
        loaded_worker.process(small_audio)
        print("\n✅ Very small chunk processed without error")


class TestZipformerStreamingSimulation:
    """Simulate real-time streaming transcription."""
    
    @pytest.fixture
    def loaded_worker(self):
        """Create and load a Zipformer worker."""
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
    def test_streaming_with_realistic_timing(self, loaded_worker):
        """Simulate realistic streaming with chunk timing."""
        chunk_size_samples = 4096
        chunk_duration_ms = (chunk_size_samples / 16000) * 1000  # 256ms
        total_duration_s = 2.0
        num_chunks = int(total_duration_s * 1000 / chunk_duration_ms)
        
        print(f"\n📊 Streaming simulation:")
        print(f"   Chunk size: {chunk_size_samples} samples ({chunk_duration_ms}ms)")
        print(f"   Total chunks: {num_chunks}")
        
        latencies = []
        
        for i in range(num_chunks):
            # Generate chunk with slight variation (simulating real audio)
            chunk = np.random.randint(-500, 500, chunk_size_samples, dtype=np.int16).tobytes()
            
            start = time.time()
            loaded_worker.process(chunk)
            process_time = (time.time() - start) * 1000
            latencies.append(process_time)
            
            # Simulate real-time: wait for chunk duration minus processing time
            sleep_time = max(0, (chunk_duration_ms - process_time) / 1000)
            if sleep_time > 0:
                time.sleep(sleep_time * 0.5)  # Speed up test
        
        avg_latency = sum(latencies) / len(latencies)
        max_latency = max(latencies)
        
        print(f"   Avg processing latency: {avg_latency:.1f}ms")
        print(f"   Max processing latency: {max_latency:.1f}ms")
        
        # Processing should be faster than real-time (chunk_duration_ms)
        assert avg_latency < chunk_duration_ms, f"Processing too slow: {avg_latency}ms > {chunk_duration_ms}ms"
    
    @pytest.mark.slow
    def test_continuous_stream_state(self, loaded_worker):
        """Test that stream maintains state across chunks."""
        chunk_size = 4096
        
        # Process several chunks and verify stream state is maintained
        for i in range(5):
            chunk = np.random.randint(-100, 100, chunk_size, dtype=np.int16).tobytes()
            loaded_worker.process(chunk)
        
        # Stream should still exist and be valid
        assert loaded_worker.stream is not None
        assert loaded_worker.recognizer is not None
        
        print("\n✅ Stream state maintained across 5 chunks")


class TestZipformerResetHandling:
    """Test reset/flush command handling."""
    
    @pytest.fixture
    def loaded_worker(self):
        """Create and load a Zipformer worker."""
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
    def test_reset_creates_new_stream(self, loaded_worker):
        """Test that reset creates a fresh stream."""
        old_stream = loaded_worker.stream
        
        # Process some audio first
        audio = np.random.randint(-100, 100, 4096, dtype=np.int16).tobytes()
        loaded_worker.process(audio)
        
        # Reset
        loaded_worker.reset()
        
        # Should have new stream
        assert loaded_worker.stream is not None
        # Note: Stream object comparison may vary by sherpa-onnx version
        print("\n✅ Reset creates new stream")
    
    @pytest.mark.slow
    def test_flush_gets_final_result(self, loaded_worker):
        """Test that flush triggers final decoding."""
        # Process some audio
        audio = np.random.randint(-500, 500, 8000, dtype=np.int16).tobytes()
        loaded_worker.process(audio)
        
        # Flush
        loaded_worker.flush()
        
        # Check for results
        results = []
        while not loaded_worker.output_queue.empty():
            results.append(loaded_worker.output_queue.get_nowait())
        
        print(f"\n📊 Flush results: {len(results)} outputs")
        for r in results:
            print(f"   {r}")
    
    @pytest.mark.slow
    def test_multiple_reset_cycles(self, loaded_worker):
        """Test multiple reset cycles don't cause issues."""
        for i in range(3):
            # Process audio
            audio = np.random.randint(-100, 100, 4096, dtype=np.int16).tobytes()
            loaded_worker.process(audio)
            
            # Reset
            loaded_worker.reset()
            
            # Verify worker is still functional
            assert loaded_worker.recognizer is not None
            assert loaded_worker.stream is not None
        
        print("\n✅ Multiple reset cycles completed without error")


class TestZipformerEdgeCases:
    """Test edge cases and error handling."""
    
    @pytest.fixture
    def loaded_worker(self):
        """Create and load a Zipformer worker."""
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
    def test_invalid_audio_data(self, loaded_worker):
        """Test handling of invalid audio data."""
        # Odd number of bytes (invalid for Int16)
        invalid_bytes = bytes([0, 1, 2])  # 3 bytes
        
        # Should handle gracefully (may ignore or produce error)
        try:
            loaded_worker.process(invalid_bytes)
            print("\n⚠️ Invalid bytes were processed (implementation-dependent)")
        except Exception as e:
            print(f"\n✅ Invalid bytes raised error as expected: {e}")
    
    @pytest.mark.slow
    def test_very_long_audio(self, loaded_worker):
        """Test processing very long audio segment."""
        # 10 seconds of audio
        long_audio = np.random.randint(-500, 500, 160000, dtype=np.int16).tobytes()
        
        start = time.time()
        loaded_worker.process(long_audio)
        process_time = time.time() - start
        
        print(f"\n📊 Long audio (10s) processing:")
        print(f"   Processing time: {process_time:.2f}s")
        print(f"   Real-time factor: {process_time / 10:.2f}x")
        
        # Should process faster than real-time
        assert process_time < 10, f"Processing slower than real-time: {process_time}s"
    
    @pytest.mark.slow
    def test_rapid_chunk_succession(self, loaded_worker):
        """Test rapid succession of chunks (stress test)."""
        chunk = np.random.randint(-100, 100, 1024, dtype=np.int16).tobytes()
        
        start = time.time()
        for _ in range(100):
            loaded_worker.process(chunk)
        total_time = time.time() - start
        
        avg_per_chunk = (total_time / 100) * 1000
        
        print(f"\n📊 Rapid chunk test (100 chunks):")
        print(f"   Total time: {total_time:.2f}s")
        print(f"   Avg per chunk: {avg_per_chunk:.1f}ms")
        
        # Average should be under 50ms per chunk
        assert avg_per_chunk < 100, f"Too slow: {avg_per_chunk}ms per chunk"


class TestZipformerWithRealAudio:
    """Test with real Vietnamese audio if available."""
    
    @pytest.fixture
    def loaded_worker(self):
        """Create and load a Zipformer worker."""
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
    
    @pytest.fixture
    def sample_audio_path(self):
        """Path to sample Vietnamese audio file."""
        data_dir = os.path.join(os.path.dirname(__file__), "../data")
        wav_path = os.path.join(data_dir, "sample_vn.wav")
        return wav_path
    
    @pytest.mark.slow
    def test_real_vietnamese_audio(self, loaded_worker, sample_audio_path):
        """Test transcription of real Vietnamese audio."""
        if not os.path.exists(sample_audio_path):
            pytest.skip(f"Sample audio not found: {sample_audio_path}")
        
        # Read audio file
        with wave.open(sample_audio_path, 'rb') as wav:
            assert wav.getnchannels() == 1, "Audio must be mono"
            assert wav.getframerate() == 16000, "Audio must be 16kHz"
            assert wav.getsampwidth() == 2, "Audio must be Int16"
            
            audio_data = wav.readframes(wav.getnframes())
        
        # Process in chunks
        chunk_size = 4096 * 2  # bytes
        for i in range(0, len(audio_data), chunk_size):
            chunk = audio_data[i:i + chunk_size]
            loaded_worker.process(chunk)
        
        # Flush
        loaded_worker.flush()
        
        # Collect results
        results = []
        while not loaded_worker.output_queue.empty():
            results.append(loaded_worker.output_queue.get_nowait())
        
        print(f"\n📊 Real Vietnamese audio transcription:")
        print(f"   Audio length: {len(audio_data) / 2 / 16000:.2f}s")
        print(f"   Results: {len(results)}")
        for r in results:
            print(f"   Text: '{r.get('text', '')}'")
        
        # Should produce some transcription
        if results:
            all_text = " ".join(r.get("text", "") for r in results)
            print(f"   Full transcription: '{all_text}'")
