# AGENTS.md — MP Stock Discovery v3.0
# 에이전트 오케스트레이션 지침서 (기계 판독 최적화)
# Compatible: Google Antigravity / Claude Code / Cursor / Windsurf
# Red-Team Verified: 2026-04-10 | Fixed: 7 defects

---

## 🎯 PROJECT IDENTITY

```
Product      : MP Stock Discovery v3.0
Type         : 주식/코인 종목 신호 분석 플랫폼 (유사투자자문업 등록)
Owner        : MetaPrompt Studio — 데니얼 (1인 창업)
Location     : Pohang, Korea
Regulation   : 유사투자자문업 — 투자 일임·매매 지시 절대 금지
Subscription : 3-Tier (Free / Standard / Premium)
Language     : JavaScript (Node.js CJS + React ESM) — TypeScript 미사용
```

---

## 🏗️ SYSTEM ARCHITECTURE

```
[KIS API (주식)] + [코인 거래소 API — 향후 coin-api-connector 스킬로 확장 예정]
        ↓
[analyzer.cjs]  ←  7-Timeframe BBW 신호 엔진
        ↓
[Redis Cache]  ←→  [BullMQ Worker Threads]
        ↓                    ↓
[server.cjs]   →   SSE Stream (실시간 신호 푸시)
        ↓
[React Frontend]
  ├── App.jsx
  ├── SSEContext.jsx     ← SSE 토큰: URL 파라미터(?token=JWT) 또는 HttpOnly Cookie
  └── useStockManager.js
        ↓
[Telegram Bot]  →  [Kakao AlimTalk (Solapi API)]
        ↓
[PostgreSQL / Prisma ORM]  →  [signals.json Archive]
```

> ⚠️ **SSE 인증 필수 규칙**: 브라우저 EventSource API는 커스텀 HTTP 헤더 미지원.
> Authorization 헤더 방식 절대 사용 금지. ?token=JWT URL 파라미터 또는 HttpOnly Cookie만 허용.
> tier 판단은 반드시 JWT payload에서 추출 (req.query.type 신뢰 금지).

### 핵심 파일 위험도 맵

| 파일 | 역할 | 수정 위험도 | 에이전트 권한 |
|------|------|------------|--------------|
| `server.cjs` | SSE 서버, API 라우팅 | 🔴 HIGH | Planning 모드만 |
| `analyzer.cjs` | BBW 신호 분석 핵심 엔진 | 🔴 HIGH | Planning 모드만 |
| `useStockManager.js` | 프론트-서버 상태 동기화 | 🟡 MEDIUM | 검토 후 수정 |
| `SSEContext.jsx` | SSE 구독 컨텍스트 | 🟡 MEDIUM | 검토 후 수정 |
| `App.jsx` | 라우팅 및 전역 상태 | 🟢 LOW | 자유 수정 |
| `signals.json` | 신호 아카이브 | 🔴 CRITICAL | 직접 수정 절대 금지 |
| `.env` | 환경변수 | 🔴 CRITICAL | 읽기 전용 |
| `workers/signalWorker.cjs` | BullMQ 신호 처리 워커 | 🟡 MEDIUM | 검토 후 수정 |
| `utils/common.cjs` | 공통 유틸(sleep 등) | 🟢 LOW | 자유 수정 |

---

## ⚙️ ENVIRONMENT SETUP

```bash
# 패키지 설치
npm install

# 개발 서버 실행 (3개 동시 실행 필요)
npm run dev              # Vite React (port 5173)
node server.cjs          # SSE 서버 (port 3001)
node workers/signalWorker.cjs  # BullMQ Worker

# Redis 실행 확인 (server 시작 전 필수)
redis-cli ping           # → PONG 응답 확인

# DB 마이그레이션
npx prisma migrate dev --name [migration_name]
npx prisma generate

# 전체 테스트
npm test && npm run test:integration && npm run test:e2e
```

### 필수 환경변수 전체 목록 (.env)

```bash
# KIS API (주식)
KIS_BASE_URL=https://openapi.koreainvestment.com:9443
KIS_APP_KEY=
KIS_APP_SECRET=
KIS_ACCOUNT_NO=
KIS_MOCK=false

# Database
DATABASE_URL=

# Redis
REDIS_URL=redis://localhost:6379

# Auth (JWT)
JWT_SECRET=
JWT_EXPIRES_IN=7d

# Telegram
TELEGRAM_TOKEN=
TG_CHANNEL_FREE=
TG_CHANNEL_STANDARD=
TG_CHANNEL_PREMIUM=
TG_CHANNEL_ADMIN=

# Solapi (Kakao AlimTalk)
SOLAPI_API_KEY=
SOLAPI_API_SECRET=
SOLAPI_SENDER=

# App
PORT=3001
NODE_ENV=development
DEBUG_SSE=false
```

---

## 📐 CODING STANDARDS

### JavaScript (CJS / ESM 혼용 주의)

- `server.cjs`, `analyzer.cjs`, `workers/*.cjs` → CommonJS (`require/module.exports`)
- React 컴포넌트 → ESM (`import/export`)
- CJS ↔ ESM 혼용 시 반드시 `.cjs` / `.mjs` 확장자 명시
- `var` 사용 금지 → `const` / `let` 전용
- `async/await` 우선, Promise 체인 지양
- 세미콜론 필수 (`;`)
- 들여쓰기: 2 spaces

### 공통 유틸 함수 표준 (모든 CJS 모듈 공유)

```javascript
// utils/common.cjs
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const escapeHtml = (str) => str
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
module.exports = { sleep, escapeHtml };
```

### 표준 응답 형식

```javascript
{ success: true,  data: { ... }, timestamp: Date.now() }  // 성공
{ success: false, error: "메시지", code: "ERROR_CODE", timestamp: Date.now() }  // 실패
```

### 신호 데이터 표준 스키마 (전체 파일 공통 준수)

```javascript
// ✅ SignalSchema — AGENTS.md가 single source of truth
const SignalSchema = {
  ticker     : String,  // "005930"
  name       : String,  // "삼성전자"
  timeframes : Array,   // [{tf:"TF60", bbw:0.023, score:78}]
  totalScore : Number,  // 0-100
  signalType : String,  // "STRONG" | "NORMAL" | "WATCH"
  market     : String,  // "KR_STOCK" | "COIN"
  timestamp  : Number,  // Unix ms
  archived   : Boolean
};

// ✅ 저장은 반드시 archiveSignal() 경유 (필드명 위 스키마와 일치)
await archiveSignal({ ticker, name, timeframes, totalScore, signalType, market, timestamp });

// ❌ 직접 쓰기 금지
fs.writeFileSync('signals.json', ...); // FORBIDDEN
```

---

## 🚫 ABSOLUTE CONSTRAINTS

```
❌ signals / users / subscriptions 테이블 → DELETE 쿼리 실행 금지
❌ KIS_APP_KEY, DATABASE_URL 등 시크릿 → 코드 하드코딩 절대 금지
❌ "매수하세요"/"매도하세요" → 투자 지시 문구 생성 금지 (유사투자자문업 법적 위반)
❌ signals.json → 직접 파일 쓰기/덮어쓰기 금지
❌ production DB → 승인 없는 마이그레이션 실행 금지
❌ KIS API → 초당 20건 상한 초과 호출 금지
❌ 구독 미인증 사용자 → Premium 신호 데이터 노출 금지
❌ SSE 인증 → EventSource Authorization 헤더 방식 금지
❌ tier 판단 → req.query 파라미터 신뢰 금지 (JWT payload만 허용)
❌ CORS → wildcard * 허용 금지 (명시적 도메인 화이트리스트 필수)
```

---

## 🔐 SECURITY RULES

- 모든 시크릿 → `.env` 파일 관리, `.gitignore` 등록 필수 (`.env*` 전체 패턴)
- API 키 노출 감지 즉시 → `audit-security` 스킬 호출 후 작업 중단
- Prisma 쿼리 → `$queryRawUnsafe` 사용 금지, 파라미터 바인딩 필수
- SSE 인증 → JWT URL 파라미터 수신 후 서버에서 `jwt.verify()` 검증
- 신규 외부 API 연동 → `audit-security` 스킬 선행 실행 필수

---

## 🧪 QUALITY GATE (9단계)

```
[ ] 1. ESLint 에러 0건 (JavaScript 기준 — TypeScript 미사용)
[ ] 2. npm test — 전체 단위 테스트 통과
[ ] 3. KIS API mock 연동 테스트 통과
[ ] 4. Redis 캐시 hit/miss 정합성 검증
[ ] 5. SSE 재연결 (3회 retry + 지수 backoff) 동작 확인
[ ] 6. Telegram 방송 E2E 테스트 통과
[ ] 7. audit-security 스킬 → 자격증명 누출 0건
[ ] 8. signals.json 아카이브 무결성 검증 통과
[ ] 9. React 빌드 용량 500KB 이하 / API 응답 평균 200ms 이하
```

---

## 🤖 AGENT ROUTING RULES

| 작업 유형 | 권장 모델 | 실행 모드 | 아티팩트 |
|----------|----------|----------|---------|
| BBW 7-timeframe 알고리즘 설계 | Claude Sonnet 4.6 | Planning | 구현계획 필수 |
| 신호 스코어링 로직 수정 | Claude Sonnet 4.6 | Planning | 코드 변경 내역 |
| SSE 파이프라인 디버깅 | Claude Sonnet 4.6 | Planning | 디버깅 로그 |
| 보안 감사 | Claude Sonnet 4.6 | Planning | 감사 리포트 |
| Prisma 마이그레이션 | Claude Sonnet 4.6 | Planning | 실행 전 승인 필수 |
| UI 대시보드 디자인 | Gemini 3.1 Pro | Planning | 스크린샷 아티팩트 |
| PRD / 기획 문서 작성 | Gemini 3.1 Pro | Planning | 문서 아티팩트 |
| 환경설정 / package.json | Gemini Flash | Fast | - |
| 단순 리팩토링 / 주석 추가 | Gemini Flash | Fast | - |

---

## 🛠️ SKILLS REGISTRY

| 스킬 ID | 트리거 조건 | 경로 | 상태 |
|--------|-----------|------|------|
| `signal-logic-verify` | BBW 로직, 7-timeframe, 신호 엔진 | `.agents/skills/signal-logic-verify/SKILL.md` | ✅ 완료 |
| `kis-api-connector` | KIS API, 토큰 갱신, rate limit | `.agents/skills/kis-api-connector/SKILL.md` | ✅ 완료 |
| `audit-security` | 보안 점검, 키 노출, credentials | `.agents/skills/audit-security/SKILL.md` | ✅ 완료 |
| `sse-pipeline-debug` | SSE 오류, 스트림 단절, 재연결 | `.agents/skills/sse-pipeline-debug/SKILL.md` | ✅ 완료 |
| `red-team-verify` | 배포 전 검증, 레드팀, QA | `.agents/skills/red-team-verify/SKILL.md` | ✅ 완료 |
| `telegram-broadcast` | 텔레그램 봇, 신호 방송 | `.agents/skills/telegram-broadcast/SKILL.md` | ✅ 완료 |
| `prisma-db-ops` | DB 쿼리, 마이그레이션, 스키마 | `.agents/skills/prisma-db-ops/SKILL.md` | 🔲 예정 |
| `subscription-billing` | 구독 티어, 결제, 멤버십 | `.agents/skills/subscription-billing/SKILL.md` | 🔲 예정 |
| `kakao-alimtalk` | Solapi, AlimTalk, 카카오 알림 | `.agents/skills/kakao-alimtalk/SKILL.md` | 🔲 예정 |
| `pine-script-gen` | TradingView, Pine Script, BBW | `.agents/skills/pine-script-gen/SKILL.md` | 🔲 예정 |

---

## ⚠️ CONTEXT DIET RULES

- 동시 활성화 스킬 최대 **3개** 제한
- MCP 서버 비활성화 기준: 해당 작업 PR merge 또는 task 완료 확인 후 즉시 비활성화
- `signals.json` 전체 로딩 금지 → 최근 **100건** 슬라이스만 참조
- grep / find 결과 출력 **50라인** 상한
- 컨텍스트 초기화 기준: 동일 오류 연속 3회 발생 또는 토큰 소모 80% 초과 시

---

*Red-Team Verified: 2026-04-10 | Fixed 7 defects | MP Stock Discovery v3.0 | MetaPrompt Studio*
