# MP Stock 운영 모니터링 가이드

## 1. 헬스 체크 설정

### 1.1 내장 헬스 체크 엔드포인트

```bash
# 빠른 헬스 체크 (애플리케이션만)
curl http://localhost:3001/api/health

# 응답:
# {"status":"healthy"}
```

### 1.2 상세 헬스 체크

```bash
# 모든 컴포넌트 상태 확인
curl http://localhost:3001/api/health/detailed

# 응답:
# {
#   "timestamp": "2026-04-17T09:18:00Z",
#   "status": "healthy",
#   "components": {
#     "database": {"connected": true},
#     "redis": {"connected": true},
#     "memory": {"percentage": 45.2}
#   }
# }
```

### 1.3 Docker 헬스 체크

```yaml
# docker-compose.prod.yml에 포함됨
services:
  backend:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

#### 헬스 체크 상태 확인:
```bash
docker ps --format "table {{.Names}}\t{{.Status}}"
```

## 2. 로깅

### 2.1 컨테이너 로그 확인

```bash
# 실시간 로그 확인
docker logs -f mp-backend

# 마지막 100줄 확인
docker logs --tail 100 mp-backend

# 특정 시간 범위 로그
docker logs --since 1h mp-backend
docker logs --until 10m mp-backend
```

### 2.2 구조화된 로깅

docker-compose.prod.yml에서 로그 드라이버 설정:
```yaml
services:
  backend:
    logging:
      driver: "json-file"
      options:
        max-size: "50m"
        max-file: "5"
        labels: "service=mp-stock-backend,env=production"
```

로그 파일 위치:
```bash
/var/lib/docker/containers/CONTAINER_ID/CONTAINER_ID-json.log
```

### 2.3 로그 분석

```bash
# 에러 로그만 필터링
docker logs mp-backend | grep ERROR

# 특정 패턴 검색
docker logs mp-backend | grep -i "database\|redis\|error"

# 로그 라인 수 확인
docker logs mp-backend | wc -l
```

## 3. 메트릭 및 성능 모니터링

### 3.1 Docker stats로 리소스 모니터링

```bash
# 실시간 리소스 사용량
docker stats mp-backend

# 출력:
# CONTAINER ID   NAME       CPU %     MEM USAGE / LIMIT   MEM %     NET I/O
# abc123...      mp-backend 5.2%      250MB / 2GB         12.5%     100MB / 50MB
```

### 3.2 프로세스 모니터링

```bash
# 컨테이너 프로세스 목록
docker top mp-backend

# 출력:
# UID   PID    PPID   C  STIME  TTY  TIME     CMD
# root  1      0      0  18:00  ?    00:00:05 /usr/sbin/dumb-init
# root  10     1      5  18:05  ?    00:15:30 node server.cjs
```

### 3.3 이벤트 모니터링

```bash
# Docker 이벤트 실시간 모니터링
docker events --filter container=mp-backend

# 필터링된 이벤트:
# 2026-04-17T09:18:00.123Z  container start mp-backend
# 2026-04-17T09:18:05.456Z  container die mp-backend
```

## 4. 네트워크 모니터링

### 4.1 포트 바인딩 확인

```bash
# 특정 컨테이너의 포트 확인
docker port mp-backend

# 출력:
# 3001/tcp -> 0.0.0.0:3001
```

### 4.2 네트워크 통신 확인

```bash
# 컨테이너 네트워크 검사
docker network inspect mp-network

# 연결된 컨테이너 목록:
# "Containers": {
#   "abc123...": {"IPv4Address": "172.18.0.3/16"},
#   "def456...": {"IPv4Address": "172.18.0.2/16"}
# }
```

### 4.3 DNS 확인

```bash
# 컨테이너 내부에서 DNS 테스트
docker exec mp-backend nslookup postgres
docker exec mp-backend nslookup redis
```

## 5. 데이터베이스 모니터링

### 5.1 PostgreSQL 상태

```bash
# PostgreSQL 연결 확인
docker exec mp-postgres psql -U postgres -d mp_stock -c "SELECT version();"

# 활성 연결 확인
docker exec mp-postgres psql -U postgres -d mp_stock -c "SELECT count(*) as active_connections FROM pg_stat_activity;"

# 테이블 크기 확인
docker exec mp-postgres psql -U postgres -d mp_stock -c "SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size FROM pg_tables ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;"
```

### 5.2 Redis 상태

```bash
# Redis 정보
docker exec mp-redis redis-cli -a <password> INFO

# 메모리 사용량
docker exec mp-redis redis-cli -a <password> INFO memory

# 키 개수
docker exec mp-redis redis-cli -a <password> DBSIZE

# 키 검사
docker exec mp-redis redis-cli -a <password> KEYS "*" | head -20
```

## 6. 배포 모니터링

### 6.1 배포 상태 확인

```bash
# 컨테이너 상태
docker compose -p mp-stock -f docker-compose.prod.yml ps

# 이미지 정보
docker inspect mp-stock-backend --format='{{json .Config.Image}}'
```

### 6.2 롤업 배포 중 모니터링

```bash
# 터미널 1: 배포 실행
docker compose -p mp-stock -f docker-compose.prod.yml up -d

# 터미널 2: 실시간 헬스 체크
watch -n 5 'curl -s http://localhost:3001/api/health/detailed | jq .'

# 터미널 3: 로그 확인
docker logs -f mp-backend
```

## 7. 경고 및 알림 설정

### 7.1 간단한 모니터링 스크립트

```bash
#!/bin/bash
# check_health.sh

HEALTH_URL="http://localhost:3001/api/health"
SLACK_WEBHOOK_URL="YOUR_SLACK_WEBHOOK_URL"

health_status=$(curl -s $HEALTH_URL | jq -r '.status')

if [ "$health_status" != "healthy" ]; then
  curl -X POST $SLACK_WEBHOOK_URL \
    -H 'Content-Type: application/json' \
    -d "{\"text\": \"🚨 Alert: MP Stock health check failed - Status: $health_status\"}"
fi
```

사용:
```bash
# Cron 작업으로 5분마다 실행
*/5 * * * * /opt/mp-stock/scripts/check_health.sh
```

### 7.2 이메일 알림

```bash
#!/bin/bash
# alert_on_error.sh

MEMORY_THRESHOLD=80  # 80%

memory=$(docker stats --no-stream mp-backend | tail -1 | awk '{print $7}' | sed 's/%//')

if (( $(echo "$memory > $MEMORY_THRESHOLD" | bc -l) )); then
  echo "Memory usage at ${memory}%" | mail -s "Alert: High memory usage" admin@example.com
fi
```

## 8. 성능 최적화 가이드

### CPU 사용률 높은 경우:
```bash
# 1. 슬로우 쿼리 확인
docker logs -f mp-backend | grep "duration"

# 2. 메모리 누수 확인
docker stats mp-backend  # MEM % 추세 확인

# 3. 컨테이너 재시작
docker restart mp-backend
```

### 메모리 사용량 높은 경우:
```bash
# 1. Node.js 힙 크기 확인
docker exec mp-backend node -e "console.log(require('v8').getHeapStatistics())"

# 2. 메모리 누수 프로파일링
docker exec mp-backend node --inspect=0.0.0.0:9229 server.cjs

# 3. 캐시 상태 확인
docker exec mp-redis redis-cli -a <password> INFO memory
```

### 네트워크 지연 높은 경우:
```bash
# 1. 로컬 네트워크 체크
docker exec mp-backend ping postgres
docker exec mp-backend ping redis

# 2. 포트 스캔
docker exec mp-backend netstat -an | grep ESTABLISHED

# 3. DNS 성능
docker exec mp-backend nslookup postgres
```

## 9. 일일 운영 체크리스트

- [ ] 헬스 체크 상태 확인 (매 시간)
- [ ] 에러 로그 확인 (매일)
- [ ] 디스크 사용량 확인 (주 1회)
- [ ] 데이터베이스 크기 확인 (주 1회)
- [ ] Redis 메모리 사용량 확인 (주 1회)
- [ ] CPU/메모리 추세 분석 (주 1회)
- [ ] 보안 업데이트 확인 (월 1회)

## 10. 참고 자료

- Docker Monitoring: https://docs.docker.com/config/containers/logging/
- PostgreSQL Monitoring: https://www.postgresql.org/docs/current/monitoring.html
- Redis Monitoring: https://redis.io/topics/monitoring
- Docker Compose: https://docs.docker.com/compose/reference/
