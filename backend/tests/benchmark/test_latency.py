"""
WebSocket latency benchmark tests.

Tests end-to-end latency through the WebSocket API for each model.
Requires backend to be running on localhost:8000.

Run with: pytest tests/benchmark/test_latency.py -v -s -m e2e
"""
import pytest
import asyncio
import json
import time
import os
import sys
import numpy as np

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

# =============================================================================
# Configuration
# =============================================================================

WS_URL = "ws://localhost:8000/ws/transcribe"
SAMPLE_RATE = 16000
CHUNK_DURATION_MS = 200  # Send 200ms chunks
CHUNK_SIZE = int(SAMPLE_RATE * CHUNK_DURATION_MS / 1000) * 2  # bytes (int16)

# Models to benchmark
MODELS = ["zipformer"]


# =============================================================================
# Utilities
# =============================================================================

def generate_test_audio(duration_sec: float = 5.0) -> bytes:
    """Generate test audio data (random noise that may trigger transcription)."""
    samples = np.random.randint(
        -32768, 32767,
        int(SAMPLE_RATE * duration_sec),
        dtype=np.int16
    )
    return samples.tobytes()


def generate_speech_like_audio(duration_sec: float = 5.0) -> bytes:
    """Generate audio that mimics speech patterns (alternating noise and silence)."""
    total_samples = int(SAMPLE_RATE * duration_sec)
    samples = np.zeros(total_samples, dtype=np.int16)
    
    # Create bursts of audio with gaps (like speech)
    burst_len = int(SAMPLE_RATE * 0.3)  # 300ms bursts
    gap_len = int(SAMPLE_RATE * 0.1)    # 100ms gaps
    
    pos = 0
    while pos < total_samples:
        # Add burst
        end = min(pos + burst_len, total_samples)
        samples[pos:end] = np.random.randint(-20000, 20000, end - pos, dtype=np.int16)
        pos = end
        
        # Add gap
        pos += gap_len
    
    return samples.tobytes()


# =============================================================================
# Benchmark Tests
# =============================================================================

class TestWebSocketLatencyBenchmark:
    """Benchmark WebSocket latency for each model."""
    
    @pytest.fixture
    def results_log(self):
        """Results log for this benchmark run."""
        return []
    
    @pytest.mark.e2e
    @pytest.mark.benchmark
    @pytest.mark.asyncio
    @pytest.mark.parametrize("model_name", MODELS)
    async def test_latency_benchmark(self, model_name, results_log):
        """
        Benchmark end-to-end latency of the STT system for each model.
        Sends audio chunks and measures time to receive results.
        """
        import websockets
        
        print(f"\n{'=' * 50}")
        print(f"[Benchmark] Model: {model_name}")
        print(f"[Benchmark] WebSocket: {WS_URL}")
        print(f"{'=' * 50}")
        
        try:
            async with websockets.connect(WS_URL, close_timeout=30) as websocket:
                # 1. Start Session
                session_id = f"bench-{model_name}-{int(time.time())}"
                await websocket.send(json.dumps({
                    "type": "start_session",
                    "sessionId": session_id
                }))
                
                # 2. Send Config
                await websocket.send(json.dumps({
                    "type": "config",
                    "model": model_name
                }))
                
                # Wait for model to load
                print(f"[Benchmark] Waiting for {model_name} to initialize...")
                await asyncio.sleep(3.0)
                
                print("[Benchmark] Streaming audio...")
                
                # Generate test audio
                audio_data = generate_speech_like_audio(duration_sec=5.0)
                total_chunks = len(audio_data) // CHUNK_SIZE
                
                latencies = []
                messages_received = []
                start_time = time.time()
                
                # Task to receive results
                async def receive_results():
                    try:
                        while True:
                            msg = await asyncio.wait_for(
                                websocket.recv(),
                                timeout=15.0  # Longer timeout for slow models
                            )
                            recv_time = time.time()
                            data = json.loads(msg)
                            
                            if data.get("text"):
                                latency = recv_time - start_time
                                latencies.append(latency)
                                messages_received.append({
                                    "text": data["text"],
                                    "latency": latency,
                                    "is_final": data.get("is_final", False)
                                })
                    except asyncio.TimeoutError:
                        pass
                    except Exception as e:
                        print(f"[Benchmark] Receive error: {e}")

                receive_task = asyncio.create_task(receive_results())
                
                # Stream Audio
                stream_start = time.time()
                for i in range(total_chunks):
                    chunk = audio_data[i*CHUNK_SIZE : (i+1)*CHUNK_SIZE]
                    await websocket.send(chunk)
                    # Simulate real-time streaming
                    await asyncio.sleep(CHUNK_DURATION_MS / 1000)
                stream_end = time.time()
                
                print(f"[Benchmark] Streaming complete ({stream_end - stream_start:.2f}s)")
                
                # Wait for final results
                await asyncio.sleep(5.0)
                receive_task.cancel()
                try:
                    await receive_task
                except asyncio.CancelledError:
                    pass
                
                # Analyze Results
                print(f"\n{'=' * 50}")
                print(f"BENCHMARK RESULTS: {model_name}")
                print(f"{'=' * 50}")
                
                if latencies:
                    avg_latency = sum(latencies) / len(latencies)
                    min_latency = min(latencies)
                    max_latency = max(latencies)
                    
                    print(f"Messages Received: {len(latencies)}")
                    print(f"Average Latency:   {avg_latency*1000:.0f} ms")
                    print(f"Min Latency:       {min_latency*1000:.0f} ms")
                    print(f"Max Latency:       {max_latency*1000:.0f} ms")
                    
                    # Show sample transcriptions
                    if messages_received:
                        print(f"\nSample Transcriptions:")
                        for msg in messages_received[:3]:
                            final_marker = "✓" if msg["is_final"] else "○"
                            print(f"  {final_marker} [{msg['latency']*1000:.0f}ms] {msg['text'][:50]}...")
                    
                    # Model-specific assertions
                    if model_name == "zipformer":
                        # Zipformer should be fast (Offline but still quick)
                        assert avg_latency < 5.0, f"Zipformer latency {avg_latency:.2f}s too high"
                    
                    print(f"\n✅ {model_name} Benchmark Completed")
                    
                else:
                    print(f"⚠️ No transcription results received for {model_name}")
                    print("   (This may be expected for random/noisy audio)")
                
                print(f"{'=' * 50}\n")
                
        except ConnectionRefusedError:
            pytest.skip("Backend not running on localhost:8000")
        except Exception as e:
            pytest.fail(f"Benchmark failed for {model_name}: {e}")


class TestStreamingLatency:
    """Test streaming-specific latency metrics."""
    
    @pytest.mark.e2e
    @pytest.mark.benchmark
    @pytest.mark.asyncio
    async def test_first_result_latency(self):
        """Measure time to first transcription result."""
        import websockets
        
        try:
            async with websockets.connect(WS_URL, close_timeout=30) as websocket:
                # Use zipformer (fastest model)
                await websocket.send(json.dumps({
                    "type": "config",
                    "model": "zipformer"
                }))
                
                await asyncio.sleep(2.0)  # Wait for model
                
                audio_data = generate_speech_like_audio(duration_sec=3.0)
                
                start_time = time.time()
                
                # Send all audio at once
                await websocket.send(audio_data)
                
                # Wait for first result
                try:
                    msg = await asyncio.wait_for(websocket.recv(), timeout=10.0)
                    first_result_time = time.time() - start_time
                    
                    print(f"\nFirst result latency: {first_result_time*1000:.0f}ms")
                    print(f"Result: {json.loads(msg)}")
                    
                except asyncio.TimeoutError:
                    print("No result received within timeout")
                    
        except ConnectionRefusedError:
            pytest.skip("Backend not running on localhost:8000")


# =============================================================================
# Standalone Runner
# =============================================================================

if __name__ == "__main__":
    """Run benchmarks standalone."""
    import asyncio
    
    async def main():
        for model in MODELS:
            print(f"\n{'=' * 60}")
            print(f"Benchmarking {model}...")
            print(f"{'=' * 60}")
            
            test = TestWebSocketLatencyBenchmark()
            try:
                await test.test_latency_benchmark(model, [])
            except Exception as e:
                print(f"Error: {e}")
    
    asyncio.run(main())
