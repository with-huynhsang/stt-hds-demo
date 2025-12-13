# =============================================================================
# Backend Dockerfile - Voice2Text Vietnamese
# Optimized multi-stage build for development and local run
# =============================================================================
# Note: For development with hot reload, use docker-compose which overrides
#       the CMD with --reload flag.
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Builder - Install dependencies and compile extensions
# -----------------------------------------------------------------------------
FROM python:3.10-slim AS builder

WORKDIR /build

# Install build dependencies (only in builder stage)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    git \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Create virtual environment for isolation
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install Python dependencies
# Copy requirements first for better layer caching
COPY requirements.txt .

# Install dependencies with optimized flags
RUN pip install --no-cache-dir --upgrade pip wheel setuptools && \
    pip install --no-cache-dir -r requirements.txt

# Pre-download ViSoBERT-HSD tokenizer (cache in builder)
# This avoids download on every container start
RUN python -c "from transformers import AutoTokenizer; AutoTokenizer.from_pretrained('visolex/visobert-hsd')" 2>/dev/null || true

# -----------------------------------------------------------------------------
# Stage 2: Runtime - Minimal image for running the application
# -----------------------------------------------------------------------------
FROM python:3.10-slim AS runtime

# Labels for container metadata
LABEL maintainer="Voice2Text Vietnamese Team"
LABEL version="2.1.0"
LABEL description="Real-time Vietnamese Speech-to-Text API with Content Moderation"

WORKDIR /app

# Install only runtime dependencies (smaller footprint)
# - ffmpeg: audio processing (required by sherpa-onnx)
# - libsndfile1: audio file handling
# - curl: for health checks
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean \
    && rm -rf /tmp/* /var/tmp/*

# Copy virtual environment from builder (with all dependencies)
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy HuggingFace cache with tokenizer files
COPY --from=builder /root/.cache/huggingface /root/.cache/huggingface

# Copy application code
# Exclude unnecessary files via .dockerignore
COPY main.py .
COPY app/ ./app/

# Create data directory for database
RUN mkdir -p /app/data

# Environment variables
# Python optimization
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# ONNX Runtime optimization
ENV OMP_NUM_THREADS=4
ENV ORT_DISABLE_SPIN_WAIT=1

# Application settings (can be overridden by docker-compose)
ENV PROJECT_NAME="Real-time Vietnamese STT"
ENV API_V1_STR="/api/v1"
ENV DEBUG=true
ENV LOG_LEVEL=DEBUG

# Content Moderation (ViSoBERT-HSD)
ENV ENABLE_CONTENT_MODERATION=true
ENV MODERATION_CONFIDENCE_THRESHOLD=0.7
ENV MODERATION_ON_FINAL_ONLY=true

# Database
ENV DATABASE_URL="sqlite+aiosqlite:///data/database.db"

# Expose API port
EXPOSE 8000

# Health check for container orchestration
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Default command (overridden by docker-compose for hot reload)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
