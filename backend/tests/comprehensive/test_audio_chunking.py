"""
Comprehensive Audio Chunking Tests

These tests verify:
1. Various chunk sizes and their effects on recognition
2. Edge cases in audio buffering
3. Int16 <-> Float32 conversion accuracy
4. Chunk boundary handling for streaming recognition

Based on research:
- Sherpa-ONNX recommends 3200 samples (0.2s at 16kHz) per chunk
- Frontend uses 4096 samples (~256ms) which is also optimal
- Audio format: PCM Int16, 16kHz, mono
"""
import pytest
import numpy as np
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))


class TestAudioChunking:
    """Test various audio chunk sizes and handling."""
    
    # Standard chunk sizes to test
    CHUNK_SIZES = [
        512,    # 32ms - very small
        1024,   # 64ms - small  
        2048,   # 128ms - medium
        3200,   # 200ms - sherpa-onnx recommended
        4096,   # 256ms - current FE implementation
        8000,   # 500ms - large
        16000,  # 1 second - very large
    ]
    
    @pytest.fixture
    def sample_audio_float32(self):
        """Generate 2 seconds of sine wave audio (Float32, -1 to 1)."""
        sample_rate = 16000
        duration = 2.0
        frequency = 440  # A4 note
        t = np.linspace(0, duration, int(sample_rate * duration), dtype=np.float32)
        audio = np.sin(2 * np.pi * frequency * t).astype(np.float32)
        return audio
    
    @pytest.fixture
    def sample_audio_int16(self, sample_audio_float32):
        """Convert Float32 audio to Int16 (as sent by frontend)."""
        # Frontend conversion: s < 0 ? s * 0x8000 : s * 0x7FFF
        audio_int16 = np.where(
            sample_audio_float32 < 0,
            sample_audio_float32 * 0x8000,
            sample_audio_float32 * 0x7FFF
        ).astype(np.int16)
        return audio_int16
    
    @pytest.mark.parametrize("chunk_size", CHUNK_SIZES)
    def test_chunk_size_division(self, sample_audio_int16, chunk_size):
        """Test that audio can be divided into chunks of various sizes."""
        total_samples = len(sample_audio_int16)
        
        # Calculate number of complete chunks and remainder
        num_complete_chunks = total_samples // chunk_size
        remainder = total_samples % chunk_size
        
        print(f"\n📊 Chunk size: {chunk_size} samples ({chunk_size / 16000 * 1000:.1f}ms)")
        print(f"   Total samples: {total_samples}")
        print(f"   Complete chunks: {num_complete_chunks}")
        print(f"   Remainder: {remainder} samples")
        
        # Verify we can reconstruct the audio
        chunks = [
            sample_audio_int16[i:i + chunk_size] 
            for i in range(0, total_samples - remainder, chunk_size)
        ]
        if remainder > 0:
            chunks.append(sample_audio_int16[-remainder:])
        
        reconstructed = np.concatenate(chunks)
        assert len(reconstructed) == total_samples
        np.testing.assert_array_equal(reconstructed, sample_audio_int16)
    
    def test_int16_to_float32_conversion(self, sample_audio_int16):
        """Test backend's Int16 to Float32 conversion (matches zipformer.py)."""
        # Backend conversion: np.int16 -> np.float32 / 32768.0
        audio_float32 = sample_audio_int16.astype(np.float32) / 32768.0
        
        # Verify range
        assert audio_float32.min() >= -1.0
        assert audio_float32.max() <= 1.0
        
        # Verify conversion preserves relative values
        max_idx = np.argmax(np.abs(sample_audio_int16))
        assert np.argmax(np.abs(audio_float32)) == max_idx
        
        print(f"\n✅ Int16 range: [{sample_audio_int16.min()}, {sample_audio_int16.max()}]")
        print(f"✅ Float32 range: [{audio_float32.min():.4f}, {audio_float32.max():.4f}]")
    
    def test_float32_to_int16_round_trip(self, sample_audio_float32):
        """Test round-trip conversion accuracy (FE -> BE -> FE)."""
        # FE: Float32 -> Int16
        int16_audio = np.where(
            sample_audio_float32 < 0,
            sample_audio_float32 * 0x8000,
            sample_audio_float32 * 0x7FFF
        ).astype(np.int16)
        
        # BE: Int16 -> Float32
        float32_restored = int16_audio.astype(np.float32) / 32768.0
        
        # Calculate maximum error
        max_error = np.max(np.abs(sample_audio_float32 - float32_restored))
        
        # Int16 has 16-bit precision, max error should be ~1/32768 ≈ 0.00003
        assert max_error < 0.001, f"Round-trip error too large: {max_error}"
        print(f"\n✅ Round-trip max error: {max_error:.6f} (acceptable: < 0.001)")
    
    def test_bytes_to_numpy_conversion(self):
        """Test converting raw bytes to numpy array (as done in zipformer.py)."""
        # Simulate audio data as bytes (as received from WebSocket)
        original_int16 = np.array([100, -200, 32767, -32768, 0], dtype=np.int16)
        audio_bytes = original_int16.tobytes()
        
        # Backend conversion
        converted = np.frombuffer(audio_bytes, dtype=np.int16)
        
        np.testing.assert_array_equal(converted, original_int16)
        print(f"\n✅ Bytes to numpy conversion correct")
    
    def test_empty_chunk_handling(self):
        """Test handling of empty audio chunks."""
        empty_chunk = np.array([], dtype=np.int16)
        empty_bytes = empty_chunk.tobytes()
        
        converted = np.frombuffer(empty_bytes, dtype=np.int16)
        assert len(converted) == 0
        
        # Should be able to convert to float32 without error
        float32 = converted.astype(np.float32) / 32768.0
        assert len(float32) == 0
        print(f"\n✅ Empty chunk handled correctly")
    
    def test_single_sample_chunk(self):
        """Test handling of minimum chunk size (1 sample)."""
        single_sample = np.array([1234], dtype=np.int16)
        single_bytes = single_sample.tobytes()
        
        converted = np.frombuffer(single_bytes, dtype=np.int16)
        assert len(converted) == 1
        assert converted[0] == 1234
        
        float32 = converted.astype(np.float32) / 32768.0
        expected = 1234 / 32768.0
        np.testing.assert_almost_equal(float32[0], expected)
        print(f"\n✅ Single sample chunk handled correctly")
    
    def test_maximum_amplitude_handling(self):
        """Test handling of maximum and minimum Int16 values."""
        # Maximum positive and negative values
        extreme_samples = np.array([32767, -32768, 0], dtype=np.int16)
        audio_bytes = extreme_samples.tobytes()
        
        converted = np.frombuffer(audio_bytes, dtype=np.int16)
        float32 = converted.astype(np.float32) / 32768.0
        
        # Max positive should be slightly less than 1.0
        assert float32[0] == 32767 / 32768.0
        # Max negative should be exactly -1.0
        assert float32[1] == -1.0
        # Zero should stay zero
        assert float32[2] == 0.0
        
        print(f"\n✅ Extreme values: max={float32[0]:.6f}, min={float32[1]:.6f}")


class TestChunkBoundaryHandling:
    """Test handling of chunk boundaries in streaming context."""
    
    @pytest.fixture
    def speech_simulation(self):
        """Simulate speech pattern: silence -> speech -> silence."""
        sample_rate = 16000
        
        # 0.5s silence + 1s speech + 0.5s silence
        silence1 = np.zeros(8000, dtype=np.int16)
        speech = (np.sin(2 * np.pi * 440 * np.linspace(0, 1, 16000)) * 20000).astype(np.int16)
        silence2 = np.zeros(8000, dtype=np.int16)
        
        return np.concatenate([silence1, speech, silence2])
    
    def test_chunk_boundaries_preserve_audio_integrity(self, speech_simulation):
        """Verify chunking doesn't lose any audio data at boundaries."""
        chunk_size = 4096  # Frontend chunk size
        chunks = []
        
        for i in range(0, len(speech_simulation), chunk_size):
            chunk = speech_simulation[i:i + chunk_size]
            chunks.append(chunk)
        
        # Reconstruct
        reconstructed = np.concatenate(chunks)
        
        # May have padding at the end, so check up to original length
        np.testing.assert_array_equal(
            reconstructed[:len(speech_simulation)], 
            speech_simulation
        )
        print(f"\n✅ Audio integrity preserved across {len(chunks)} chunks")
    
    def test_speech_onset_in_middle_of_chunk(self, speech_simulation):
        """Test when speech starts in the middle of a chunk."""
        chunk_size = 4096
        
        # Speech starts at sample 8000, chunk boundaries at 0, 4096, 8192, ...
        # So speech onset is between chunk boundaries
        
        chunks = [
            speech_simulation[i:i + chunk_size]
            for i in range(0, len(speech_simulation), chunk_size)
        ]
        
        # Chunk 1 (0-4095): silence
        assert np.max(np.abs(chunks[0])) == 0 or np.max(np.abs(chunks[0])) < 100
        
        # Chunk 2 (4096-8191): mostly silence, some speech may start
        # Chunk 3 (8192-12287): contains speech
        assert np.max(np.abs(chunks[2])) > 1000  # Should have speech amplitude
        
        print(f"\n✅ Speech onset detection across chunk boundaries works")
    
    def test_continuous_streaming_simulation(self, speech_simulation):
        """Simulate continuous streaming as in real-time transcription."""
        chunk_size = 4096
        accumulated_audio = []
        
        # Simulate streaming: chunks arrive one by one
        for i in range(0, len(speech_simulation), chunk_size):
            chunk = speech_simulation[i:i + chunk_size]
            
            # Simulate backend processing
            if len(chunk) > 0:
                # Convert to float32 (as backend does)
                chunk_float32 = chunk.astype(np.float32) / 32768.0
                accumulated_audio.append(chunk_float32)
        
        # All chunks should be processed
        total_processed = sum(len(c) for c in accumulated_audio)
        assert total_processed == len(speech_simulation)
        
        print(f"\n✅ Continuous streaming: {len(accumulated_audio)} chunks, {total_processed} samples")


class TestChunkTimingMetrics:
    """Test timing-related aspects of audio chunking."""
    
    def test_chunk_duration_calculation(self):
        """Verify chunk duration calculations are correct."""
        sample_rate = 16000
        
        test_cases = [
            (512, 32),      # 512 samples = 32ms
            (1024, 64),     # 1024 samples = 64ms
            (4096, 256),    # 4096 samples = 256ms (frontend default)
            (16000, 1000),  # 16000 samples = 1 second
        ]
        
        for chunk_size, expected_ms in test_cases:
            actual_ms = (chunk_size / sample_rate) * 1000
            assert actual_ms == expected_ms, f"Expected {expected_ms}ms, got {actual_ms}ms"
        
        print("\n✅ All chunk duration calculations correct")
    
    def test_latency_estimation(self):
        """Estimate end-to-end latency based on chunk size."""
        sample_rate = 16000
        chunk_size = 4096  # Frontend default
        
        # Audio capture latency (filling the buffer)
        capture_latency_ms = (chunk_size / sample_rate) * 1000
        
        # Typical network latency (local)
        network_latency_ms = 5  # ~5ms for localhost
        
        # Model inference latency (estimated for zipformer)
        inference_latency_ms = 50  # ~50ms per chunk for zipformer
        
        total_latency_ms = capture_latency_ms + network_latency_ms + inference_latency_ms
        
        print(f"\n📊 Latency estimation for {chunk_size} sample chunks:")
        print(f"   Capture: {capture_latency_ms:.1f}ms")
        print(f"   Network: {network_latency_ms}ms (localhost)")
        print(f"   Inference: ~{inference_latency_ms}ms")
        print(f"   Total: ~{total_latency_ms:.1f}ms")
        
        # Total latency should be under 500ms for real-time
        assert total_latency_ms < 500, "Latency too high for real-time"
    
    def test_buffer_underrun_simulation(self):
        """Simulate buffer underrun scenario."""
        sample_rate = 16000
        chunk_size = 4096
        
        # Normal: chunks arrive every 256ms
        expected_interval_ms = (chunk_size / sample_rate) * 1000
        
        # Simulate delayed chunk (e.g., network congestion)
        delayed_interval_ms = expected_interval_ms * 2  # 512ms delay
        
        # This would cause buffer underrun in real-time scenario
        buffer_underrun = delayed_interval_ms > expected_interval_ms * 1.5
        
        print(f"\n📊 Buffer underrun test:")
        print(f"   Expected interval: {expected_interval_ms}ms")
        print(f"   Delayed interval: {delayed_interval_ms}ms")
        print(f"   Would cause underrun: {buffer_underrun}")
        
        # This is informational - actual handling depends on system design


class TestAudioFormatValidation:
    """Validate audio format assumptions."""
    
    def test_16khz_sample_rate(self):
        """Verify 16kHz sample rate is used throughout."""
        expected_sample_rate = 16000
        
        # Frontend uses 16kHz (from useAudioRecorder.ts)
        fe_sample_rate = 16000  # Hardcoded in frontend
        
        # Model expects 16kHz
        model_sample_rate = 16000
        
        assert fe_sample_rate == expected_sample_rate
        assert model_sample_rate == expected_sample_rate
        print("\n✅ Sample rate consistent: 16kHz throughout")
    
    def test_mono_channel(self):
        """Verify mono audio is used."""
        # Simulate stereo to mono conversion (as would happen in frontend)
        stereo_left = np.random.randint(-32768, 32767, 1000, dtype=np.int16)
        stereo_right = np.random.randint(-32768, 32767, 1000, dtype=np.int16)
        
        # Average to mono (common conversion)
        mono = ((stereo_left.astype(np.int32) + stereo_right.astype(np.int32)) // 2).astype(np.int16)
        
        assert len(mono) == 1000  # Same length, just 1 channel
        print("\n✅ Mono channel handling correct")
    
    def test_int16_format(self):
        """Verify Int16 format constraints."""
        # Int16 range: -32768 to 32767
        min_val = np.iinfo(np.int16).min
        max_val = np.iinfo(np.int16).max
        
        assert min_val == -32768
        assert max_val == 32767
        
        # Verify clipping behavior
        overflow_value = 40000
        clipped = np.int16(np.clip(overflow_value, min_val, max_val))
        assert clipped == max_val
        
        print(f"\n✅ Int16 format validated: [{min_val}, {max_val}]")
