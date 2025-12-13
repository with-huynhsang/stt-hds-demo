"""
Pytest configuration and shared fixtures for all tests.

This module provides:
- Database fixtures for async tests
- Mock queue fixtures for worker tests
- HTTP client fixtures for API tests
- Audio sample fixtures for E2E tests
"""
import os
import sys
import pytest
import asyncio
import multiprocessing
import numpy as np
from typing import Tuple
from unittest.mock import MagicMock

# Ensure backend is in path
backend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)


# =============================================================================
# Pytest Configuration
# =============================================================================

def pytest_configure(config):
    """Configure pytest markers."""
    config.addinivalue_line(
        "markers", "slow: marks tests as slow (deselect with '-m \"not slow\"')"
    )
    config.addinivalue_line(
        "markers", "e2e: marks tests as end-to-end requiring running backend"
    )
    config.addinivalue_line(
        "markers", "benchmark: marks tests as performance benchmarks"
    )


# =============================================================================
# Database Fixtures
# =============================================================================

@pytest.fixture(scope="function")
async def setup_database():
    """Setup database for async tests that need it."""
    from app.core.database import create_db_and_tables
    await create_db_and_tables()
    yield


@pytest.fixture(scope="function")
def setup_database_sync():
    """Setup database for sync tests that need it."""
    import asyncio
    from app.core.database import create_db_and_tables
    asyncio.get_event_loop().run_until_complete(create_db_and_tables())
    yield


# =============================================================================
# HTTP Client Fixtures
# =============================================================================

@pytest.fixture
async def async_client():
    """Async HTTP client for testing API endpoints."""
    from httpx import AsyncClient, ASGITransport
    from main import app
    
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test"
    ) as client:
        yield client


@pytest.fixture
def sync_client():
    """Sync HTTP client for testing API endpoints."""
    from fastapi.testclient import TestClient
    from main import app
    return TestClient(app)


# =============================================================================
# Mock Queue Fixtures
# =============================================================================

@pytest.fixture
def mock_queues() -> Tuple[MagicMock, MagicMock]:
    """Mock multiprocessing queues for worker tests."""
    input_q = MagicMock(spec=multiprocessing.Queue)
    output_q = MagicMock(spec=multiprocessing.Queue)
    return input_q, output_q


@pytest.fixture
def real_queues() -> Tuple[multiprocessing.Queue, multiprocessing.Queue]:
    """Real multiprocessing queues for integration tests."""
    input_q = multiprocessing.Queue()
    output_q = multiprocessing.Queue()
    yield input_q, output_q
    # Cleanup
    input_q.close()
    output_q.close()


# =============================================================================
# Audio Fixtures
# =============================================================================

@pytest.fixture
def dummy_audio_bytes() -> bytes:
    """Generate 1 second of dummy audio (16kHz, int16, mono)."""
    duration_sec = 1.0
    sample_rate = 16000
    samples = np.random.randint(-32768, 32767, int(sample_rate * duration_sec), dtype=np.int16)
    return samples.tobytes()


@pytest.fixture
def silence_audio_bytes() -> bytes:
    """Generate 1 second of silence (16kHz, int16, mono)."""
    duration_sec = 1.0
    sample_rate = 16000
    samples = np.zeros(int(sample_rate * duration_sec), dtype=np.int16)
    return samples.tobytes()


@pytest.fixture
def long_audio_bytes() -> bytes:
    """Generate 5 seconds of dummy audio for VAD testing."""
    duration_sec = 5.0
    sample_rate = 16000
    samples = np.random.randint(-32768, 32767, int(sample_rate * duration_sec), dtype=np.int16)
    return samples.tobytes()


# =============================================================================
# Model Constants
# =============================================================================

VALID_MODELS = ["zipformer"]


@pytest.fixture
def valid_models():
    """List of valid model names."""
    return VALID_MODELS


# =============================================================================
# Skip Markers
# =============================================================================

def pytest_collection_modifyitems(config, items):
    """Add skip markers based on environment."""
    import socket
    
    # Check if backend is running
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    backend_running = sock.connect_ex(('localhost', 8000)) == 0
    sock.close()
    
    skip_e2e = pytest.mark.skip(reason="E2E test requires running backend on localhost:8000")
    
    for item in items:
        if "e2e" in item.keywords and not backend_running:
            item.add_marker(skip_e2e)
