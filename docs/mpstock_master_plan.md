# 🌐 [Master PRD] mpstock.co.kr 글로벌 알파 발굴 플랫폼

## 1. 비전 및 목표 (Vision & Strategy)
`mpstock.co.kr`은 한국(KOSPI 200/KOSDAQ 150), 미국(NASDAQ 100), 가상자산(MarketCap Top 100) 시장을 통합하여, **데이터 기반의 정밀 기술적 지표와 AI의 통찰력을 결합한 글로벌 종목 추천 플랫폼**을 지향합니다.

## 2. 시장별 발굴 및 추천 범위 (Scope)

### A. 한국 시장 (KOSPI 200 / KOSDAQ 150)
- **대상**: 시가총액 상위 우량주 중심.
- **로직**: KIS API 연동, 외인/기관 수급 분석 포함, 모멘텀 스코어링 적용.

### B. 가상자산 시장 (CMC Top 100 + Major 20)
- **대상**: 코인마켓캡 상위 100개 종목 및 주요 메이저 20종.
- **로직**: Upbit/Bithumb/Binance 데이터 융합, 변동성 필터링 및 AI 호재 분석.

### C. 미국 시장 (NASDAQ 100)
- **대상**: 나스닥 100 지수 구성 종목.
- **로직**: KIS 해외 주식 API 및 Alpha Vantage 연동, 글로벌 거시 지표(Macro) 반영.
- **리스크 관리**: 미국 시장용 `parse_mode` 및 상이한 휴장일 체크 로직 자동화.

## 3. 핵심 기술 명세 (Red Team Verified Specs)

### A. 통합 인증 및 토큰 관리 (Auth Sync)
- **KIS OAuth 2.0**: 국내/해외 API 토큰이 상이하며 유효기간(1시간)이 짧음. 
- **해결책**: Node.js 서버에서 토큰 관리 데몬 기동 -> Redis/File에 캐싱 -> Python AI 서비스가 이를 공유하여 중복 발급 및 중복 요청 차단.

### B. 시장별 UI/UX 컬러 가이드 (Financial Standards)
`Common/FINANCIAL_UI_STANDARDS.md`에 의거하여 시장별 테마 자동 전환:
- **한국/코인**: 상승(Red 🔴), 하락(Blue 🔵) - 국내 투자자 관습 준수.
- **미국(Nasdaq)**: 상승(Green 🟢), 하락(Red 🔴) - 글로벌 표준 준수.
- **통합 뷰**: 사용자가 선택한 '주력 시장'에 따라 전체 테마 색상 가중치 조정.

### C. 24/7 리소스 할당 전략 (Resource Allocation)
- **피크 타임 관리**: 한국(09-15시) / 미국(22-05시) / 코인(24h).
- **최적화**: 시장 미운영 시기에는 해당 스캐너의 폴링 주기를 10배로 늘려 서버 CPU 및 AI API Rate Limit을 확보.

### [Service Layers]
1.  **Ingestion (수집)**: KIS API, WebSocket, RSS Scraper (Zero-Cost Focus).
2.  **Processing (연동)**: 
    - **Node.js**: 실시간 신호 중계 (SSE) 및 회원 관리.
    - **Python**: 기술적 지표 계산 및 Gemini AI 분석/리포트 생성.
3.  **Frontend (표기)**: Vite + React 기반의 프리미엄 대시보드 (Mobile-First).

## 4. 운영 및 관리 가이드 (SRE & Ops)

- **배포 인프라**: AWS EC2 + PM2 (무중단 서비스).
- **관측성(Observability)**: 
    - `Skills/Common/OPS_MONITORING.md`에 정의된 로그 로테이션 및 헬스 체크 적용.
    - **레드팀 보안 감사**: Read-Only API 키 강제 및 주기적 환경 변수 점검.

## 5. 단계별 협업 로드맵 (MCP & Skill)

| 단계 | 협업 방식 | 적용 스킬 |
| :--- | :--- | :--- |
| **기획/설계** | `Mermaid MCP`로 시스템 흐름도 작성 | `BlueTeam/IMPLEMENTATION_STRATEGY.md` |
| **구현** | `Postgres MCP`로 통합 스키마 설계 | `BlueTeam/DB_RESILIENCE` |
| **운영** | `pm2-logrotate` 및 AWS CloudWatch 연동 | `Common/OPS_MONITORING.md` |
| **검증** | `Puppeteer MCP`로 다국어 UI 렌더링 확인 | `RedTeam/SKILL.md` (IRP 프로토콜) |

---

> [!CAUTION]
> **레드팀 누락 방지 체크리스트**:
> 1. 미국 시장 서머타임(Daylight Saving) 자동 계산 로직 포함 확인.
> 2. KIS 해외 API의 실시간 체결가 지연(15분) 여부에 따른 실시간성 보정 로직 확인.
> 3. 코인 마켓캡 Top 100 데이터 로딩 시 브라우저 캐시 버스팅(`?v=timestamp`) 적용 확인.

> [!IMPORTANT]
> **디자인 철학**: `Common/FINANCIAL_UI_STANDARDS.md`를 준수하여, 한국 시장(🔴/🔵), 미국 시장(🟢/🔴)의 관습적 색상을 하이브리드로 지원하는 프리미엄 웹 UX를 구축합니다.
