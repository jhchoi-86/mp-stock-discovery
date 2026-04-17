# ============================================================================
# Stage 1: Build & Dependencies (Node.js)
# ============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++ cairo-dev jpeg-dev pango-dev giflib-dev

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --legacy-peer-deps

# Copy source code
COPY src ./src
COPY analyzer.cjs ./
COPY server.cjs ./
COPY .env.example ./
COPY prisma ./prisma
COPY tsconfig.json ./
COPY .eslintrc.cjs ./

# Generate Prisma client
RUN npx prisma generate

# Run type checking
RUN npx tsc --noEmit || true

# ============================================================================
# Stage 2: Production Runtime (Node + Python Hybrid)
# ============================================================================
FROM node:20-alpine

WORKDIR /app

# 1. 시스템 의존성 설치 (PM2 및 psycopg2 빌드에 필요한 라이브러리 포함)
RUN apk add --no-cache curl dumb-init openssl python3 py3-pip \
    gcc musl-dev python3-dev postgresql-dev \
    && npm install -g pm2

# 2. Python 패키지 캐싱 및 설치 (소스 코드 복사 전 실행하여 빌드 속도 최적화)
COPY ai-service/requirements.txt ./ai-service/
RUN pip3 install -r ai-service/requirements.txt --break-system-packages

# 3. Node.js 빌드 산출물 복사
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

# 4. 애플리케이션 파일 복사 (ecosystem.config.cjs 포함)
COPY server.cjs ./
COPY analyzer.cjs ./
COPY ecosystem.config.cjs ./
COPY .env.example ./
COPY prisma ./prisma
COPY src ./src
COPY platform ./platform
COPY lib ./lib
COPY scripts ./scripts

# 5. Python 소스 코드 복사
COPY ai-service ./ai-service
COPY sniper_engine ./sniper_engine
COPY sniper_3m.cjs ./
COPY sync_scheduler.cjs ./

# 6. 데이터 저장을 위한 디렉토리 생성
RUN mkdir -p /app/data /app/data/archive /app/data/vip_logs

# 7. 환경 변수 설정
ENV NODE_ENV=production \
    PORT=3001 \
    NODE_OPTIONS="--max-old-space-size=1024" \
    TZ=Asia/Seoul

# 8. 컨테이너 헬스 체크
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3001/api/health || exit 1

# 9. PM2 Runtime (Foreground) 실행
CMD ["pm2-runtime", "start", "ecosystem.config.cjs"]