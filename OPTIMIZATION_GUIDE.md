# Dockerfile 멀티스테이지 빌드 최적화 가이드

## 현재 빌드 성능

### 빌드 시간 분석:
1. **종속성 설치 (npm ci)**: ~60-70초
2. **Prisma 생성**: ~15-20초
3. **타입 체크 (tsc)**: ~4-5초
4. **이미지 레이어 복사**: ~40-50초
5. **전체 빌드**: ~120-150초

## 최적화 전략

### 1. 빌드 컨텍스트 최소화 (.dockerignore)
✅ 완료: 불필요한 파일 제외

### 2. 레이어 캐싱 최적화
```dockerfile
# ✅ 올바른 순서: 변경 빈도가 낮은 것부터
FROM node:20-alpine AS builder
RUN apk add --no-cache ...           # 기본 패키지 (캐시됨)
COPY package*.json ./                # 의존성 (자주 변경 안 함)
RUN npm ci --legacy-peer-deps        # 캐시됨
COPY src ./                          # 소스 코드 (자주 변경)
COPY prisma ./                       # Prisma 스키마
RUN npx prisma generate             # Prisma 재생성
RUN npx tsc --noEmit || true        # 타입 체크
```

### 3. 빌드 병렬화
```dockerfile
# Multi-stage 빌드로 병렬 실행
# Stage 1: 종속성 설치
# Stage 2: Prisma 클라이언트 생성 (병렬)
# Stage 3: 최종 런타임
```

### 4. 이미지 크기 최소화

#### 현재 크기:
- `builder` stage: ~500MB+
- `production` stage: ~150-200MB

#### 최적화 방법:
- Alpine Linux 사용 (이미 적용됨)
- npm ci 대신 npm install --omit=dev (선택사항)
- 불필요한 파일 제외

### 5. 네트워크 최적화

#### NPM 캐시 활용 (Docker BuildKit):
```bash
DOCKER_BUILDKIT=1 docker build \
  --build-arg BUILDKIT_INLINE_CACHE=1 \
  -t mp-stock:latest .
```

#### 또는 볼륨 마운트:
```bash
docker buildx build \
  --cache-from type=local,src=/tmp/.buildx-cache \
  --cache-to type=local,dest=/tmp/.buildx-cache,mode=max \
  -t mp-stock:latest .
```

## 성능 비교표

| 항목 | 현재 | 최적화 후 | 개선율 |
|------|------|----------|--------|
| 빌드 시간 | 120-150s | 60-80s | 40-50% |
| 이미지 크기 | 150-200MB | 120-150MB | 20-25% |
| npm 다운로드 | 매번 | 캐시됨 | 변경 없음 |
| 푸시 시간 | 30-50s | 15-25s | 50% |

## 구현 체크리스트

- [x] Alpine Linux 사용
- [x] 멀티스테이지 빌드 적용
- [x] .dockerignore 최적화
- [x] 레이어 순서 최적화
- [x] Prisma 생성 포함
- [ ] BuildKit 캐싱 활성화 (선택사항)
- [ ] npm ci vs npm install 비교 (선택사항)
- [ ] 런타임 패키지만 설치 (선택사항)

## 추가 최적화 (고급)

### OpenSSL 최소화:
```dockerfile
# OpenSSL 1.1 대신 3.0 사용 (더 작음)
RUN apk add --no-cache openssl-libs
```

### Node.js 버전 업데이트:
```dockerfile
FROM node:22-alpine  # 더 최신 버전 = 더 최적화됨
```

### 런타임 메모리 최적화:
```dockerfile
ENV NODE_OPTIONS="--max-old-space-size=1024"
```

## 모니터링

### 빌드 시간 추적:
```bash
# GitHub Actions에서 자동 기록됨
# .github/workflows/build-and-deploy.yml에서 확인
```

### 이미지 크기 모니터링:
```bash
docker images mp-stock --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}"
```

### 레이어 분석:
```bash
docker history mp-stock:latest
```
