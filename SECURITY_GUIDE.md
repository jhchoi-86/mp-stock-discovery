# MP Stock 보안 강화 가이드

## 1. Docker Hardened Images 마이그레이션

### 현재 베이스 이미지:
```dockerfile
FROM node:20-alpine
FROM postgres:16-alpine
FROM redis:7-alpine
```

### Docker Hardened Images로 마이그레이션:
```dockerfile
# Node.js: Docker Official Image (보안 유지보수됨)
FROM docker.io/library/node:20-alpine

# PostgreSQL: Docker Official Image
FROM docker.io/library/postgres:16-alpine

# Redis: Docker Official Image
FROM docker.io/library/redis:7-alpine
```

**DHI (Docker Hardened Images) 마이그레이션:**
```bash
# 1. DHI 사용 가능 여부 확인
# Docker Hub에서 다음 이미지 검색:
# - docker/library/node:20-alpine
# - docker/library/postgres:16-alpine (공식 이미지로도 충분)

# 2. Dockerfile 업데이트
FROM docker.io/library/node:20-alpine AS builder

# 3. 이미지 스캔
docker scan mp-stock:latest
```

## 2. 컨테이너 보안

### 2.1 비루트 사용자 설정

#### Node.js Dockerfile에 추가:
```dockerfile
# 비루트 사용자 생성
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# 권한 설정
RUN chown -R nodejs:nodejs /app
USER nodejs

# 시작 명령어
CMD ["node", "server.cjs"]
```

#### PostgreSQL (docker-compose.yml):
```yaml
services:
  postgres:
    image: postgres:16-alpine
    user: "999"  # postgres user
```

#### Redis (docker-compose.yml):
```yaml
services:
  redis:
    image: redis:7-alpine
    user: "999"  # redis user
```

### 2.2 파일 시스템 보호

```yaml
# docker-compose.prod.yml
services:
  backend:
    read_only: true  # 읽기 전용
    tmpfs:
      - /tmp
      - /app/.cache
    environment:
      NODE_ENV: production
```

### 2.3 리소스 제한

```yaml
services:
  backend:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G

  postgres:
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M

  redis:
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
        reservations:
          cpus: '0.25'
          memory: 256M
```

## 3. 네트워크 보안

### 3.1 포트 제한

```yaml
# docker-compose.prod.yml
services:
  postgres:
    ports:
      - "5432:5432"  # 필요한 경우만 노출
    # 또는 내부 네트워크만:
    # (포트 제거)

  redis:
    ports:
      - "6379:6379"
    # 또는 내부 네트워크만
```

### 3.2 네트워크 격리

```yaml
networks:
  mp-network:
    driver: bridge
    driver_opts:
      com.docker.network.bridge.name: mp-br0

services:
  backend:
    networks:
      - mp-network
    expose:
      - 3001  # 다른 컨테이너에만 노출

  postgres:
    networks:
      - mp-network
    expose:
      - 5432

  redis:
    networks:
      - mp-network
    expose:
      - 6379
```

## 4. 환경 변수 보안

### 4.1 .env 파일 보호

```bash
# .env 파일 권한 설정
chmod 600 .env
chmod 600 .env.production

# .gitignore에 포함
echo ".env .env.production" >> .gitignore
```

### 4.2 시크릿 관리 (AWS Secrets Manager)

```bash
# 시크릿 생성
aws secretsmanager create-secret \
  --name mp-stock/production \
  --secret-string file://secrets.json

# 시크릿 조회
aws secretsmanager get-secret-value \
  --secret-id mp-stock/production
```

### 4.3 GitHub Actions 시크릿

```yaml
# .github/workflows/build-and-deploy.yml
env:
  JWT_ACCESS_SECRET: ${{ secrets.JWT_ACCESS_SECRET }}
  CORE_INTEGRITY_HASH: ${{ secrets.CORE_INTEGRITY_HASH }}
```

## 5. 이미지 스캔 및 모니터링

### 5.1 Trivy 스캔 (자동)

```yaml
# .github/workflows/build-and-deploy.yml에 포함됨
- name: Run Trivy vulnerability scanner
  uses: aquasecurity/trivy-action@master
```

### 5.2 수동 스캔

```bash
# 로컬 스캔
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  aquasec/trivy image mp-stock:latest

# 파일시스템 스캔
trivy fs .
```

### 5.3 Docker Scout (공식)

```bash
docker scout cves mp-stock:latest
docker scout recommendations mp-stock:latest
```

## 6. 로깅 및 감시

### 6.1 구조화된 로깅

```javascript
// src/utils/logger.js
const logger = {
  info: (message, meta) => {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      message,
      ...meta
    }));
  },
  error: (message, error, meta) => {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      message,
      error: error?.message,
      ...meta
    }));
  }
};
```

### 6.2 Docker 로깅 드라이버

```yaml
services:
  backend:
    logging:
      driver: "json-file"
      options:
        max-size: "50m"
        max-file: "5"
        labels: "service=mp-stock-backend"
```

## 7. 정기 보안 점검

### 체크리스트:
- [ ] 월 1회: npm audit 실행
- [ ] 월 1회: Docker 이미지 스캔
- [ ] 주 1회: 의존성 업데이트 확인
- [ ] 분기 1회: 보안 감사
- [ ] 즉시: 심각한 CVE 발견 시 대응

## 8. 배포 후 보안 검증

```bash
# 1. 컨테이너 프로세스 확인
docker exec mp-backend ps aux

# 2. 포트 바인딩 확인
docker port mp-stock-backend

# 3. 환경 변수 확인 (시크릿 확인 불가)
docker exec mp-backend env | grep -v SECRET

# 4. 파일시스템 권한 확인
docker exec mp-backend ls -la /app

# 5. 네트워크 연결 확인
docker network inspect mp-network
```

## 9. 인시던트 대응

### 보안 취약점 발견 시:
```bash
# 1. 긴급 패치 배포
docker build -t mp-stock:emergency-patch .
docker push ACCOUNT_ID.dkr.ecr.ap-northeast-2.amazonaws.com/mp-stock:emergency-patch

# 2. EC2에 배포
ssh ec2-user@YOUR_EC2_IP
cd /opt/mp-stock
docker compose -p mp-stock -f docker-compose.prod.yml pull
docker compose -p mp-stock -f docker-compose.prod.yml up -d

# 3. 로그 확인
docker logs -f mp-stock-backend

# 4. 롤백 (필요 시)
docker compose -p mp-stock -f docker-compose.prod.yml down
docker pull ACCOUNT_ID.dkr.ecr.ap-northeast-2.amazonaws.com/mp-stock:PREVIOUS_TAG
docker compose -p mp-stock -f docker-compose.prod.yml up -d
```

## 10. 참고 자료

- Docker Security Best Practices: https://docs.docker.com/engine/security/
- OWASP Top 10: https://owasp.org/www-project-top-ten/
- CIS Docker Benchmark: https://www.cisecurity.org/cis-benchmarks/
- NIST Cybersecurity Framework: https://www.nist.gov/cyberframework
