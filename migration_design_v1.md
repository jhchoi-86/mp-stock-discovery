# MP Stock Platform 1.0 마이그레이션 설계서
### PRD v5.2 기반 단계별 실행 설계서 (초안)
> 작성일: 2026-03-21 | 기준 PRD: MP_Stock_PRD_v5.2.md

---

## 0. 설계서 목적 및 범위

본 문서는 현재 MP Stock V2 모놀리식 시스템을 **PRD v5.2**에 정의된 **Platform 1.0 9-Layer 아키텍처**로 안전하게 마이그레이션하기 위한 단계별 실행 설계서입니다.

- **원칙:** Preservation-First (기존 자산 보존 우선) + Strangler Fig Pattern (점진적 이식)
- **금지:** `analyzer.cjs` 재작성 절대 금지 / 런타임 매핑 없이 파일 삭제 금지
- **목표 스택:** Node.js(Express) + PostgreSQL(Prisma 4분할) + Redis(BullMQ/Pub-Sub) + Worker Threads + React(Vite/역할분리 UI)

---

## 1. As-Is 현황 분석 (현재 V2)

### 1-1. 현재 디렉토리 구조 (주요 파일)

```
주식종목발굴/
├── server.cjs              ← 모놀리식 메인 서버 (Express + Cron + 분석 인라인 호출)
├── analyzer.cjs            ← [A등급] 핵심 분석 엔진 (Pine Script 포팅) — 보존 필수
├── update_master.cjs       ← 종목 마스터 업데이트 배치 스크립트
├── src/
│   ├── App.jsx             ← 프론트엔드 메인 (단일 SPA)
│   ├── components/
│   │   ├── PcDashboard.jsx
│   │   └── MobileDashboard.jsx
│   ├── routes/
│   │   ├── auth.cjs        ← JWT 인증 라우터
│   │   ├── admin.cjs       ← 관리자 라우터
│   │   ├── users.cjs       ← 사용자 라우터
│   │   ├── report.cjs      ← 텔레그램 발송 라우터
│   │   ├── archive.cjs     ← 발송 이력 조회
│   │   ├── roi.cjs         ← ROI 랭킹
│   │   └── subscriptions.cjs ← 구독 요청
│   ├── utils/
│   │   ├── historyManager.cjs  ← 추천 이력 관리 + Excel 생성 (ExcelJS)
│   │   ├── integrityGuard.cjs  ← 간이 무결성 검증
│   │   └── reportUtils.js      ← 텔레그램 리포트 유틸
│   ├── hooks/
│   ├── store/
│   └── services/
├── data/
│   ├── signals.json        ← [위험] Race Condition 가능 — DB 이관 대상
│   └── stock_master.json   ← [위험] Race Condition 가능 — DB 이관 대상
├── prisma/
│   └── schema.prisma       ← 현재 단일 스키마 (users, reports, recommendations 등)
└── ecosystem.config.cjs    ← PM2 클러스터 모드 (instances: 'max')
```

### 1-2. 현재 V2의 치명적 문제점 (PRD 7-1 기반)

| 문제 | 현재 상태 | PRD 목표 |
| :--- | :--- | :--- |
| **데이터 저장** | `signals.json` 파일 동기식 I/O → Race Condition | PostgreSQL ACID + 4분할 스키마 |
| **분석 엔진** | `server.cjs` Event Loop 인라인 CPU-bound → 서버 블로킹 | Worker Thread 격리 비동기 처리 |
| **실시간 SSE** | PM2 워커별 독립 메모리 → SSE 단절 | Redis Pub/Sub 전역 브로드캐스트 |
| **텔레그램 쿨다운** | `Map()` 로컬 메모리 → 워커별 분산, 중복 발송 위험 | Redis TTL 14,400초 공유 |
| **인증** | JWT 기본 구조 존재하나 Redis Blacklist 미적용 | JWT + Redis Blacklist (jti) |
| **API 네임스페이스** | `/api/*` 단일 공간 → Admin/User 혼재 | `/admin-api/*` + `/user-api/*` 완전 분리 |
| **분석 대상** | 국내 주식(KIS)만 지원 | 국내 + NASDAQ 100 + 코인 120종목 |
| **회원 체계** | ADMIN / PRO_USER / FREE_USER 3단계 | FREE_TRIAL(14일) / FREE / PAID / ADMIN |
| **점수화** | 시그널 발생 여부 기반 단순 판단 | 7개 항목 100점 만점 채점 체계 |
| **Excel 리포팅** | 기초적인 historyManager.cjs 존재 | 일간/주간/월간/연간 자동 성과 리포트 |

### 1-3. 보존 자산 등급 분류 (PRD 11장 기반)

| 등급 | 파일 | 처리 방침 |
| :--- | :--- | :--- |
| **A — Critical Keep** | `analyzer.cjs` | Worker Thread로 래핑. 내부 로직 일체 수정 금지 |
| **B — Wrap-and-Migrate** | `src/utils/historyManager.cjs`, `src/utils/reportUtils.js`, `src/routes/auth.cjs`, `src/routes/admin.cjs`, `src/routes/report.cjs`, `update_master.cjs` | `platform/` 레이어 하위로 이동 후 표준 인터페이스 래핑 |
| **C — Reference** | `test_*.cjs`, `verify_*.cjs`, `simulate_signal.cjs` | `sandbox/legacy_tests/`로 이동. 코드 동결 |
| **D — Quarantine** | `extract_*.cjs`, `fetch_*.cjs`, `scrape_*.cjs`, `fix.cjs`, `seal.cjs` 등 | `quarantine/`으로 이동. 14일 유예 후 삭제 결정 |
| **E — Delete Later** | `*.local_backup`, 임시 덤프 파일 (이미 삭제 완료) | Git 이력 보존 전제 30일 후 정리 |

---

## 2. To-Be 목표 아키텍처 (PRD 7-2 기반)

### 2-1. 9-Layer 플랫폼 디렉토리 구조

```
platform/
├── core/                          # L1: 시장 중립 도메인 모델
│   ├── models/                    #   Instrument.ts, Candle.ts, Signal.ts
│   ├── contracts/                 #   TDR 입출력 인터페이스
│   └── integrity/                 #   execHash 생성 유틸
│
├── markets/                       # L2: 시장별 어댑터
│   ├── kr_equity/                 #   KR 세션, 호가단위, 심볼 맵
│   ├── us_equity/                 #   NASDAQ 세션, 달러 환산
│   └── crypto_spot/               #   24h 운영, Binance/Upbit 이중 기준가
│
├── data_sources/                  # L3: 외부 데이터 수집
│   ├── kis/                       #   KIS API 커넥터 (국내 OHLCV + 실시간)
│   ├── yahoo/                     #   Yahoo Finance (NASDAQ OHLCV)
│   ├── naver/                     #   Naver 크롤러 래핑 (외인/기관 데이터)
│   ├── binance/                   #   Binance REST+WS (USDT 기준가)
│   ├── upbit/                     #   Upbit WebSocket (KRW 기준가)
│   └── coingecko/                 #   Market Cap 순위 (주 1회 갱신)
│
├── analysis/                      # L4: 분석 엔진 (Worker 격리)
│   ├── strategies/
│   │   └── legacy_adapter/        #   [A등급] analyzer.cjs 래핑 어댑터
│   ├── workers/                   #   Worker Thread 풀 관리자
│   └── scoring/                   #   100점 만점 7개 항목 점수화 로직
│
├── approval/                      # L5: TDR 무결성 게이트
│   ├── tdr_bridge/                #   execHash 생성 + TDR Fail-Closed
│   ├── validators/                #   신호 유효성 검증
│   └── audit/                     #   승인/거부 감사 로그
│
├── application/                   # L6: 비즈니스 서비스 로직
│   ├── scan_jobs/                 #   Universe 전체 스캔 오케스트레이션
│   ├── alarm_watcher/             #   진입가 도달 감시 + 텔레그램 알람
│   ├── scheduler/                 #   일간 21:10 발송, 결과 판정 크론
│   ├── report_generator/          #   일간/주간/월간/연간 Excel 생성
│   └── watchlist/                 #   회원 관심종목 관리
│
├── interfaces/                    # L7: API 게이트웨이
│   ├── api_admin/                 #   /admin-api/* (IP 화이트리스트 + RBAC)
│   └── api_user/                  #   /user-api/* (JWT + RBAC)
│
├── ui/                            # L8: 역할 분리 UI
│   ├── admin_web/                 #   운영자 PC 대시보드 (React)
│   └── user_web/                  #   회원 PC + 모바일 (React)
│
└── infra/                         # L9: 인프라 자원
    ├── db/                        #   Prisma 4분할 스키마
    ├── redis/                     #   Redis 설정 (Pub/Sub, TTL, Blacklist)
    ├── queue/                     #   BullMQ + Redlock 설정
    └── logger/                    #   Winston JSON 구조화 로깅
```

### 2-2. PostgreSQL 4분할 스키마 (PRD 7-3 기반)

| 스키마 | 역할 | 주요 테이블 |
| :--- | :--- | :--- |
| `market_data` | 원시 시장 데이터 | `candles`, `instruments`, `trading_sessions` |
| `analysis_results` | 분석 엔진 출력·점수 | `signal_candidates`, `score_details`, `exec_hashes` |
| `signal_approvals` | TDR 승인 최종 추천 | `approved_signals`, `entry_prices`, `rejection_logs`, `signal_results` |
| `system_audit` | 운영·보안 감사 로그 | `api_call_logs`, `auth_events`, `alarm_logs`, `error_logs`, `report_distribution_logs` |

> **현재 V2 Prisma 스키마** (`users`, `refresh_tokens`, `usage_logs`, `audit_logs`, `reports`, `recommendations`, `subscription_requests`)는 `signal_approvals` + `system_audit` 스키마의 일부로 흡수 이관됩니다.

### 2-3. 회원 등급 체계 전환 (PRD 3-1 기반)

| 현재 V2 | Platform 1.0 | 변경 내용 |
| :--- | :--- | :--- |
| `FREE_USER` | `FREE_TRIAL` (14일) → `FREE` 자동전환 | 체험 기간 개념 신설 |
| `PRO_USER` | `PAID` | 명칭 변경 + 텔레그램 연동 활성화 연동 |
| `ADMIN` | `ADMIN` | 유지 (IP 화이트리스트 추가) |

---

## 3. 단계별 마이그레이션 실행 계획

### Phase 0 — 헌법 수립 및 사전 준비
> **기간:** 1~2일 | **위험도:** 최저
> **원칙:** 문서 작성, 스키마 정의만 허용. 실제 `.cjs` 파일 이동/수정 금지.

| Task | 세부 내용 | 완료 기준 |
| :--- | :--- | :--- |
| P0-01 | 본 설계서 최종 확정 및 서명 | 문서 최종본 존재 |
| P0-02 | 전체 코드 A~E 등급 분류 명부 작성 (`preservation_ledger.csv`) | 80개 이상 파일 등록 |
| P0-03 | 현재 서버의 실제 런타임 경로 파악 — `server.cjs`의 모든 `/api/*` 라우트 및 cron 스케줄 인벤토리화 | 100% 경로 문서화 |
| P0-04 | Git 현재 상태 태깅 (`git tag v2-freeze-YYYYMMDD`) | 태그 생성 완료 |

---

### Phase 1 — 기반 구축 (PRD Phase 1 대응)
> **기간:** 3~5일 | **위험도:** 낮음
> **원칙:** 새 플랫폼 스켈레톤 생성. 기존 서비스는 100% 그대로 유지.

#### T1-01. `platform/` 9-Layer 스켈레톤 디렉토리 생성

```bash
# 실행할 명령어 (프로젝트 루트에서)
mkdir -p platform/{core/{models,contracts,integrity},markets/{kr_equity,us_equity,crypto_spot},data_sources/{kis,yahoo,naver,binance,upbit,coingecko},analysis/{strategies/legacy_adapter,workers,scoring},approval/{tdr_bridge,validators,audit},application/{scan_jobs,alarm_watcher,scheduler,report_generator,watchlist},interfaces/{api_admin,api_user},ui/{admin_web,user_web},infra/{db,redis,queue,logger}}
mkdir -p sandbox/legacy_tests quarantine
```

#### T1-02. 전체 코드 A~E 등급 분류 (Preservation Ledger 작성)
- `quarantine/` 폴더: `extract_*.cjs`, `fetch_*.cjs`, `scrape_*.cjs` 등 사용 여부 불명확 파일 이동
- `sandbox/legacy_tests/`: `test_*.cjs`, `verify_*.cjs`, 디버그 스크립트 이동
- A/B등급 파일은 경로만 기록하며 **이동하지 않음**

#### T1-03. PostgreSQL 4분할 Prisma 스키마 설계 및 이관

**신규 스키마 파일 구조:**
```
platform/infra/db/
├── schema_market_data.prisma      # candles, instruments, trading_sessions
├── schema_analysis_results.prisma # signal_candidates, score_details, exec_hashes
├── schema_signal_approvals.prisma # approved_signals, entry_prices, signal_results
└── schema_system_audit.prisma     # api_call_logs, auth_events, alarm_logs
```

**현재 V2 테이블 → 신규 스키마 매핑:**
| 기존 테이블 (V2) | 신규 스키마 | 비고 |
| :--- | :--- | :--- |
| `users` | `system_audit.users` (→ `product_data`) | 회원 등급 컬럼 변경 (role 재정의) |
| `refresh_tokens` | `system_audit.refresh_tokens` | 유지 |
| `usage_logs` | `system_audit.usage_logs` | 유지 |
| `audit_logs` | `system_audit.audit_logs` | 유지 |
| `reports` | `signal_approvals.report_distribution_logs` | 이름 변경 |
| `recommendations` | `signal_approvals.approved_signals` + `signal_approvals.signal_results` | 구조 확장 |
| `subscription_requests` | `system_audit.subscription_requests` | 유지 |
| (신규) `candles` | `market_data.candles` | OHLCV 데이터 DB 이관 |
| (신규) `signal_candidates` | `analysis_results.signal_candidates` | 100점 채점 결과 저장 |

#### T1-04. 분석 대상 Universe 종목 DB 등록

| 자산군 | 수집 방법 | 저장 테이블 |
| :--- | :--- | :--- |
| KOSPI 200 | KIS API 종목 리스트 | `market_data.instruments` (market='kr_kospi') |
| KOSDAQ 150 | KIS API 종목 리스트 | `market_data.instruments` (market='kr_kosdaq') |
| NASDAQ 100 | Yahoo Finance / Polygon.io 심볼 리스트 | `market_data.instruments` (market='us_nasdaq') |
| 코인 120종목 | CoinGecko Market Cap 상위 100 + 운영진 선정 20 | `market_data.instruments` (market='crypto') |

#### T1-05. 회원 등급 모델 DB 전환

```sql
-- 기존 Role Enum 변경
-- ADMIN → ADMIN (유지)
-- PRO_USER → PAID (변경)  
-- FREE_USER → FREE or FREE_TRIAL (신규 컬럼 trial_expires_at 추가)
```
- `trial_expires_at: DateTime?` 컬럼 추가 (가입일 + 14일)
- 체험 만료 cron: 매일 00:00 실행 → `trial_expires_at < now()` 인 `FREE_TRIAL` 회원을 `FREE`로 자동 전환

---

### Phase 2 — 인프라 안정화 (PRD Phase 2 대응)
> **기간:** 3~5일 | **위험도:** 중간
> **원칙:** 인프라 레이어 추가. 기존 서비스 라우트는 변경하지 않음.

#### T2-01. Redis 설치 및 SSE Pub/Sub 구성

**현재 문제:** `let clients = []` 로컬 배열 → PM2 워커별 단절
**해결 방안:**
```javascript
// platform/infra/redis/pubsub.cjs
const redis = require('ioredis');
const publisher = new redis(process.env.REDIS_URL);
const subscriber = new redis(process.env.REDIS_URL);

// 데이터 갱신 시: publisher.publish('signals:update', JSON.stringify(payload))
// SSE 핸들러: subscriber.subscribe('signals:update') → 자신의 clients[]에 브로드캐스트
```

#### T2-02. BullMQ + Redlock KIS API 보호 큐

```javascript
// platform/infra/queue/kisQueue.cjs
const { Queue, Worker } = require('bullmq');
const Redlock = require('redlock');

// KIS API Rate Limit: 초당 18건 이하
// BATCH_SIZE: 2, 딜레이: 110ms → 초당 약 9건 (안전 마진 2배)
const kisQueue = new Queue('kis-api', { connection: redisConnection });
```

#### T2-03. 텔레그램 쿨다운 Redis TTL 통합

**현재 문제:** `const alertCache = new Map()` → 워커별 독립 → 중복 발송
**해결 방안:**
```javascript
// Redis에서 쿨다운 관리
const cooldownKey = `tg:cooldown:${code}:${timeframe}`;
const isCoolingDown = await redis.get(cooldownKey);
if (isCoolingDown) return; // 중복 차단
await redis.set(cooldownKey, '1', 'EX', 14400); // 4시간 TTL
```

#### T2-04. API 네임스페이스 분리

```javascript
// 기존: app.use('/api/auth', authRouter)  ← 혼재
// 변경:
app.use('/user-api/auth', authRouter);          // 회원 인증
app.use('/user-api/signals', signalsRouter);     // 추천 종목 조회
app.use('/admin-api/scan', scanRouter);          // 스캔 수동 트리거 (IP 화이트리스트)
app.use('/admin-api/users', adminUsersRouter);   // 사용자 관리

// Nginx 레벨: /admin-api/* → allow 운영자IP; deny all;
```

---

### Phase 3 — 핵심 기능 완성 (PRD Phase 3 대응)
> **기간:** 7~14일 | **위험도:** 높음
> **원칙:** 신규 핵심 기능 구현. 기존 V2와 병렬 운영하다 검증 후 전환.

#### T3-01. analyzer.cjs Worker Thread 래핑 + 100점 점수화

```javascript
// platform/analysis/workers/analysisWorker.cjs
const { workerData, parentPort } = require('worker_threads');
const { calculateSignals } = require('../../strategies/legacy_adapter/analyzer.cjs');

const result = calculateSignals(workerData.history, workerData.timeframe);
parentPort.postMessage(result);
```

**100점 만점 점수화 (PRD 2-1 기반):**
```javascript
// platform/analysis/scoring/scorer.cjs
function calculateScore(signal) {
  let score = 0;
  if (signal.cond_up7)             score += 20; // 추세 강도 (BB-MACD)
  if (signal.DHH2)                 score += 20; // 지지/저항 돌파 (눌림목)
  if (signal.trigger_vol)          score += 15; // 거래량 확인
  if (signal.trigger_rsi)          score += 15; // RSI 과매수/과매도 후크
  if (signal.DHH2 && signal.cond_up7) score += 15; // 눌림목 패턴
  if (signal.isTrending)           score += 10; // 이평선 정배열 (ADX 기반)
  if (signal.entry_approved)       score +=  5; // 캔들 패턴 (불리쉬 캔들)
  return Math.min(score, 100);
}
```

**등급 분류 (PRD 2-2):**
| 점수 | 등급 | 처리 |
| :--- | :--- | :--- |
| 90~100 | S등급 | TDR 승인 후 전체 회원 노출 |
| 75~89  | A등급 | TDR 승인 후 전체 회원 노출 |
| 60~74  | B등급 | DB 저장, 유료 회원만 노출 |
| 60 미만 | 제외 | 로그만 기록 |

#### T3-02. 진입가·목표가·손절가 산출 (PRD 2-3, 5-1 기반)

| 항목 | 산출 규칙 |
| :--- | :--- |
| 진입가 1 | EMA5 or result_2 (1차 눌림목 지지선) |
| 진입가 2 | result_3 (2차 눌림목 지지선), 존재 시만 표시 |
| 진입가 3 | BB 하단, 존재 시만 표시 |
| 목표가 | BB 상단 (bb_upper) — 진입가 대비 수익률 병기 |
| 손절가 | 진입가 1 × 0.9 — 오차 0원 (FR-07) |

#### T3-03. JWT + Redis Blacklist + RBAC 강화 (PRD 8장 기반)

- **JWT `jti` 필드 추가:** 로그아웃 시 `redis.set(jti, '1', 'EX', <remaining_ttl>)` 저장
- **미들웨어 순서:** `ipWhitelist()` → `verifyJWT()` → `checkBlacklist()` → `rbac(requiredRole)`
- **Admin IP 화이트리스트:** Nginx 레벨 + 미들웨어 이중 적용

#### T3-04. 진입가 도달 감시 + 텔레그램 알람 (PRD 4-1, FR-30~31 기반)

```javascript
// platform/application/alarm_watcher/priceWatcher.cjs
// 주기: 1분마다 관심종목 등록된 유료 회원의 진입가 감시
// 도달 조건: 현재가 ≤ 진입가 (1 or 2 or 3 중 회원 선택)
// 알람 내용: 종목명/현재가/도달진입가번호/목표가/손절가/분석점수/시간대
// 쿨다운: Redis TTL 14,400초 (4시간) — FR-31
```

#### T3-05. 전일 결과 판정 엔진 (PRD 4-3, FR-51~54 기반)

```
판정 로직 (매일 15:30 장 마감 후 실행):
1. signal_approvals 테이블에서 당일 추천 종목 조회
2. KIS API로 당일 장중 저가(Low) 데이터 수집 (FR-53-1)
3. 실패 판정: 장중 저가 ≤ 진입가1 × 0.9 → signal_results.status = 'FAIL'
4. 성공 판정: 종가 ≥ 목표가 → signal_results.status = 'SUCCESS'
5. 나머지: signal_results.status = 'IN_PROGRESS'
```

#### T3-06. 일간 텔레그램 통합 발송 (PRD 4-3, FR-50 기반)
- **발송 시각:** 매일 21:10 (cron: `10 21 * * 1-5`)
- **메시지 구성:**
  1. 당일 결과 리포트 (성공률 + 각 종목 결과)
  2. 익일 추천 종목 목록 (S·A등급 전체)
- **실패 시 재시도:** 3회 재시도, 간격 5분, 운영자 알람 발송 (FR-56)

#### T3-07. Excel 자동 저장 및 일간 리포트 생성 (PRD 4-4, FR-60~61 기반)
- 텔레그램 발송 직후 (21:30) `RAW_DATA` 시트 즉시 업데이트
- `DAILY_SUMMARY` 시트: 당일 성공/실패/진행중 건수 + 성공률·실패율 자동 산출
- 성공률 = 성공 ÷ (성공 + 실패) × 100 (진행중 제외)

---

### Phase 4 — 글로벌 확장 및 SaaS 완성 (PRD Phase 4 대응)
> **기간:** 14~21일 | **위험도:** 중간
> **전제:** Phase 3 전체 검증 완료 후 진행

#### T4-01. NASDAQ 100 Yahoo Finance 어댑터
```javascript
// platform/data_sources/yahoo/yahooConnector.cjs
// 기존 server.cjs의 Yahoo Finance 호출 로직을 이 파일로 추출·래핑
// source 태그: { source: 'yahoo', is_valid: true }
```

#### T4-02. 코인 Binance(USDT) + Upbit(KRW) + CoinGecko 어댑터
```javascript
// platform/data_sources/binance/binanceConnector.cjs → USDT 글로벌 기준가
// platform/data_sources/upbit/upbitConnector.cjs → KRW 원화 기준가 (WebSocket)
// platform/data_sources/coingecko/geckoSync.cjs → Market Cap 상위 100 주 1회 갱신
// FR-13-2: Upbit 미상장 코인 → Binance USDT 자동 Fallback
```

#### T4-03. 유료 결제 시스템 (토스페이먼츠) 연동
- 결제 완료 Webhook → 즉시 `PAID` 등급 전환 (지연 < 1분, FR-23)
- 텔레그램 연동 활성화: PAID 전환 시 `telegramId` 연동 UI 표시

#### T4-04. 모니터링 파이프라인 (PRD 9장 기반)
- **Uptime Robot:** 외부 가용성 1분 주기 HTTP 체크
- **Winston JSON 로깅:** 모든 에러 및 경고 → `system_audit.error_logs` DB 저장
- **운영자 텔레그램 알람:** error 레벨 즉시, Rate Limit 100건 초과 즉시

#### T4-05. 법적 고지문 전 화면 적용 (PRD 10장, NFR-08~09)
- 전 화면 하단 고정: "본 서비스는 자동 매매 시스템이 아님"
- 추천 종목 상세: 투자 책임 + 손절가 고지 (-10% 고정)
- 가입 화면: 투자 손실 위험 동의 필수

#### T4-06. PM2 수평 스케일아웃 부하 테스트
- **k6 테스트:** P95 < 200ms (NFR-01)
- **전체 스캔 완료:** < 10분 (NFR-02)
- **Race Condition:** PM2 16워커 동시 쓰기 테스트 — 0건 (DoD)

#### T4-07~09. Excel 리포트 완성 + 배포 기능
- 주간 리포트: 매주 월요일 08:00 자동 생성
- 월간 리포트: 매월 1일 08:00 자동 생성
- 연간 리포트: 매년 1월 1일 08:00 자동 생성
- 운영자: Admin 대시보드 기간 선택 즉시 다운로드 (< 10초)
- 유료 회원: 마이페이지 최근 12개월 다운로드
- 텔레그램 배포: 버튼 1클릭 파일 전송 (< 50MB)

---

## 4. 환경 변수 추가 목록

현재 `.env`에 추가로 필요한 환경 변수:

```env
# 신규 추가 필요
REDIS_URL=redis://127.0.0.1:6379
ADMIN_WHITELIST_IPS=1.2.3.4,5.6.7.8     # 운영자 IP 목록
TOSS_PAYMENTS_API_KEY=...                 # 토스페이먼츠
TOSS_PAYMENTS_SECRET=...
POLYGON_API_KEY=...                       # NASDAQ데이터 (Yahoo 대체/보조)
BINANCE_API_KEY=...                       # 코인 글로벌 기준가
BINANCE_API_SECRET=...
UPBIT_ACCESS_KEY=...                      # 코인 KRW 기준가
UPBIT_SECRET_KEY=...
COINGECKO_API_KEY=...                     # Market Cap 동기화
SMTP_HOST=...                             # 이메일 발송 (체험 만료 안내)
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
```

---

## 5. 출시 완료 기준 체크리스트 (PRD 13장 기반)

| 카테고리 | 검증 항목 | 기준값 | 검증 방법 |
| :--- | :--- | :--- | :--- |
| 분석 정확성 | 점수 산출 오류 | 0건 | Universe 전체 테스트 |
| 분석 정확성 | 손절가 = 진입가1 × 90% | 오차 0원 | 단위 테스트 |
| 무결성 | Race Condition | 0건 | PM2 16워커 동시 쓰기 |
| 무결성 | execHash 변조 차단 | 100% | TDR 변조 테스트 |
| 성능 | API 응답 P95 | < 200ms | k6 부하 테스트 |
| 성능 | 전체 스캔 완료 | < 10분 | 타임스탬프 측정 |
| 알람 | 진입가 도달 → 텔레그램 | < 60초 | 실측 테스트 |
| 알람 | 중복 알람 4시간 이내 | 0건 | 연속 트리거 테스트 |
| 회원 | 14일 체험 → FREE 자동 전환 | 오차 0 | 만료 시뮬레이션 |
| 회원 | 결제 → PAID 전환 | < 1분 | Webhook 응답 측정 |
| 보안 | 비인가 Admin 접근 | 차단 100% | 비허용 IP/무효 JWT 테스트 |
| 결과 판정 | 성공·실패·진행중 판정 | 오류 0건 | 판정 로직 단위 테스트 |
| 결과 판정 | 장중 저가 기준 실패 판정 | 오차 0원 | 저가 데이터 기반 수식 검증 |
| 리포팅 | 일간 Excel 생성 + 성공률/실패율 | 오류 0건 | 자동 검증 |
| 리포팅 | 주간·월간·연간 리포트 생성 | 누락 0건 | 스케줄러 전수 확인 |
| 배포 | 텔레그램 Excel 발송 | < 30초 | 버튼 응답 시간 |
| 배포 | 유료 회원 이메일 일괄 발송 | 누락 0건 | 발송 대상 전수 확인 |
| 법적 | 면책 고지문 전 화면 표시 | 누락 0 | UI 전수 검수 |
| 가용성 | 월간 서비스 가용성 | ≥ 99.5% | Uptime Robot 30일 |
