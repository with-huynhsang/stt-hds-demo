import logging
from sqlalchemy.ext.asyncio import create_async_engine
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlmodel import SQLModel, text
from app.core.config import settings

logger = logging.getLogger(__name__)

# Create async engine with proper settings
connect_args = {"check_same_thread": False}
engine = create_async_engine(
    settings.DATABASE_URL, 
    echo=settings.DATABASE_ECHO, 
    connect_args=connect_args,
    pool_pre_ping=True,  # Check connection health
)


async def create_db_and_tables():
    """Create database tables and configure SQLite settings."""
    # Import models to ensure they are registered with SQLModel.metadata
    from app.models import schema
    
    logger.info(f"Creating tables: {list(SQLModel.metadata.tables.keys())}")
    
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
        # Enable WAL mode for better concurrent write performance
        await conn.execute(text("PRAGMA journal_mode=WAL;"))
        await conn.execute(text("PRAGMA synchronous=NORMAL;"))
        
    logger.info("Database initialized successfully")


async def get_session():
    """Dependency that provides an async database session."""
    async_session = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()
