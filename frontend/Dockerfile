# =============================================================================
# Frontend Dockerfile - Voice2Text Vietnamese
# Build-only Dockerfile (no serving - use npm run dev locally)
# =============================================================================
# Note: This Dockerfile is for building the frontend only.
#       For development, run `npm run dev` locally for hot reload.
#       For production hosting, add nginx or use a CDN.
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Dependencies - Install node modules (cached layer)
# -----------------------------------------------------------------------------
FROM node:22-alpine AS deps

WORKDIR /app

# Install dependencies only (better caching)
COPY package.json package-lock.json* ./

# Use npm ci for reproducible builds
RUN npm ci --prefer-offline --no-audit --progress=false

# -----------------------------------------------------------------------------
# Stage 2: Builder - Build the application
# -----------------------------------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set production mode for optimized build
ENV NODE_ENV=production

# Build the application
# Disable Tauri-specific build targets for web-only deployment
ENV TAURI_ENV_PLATFORM=""
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 3: Output - Just the built assets
# -----------------------------------------------------------------------------
FROM alpine:latest AS output

# Labels for container metadata
LABEL maintainer="Voice2Text Vietnamese Team"
LABEL version="2.1.0"
LABEL description="Real-time Vietnamese Speech-to-Text Frontend (Build Only)"

WORKDIR /app

# Copy built assets from builder stage
COPY --from=builder /app/dist ./dist

# This image is meant to be used as a source for copying built assets
# Usage: docker cp $(docker create voice2text-frontend):/app/dist ./dist
CMD ["echo", "Frontend build complete. Use 'docker cp' to extract /app/dist"]
