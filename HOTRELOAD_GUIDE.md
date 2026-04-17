# Docker Compose Watch - 로컬 개발 환경 핫 리로드

## 개요

Docker Compose Watch를 사용하면 로컬 파일 변경 시 컨테이너 내부 파일이 자동으로 동기화되고, 필요에 따라 컨테이너가 재시작됩니다.

## 요구 사항

- Docker Desktop 4.26+ 이상 (또는 Docker Compose 2.22+)
- nodemon (개발용 의존성)

## 설정 방법

### 1. nodemon 설치

```bash
npm install --save-dev nodemon
```

### 2. docker-compose.watch.yml 사용

```bash
# 개발 환경 시작 (Watch 활성화)
docker compose -p mp-stock -f docker-compose.watch.yml up

# 또는 백그라운드 실행
docker compose -p mp-stock -f docker-compose.watch.yml up -d
```

### 3. 파일 변경 감지

```
# src 디렉토리의 파일 수정 시:
[backend] 자동으로 동기화되고 재시작

# package.json 수정 시:
[backend] 이미지 재빌드 및 컨테이너 재시작
```

## 사용 방법

### 실시간 개발 (권장)

```bash
# 터미널 1: Watch 모드로 시작
docker compose -p mp-stock -f docker-compose.watch.yml up

# 터미널 2: 코드 편집
vim src/routes/api.js

# 자동으로 감지되고 재시작됨 (약 2-3초)
```

### 로그 확인

```bash
# 실시간 로그 보기
docker logs -f mp-backend

# 또는 docker compose로
docker compose -p mp-stock -f docker-compose.watch.yml logs -f backend
```

### 종료

```bash
# Ctrl+C를 누르거나
docker compose -p mp-stock -f docker-compose.watch.yml down
```

## 대안: Bind Mount (수동)

`docker-compose.watch.yml` 없이 바인드 마운트만 사용:

```yaml
# docker-compose.dev.yml
services:
  backend:
    volumes:
      - ./src:/app/src          # 소스 코드 동기화
      - ./lib:/app/lib
      - ./platform:/app/platform
      - ./server.cjs:/app/server.cjs
```

하지만 이 경우 파일 변경 후 수동으로 재시작해야 합니다:

```bash
docker restart mp-backend
```

## 성능 최적화

### Watch 감시 제외

```yaml
develop:
  watch:
    - action: sync
      path: ./src
      target: /app/src
      ignore:
        - "**/.git"
        - "**/.gitignore"
        - "**/node_modules"
        - "**/.env"
        - "**/logs"
```

### 여러 서비스 Watch

```yaml
develop:
  watch:
    # Backend
    - action: sync
      path: ./src
      target: /app/src
    # Database migrations (package.json 변경 시 자동)
    - action: rebuild
      path: ./prisma
```

## 트러블슈팅

### Watch가 작동하지 않는 경우

```bash
# Docker Desktop 버전 확인
docker compose version

# 최소 2.22.0 필요
# 필요하면 업그레이드: https://docs.docker.com/compose/release-notes/

# 또는 명시적으로 watch 모드 활성화
docker compose -p mp-stock -f docker-compose.watch.yml watch
```

### 파일이 동기화되지 않는 경우

```bash
# Windows/Mac의 경우 Docker Desktop 설정 확인:
# Preferences → Resources → File Sharing

# 또는 수동으로 재시작
docker compose -p mp-stock -f docker-compose.watch.yml restart backend
```

### 컨테이너 재빌드 필요한 경우

```bash
# package.json 변경 시 수동 재빌드
docker compose -p mp-stock -f docker-compose.watch.yml up -d --build

# 또는 전체 재시작
docker compose -p mp-stock -f docker-compose.watch.yml down
docker compose -p mp-stock -f docker-compose.watch.yml up -d
```

## 비교표

| 기능 | Bind Mount | docker-compose watch |
|------|-----------|----------------------|
| 파일 동기화 | 수동 | 자동 |
| 컨테이너 재시작 | 수동 | 자동 |
| 성능 | 좋음 | 좋음 |
| 설정 복잡도 | 낮음 | 중간 |
| 재빌드 지원 | 아니오 | 예 |

## Makefile 커맨드

```bash
# 핫 리로드 모드로 시작
make dev-watch

# 일반 개발 모드 시작
make dev

# 로그 확인
make logs-backend

# 재시작
make restart
```

## 모니터링

### 동기화 상태 확인

```bash
# 컨테이너 내부 파일 변경 확인
docker exec mp-backend ls -la src/

# 또는 파일 내용 확인
docker exec mp-backend cat src/index.ts
```

### CPU/메모리 모니터링

```bash
docker stats mp-backend
```

## 고급 사용법

### 특정 파일만 Watch

```yaml
develop:
  watch:
    - action: sync
      path: ./src/routes
      target: /app/src/routes
    - action: sync
      path: ./src/utils
      target: /app/src/utils
```

### 조건부 재빌드

```yaml
develop:
  watch:
    # package.json 변경 시만 재빌드
    - action: rebuild
      path: ./package.json
    
    # 소스 파일만 동기화 (재빌드 없음)
    - action: sync
      path: ./src
      target: /app/src
```

## 참고 자료

- Docker Compose Watch: https://docs.docker.com/compose/file-sync/
- Nodemon: https://nodemon.io/
- Docker Desktop: https://docs.docker.com/desktop/
