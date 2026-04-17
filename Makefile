.PHONY: help build up down logs test deploy lint format install push

# Colors
BLUE := \033[0;34m
GREEN := \033[0;32m
RED := \033[0;31m
NC := \033[0m # No Color

help:
	@echo "$(BLUE)MP Stock Development Commands$(NC)"
	@echo ""
	@echo "$(GREEN)Development:$(NC)"
	@echo "  make install       - Install dependencies"
	@echo "  make lint          - Run linter"
	@echo "  make format        - Format code"
	@echo "  make test          - Run tests"
	@echo ""
	@echo "$(GREEN)Docker:$(NC)"
	@echo "  make build         - Build Docker image"
	@echo "  make up            - Start containers (dev)"
	@echo "  make down          - Stop containers"
	@echo "  make logs          - View container logs"
	@echo "  make logs-backend  - View backend logs only"
	@echo "  make clean         - Remove containers and volumes"
	@echo ""
	@echo "$(GREEN)Database:$(NC)"
	@echo "  make db-migrate    - Run database migrations"
	@echo "  make db-reset      - Reset database"
	@echo ""
	@echo "$(GREEN)Production:$(NC)"
	@echo "  make push          - Push image to ECR"
	@echo "  make deploy        - Deploy to AWS EC2"
	@echo ""

# Install dependencies
install:
	@echo "$(BLUE)Installing dependencies...$(NC)"
	npm ci --legacy-peer-deps

# Linting
lint:
	@echo "$(BLUE)Running linter...$(NC)"
	npx eslint src --fix || true
	npx prettier --write src || true

format:
	@echo "$(BLUE)Formatting code...$(NC)"
	npx prettier --write "src/**/*.{js,ts,jsx,tsx,json,css,md}"

# Testing
test:
	@echo "$(BLUE)Running tests...$(NC)"
	npm test -- --passWithNoTests

# Docker commands
build:
	@echo "$(BLUE)Building Docker image...$(NC)"
	docker build -t mp-stock:latest -f Dockerfile .

build-prod:
	@echo "$(BLUE)Building production Docker image...$(NC)"
	docker build -t mp-stock:prod -f Dockerfile . --build-arg NODE_ENV=production

up:
	@echo "$(BLUE)Starting containers...$(NC)"
	docker compose -p mp-stock -f docker-compose.dev.yml up -d
	@echo "$(GREEN)Containers started! Backend: http://localhost:3001$(NC)"

down:
	@echo "$(BLUE)Stopping containers...$(NC)"
	docker compose -p mp-stock -f docker-compose.dev.yml down

restart: down up

logs:
	@echo "$(BLUE)Showing all container logs...$(NC)"
	docker compose -p mp-stock -f docker-compose.dev.yml logs -f

logs-backend:
	@echo "$(BLUE)Showing backend logs...$(NC)"
	docker logs -f mp-backend

logs-postgres:
	@echo "$(BLUE)Showing PostgreSQL logs...$(NC)"
	docker logs -f mp-postgres

logs-redis:
	@echo "$(BLUE)Showing Redis logs...$(NC)"
	docker logs -f mp-redis

ps:
	@echo "$(BLUE)Container status:$(NC)"
	docker compose -p mp-stock -f docker-compose.dev.yml ps

clean:
	@echo "$(BLUE)Cleaning up containers and volumes...$(NC)"
	docker compose -p mp-stock -f docker-compose.dev.yml down -v
	docker system prune -f

# Database commands
db-migrate:
	@echo "$(BLUE)Running database migrations...$(NC)"
	docker exec mp-backend npx prisma migrate deploy

db-reset:
	@echo "$(RED)Resetting database (this will delete all data!)$(NC)"
	docker compose -p mp-stock -f docker-compose.dev.yml down -v
	docker compose -p mp-stock -f docker-compose.dev.yml up -d postgres
	sleep 5
	docker exec mp-postgres psql -U postgres -d mp_stock -f /docker-entrypoint-initdb.d/init.sql

# Production commands
push:
	@echo "$(BLUE)Pushing image to ECR...$(NC)"
	@read -p "Enter AWS Account ID: " AWS_ACCOUNT_ID; \
	read -p "Enter image tag (default: latest): " TAG; \
	TAG=$${TAG:-latest}; \
	aws ecr get-login-password --region ap-northeast-2 | docker login --username AWS --password-stdin $$AWS_ACCOUNT_ID.dkr.ecr.ap-northeast-2.amazonaws.com; \
	docker tag mp-stock:latest $$AWS_ACCOUNT_ID.dkr.ecr.ap-northeast-2.amazonaws.com/mp-stock:$$TAG; \
	docker push $$AWS_ACCOUNT_ID.dkr.ecr.ap-northeast-2.amazonaws.com/mp-stock:$$TAG; \
	echo "$(GREEN)Image pushed successfully!$(NC)"

deploy:
	@echo "$(BLUE)Deploying to AWS EC2...$(NC)"
	@echo "$(RED)This command requires EC2 setup. Use GitHub Actions for automated deployment.$(NC)"
	@read -p "Enter EC2 instance IP: " EC2_IP; \
	ssh -i ~/.ssh/mp-stock-deploy.pem ec2-user@$$EC2_IP 'bash /opt/mp-stock/scripts/deploy-ec2.sh'

# Health check
health:
	@echo "$(BLUE)Running health check...$(NC)"
	@docker exec mp-backend curl -s http://localhost:3001/api/health || echo "$(RED)Health check failed$(NC)"

# Development commands
dev:
	@echo "$(BLUE)Starting development environment...$(NC)"
	make install
	make up
	@echo "$(GREEN)Development environment ready!$(NC)"
	@echo "Backend: http://localhost:3001"
	@echo "PostgreSQL: localhost:5432"
	@echo "Redis: localhost:6379"

# Version info
version:
	@echo "$(BLUE)Version Information:$(NC)"
	@echo "Node.js: $$(node --version)"
	@echo "npm: $$(npm --version)"
	@echo "Docker: $$(docker --version)"
	@echo "Docker Compose: $$(docker compose --version)"

.DEFAULT_GOAL := help
