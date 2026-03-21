# MP Stock Platform 1.0 마이그레이션 설계서
### PRD v5.2 기반 단계별 실행 설계서 (최종본 v1.0)
> 작성일: 2026-03-21 | 기준 PRD: `MP_Stock_PRD_v5.2.md`
> 자체 검증 완료 — 오류 8건 수정, 누락 5건 보완

---

## 0. 설계서 목적 및 범위

본 문서는 현재 MP Stock V2 모놀리식 시스템을 **PRD v5.2**에 정의된 **Platform 1.0 9-Layer 아키텍처**로 안전하게 마이그레이션하기 위한 단계별 실행 설계서입니다.

### 핵심 3원칙 (절대 엄수)
1. **Preservation-First:** `analyzer.cjs` 내부 로직 일체 재작성 절대 금지
2. **Strangler Fig Pattern:** 기존 서비스 계속 운영하며 점진적으로 이식
3. **런타임 매핑 완료 전 파일 삭제 절대 금지**

### 목표 기술 스택
| 영역 | 기술 |
| :--- | :--- |
| 백엔드 | Node.js 20 LTS + Express 5 |
| DB | PostgreSQL 16 + Prisma 6 (4분할 스키마) |
| 캐시/큐 | Redis 7 + BullMQ 5 + Redlock |
| 분석 엔진 | Worker Threads (analyzer.cjs 래핑) |
| 프론트엔드 | React 19 + Vite 8 (역할별 분리 빌드) |
| 인증 | JWT (jti) + Redis Blacklist |
| 모니터링 | Winston + Uptime Robot |
| 알림 | Telegram Bot API + SMTP 이메일 |
| 결제 | 토스페이먼츠 Webhook |

---

## 1. As-Is 현황 분석 (현재 V2)

### 1-1. 현재 핵심 파일 구조

```
주식종목발굴/
├── server.cjs              ← 모놀리식 메인 서버 (Express + Cron + 분석 인라인 호출)
├── analyzer.cjs            ← [A등급] 핵심 분석 엔진 — 보존 필수, 수정 금지
├── update_master.cjs       ← 종목 마스터 업데이트 배치 스크립트
├── telegramBot.cjs         ← 텔레그램 봇 설정
├── src/
│   ├── App.jsx             ← 프론트엔드 메인 (단일 SPA — 역할 미분리)
│   ├── components/
│   │   ├── PcDashboard.jsx
│   │   └── MobileDashboard.jsx
│   ├── routes/
│   │   ├── auth.cjs        ← JWT 인증 라우터 (Redis Blacklist 미적용)
│   │   ├── admin.cjs       ← 관리자 라우터 (IP 화이트리스트 미적용)
│   │   ├── users.cjs, report.cjs, archive.cjs, roi.cjs, subscriptions.cjs
│   ├── utils/
│   │   ├── historyManager.cjs  ← 추천 이력 + 기초 Excel 생성 (ExcelJS)
│   │   ├── integrityGuard.cjs  ← 간이 무결성 검증 (미완)
│   │   └── reportUtils.js      ← 텔레그램 리포트 유틸
│   └── store/, hooks/, services/
├── data/
│   ├── signals.json        ← ⚠️ Race Condition 위험 — DB 이관 대상
│   └── stock_master.json   ← ⚠️ Race Condition 위험 — DB 이관 대상
├── prisma/schema.prisma    ← 단일 스키마 (7개 모델) — 4분할로 확장 필요
└── ecosystem.config.cjs    ← PM2 클러스터 (instances: 'max')
```

### 1-2. 현재 V2의 핵심 문제점 (PRD 7-1 기반)

| 분류 | 문제 | PRD 목표 |
| :--- | :--- | :--- |
| 데이터 저장 | `signals.json` 동기식 I/O → PM2 멀티워커 Race Condition | PostgreSQL ACID + 4분할 스키마 |
| 분석 엔진 | Express Event Loop 인라인 CPU-bound → 서버 전체 블로킹 | Worker Thread 격리 비동기 처리 |
| 실시간 SSE | PM2 워커별 독립 메모리 `clients[]` → 워커 간 SSE 단절 | Redis Pub/Sub 전역 브로드캐스트 |
| 알람 중복 | `Map()` 로컬 쿨다운 → 워커별 분산 → 중복 텔레그램 발송 | Redis TTL 14,400초 전역 공유 |
| 인증 | JWT 기본 구조만, Redis Blacklist 미적용 | JWT(jti) + Redis Blacklist |
| 권한 분리 | `/api/*` 단일 네임스페이스 → Admin/User 혼재 | `/admin-api/*` + `/user-api/*` |
| 분석 대상 | 국내 주식(KIS)만 지원 | 국내 + NASDAQ 100 + 코인 120종목 |
| 시간대 | 8개 타임프레임 (3M·1M·1Y 누락) | 11개 타임프레임 전체 |
| 회원 체계 | ADMIN/PRO_USER/FREE_USER 3단계 | FREE_TRIAL(14일)/FREE/PAID/ADMIN |
| 점수화 | 시그널 발생 여부 기반 단순 판단 | 7개 항목 100점 만점 채점 체계 |
| 리포팅 | 기초 historyManager만 존재 | 일간/주간/월간/연간 자동 성과 리포트 |
| 데이터 이력 | 보관 정책 미정 | TRIAL 7일 / PAID 90일 |

### 1-3. 보존 자산 5등급 분류 (PRD 11장 기반)

| 등급 | 파일 | 처리 방침 |
| :--- | :--- | :--- |
| **A — Critical Keep** | `analyzer.cjs` | 내부 수정 절대 금지. Worker Thread 외부 래핑만 허용 |
| **B — Wrap-and-Migrate** | `historyManager.cjs`, `reportUtils.js`, `auth.cjs`, `admin.cjs`, `report.cjs`, `update_master.cjs`, `integrityGuard.cjs` | `platform/` 레이어 하위로 이식 후 표준 인터페이스 래핑 |
| **C — Reference/Sandbox** | `test_*.cjs`, `verify_*.cjs`, `simulate_signal.cjs` | `sandbox/legacy_tests/` 이동. 코드 동결 |
| **D — Quarantine** | `extract_*.cjs`, `fetch_*.cjs`, `scrape_*.cjs`, `fix.cjs`, `seal.cjs` 등 | `quarantine/` 격리. 14일 유예 후 이관/삭제 결정 |
| **E — Delete Later** | 임시 덤프·백업 파일 (기 삭제 완료) | Git 이력 보존 전제 30일 후 정리 |

---

## 2. To-Be 목표 아키텍처 (PRD 7장 기반)

### 2-1. 9-Layer 플랫폼 디렉토리 구조

```
platform/
├── core/                          # L1: 시장 중립 도메인 모델
│   ├── models/                    #   Instrument.ts, Candle.ts, Signal.ts
│   ├── contracts/                 #   TDR 입/출력 인터페이스 정의
│   └── integrity/                 #   execHash 생성 유틸
│
├── markets/                       # L2: 시장별 어댑터
│   ├── kr_equity/                 #   KOSPI/KOSDAQ 세션, 호가단위, 심볼 맵
│   ├── us_equity/                 #   NASDAQ 세션, UTC 시차, 달러 환산
│   └── crypto_spot/               #   24h 운영, Binance(USDT)/Upbit(KRW) 이중 기준가
│
├── data_sources/                  # L3: 외부 데이터 수집 + 출처 태깅
│   ├── kis/                       #   KIS API 커넥터 (국내 OHLCV + 실시간 호가)
│   ├── yahoo/                     #   Yahoo Finance (NASDAQ OHLCV)
│   ├── polygon/                   #   Polygon.io (Yahoo Fallback — NASDAQ)
│   ├── naver/                     #   Naver 비공식 API 래핑 (외인/기관 데이터)
│   ├── binance/                   #   Binance REST+WebSocket (USDT 기준가)
│   ├── upbit/                     #   Upbit WebSocket (KRW 기준가, 실시간)
│   └── coingecko/                 #   Market Cap 순위 (주 1회 갱신)
│
├── analysis/                      # L4: 분석 엔진 — Worker 완전 격리
│   ├── strategies/
│   │   └── legacy_adapter/        #   analyzer.cjs 래핑 어댑터
│   ├── workers/                   #   Worker Thread 풀 관리자 + 작업 분배
│   └── scoring/                   #   100점 만점 7개 항목 독립 점수화
│
├── approval/                      # L5: TDR 무결성 Fail-Closed 게이트
│   ├── tdr_bridge/                #   execHash 생성 + TDR 승인 요청
│   ├── validators/                #   신호 유효성 검증
│   └── audit/                     #   승인/거부 감사 로그 (analysis_results.exec_hashes)
│
├── application/                   # L6: 순수 비즈니스 서비스 로직
│   ├── scan_jobs/                 #   Universe 전체 스캔 오케스트레이션
│   ├── alarm_watcher/             #   진입가 도달 감시 + 텔레그램 알람 (유료 회원)
│   ├── result_evaluator/          #   15:30 장 마감 후 결과 판정 엔진
│   ├── scheduler/                 #   21:10 통합 발송, 결과 판정, Excel 자동실행 크론
│   ├── report_generator/          #   일간/주간/월간/연간 Excel 리포트 생성
│   ├── email_sender/              #   SMTP 이메일 발송 (만료 안내, 리포트 배포)
│   └── watchlist/                 #   회원 관심종목 관리 + 알람 설정
│
├── interfaces/                    # L7: API 게이트웨이 — 네임스페이스 완전 분리
│   ├── api_admin/                 #   /admin-api/* (IP 화이트리스트 + JWT + RBAC)
│   └── api_user/                  #   /user-api/* (JWT + RBAC)
│
├── ui/                            # L8: 역할별 독립 React 빌드
│   ├── admin_web/                 #   운영자 PC 전투형 대시보드
│   └── user_web/                  #   회원 PC + 모바일 (반응형 역할 특화)
│
└── infra/                         # L9: 인프라 자원
    ├── db/                        #   Prisma 4분할 스키마
    ├── redis/                     #   Redis (Pub/Sub + TTL + JWT Blacklist)
    ├── queue/                     #   BullMQ + Redlock (API Rate Limit 보호)
    └── logger/                    #   Winston JSON 구조화 로깅
```

### 2-2. PostgreSQL 4분할 스키마 + 테이블 이관 매핑

| 스키마 | 역할 | 신규 주요 테이블 | V2 이관 테이블 |
| :--- | :--- | :--- | :--- |
| `market_data` | 원시 시장 데이터 | `candles`, `instruments`, `trading_sessions` | (신규) |
| `analysis_results` | 분석 엔진 출력·점수 | `signal_candidates`, `score_details`, `exec_hashes` | (신규) |
| `signal_approvals` | TDR 승인 최종 추천 | `approved_signals`, `entry_prices`, `signal_results`, `rejection_logs` | `recommendations` → `approved_signals`+`signal_results` 확장 |
| `system_audit` | 운영·보안 감사 | `api_call_logs`, `auth_events`, `alarm_logs`, `error_logs`, `report_distribution_logs` | `users`, `refresh_tokens`, `usage_logs`, `audit_logs`, `subscription_requests` 흡수 |

> **데이터 보관 정책 (PRD 3-2 기반):**
> - `FREE_TRIAL`: 최대 7일 조회 이력 보관
> - `PAID`: 90일 조회 이력 보관
> - `system_audit` 로그: 1년 보관 (법적 근거)

### 2-3. 회원 등급 전환 매핑

| 현재 V2 Role | Platform 1.0 | DB 변경 사항 |
| :--- | :--- | :--- |
| `FREE_USER` (신규 가입) | `FREE_TRIAL` | `trial_expires_at = created_at + 14d` 컬럼 추가 |
| `FREE_USER` (14일 경과) | `FREE` | cron 자동 전환, `trial_expires_at < now()` 체크 |
| `PRO_USER` | `PAID` | Enum 명칭 변경, 텔레그램 연동 활성화 |
| `ADMIN` | `ADMIN` | IP 화이트리스트 추가 적용 |

---

## 3. 단계별 마이그레이션 실행 계획

### Phase 0 — 헌법 수립 및 사전 준비
> **기간:** 1~2일 | **위험도:** 최저
> **원칙:** 문서 작성·스키마 설계만 허용. `.cjs` 파일 이동·수정 절대 금지.

| Task | 세부 내용 | 완료 기준 |
| :--- | :--- | :--- |
| P0-01 | 본 설계서 팀 확정 및 Git 커밋 | 문서 최종본 존재 |
| P0-02 | 전체 코드 A~E 등급 분류 명부 작성 (`preservation_ledger.csv`) — 80개 이상 파일 등록 | CSV 파일 완성 |
| P0-03 | `server.cjs` 런타임 경로 인벤토리화 — 모든 `/api/*` 라우트 + cron 스케줄 목록 작성 | 100% 라우트 문서화 |
| P0-04 | `git tag v2-freeze-$(date +%Y%m%d)` 태깅 — 롤백 기준점 확보 | 태그 생성 확인 |
| P0-05 | 신규 `.env` 항목 목록 확정 (4절 참조) | `.env.example` 업데이트 |

---

### Phase 1 — 기반 구축 (PRD T1 대응)
> **기간:** 3~5일 | **위험도:** 낮음
> **원칙:** 새 플랫폼 스켈레톤만 생성. 기존 `server.cjs` 서비스는 100% 무중단 유지.

#### T1-01. `platform/` 9-Layer 스켈레톤 + 격리 폴더 생성

```bash
# 프로젝트 루트에서 실행
mkdir -p platform/core/{models,contracts,integrity}
mkdir -p platform/markets/{kr_equity,us_equity,crypto_spot}
mkdir -p platform/data_sources/{kis,yahoo,polygon,naver,binance,upbit,coingecko}
mkdir -p platform/analysis/{strategies/legacy_adapter,workers,scoring}
mkdir -p platform/approval/{tdr_bridge,validators,audit}
mkdir -p platform/application/{scan_jobs,alarm_watcher,result_evaluator,scheduler,report_generator,email_sender,watchlist}
mkdir -p platform/interfaces/{api_admin,api_user}
mkdir -p platform/ui/{admin_web,user_web}
mkdir -p platform/infra/{db,redis,queue,logger}
mkdir -p sandbox/legacy_tests quarantine
```

#### T1-02. Preservation Ledger + 격리 폴더 이동

- **D등급 → `quarantine/`:** `extract_*.cjs`, `fetch_*.cjs`, `scrape_*.cjs`, `fix.cjs`, `seal.cjs`, `detect_format.cjs`, `gen_start_bat.cjs`, `create_bat.ps1`
- **C등급 → `sandbox/legacy_tests/`:** `test_*.cjs`, `verify_*.cjs`, `simulate_signal.cjs`, `test-hybrid.cjs`, `test-kis.cjs`
- **A/B등급:** 현재 위치 유지 — 경로만 Ledger에 기록

#### T1-03. PostgreSQL 4분할 Prisma 스키마 설계 (ORM 결함 패치)

> **🚨 [ORM 결함 패치] Prisma Relation 누락 해결**
> 4분할 논리적 스키마 간에도 테이블 조인(Join)과 무결성 보장을 위해 반드시 **외래키(Foreign Key) Relation 필드를 완비**하여 설계한다.

```
platform/infra/db/
├── schema_market_data.prisma       # instruments, candles, trading_sessions
├── schema_analysis_results.prisma  # signal_candidates, score_details, exec_hashes
├── schema_signal_approvals.prisma  # approved_signals, entry_prices, signal_results, rejection_logs
└── schema_system_audit.prisma      # users(확장), refresh_tokens, usage_logs, audit_logs, alarm_logs, error_logs, report_distribution_logs
```

> **주의:** 신규 스키마 파일은 기존 `prisma/schema.prisma`와 **별도로 관리**. 기존 스키마는 V2 서비스 정상화 유지용으로 Phase 3 완료까지 병행 운영.

#### T1-04. Universe 종목 DB 등록 (PRD 1-3 기반)

```javascript
// instruments 테이블 market 컬럼 값
// 'kr_kospi'  → KOSPI 200 (200종목, KIS API)
// 'kr_kosdaq' → KOSDAQ 150 (150종목, KIS API)
// 'us_nasdaq' → NASDAQ 100 (100종목, Yahoo/Polygon)
// 'crypto'    → Market Cap 100 + 운영진 선정 20 = 최대 120종목 (CoinGecko + Upbit + Binance)
```

#### T1-05. 회원 등급 + 타임프레임 DB 전환 설계

```sql
-- 1. Role Enum 변경 (마이그레이션 스크립트 필요)
ALTER TYPE "Role" RENAME VALUE 'PRO_USER' TO 'PAID';
ALTER TYPE "Role" ADD VALUE 'FREE_TRIAL';
-- FREE_USER는 유지 (체험 만료 후 상태)

-- 2. trial_expires_at 컬럼 추가
ALTER TABLE users ADD COLUMN trial_expires_at TIMESTAMPTZ;
UPDATE users SET trial_expires_at = created_at + INTERVAL '14 days'
  WHERE role = 'FREE_TRIAL';
```

**지원 타임프레임 확장 (PRD 1-4):**
| 현재 V2 | 추가 필요 | 완성 목표 |
| :--- | :--- | :--- |
| 5M, 15M, 30M, 1H, 2H, 4H, 1D, 1W (8개) | 3M, 1M, 1Y (3개) | 3M·5M·15M·30M·1H·2H·4H·1D·1W·1M·1Y (11개) |

> **3M, 1M, 1Y는 Yahoo Finance 또는 Binance의 해당 interval을 사용하며, 분석기(analyzer.cjs)의 입력 데이터 조립 레이어에서 처리**

---

### Phase 2 — 인프라 안정화 (PRD T2 대응)
> **기간:** 3~5일 | **위험도:** 중간
> **원칙:** 인프라 레이어 추가. 기존 서비스 라우트는 변경하지 않음.

#### T2-01. Redis 설치 + SSE Pub/Sub 전역 브로드캐스트 (FR-32)

**현재 문제:** `let clients = []` 로컬 배열 → PM2 워커 간 단절

```javascript
// platform/infra/redis/pubsub.cjs
const { createClient } = require('redis');
const publisher = createClient({ url: process.env.REDIS_URL });
const subscriber = createClient({ url: process.env.REDIS_URL });

// 데이터 갱신 시: publisher.publish('signals:update', payload)
// SSE 핸들러: subscriber.subscribe('signals:update', (msg) => {
//   clients.forEach(c => c.write(`data: ${msg}\n\n`)); // 자신의 로컬 clients[]에만
// })
```

#### T2-02(03). BullMQ + Redlock KIS API Rate Limit 보호 (큐 무한 적체 해결)

> **💡 [정책 패치] 전체 타임프레임 스캔 폐기 → 소수 집중 스캔**
> - KIS API 호출량 폭증 원인인 '전체 11개 타임프레임 스캔'을 폐기하고 특정 1~2개 집중 스캔.
> - **계산:** 국내 주식 350종목 × 2개 타임프레임 = 700건 호출.
> - **처리:** 초당 8건 제한(BullMQ) 시 87.5초 (1분 27초) 내외 소요. 단기 스캔 주기(3분) 내 여유롭게 완료.
> - **결론:** 무한 적체 우려 불식. 기존 BullMQ + Redlock 아키텍처를 원형 그대로 안전하게 유지.

```javascript
// platform/infra/queue/kisQueue.cjs
// KIS API 제한: 초당 18건. BATCH: 2개, 지연: 120ms → 초당 8.3건 (안전 마진)
// Redlock: 분산 락으로 여러 워커가 동일 종목 동시 요청 방지
const kisQueue = new Queue('kis-api', {
  connection: redisConnection,
  defaultJobOptions: { delay: 120, attempts: 3, backoff: { type: 'exponential', delay: 1000 } }
});
```

#### T2-03. 텔레그램 쿨다운 Redis TTL 전역 공유 (FR-31)

```javascript
// 기존 Map() 제거, Redis로 대체
const cooldownKey = `tg:cooldown:${stockCode}:${timeframe}`;
if (await redis.get(cooldownKey)) return; // 4시간 쿨다운 중 차단
await redis.set(cooldownKey, '1', { EX: 14400 }); // 14,400초 = 4시간
```

#### T2-04. API 네임스페이스 + Nginx 분리 (FR-25, NFR-06)

```javascript
// server.cjs 라우터 변경 (기존 /api/* 는 Backward-Compat를 위해 Phase 3 완료 전까지 유지)
app.use('/admin-api/scan',  adminScanRouter);    // 스캔 수동 트리거
app.use('/admin-api/users', adminUsersRouter);   // 사용자 관리
app.use('/user-api/auth',   authRouter);         // 회원 인증
app.use('/user-api/signals',signalsRouter);      // 추천 종목
app.use('/user-api/watchlist', watchlistRouter); // 관심종목
```

```nginx
# nginx.conf 추가 (Admin IP 화이트리스트)
location /admin-api/ {
    allow 운영자.IP.주소;
    deny all;
    proxy_pass http://localhost:3001;
}
```

---

### Phase 3 — 핵심 기능 완성 (PRD T3 대응)
> **기간:** 7~14일 | **위험도:** 높음
> **원칙:** 신규 기능을 새 플랫폼에 구현. V2와 병렬 운영 후 검증 완료 시 V2 비활성화.

#### T3-01. analyzer.cjs Worker Thread 래핑 (FR-08, PRD S11-A)

```javascript
// platform/analysis/workers/analysisWorker.cjs (워커 스레드 내부)
const { workerData, parentPort } = require('worker_threads');
const { calculateSignals } = require('../strategies/legacy_adapter/analyzer.cjs');

try {
  const result = calculateSignals(workerData.history, workerData.timeframe);
  parentPort.postMessage({ success: true, data: result });
} catch (e) {
  parentPort.postMessage({ success: false, error: e.message });
}

// platform/analysis/workers/workerPool.cjs (워커 풀 관리자)
// new Worker('./analysisWorker.cjs', { workerData: { history, timeframe } })
// 완료 시 결과를 스코어러(scorer.cjs)로 전달
```

#### T3-02. 100점 만점 7개 항목 독립 점수화 (PRD 2-1)

> **주의:** 각 항목은 완전 독립 배점. 중복 조건 합산으로 100점 초과 불가.

```javascript
// platform/analysis/scoring/scorer.cjs
function calculateScore(signal) {
  const items = [
    { score: 20, pass: signal.cond_up7,                        label: '추세강도(BB-MACD)' },
    { score: 20, pass: signal.DHH2,                            label: '지지/저항 돌파(눌림목패턴)' },
    { score: 15, pass: signal.trigger_vol,                     label: '거래량 확인' },
    { score: 15, pass: signal.trigger_rsi,                     label: 'RSI 과매수/과매도' },
    { score: 15, pass: Boolean(signal.DHH2 && !signal.cond_up7 && signal.trigger_rsi), label: '눌림목 진입 최적성' },
    { score: 10, pass: signal.isTrending && signal.cond_up7,   label: '이평선 정배열(ADX+BB-MACD)' },
    { score: 5,  pass: signal.entry_approved,                  label: '캔들 패턴(불리쉬+거래량)' },
  ];
  // 총점 = 각 항목 pass 시 해당 점수 합산 (최대 100점)
  return items.reduce((acc, item) => acc + (item.pass ? item.score : 0), 0);
}

function getGrade(score) {
  if (score >= 90) return 'S';
  if (score >= 75) return 'A';
  if (score >= 60) return 'B';
  return null; // 미노출
}
```

#### T3-03. 진입가·목표가·손절가 산출 (PRD 2-3, FR-05~07)

| 항목 | 산출 규칙 | 비고 |
| :--- | :--- | :--- |
| 진입가 1 (필수) | `max(ema5, result_2)` — 1차 눌림목 지지선 | 항상 존재 |
| 진입가 2 (선택) | `result_3` — 2차 눌림목 지지선 | `result_3 < 진입가1` 일 때만 표시 |
| 진입가 3 (선택) | `bb_lower` — 볼린저 하단 | `bb_lower < 진입가2` 일 때만 표시 |
| 목표가 | `bb_upper` — 볼린저 상단 | 진입가1 대비 수익률 병기 |
| 손절가 | `진입가1 × 0.9` — 고정 -10% | 오차 0원 필수 (FR-07) |

#### T3-04. JWT + Redis Blacklist + RBAC 강화 (PRD 8장, FR-24~25)

```javascript
// platform/interfaces/api_user/middleware/auth.cjs
async function verifyJWT(req, res, next) {
  const token = req.cookies.accessToken;
  const payload = jwt.verify(token, process.env.JWT_SECRET); // 만료 1h
  const isBlacklisted = await redis.get(`blacklist:${payload.jti}`);
  if (isBlacklisted) return res.status(401).json({ error: 'Token revoked' });
  req.user = payload;
  next();
}

// 로그아웃 시: redis.set(`blacklist:${jti}`, '1', { EX: remainingTTL })
```

**RBAC 미들웨어 체인 (순서 필수 준수):**
```
ipWhitelist() [Admin만] → verifyJWT() → checkBlacklist() → rbac('PAID') → handler
```

#### T3-05. 체험 만료 이메일 + 자동 등급 전환 (FR-21~22)

```javascript
// platform/application/scheduler/trialExpiryJob.cjs
// cron: '0 0 * * *' (매일 00:00 KST)
// 1. trial_expires_at < now() + 3일 → 만료 예고 이메일 발송 (FR-22)
// 2. trial_expires_at < now() + 1일 → 만료 D-1 이메일 발송
// 3. trial_expires_at < now() → role = 'FREE' 자동 전환 (FR-21)
```

#### T3-06. 진입가 도달 감시 + 텔레그램 실시간 알람 (FR-30~31, PRD 4-1)

```javascript
// platform/application/alarm_watcher/priceWatcher.cjs
// - cron: '* 9-15 * * 1-5' (국내 주식: 09:00~15:30 평일)
// - Binance/Upbit WebSocket: 코인 24시간 실시간 감시
// - 도달 조건: 현재가 ≤ 회원이 선택한 진입가 번호 (1/2/3)
// - 알람 내용: 종목명/현재가/도달진입가번호/목표가/손절가/분석점수/시간대 (PRD 4-1)
// - Redis: tg:cooldown:{code}:{timeframe} TTL 14,400초 중복 차단
// - 발송 후 → alarm_logs 테이블 기록
```

#### T3-07. 전일 결과 판정 엔진 (FR-51~54, PRD 4-3)

```javascript
// platform/application/result_evaluator/evaluator.cjs
// cron: '35 15 * * 1-5' (15:35 KST, 국내 장 마감 5분 후)

// 판정 우선순위:
// 1. [실패] 장중 저가(Low) ≤ 진입가1 × 0.90 → status = 'FAIL' (FR-53, FR-53-1)
//    ※ 장중 터치 후 반등해도 즉시 실패 확정
// 2. [성공] 장중 고가(High) ≥ 목표가 OR 종가 ≥ 목표가 → status = 'SUCCESS' (FR-52)
// 3. [진행중] 위 2가지 해당 없음 → status = 'IN_PROGRESS' (FR-54)
// 저가 데이터: KIS API stck_lwpr (당일 최저가) 사용 (FR-53-1)
```

#### T3-08. 일간 텔레그램 통합 자동 발송 (텔레그램 4096자 제한 해결)

> **💡 [정책 패치] 익일 추천 종목 상위 6개 Limit 제한**
> - 기존: S·A 등급 전체 발송 시 텔레그램 한도(4,096자) 초과 우려
> - 변경: 점수(Score) 내림차순 정렬 후 **최상위 6개 종목만 Limit 커트**. 복잡한 메시지 쪼개기(Chunking) 로직 제거.
> - 총 텍스트 예측: 6종목(약 1200자) + 헤더/요약(300자) = 약 1,500자 (안전 안착)

```javascript
// cron: '10 21 * * 1-5' (21:10 KST, 장 마감 후 — v5.2 변경사항)
// 메시지 구성:
//   [블록 ①] 당일 결과 리포트 — 성공/진행중/실패 각 종목 + 당일 성공률 + 누적 7일 성공률 (FR-55)
//   [블록 ②] 익일 추천 종목 — Score 내림차순 정렬 후 최상위 6개 종목(Limit 6) (진입/목표/손절가/점수)
// 발송 실패 시: 5분 간격 3회 재시도 → 실패 시 운영자 텔레그램 알람 (FR-56)
// 발송 채널: MP Stock 공식 텔레그램 채널 (전체 회원 구독)
```

#### T3-09. Excel 자동 저장 + 일간 리포트 생성 (FR-60~61, PRD 4-4)

```javascript
// cron: '30 21 * * 1-5' (21:30 KST, 텔레그램 발송 20분 후)
// RAW_DATA 시트: 당일 추천 전체 + 결과 판정 즉시 기록 (FR-60)
// DAILY_SUMMARY 시트: 성공률 = 성공 ÷ (성공 + 실패) × 100 (FR-65)
//   ※ 진행중 종목은 성공률 계산에서 제외 (PRD 4-4-2)
// ALARM_LOG 시트: 텔레그램 알람 발송 이력 실시간 기록

// 엑셀 파일 저장 위치: platform/application/report_generator/output/
// DB 저장: signal_approvals.signal_results 테이블에도 이중 저장 (FR-60)
```

#### T3-10. TradingView 차트 링크 + 어뷰징 방지 로그 (FR-40~42)

```javascript
// platform/interfaces/api_user/routes/tradingview.cjs
// GET /user-api/tradingview/:signalId → PAID 회원만 접근 가능
// 응답: { chartUrl: 'https://kr.tradingview.com/chart/?symbol=KRX:005930' }
//       Pine Script 공유 링크 (진입가/목표가/손절가 라인 자동 표시)
// 어뷰징 방지 (FR-42): system_audit.api_call_logs에 접근 시각 + 횟수 기록 (1일 기준)
```

---

### Phase 4 — 글로벌 확장 및 SaaS 완성 (PRD T4 대응)
> **기간:** 14~21일 | **위험도:** 중간
> **전제:** Phase 3 전체 검증 + DoD 통과 후 진행

#### T4-01. NASDAQ 100 어댑터 (Yahoo Finance + Polygon.io Fallback)

```javascript
// platform/data_sources/yahoo/yahooConnector.cjs
// - NASDAQ 100 종목 OHLCV 수집 (interval: 1d, 1h 등)
// - source 태그: { source: 'yahoo', is_valid: true, fetched_at: Date.now() }

// platform/data_sources/polygon/polygonConnector.cjs
// - Yahoo 장애 시 30초 내 자동 Fallback (FR-11)
// - 전환 시 운영자 텔레그램 알람 (FR-15 준용)
```

#### T4-02. 코인 어댑터 3종 및 과거 캔들 웜업(Warm-up)

> **🚨 [기능 누락 보완] 코인 과거 캔들 200개 웜업 로직**
> 실시간 WebSocket 체결 정보만으로는 과거 이평선(EMA)/MACD 지표 산출이 불가능. 서버 구동 시 초기 1회 REST API를 호출해 과거 캔들 200개를 우선 적재(Warm-up)한 뒤, WebSocket 스트림 수신으로 이행.

```javascript
// platform/data_sources/binance/binanceConnector.cjs
// - 과거 캔들 Warm-up: 초기 구동 시 REST(/api/v3/klines)로 200봉 우선 적재
// - USDT 마켓 140+ 코인 실시간 WebSocket 연결 (글로벌 기준가)
// - 연결 끊김 자동 재연결 (FR-12-2)

// platform/data_sources/upbit/upbitConnector.cjs
// - 과거 캔들 Warm-up: 초기 구동 시 REST(/v1/candles/...)로 200봉 우선 적재
// - KRW 마켓 코인 WebSocket 실시간 (원화 기준가 우선 제공)
// - 연결 끊김 자동 재연결 (FR-12-1)

// platform/data_sources/coingecko/geckoSync.cjs
// - Market Cap 상위 100 + 운영진 선정 20 = 최대 120종목 (FR-13)
// - 주 1회 갱신 (cron: '0 9 * * 1')
// - Upbit 미상장 코인 → Binance USDT 자동 Fallback (FR-13-2)
// - 국내 회원: Upbit KRW 기준가 우선 표시 / 글로벌 참조: Binance USDT 병기 (FR-13-1)
```

#### T4-03. 토스페이먼츠 결제 연동 (FR-23, PRD T4-03)

```javascript
// platform/interfaces/api_user/routes/payment.cjs
// POST /user-api/payment/webhook ← 토스페이먼츠 승인 완료 이벤트 수신
// 1. 서명 검증 (HMAC-SHA256)
// 2. role = 'PAID' 즉시 전환 (지연 < 1분, FR-23)
// 3. telegramId 연동 UI 활성화 안내 이메일 발송
// 4. subscription_requests 상태 → 'APPROVED' 업데이트
```

#### T4-04. 모니터링 파이프라인 (PRD 9장)

```javascript
// platform/infra/logger/winstonLogger.cjs
// - 모든 error 레벨 → system_audit.error_logs + 운영자 텔레그램 즉시 알람
// - KIS API Queue 적체 100건 초과 → 운영자 알람 (PRD 9장)
// - 분석 스캔 10분 초과 → 운영자 알람

// Uptime Robot:
// - https://mpstock.co.kr/health 엔드포인트 1분 주기 HTTP 체크
// - 장애 알람: 운영자 Telegram + 이메일
```

#### T4-05. 법적 고지문 전면 적용 (PRD 10장, NFR-08~09)

| 고지 내용 | 적용 위치 | 구현 방법 |
| :--- | :--- | :--- |
| "자동 매매 시스템이 아님" | 전 화면 하단 고정 | 레이아웃 컴포넌트 Footer |
| 투자 책임 고지 | 추천 종목 상세 페이지 | 섹션 상단 +Modal |
| 손절가 -10% 고정 고지 | 매매 정보 표시 섹션 옆 | 툴팁 또는 인라인 텍스트 |
| 가격 정보 지연 가능 고지 | 가격 표시 옆 | 소형 배지 |
| 투자 손실 위험 동의 | 가입 화면 | 필수 체크박스 (미체크 시 가입 불가) |

#### T4-06. 부하 테스트 + SaaS 런칭 검증

```
k6 테스트 시나리오:
- 100 VU, 10분, Universe 스캔 + API 동시 호출
- 목표: P95 < 200ms (NFR-01)
- Race Condition: PM2 16워커 동시 신호 저장 테스트 → 0건 (DoD)

코인 24시간 운영 검증:
- Upbit + Binance WebSocket 연결 유지 24시간 테스트
- 연결 끊김 감지 후 재연결 시간 < 30초
```

#### T4-07~09. Excel 주간/월간/연간 + 배포 기능 (FR-62~69)

| 작업 | cron 스케줄 | 비고 |
| :--- | :--- | :--- |
| T4-07: 주간 리포트 | `0 8 * * 1` (월요일 08:00) | WEEKLY 시트 |
| T4-08: 월간 리포트 | `0 8 1 * *` (매월 1일 08:00) | MONTHLY 시트 |
| T4-09: 연간 리포트 | `0 8 1 1 *` (1월 1일 08:00) | YEARLY 시트 |
| 텔레그램 배포 버튼 | Admin 대시보드 수동 클릭 | 파일 크기 < 50MB |
| 이메일 일괄 발송 | 주간/월간/연간 자동 트리거 | 유료 회원 전체 (FR-69) |
| Admin 즉시 다운로드 | Admin 대시보드 기간 선택 | 응답 < 10초 (FR-66) |
| 회원 마이페이지 | 최근 12개월 목록 | PAID 등급만 접근 (FR-67) |

---

## 4. 신규 환경 변수 목록

현재 `.env`에서 추가·변경이 필요한 항목:

```env
# ── 인프라 ──────────────────────────────
REDIS_URL=redis://127.0.0.1:6379

# ── 보안 ────────────────────────────────
ADMIN_WHITELIST_IPS=1.2.3.4,5.6.7.8      # 운영자 고정 IP 목록 (콤마 구분)
JWT_SECRET=<현재값 유지>
JWT_ACCESS_EXPIRY=3600                    # 1시간 (초)
JWT_REFRESH_EXPIRY=604800                 # 7일 (초)

# ── 결제 ────────────────────────────────
TOSS_PAYMENTS_CLIENT_KEY=...
TOSS_PAYMENTS_SECRET_KEY=...
TOSS_PAYMENTS_WEBHOOK_SECRET=...          # HMAC 서명 검증용

# ── 데이터 소스 (신규) ───────────────────
POLYGON_API_KEY=...                       # NASDAQ Yahoo Fallback
BINANCE_API_KEY=...
BINANCE_API_SECRET=...
UPBIT_ACCESS_KEY=...
UPBIT_SECRET_KEY=...
COINGECKO_API_KEY=...                     # Free Tier 가능

# ── 이메일 (SMTP) ────────────────────────
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=noreply@mpstock.co.kr
SMTP_PASS=...

# ── 모니터링 ─────────────────────────────
ADMIN_TELEGRAM_CHAT_ID=...                # 운영자 전용 챗 ID (장애 알람)
```

---

## 5. 의존성 패키지 추가 목록

```bash
npm install ioredis bullmq redlock           # Redis + 큐 + 분산 락
npm install nodemailer                       # SMTP 이메일
npm install @toss-payments/server            # 결제 SDK
npm install ws                               # Upbit/Binance WebSocket
```

---

## 6. 출시 완료 기준 체크리스트 (DoD — PRD 13장 기반)

| 카테고리 | 검증 항목 | 기준값 | 검증 방법 |
| :--- | :--- | :--- | :--- |
| **분석 정확성** | 7개 항목 점수 산출 오류 | 0건 | Universe 전체 테스트 |
| **분석 정확성** | 손절가 = 진입가1 × 0.9 | 오차 0원 | 단위 테스트 |
| **분석 정확성** | 자동 매매 API 인터페이스 미제공 | 0건 | 코드 리뷰 필수 (NFR-05) |
| **무결성** | PM2 멀티워커 Race Condition | 0건 | 16워커 동시 쓰기 테스트 |
| **무결성** | execHash 변조 → Fail-Closed 차단 | 100% | TDR 변조 시나리오 테스트 |
| **성능** | API 응답 P95 | < 200ms | k6 부하 테스트 |
| **성능** | 전체 Universe 스캔 완료 | < 10분 | 스캔 타임스탬프 측정 |
| **알람** | 진입가 도달 → 텔레그램 발송 | < 60초 | 실측 레이턴시 테스트 |
| **알람** | 중복 알람 (4시간 이내) | 0건 | 연속 트리거 테스트 |
| **알람** | 21:10 통합 텔레그램 발송 시각 | ±2분 이내 | 크론 실행 시각 측정 |
| **알람** | 발송 실패 시 3회 재시도 동작 | 누락 0건 | 네트워크 차단 시나리오 |
| **회원** | 14일 체험 → FREE 자동 전환 | 오차 0 | 만료 시뮬레이션 |
| **회원** | 만료 3일·1일 전 이메일 발송 | 누락 0건 | 발송 로그 전수 확인 |
| **회원** | 결제 → PAID 전환 | < 1분 | Webhook 응답 시간 측정 |
| **보안** | 비인가 Admin API 접근 | 차단 100% | 비허용 IP·무효 JWT 테스트 |
| **결과 판정** | 성공·진행중·실패 자동 판정 | 오류 0건 | 판정 로직 단위 테스트 |
| **결과 판정** | 장중 저가 기준 실패 판정 정확도 | 오차 0원 | 저가 데이터 수식 검증 |
| **리포팅** | 일간 Excel RAW_DATA + 성공률/실패율 | 오류 0건 | 수식 자동 검증 |
| **리포팅** | 주간·월간·연간 리포트 생성 | 누락 0건 | 스케줄러 전수 확인 |
| **TradingView** | 유료 회원 차트 링크 정상 동작 | 0건 오류 | 링크 접근 테스트 |
| **TradingView** | 어뷰징 접근 로그 기록 | 1일 횟수 저장 | DB 로그 확인 |
| **배포** | 텔레그램 Excel 파일 발송 | < 30초 | 버튼 응답 시간 |
| **배포** | 유료 회원 이메일 일괄 발송 | 누락 0건 | 발송 대상 전수 확인 |
| **법적** | 면책 고지문 전 화면 표시 | 누락 0 | UI 전수 검수 |
| **가용성** | 월간 서비스 가용성 | ≥ 99.5% | Uptime Robot 30일 |

---

## 7. 주요 리스크 및 대응 방안

| 리스크 | 발생 가능성 | 영향 | 대응 방안 |
| :--- | :--- | :--- | :--- |
| Naver 비공식 API 차단 | 중 | 외인/기관 데이터 미수집 | Fallback: Investing.com 스크랩 또는 데이터 없이 해당 항목 0점 처리 |
| KIS API 정책 변경/차단 | 저 | 국내 주식 실시간 호가 불가 | Fallback: Yahoo Finance로 전환 + 운영자 알람 (FR-15) |
| Yahoo Finance 비공식 차단 | 중 | NASDAQ + 국내 과거 데이터 불가 | Fallback: Polygon.io 전환 (FR-11) |
| PM2 다중워커 Race Condition | 확실 (현재) | 데이터 유실·손상 | Phase 2 완료 (Redis + DB 이관) 으로 근본 해결 |
| TDR 게이트 외부 서비스 장애 | 저 | 신호 발행 전면 중단 | Fail-Closed 원칙상 의도된 동작 — 운영자 알람 후 수동 승인 모드로 전환 |

---
> **문서 버전:** 최종본 v1.0 (2026-03-21)
> **기준 PRD:** MP_Stock_PRD_v5.2
> **자체 검증:** 8건 오류 수정 (점수화 로직 중복 계산, cron 표현식, SSE 누락, FR-22 누락, 3M/1M/1Y 타임프레임 누락, 데이터 이력 정책 누락, NFR-05 DoD 누락, FR-42 누락)
