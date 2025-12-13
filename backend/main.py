import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from fastapi.routing import APIRoute
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.config import settings
from app.core.database import create_db_and_tables
from app.core.manager import manager
from app.core.errors import http_exception_handler, validation_exception_handler, general_exception_handler

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager for startup and shutdown."""
    # Startup
    logger.info(f"Starting {settings.PROJECT_NAME}...")
    await create_db_and_tables()
    
    # Pre-load all models for faster first request
    # Run in thread to not block startup (models load in background)
    import asyncio
    loop = asyncio.get_event_loop()
    loop.run_in_executor(None, manager.preload_all_models)
    
    logger.info("Application started successfully (models loading in background)")
    
    yield
    
    # Shutdown
    logger.info("Shutting down...")
    manager.stop_all_models()
    logger.info("Application shutdown complete")


app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Real-time Vietnamese Speech-to-Text Research Dashboard API",
    version="1.0.0",
    lifespan=lifespan,
)

# Exception handlers
app.add_exception_handler(StarletteHTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(Exception, general_exception_handler)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def simplify_operation_ids(app: FastAPI):
    """Use function names as operation IDs for cleaner OpenAPI spec."""
    for route in app.routes:
        if isinstance(route, APIRoute):
            route.operation_id = route.name


def custom_openapi():
    """Generate custom OpenAPI schema."""
    if app.openapi_schema:
        return app.openapi_schema
    
    simplify_operation_ids(app)
    
    openapi_schema = get_openapi(
        title=settings.PROJECT_NAME,
        version="1.0.0",
        description="Real-time Vietnamese Speech-to-Text Research Dashboard",
        routes=app.routes,
    )
    
    # Set server URL for hey-api generator
    openapi_schema["servers"] = [{"url": "http://localhost:8000"}]
    app.openapi_schema = openapi_schema
    return app.openapi_schema


app.openapi = custom_openapi


@app.get("/", tags=["Health"])
def root():
    """Health check endpoint."""
    return {"message": "Welcome to Real-time STT API", "status": "healthy"}


@app.get("/health", tags=["Health"])
def health_check():
    """Detailed health check."""
    return {
        "status": "healthy",
        "model_loaded": manager.current_model is not None,
        "current_model": manager.current_model
    }


# Include API routes
from app.api.endpoints import router
app.include_router(router)
