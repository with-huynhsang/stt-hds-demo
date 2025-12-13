"""
RFC 7807 Problem Details compliance tests.

Tests that error responses follow the RFC 7807 standard:
- application/problem+json content type
- status, title, type fields
- Proper error codes for different scenarios
"""
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from main import app
from app.core.database import create_db_and_tables

# Mark all tests in this module as async
pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture(scope="function")
async def setup_db():
    """Setup database before each test."""
    await create_db_and_tables()


@pytest_asyncio.fixture
async def ac(setup_db):
    """Async HTTP client fixture."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test"
    ) as client:
        yield client


class TestRFC7807Compliance:
    """Test RFC 7807 Problem Details compliance."""
    
    @pytest.mark.asyncio
    async def test_404_not_found_rfc7807(self, ac):
        """Test 404 response follows RFC 7807."""
        response = await ac.get("/api/v1/non-existent-endpoint")
        
        assert response.status_code == 404
        assert response.headers["content-type"] == "application/problem+json"
        
        data = response.json()
        assert data["status"] == 404
        assert data["title"] == "Not Found"
        assert data["type"] == "about:blank"
    
    @pytest.mark.asyncio
    async def test_400_bad_request_rfc7807(self, ac):
        """Test 400 response follows RFC 7807."""
        # Trigger validation error - switch model with invalid model name
        response = await ac.post("/api/v1/models/switch?model=invalid_model_name")
        
        assert response.status_code == 400
        assert response.headers["content-type"] == "application/problem+json"
        
        data = response.json()
        assert data["status"] == 400
        assert "Invalid model" in data["detail"]
    
    @pytest.mark.asyncio
    async def test_custom_error_rfc7807(self, ac):
        """Test custom error response follows RFC 7807."""
        # Trigger ValueError with unknown model
        response = await ac.post("/api/v1/models/switch?model=unknown_model_xyz")
        
        assert response.status_code == 400
        assert response.headers["content-type"] == "application/problem+json"
        
        data = response.json()
        assert data["status"] == 400
        assert "Invalid model" in data["detail"]
    
    @pytest.mark.asyncio
    async def test_422_validation_error_rfc7807(self, ac):
        """Test 422 validation error follows RFC 7807."""
        # Missing required parameter
        response = await ac.post("/api/v1/models/switch")
        
        assert response.status_code == 422
        assert response.headers["content-type"] == "application/problem+json"
        
        data = response.json()
        assert data["status"] == 422
        assert data["title"] == "Validation Error"


class TestErrorResponses:
    """Test various error response scenarios."""
    
    @pytest.mark.asyncio
    async def test_method_not_allowed(self, ac):
        """Test method not allowed returns proper error."""
        # GET on POST-only endpoint
        response = await ac.get("/api/v1/models/switch?model=zipformer")
        
        assert response.status_code == 405
    
    @pytest.mark.asyncio
    async def test_valid_model_switch_no_error(self, ac):
        """Test valid model switch doesn't return error."""
        # Valid model name
        response = await ac.post("/api/v1/models/switch?model=zipformer")
        
        # Should succeed (200) or fail to start (503), but not 400
        assert response.status_code in [200, 503]
