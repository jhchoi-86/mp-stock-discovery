# SKILL: Database & Infrastructure
# MP Stock Discovery v9.4.25 | MetaPrompt Studio
# Rev: Blue/Red Team Audit v1.1
# 적용 범위: schema.prisma, PostgreSQL, Redis, BullMQ 관련 모든 작업

---

## 🎯 이 스킬을 사용할 때

Claude Code가 다음 작업을 요청받은 경우 이 스킬을 먼저 참조:
- schema.prisma 모델 추가/수정
- Prisma 마이그레이션 실행
- Redis 캐시 로직 작성
- BullMQ 큐/워커 작성
- DB 쿼리 최적화
- integrityGuard.cjs 관련 작업

---

## 🗄️ PostgreSQL + Prisma 구조

### 4-Schema 원칙
```
schema.prisma (4개 독립 스키마)
├── schema 1: 사용자/공통 데이터
├── schema 2: 신호 데이터 (signals.json SSOT와 동기화)
├── schema 3: 거래 내역 / 결과
└── schema 4: 관리자 / 시스템 설정
```

> ⚠️ 실제 스키마명은 schema.prisma 파일 직접 확인 필수 — 위 명칭은 참고용
> ⚠️ 스키마 간 직접 참조(Foreign Key) 최소화 — 스키마 독립성 유지 원칙

### Prisma 기본 설정
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")  // 반드시 .env 참조
}

generator client {
  provider = "prisma-client-js"
}
```

---

## 🔄 마이그레이션 절차 (필수 순서)

```bash
# 1. DB 스냅샷 먼저 생성 (필수 — PGPASSFILE 사용 권장)
export PGPASSFILE=~/.pgpass   # 패스워드 shell 히스토리 노출 방지
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# 2. 마이그레이션 파일 생성 (실제 적용 전 확인)
npx prisma migrate dev --name [설명] --create-only

# 3. 마이그레이션 내용 검토 후 적용
npx prisma migrate deploy

# 4. Prisma Client 재생성
npx prisma generate

# 5. integrityGuard 실행 (DB ↔ 캐시 일관성 확인)
node src/utils/integrityGuard.cjs
```

### 마이그레이션 롤백
```bash
npx prisma migrate resolve --rolled-back [migration_name]
# 필요 시 스냅샷 복원
psql $DATABASE_URL < backup_[timestamp].sql
```

---

## ⚡ Redis 캐시 원칙

**경로**: `platform/infra/redis/`

```javascript
// ✅ 올바른 Redis 연결 패턴
const redis = new Redis(process.env.REDIS_URL); // .env 참조 필수

// 캐시 키 네이밍 컨벤션
// signals:{ticker}:{timeframe}  → 신호 캐시 (30M/1H/2H/4H/1D/2D/1W)
// token:kis                     → KIS OAuth 토큰
// session:{userId}              → 사용자 세션
```

**TTL 기준:**
| 데이터 유형 | TTL | 비고 |
|------------|-----|------|
| 신호 캐시 | 5분 | signals.json 업데이트 주기와 동기화 |
| KIS 토큰 | 만료시간 - 5분 버퍼 | race condition 방지 |
| 사용자 세션 | 24시간 | |

> ⚠️ Redis는 캐시 레이어 — SSOT는 항상 PostgreSQL + signals.json

---

## 📦 BullMQ 큐 구조

**경로**: `platform/infra/queue/`

```
큐 이름          | 용도                         | 권장 재시도
-----------------|------------------------------|----------
signal-analysis  | 신호 분석 작업 큐             | 3회
kis-api-request  | KIS API 요청 큐 (Rate Limit)  | 3회
telegram-notify  | 텔레그램 알림 발송 큐          | 5회
```

**워커 작성 원칙:**
```javascript
// ✅ 에러 핸들링 + 적정 재시도 횟수
const worker = new Worker('signal-analysis', async (job) => {
  // 작업 처리
}, {
  connection: redis,
  attempts: 3,          // 3~5회 권장 (999 등 과도한 값 금지)
  backoff: { type: 'exponential', delay: 1000 }
});

worker.on('failed', (job, err) => {
  // 로그에 job 데이터 출력 시 토큰/키 마스킹 확인
  console.error(`Job ${job.id} failed [${job.attemptsMade}/${job.opts.attempts}]:`, err.message);
});
```

---

## 🔒 integrityGuard.cjs 동작

**경로**: `src/utils/integrityGuard.cjs`

- **실행 시점**: PM2 부팅 시 자동 실행
- **검증 항목**:
  1. DB 연결 상태 (PostgreSQL ping)
  2. Redis 연결 상태
  3. signals.json 스키마 무결성 (7-TF 키 포함 여부)
  4. DB ↔ signals.json 데이터 일관성
- **실패 시**: 프로세스 시작 차단 (Fail-Closed)

```bash
# 수동 실행
node src/utils/integrityGuard.cjs

# 정상 출력 예시
# ✅ DB Connection OK
# ✅ Redis Connection OK
# ✅ signals.json Schema Valid
# ✅ Data Consistency OK

# 실패 시 복구 절차
# 1. 원인 파악: pm2 logs --lines 100
# 2. DB 재연결 확인: psql $DATABASE_URL -c "SELECT 1"
# 3. Redis 재연결 확인: redis-cli -u $REDIS_URL ping
# 4. signals.json 재생성: node analyzer.cjs --force-rebuild
# 5. 재실행: node src/utils/integrityGuard.cjs
```

---

## ✅ DB 작업 체크리스트

- [ ] schema.prisma 변경 → 마이그레이션 전 PGPASSFILE 설정 후 DB 스냅샷 생성
- [ ] 마이그레이션 파일 `--create-only`로 먼저 내용 확인
- [ ] `prisma generate` 실행 (Client 동기화)
- [ ] integrityGuard 실행 및 통과 확인
- [ ] signals 관련 스키마 변경 → signals.json + useStockManager.js 동반 확인
- [ ] Redis TTL 설정 (signals 5분 주기와 일치)
- [ ] BullMQ 워커 attempts 값 3~5 범위 확인

---

## ⚠️ 절대 금지 사항

1. DB 스냅샷 없이 마이그레이션 실행
2. `prisma db push` 프로덕션 직접 사용 (migrate 사용할 것)
3. DATABASE_URL 하드코딩 (shell 히스토리 포함)
4. 스키마 간 직접 Foreign Key 남발 (독립성 원칙 위반)
5. Redis 캐시를 SSOT로 사용 (SSOT는 항상 PostgreSQL + signals.json)
6. BullMQ attempts: 999 등 과도한 재시도 설정
