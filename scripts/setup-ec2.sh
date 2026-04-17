#!/bin/bash

# ============================================================================
# EC2 Setup Script for MP Stock Docker Deployment
# Run this script on a fresh Amazon Linux 2 or Ubuntu EC2 instance
# ============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# ============================================================================
# Configuration
# ============================================================================
APP_DIR="/opt/mp-stock"
APP_USER="ec2-user"

# ============================================================================
# Functions
# ============================================================================
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# ============================================================================
# Update System
# ============================================================================
update_system() {
    log_info "Updating system packages..."
    
    if command -v apt-get &> /dev/null; then
        # Ubuntu/Debian
        sudo apt-get update
        sudo apt-get upgrade -y
    else
        # Amazon Linux / RHEL
        sudo yum update -y
    fi
    
    log_success "System updated"
}

# ============================================================================
# Install Docker
# ============================================================================
install_docker() {
    log_info "Installing Docker..."
    
    if command -v docker &> /dev/null; then
        log_info "Docker already installed"
        return
    fi
    
    if command -v apt-get &> /dev/null; then
        # Ubuntu/Debian
        sudo apt-get install -y docker.io
        sudo systemctl start docker
        sudo systemctl enable docker
    else
        # Amazon Linux / RHEL
        sudo yum install -y docker
        sudo systemctl start docker
        sudo systemctl enable docker
    fi
    
    log_success "Docker installed"
}

# ============================================================================
# Install Docker Compose
# ============================================================================
install_docker_compose() {
    log_info "Installing Docker Compose..."
    
    if docker compose version &> /dev/null; then
        log_info "Docker Compose already installed"
        return
    fi
    
    DOCKER_COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep 'tag_name' | cut -d'"' -f4)
    sudo curl -L "https://github.com/docker/compose/releases/download/${DOCKER_COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    
    log_success "Docker Compose installed"
}

# ============================================================================
# Install AWS CLI
# ============================================================================
install_aws_cli() {
    log_info "Installing AWS CLI..."
    
    if command -v aws &> /dev/null; then
        log_info "AWS CLI already installed"
        return
    fi
    
    if command -v apt-get &> /dev/null; then
        sudo apt-get install -y awscli
    else
        sudo yum install -y aws-cli
    fi
    
    log_success "AWS CLI installed"
}

# ============================================================================
# Install Additional Tools
# ============================================================================
install_tools() {
    log_info "Installing additional tools..."
    
    if command -v apt-get &> /dev/null; then
        sudo apt-get install -y curl git jq htop tmux
    else
        sudo yum install -y curl git jq htop tmux
    fi
    
    log_success "Additional tools installed"
}

# ============================================================================
# Configure Docker User
# ============================================================================
configure_docker_user() {
    log_info "Configuring Docker for user..."
    
    # Add user to docker group
    sudo usermod -aG docker $APP_USER || true
    
    # Apply group changes
    newgrp docker || true
    
    log_success "Docker configured for user"
}

# ============================================================================
# Create Application Directory
# ============================================================================
create_app_directory() {
    log_info "Creating application directory..."
    
    sudo mkdir -p $APP_DIR
    sudo chown -R $APP_USER:$APP_USER $APP_DIR
    
    mkdir -p $APP_DIR/{data,logs,scripts}
    
    log_success "Application directory created: $APP_DIR"
}

# ============================================================================
# Create docker-compose.prod.yml
# ============================================================================
create_docker_compose() {
    log_info "Creating docker-compose.prod.yml..."
    
    cat > $APP_DIR/docker-compose.prod.yml << 'EOF'
services:
  postgres:
    image: postgres:16-alpine
    container_name: mp-postgres-prod
    environment:
      POSTGRES_USER: ${DB_USER:-postgres}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: ${DB_NAME:-mp_stock}
      TZ: Asia/Seoul
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - mp-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER:-postgres}"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: mp-redis-prod
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD} --maxmemory 2gb --maxmemory-policy allkeys-lru
    volumes:
      - redis_data:/data
    networks:
      - mp-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  backend:
    image: ${DOCKER_IMAGE_URI:-mp-stock:latest}
    container_name: mp-stock-backend
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment:
      NODE_ENV: production
      PORT: 3001
      DATABASE_URL: postgresql://${DB_USER:-postgres}:${DB_PASSWORD}@postgres:5432/${DB_NAME:-mp_stock}?schema=public
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379
      TZ: Asia/Seoul
      JWT_ACCESS_SECRET: ${JWT_ACCESS_SECRET}
      JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET}
      CORE_INTEGRITY_HASH: ${CORE_INTEGRITY_HASH}
      KIS_APP_KEY: ${KIS_APP_KEY}
      KIS_APP_SECRET: ${KIS_APP_SECRET}
      TELEGRAM_BOT_TOKEN: ${TELEGRAM_BOT_TOKEN}
      TELEGRAM_CHAT_ID: ${TELEGRAM_CHAT_ID}
    ports:
      - "3001:3001"
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
    networks:
      - mp-network
    restart: unless-stopped
    deploy:
      resources:
        limits:
          cpus: '1.5'
          memory: 2G
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    logging:
      driver: "json-file"
      options:
        max-size: "50m"
        max-file: "5"

volumes:
  postgres_data:
    driver: local
  redis_data:
    driver: local

networks:
  mp-network:
    driver: bridge
EOF
    
    log_success "docker-compose.prod.yml created (with resource limits)"
}

# ============================================================================
# Create Environment Template
# ============================================================================
create_env_template() {
    log_info "Creating .env.production template..."
    
    cat > $APP_DIR/.env.production << 'EOF'
# ============================================================================
# Production Environment Variables
# ============================================================================

# Node.js
NODE_ENV=production
PORT=3001
TZ=Asia/Seoul

# Database
DB_USER=postgres
DB_PASSWORD=<SET_IN_AWS_SECRETS>
DB_NAME=mp_stock

# Redis
REDIS_PASSWORD=<SET_IN_AWS_SECRETS>

# JWT
JWT_ACCESS_SECRET=<SET_IN_AWS_SECRETS>
JWT_REFRESH_SECRET=<SET_IN_AWS_SECRETS>
CORE_INTEGRITY_HASH=<SET_IN_AWS_SECRETS>

# APIs
KIS_APP_KEY=<SET_IN_AWS_SECRETS>
KIS_APP_SECRET=<SET_IN_AWS_SECRETS>
TELEGRAM_BOT_TOKEN=<SET_IN_AWS_SECRETS>
TELEGRAM_CHAT_ID=<SET_IN_AWS_SECRETS>
EOF
    
    log_success ".env.production template created"
}

# ============================================================================
# Create Deployment Script
# ============================================================================
create_deploy_script() {
    log_info "Creating deployment script..."
    
    cat > $APP_DIR/deploy.sh << 'EOF'
#!/bin/bash
set -e

echo "Starting deployment..."

# Source environment variables
source .env.production

# Login to ECR
aws ecr get-login-password --region ap-northeast-2 | \
  docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.ap-northeast-2.amazonaws.com

# Pull latest image
docker pull $DOCKER_IMAGE_URI

# Stop and remove old container
docker compose -p mp-stock -f docker-compose.prod.yml down || true

# Start new container
docker compose -p mp-stock -f docker-compose.prod.yml up -d

# --- DB 마이그레이션 적용 ---
echo "Running Prisma Database Migrations..."
# 백엔드 컨테이너 내부에서 Prisma 스키마 동기화 실행
docker exec mp-stock-backend npx prisma migrate deploy
echo "✓ Migrations completed"

# Wait for health check
echo "Waiting for health check..."
for i in {1..30}; do
  if curl -sf http://localhost:3001/api/health > /dev/null; then
    echo "✓ Health check passed"
    break
  fi
  echo "Attempt $i/30..."
  sleep 2
done

echo "Deployment completed!"
EOF
    
    chmod +x $APP_DIR/deploy.sh
    log_success "Deployment script created (with Prisma migration support)"
}

# ============================================================================
# Create Systemd Service (Optional)
# ============================================================================
create_systemd_service() {
    log_info "Creating systemd service file..."
    
    cat > /tmp/mp-stock.service << EOF
[Unit]
Description=MP Stock Docker Application
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
User=$APP_USER
WorkingDirectory=$APP_DIR
ExecStart=$APP_DIR/deploy.sh
ExecStop=docker compose -p mp-stock -f docker-compose.prod.yml down
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
    
    sudo tee /etc/systemd/system/mp-stock.service > /dev/null < /tmp/mp-stock.service
    sudo systemctl daemon-reload
    
    log_success "Systemd service created (optional)"
    echo "To enable auto-start: sudo systemctl enable mp-stock.service"
}

# ============================================================================
# Output Instructions
# ============================================================================
output_instructions() {
    log_info "Setup completed!"
    echo ""
    echo "Next steps:"
    echo "1. SSH into the instance:"
    echo "   ssh -i your-key.pem ec2-user@YOUR_EC2_IP"
    echo ""
    echo "2. Edit environment file:"
    echo "   vi $APP_DIR/.env.production"
    echo ""
    echo "3. Test Docker:"
    echo "   docker --version"
    echo "   docker compose --version"
    echo ""
    echo "4. Manual deployment (testing):"
    echo "   cd $APP_DIR"
    echo "   bash deploy.sh"
    echo ""
    echo "5. Enable auto-start (optional):"
    echo "   sudo systemctl enable mp-stock.service"
    echo ""
}

# ============================================================================
# Main
# ============================================================================
main() {
    log_info "Starting EC2 setup..."
    echo ""
    
    update_system
    install_docker
    install_docker_compose
    install_aws_cli
    install_tools
    configure_docker_user
    create_app_directory
    create_docker_compose
    create_env_template
    create_deploy_script
    create_systemd_service
    
    echo ""
    output_instructions
}

main "$@"