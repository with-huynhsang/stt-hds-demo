import logging
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # General
    PROJECT_NAME: str = "Real-time Vietnamese STT"
    API_V1_STR: str = "/api/v1"
    DEBUG: bool = False
    
    # CORS
    ALLOWED_ORIGINS: List[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    
    # Model Storage
    MODEL_STORAGE_PATH: str = "models_storage"
    
    # Content Moderation (ViSoBERT-HSD)
    ENABLE_CONTENT_MODERATION: bool = True
    MODERATION_CONFIDENCE_THRESHOLD: float = 0.7
    # Only run moderation on final transcription results
    MODERATION_ON_FINAL_ONLY: bool = True
    
    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///database.db"
    DATABASE_ECHO: bool = False
    
    # Logging
    LOG_LEVEL: str = "INFO"
    
    model_config = SettingsConfigDict(
        env_file=".env", 
        case_sensitive=True,
        extra="ignore"
    )


settings = Settings()


def get_settings() -> Settings:
    """Get the settings instance (for dependency injection)."""
    return settings


# Configure logging
def setup_logging():
    """Configure application-wide logging."""
    log_level = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)
    
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )
    
    # Reduce noise from third-party libraries
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    # Reduce WebSocket binary data spam (shows < BINARY ... in DEBUG mode)
    logging.getLogger("websockets").setLevel(logging.WARNING)
    logging.getLogger("websockets.protocol").setLevel(logging.WARNING)
    logging.getLogger("websockets.server").setLevel(logging.WARNING)
    

setup_logging()
