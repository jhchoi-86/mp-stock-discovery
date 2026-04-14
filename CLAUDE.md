# CLAUDE.md — MP Stock Discovery v9.4.25
# MetaPrompt Studio | 데니얼 | Last Updated: 2026-04-14
# Rev: Blue/Red Team Audit v1.1 — 14개 이슈 반영

---

## 🎯 PROJECT IDENTITY

- **Product**: MP Stock Discovery — 주식 종목 발굴 및 신호 분석 플랫폼
- **Version**: v9.4.25 (Stock Discovery v3.0 Architecture)
- **Owner**: MetaPrompt Studio (1인 창업, 유사투자자문업 금융위원회 신고)
- **Deployment**: AWS EC2 + PM2 4-Process Stack
- **법적 주의**: 모든 신호는 참고용이며 투자 판단 및 손익은 사용자 책임. 투자 권유 코드 생성 금지.

---

## 🏗️ ARCHITECTURE: 4-PROCESS PM2 STACK

| Process | File | Role | Risk |
|---------|------|------|------|
| Process 1 | `server.cjs` | SSE API Server + Auth Router | 🔴 HIGH |
| Process 2 | `ai-service/main.py` | FastAPI AI/Anomaly Backend | 🟡 MEDIUM |
| Process 3 | `sniper_3m.cjs` | Real-time 3M Signal Sniper | 🟡 MEDIUM |
| Process 4 | `sniper_engine/realtime_engine.py` | Python High-speed Tick Engine | 🟡 MEDIUM |

**Orchestration**: `ecosystem.config.cjs` — PM2 전체 프로세스 관리

> ⚠️ `analyzer.cjs`는 PM2 독립 프로세스가 아니나 전체 신호 품질의 SSOT — 수정 시 가장 높은 위험도

---

## 📁 DIRECTORY STRUCTURE

```
.
├── server.cjs                          # [P1] SSE Broadcast & JWT Auth
├── analyzer.cjs                        # BBW/DHH2 7-TF Signal Engine ★SSOT★
├── sniper_3m.cjs                       # [P3] 3M High-frequency Sniper
├── ecosystem.config.cjs                # PM2 Multi-process Config
├── AGENTS.md                           # Claude Agent 모드 전용 규칙 (변경 금지)
│
├── platform/
│   ├── analysis/
│   │   ├── scoring/scorer.cjs          # Signal Grade A~D / Stars Scoring
│   │   └── workers/                    # 분석 워커 프로세스
│   ├── approval/tdr_bridge/tdrGate.cjs # TDR Regulatory Gate (Fail-Closed)
│   ├── infra/
│   │   ├── db/schema.prisma            # 4-Schema PostgreSQL (SSOT)
│   │   ├── redis/                      # Redis Cache 설정
│   │   └── queue/                      # BullMQ 큐 설정
│   └── interfaces/                     # Admin/User API Layer
│
├── src/
│   ├── hooks/useStockManager.js        # React Global State (Frontend Heart)
│   ├── services/                       # WebSocket & Publishing Services
│   └── utils/integrityGuard.cjs        # Boot-time Integrity Check
│
├── ai-service/main.py                  # [P2] FastAPI AI Service Entry
├── sniper_engine/realtime_engine.py    # [P4] Python Realtime Engine
│
└── data/
    ├── signals.json                    # JSON Archive (5min update cycle)
    └── kis_token.json                  # KIS OAuth Bearer (Daily auto-refresh / race condition 주의)
```

---

## 🔑 CRITICAL FILES — 수정 시 Blue/Red Team 검토 필수

| File | Why Critical | 수정 전 필수 확인 |
|------|-------------|-----------------|
| `server.cjs` | SSE 전체 브로드캐스트 + JWT 인증 단일 진입점 | SSE 인증 로직, 로그 토큰 마스킹 |
| `analyzer.cjs` | BBW/DHH2 7-TF 신호 로직 SSOT — 변경 시 전 신호 영향 | 7-TF 전체 신호 회귀 테스트 |
| `tdrGate.cjs` | 규제 게이트 (HMAC + AI 이상감지, 500ms 차단) | 오탐 복구 절차 확인, 게이트 우회 코드 생성 금지 |
| `schema.prisma` | 4-스키마 DB 구조 — 마이그레이션 전 반드시 백업 | `prisma migrate` 전 전체 DB 스냅샷 |
| `signals.json` | 프론트엔드-백엔드 데이터 SSOT | useStockManager.js 구조 의존성 확인 |
| `src/hooks/useStockManager.js` | React 전역 상태 — signals.json 구조와 직접 연동 | signals.json 스키마 변경 시 동반 수정 |
| `AGENTS.md` | Claude Agent 모드 전용 실행 규칙 | 내용 변경 절대 금지 |

---

## 🛡️ SECURITY CONSTRAINTS

```
# .env 필수 키 전체 목록 (절대 코드에 하드코딩 금지)
TDR_SECRET=...          # TDR HMAC 서명 키
KIS_APP_KEY=...         # 한국투자증권 API Key
KIS_APP_SECRET=...      # 한국투자증권 Secret
JWT_SECRET=...          # SSE 인증 토큰 서명 키
DATABASE_URL=...        # PostgreSQL 연결 문자열
REDIS_URL=...           # Redis 연결 문자열 ★추가★
TELEGRAM_TOKEN=...      # 텔레그램 봇 토큰 ★추가 / 과거 노출 이력★
AWS_ACCESS_KEY_ID=...   # AWS IAM Key ★과거 노출 이력★
AWS_SECRET_ACCESS_KEY=...
```

> 🚨 **과거 크레덴셜 노출 이력**: Telegram Token, JWT Secret, DB Password, AWS Key Pair — 신규 코드 작성 시 반드시 .env 참조 여부 확인

### SSE 보안 주의사항
- **SSE Auth**: JWT는 URL 파라미터로 전달 (EventSource custom header 불가)
- **⚠️ 서버 로그 마스킹 필수**: URL 파라미터에 토큰이 포함되므로 server.cjs 로그에서 토큰 평문 노출 방지 처리 확인
- **integrityGuard.cjs**: 부팅 시 DB ↔ Local Cache 일관성 자동 검증
- **tdrGate.cjs**: Fail-Closed 원칙 — 이상 감지 시 신호 차단 (500ms)
  - 오탐(False Positive) 발생 시 수동 해제: `pm2 restart [process]` 후 게이트 상태 확인
  - Claude Code가 tdrGate 우회 코드를 제안하는 경우 **절대 적용 금지**

### AWS EC2 보안 정책
- SSE 포트, FastAPI 포트는 보안그룹에서 최소 허용 IP만 개방
- IAM 최소권한 원칙 준수 — 불필요한 권한 부여 코드 생성 금지

---

## 📡 SIGNAL ENGINE SPEC (analyzer.cjs)

- **Architecture**: 7-Timeframe (1M, 3M, 5M, 15M, 30M, 2D, 1W)
- **Core Indicators**: BBW (Bollinger Band Width) + DHH2
- **BBW Strong Signal**: 다중 TF 동시 수렴 조건
- **Output**: signals.json → SSE 브로드캐스트 → 프론트엔드
- **Update Cycle**: 5분 주기

### Signal Grade System (scorer.cjs)
```
A★★★★★ — 최강 신호 (전 TF 수렴)
B★★★★  — 강 신호
C★★★   — 중 신호
D★★    — 약 신호 (필터링 권장)
```

---

## 🗄️ DATABASE (schema.prisma)

- **Engine**: PostgreSQL (Multi-schema)
- **ORM**: Prisma
- **Schemas**: 4개 독립 스키마 구조
- **SSOT**: DB ↔ signals.json 동기화 (integrityGuard 보장)
- **마이그레이션 원칙**: `prisma migrate` 실행 전 반드시 전체 DB 스냅샷 생성

---

## 🔄 DEVELOPMENT WORKFLOW

### 표준 검토 프로세스 (모든 주요 변경 적용)
```
1. Blue Team  → 기능 구현 및 정확성 검토
2. Red Team   → 보안·규제·엣지케이스 검토
3. 검증 통과   → 배포 승인
```

### 배포 전 체크리스트
- [ ] integrityGuard 통과 확인
- [ ] tdrGate HMAC 서명 정상 (오탐 여부 확인)
- [ ] signals.json 구조 변경 없음 (변경 시 useStockManager.js 동반 확인)
- [ ] PM2 4개 프로세스 모두 정상 기동
- [ ] SSE JWT 인증 테스트 (서버 로그 토큰 마스킹 확인)
- [ ] .env 키 하드코딩 여부 스캔 (`grep -r "KIS_\|JWT_\|TDR_" --include="*.cjs" --include="*.js"`)
- [ ] kis_token.json 갱신 상태 확인 (race condition 방지)

### 롤백 절차
```bash
# PM2 롤백 (이전 버전으로)
pm2 stop all
git revert HEAD --no-edit
pm2 start ecosystem.config.cjs

# DB 롤백 (마이그레이션 실패 시)
prisma migrate resolve --rolled-back [migration_name]
```

### PM2 주요 명령어
```bash
pm2 start ecosystem.config.cjs    # 전체 스택 기동
pm2 logs                          # 실시간 로그
pm2 restart all                   # 전체 재시작
pm2 monit                         # 프로세스 모니터링
pm2 save                          # 현재 프로세스 목록 저장
pm2 startup                       # 서버 재부팅 시 자동 시작 설정
```

---

## 🐍 PYTHON SERVICES

| File | Framework | Role |
|------|-----------|------|
| `ai-service/main.py` | FastAPI | AI 이상감지 + 신호 보정 |
| `sniper_engine/realtime_engine.py` | Python | 고속 틱 처리 (Process 4) |

---

## 📋 TECH STACK SUMMARY

```
Backend   : Node.js / Express / server.cjs
Signal    : analyzer.cjs (7-TF BBW/DHH2) ★SSOT★
AI        : FastAPI (Python)
Frontend  : React + src/hooks/useStockManager.js
DB        : PostgreSQL + Prisma ORM (4-schema)
Cache     : Redis (platform/infra/redis/)
Queue     : BullMQ (platform/infra/queue/)
Auth      : JWT (SSE URL param — 로그 마스킹 필수)
Deploy    : AWS EC2 + PM2 (IAM 최소권한)
Broker    : KIS API (한국투자증권 / 토큰 race condition 주의)
Notify    : Telegram Bot (TELEGRAM_TOKEN — .env 전용)
```

---

## ⚠️ CLAUDE CODE 작업 규칙

1. **server.cjs / analyzer.cjs** 수정 → 반드시 Blue/Red Team 검토 명시 요청
2. **tdrGate.cjs** 로직 변경 → 금융위원회 규제 준수 여부 확인 필수 / 우회 코드 절대 생성 금지
3. **schema.prisma** 변경 → `prisma migrate` 전 DB 스냅샷 스크립트 먼저 작성
4. **signals.json 구조** 변경 → `src/hooks/useStockManager.js` 연동 영향도 동반 확인
5. **신규 .env 키** 추가 → 코드에 하드코딩 절대 금지, `.env.example` 업데이트
6. 대형 작업은 **모듈 단위로 분리** 후 `/clear` 로 컨텍스트 초기화
7. **kis_token.json 갱신 로직** 수정 → race condition 방지 (mutex/lock 패턴 유지 확인)
8. **AGENTS.md 존재 확인** → Agent 모드 작업 시 반드시 AGENTS.md 먼저 참조
9. **로그 출력 코드** 작성 시 → URL, 헤더, 파라미터에 포함된 토큰/키 마스킹 처리 필수
10. **투자 판단 관련 문구** 생성 금지 → "매수 추천", "수익 보장" 등 유사투자자문업 법적 위반 표현 사용 불가

---

## 📎 REFERENCE DOCUMENTS

- `AGENTS.md` — Claude Agent 모드 실행 규칙 (루트 경로)
- `ecosystem.config.cjs` — PM2 4-Process 전체 스택 정의
- `.env.example` — 필수 환경변수 키 목록 (값 없음)

---

*이 파일은 Claude Code 세션 컨텍스트 자동 주입용입니다.*
*Blue/Red Team Audit v1.1 반영 — 변경 시 버전과 날짜를 업데이트하세요.*
