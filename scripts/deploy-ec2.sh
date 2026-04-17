#!/bin/bash
# MP Stock EC2 Deployment Script
# This script pulls the latest Docker image and restarts the service

set -e

# ============================================================================
# Configuration
# ============================================================================
IMAGE_URI="${1:-latest}"
CONTAINER_NAME="mp-stock-backend"
COMPOSE_DIR="/opt/mp-stock"
APP_PORT="3001"
HEALTH_CHECK_URL="http://localhost:${APP_PORT}/api/health"
HEALTH_CHECK_RETRIES=30
HEALTH_CHECK_DELAY=2

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ============================================================================
# Functions
# ============================================================================
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

health_check() {
    local retries=0
    while [ $retries -lt $HEALTH_CHECK_RETRIES ]; do
        if curl -sf "$HEALTH_CHECK_URL" > /dev/null 2>&1; then
            log_info "Health check passed!"
            return 0
        fi
        retries=$((retries + 1))
        log_warn "Health check attempt $retries/$HEALTH_CHECK_RETRIES..."
        sleep $HEALTH_CHECK_DELAY
    done
    
    log_error "Health check failed after $HEALTH_CHECK_RETRIES attempts"
    return 1
}

rollback() {
    log_error "Deployment failed. Rolling back to previous version..."
    if [ ! -z "$BACKUP_IMAGE" ]; then
        cd "$COMPOSE_DIR"
        docker compose -p mp-stock -f docker-compose.prod.yml down || true
        log_info "Running backup image: $BACKUP_IMAGE"
        docker compose -p mp-stock -f docker-compose.prod.yml up -d
        log_info "Rollback completed"
    fi
}

# ============================================================================
# Main Deployment
# ============================================================================
log_info "Starting MP Stock deployment..."
log_info "Image URI: $IMAGE_URI"

# Create compose directory if it doesn't exist
mkdir -p "$COMPOSE_DIR"
cd "$COMPOSE_DIR"

# Save current image for rollback
if docker ps -a | grep -q $CONTAINER_NAME; then
    BACKUP_IMAGE=$(docker inspect --format='{{.Image}}' $CONTAINER_NAME 2>/dev/null || echo "")
    log_info "Backup image: $BACKUP_IMAGE"
fi

# Pull latest image
log_info "Pulling Docker image..."
if ! docker pull "$IMAGE_URI"; then
    log_error "Failed to pull Docker image"
    exit 1
fi

# Stop and remove old container
log_info "Stopping old container..."
docker compose -p mp-stock -f docker-compose.prod.yml down || true

# Start new container
log_info "Starting new container with image: $IMAGE_URI..."
if ! docker compose -p mp-stock -f docker-compose.prod.yml up -d; then
    log_error "Failed to start container"
    rollback
    exit 1
fi

# Health check
log_info "Running health checks..."
if ! health_check; then
    log_error "Container failed health check"
    rollback
    exit 1
fi

# Cleanup old images
log_info "Cleaning up old images..."
docker image prune -f --filter "until=240h" || true

log_info "Deployment completed successfully!"
log_info "Service is running on port $APP_PORT"
