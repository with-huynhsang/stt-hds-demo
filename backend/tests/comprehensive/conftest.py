"""
Pytest configuration for comprehensive tests.

Markers:
- slow: Tests that take a long time (model loading, performance tests)
- e2e: End-to-end tests requiring running backend
"""
import pytest


def pytest_configure(config):
    """Configure custom markers."""
    config.addinivalue_line(
        "markers", "slow: marks tests as slow (deselect with '-m \"not slow\"')"
    )
    config.addinivalue_line(
        "markers", "e2e: marks tests as end-to-end (deselect with '-m \"not e2e\"')"
    )
    config.addinivalue_line(
        "markers", "integration: marks tests as integration tests"
    )
    config.addinivalue_line(
        "markers", "performance: marks tests as performance tests"
    )


def pytest_collection_modifyitems(config, items):
    """Auto-skip slow tests unless explicitly requested."""
    if config.getoption("-m"):
        # If marker specified, don't auto-skip
        return
    
    skip_slow = pytest.mark.skip(reason="slow test - run with -m slow")
    skip_e2e = pytest.mark.skip(reason="e2e test - run with -m e2e")
    
    for item in items:
        if "slow" in item.keywords:
            item.add_marker(skip_slow)
        if "e2e" in item.keywords:
            item.add_marker(skip_e2e)
