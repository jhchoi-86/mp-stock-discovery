# 📈 퀀트 주식 발굴 서비스 (mp-stock-discovery) 개발 내역서

본 문서는 프로젝트 기획부터 V1.0 프로덕션 배포까지 진행된 모든 개발 마일스톤(Phase 1 ~ Phase 12)을 기능별 카테고리로 묶어 정리한 버전 관리 문서입니다.

---

## 🚀 Version 1.0.0 (최종 릴리스)
**배포일:** 2026-03-17  
**주요 목표:** 단일 통합 프록시 서버(Nginx + PM2)를 통한 상용화 프로덕션 배포

### 📌 기획 및 핵심 비즈니스 로직 고도화 (Phase 1 ~ 5)
- **추천매매 타점 분석 고도화:**
  - `1D(일봉)` 및 `2H/4H(분봉)` 멀티 타임프레임을 적용한 스윙/단기 타점 분석 엔진 구축
  - 급등1차, 눌림1차, 눌림2차, 목표가 등 **[최고 달성가(Highest Price)]** 기준 수익률 로직 확립
  - 볼린저 밴드(Upper) 및 지수이동평균(EMA 5/20/60) 기반 자동 지지/저항선 저항대 맵핑
- **KIS(한국투자증권) Open API 연동:**
  - 실시간 현재가/변동률 폴링(Polling) 연동
  - API 초당 요청 제한(Rate Limit)을 우회하는 토큰 영속성화(`kis_token.json`) 및 지연(Delay) 처리 로직
- **프론트엔드 UI 대규모 개선:**
  - Glassmorphism 기반의 다크 모드 프리미엄 대시보드 테마 적용
  - 테이블 드롭다운 UI 버그 표출 및 그리드 정렬 수정
  - 목표가 도달 시 `[🎯 목표가 달성]` 뱃지 애니메이션 표출

### 🔐 보안 및 인증 시스템 (Phase 5, 6)
- **데이터베이스/ORM 적용:**
  - Supabase(PostgreSQL) 연동 및 Prisma ORM을 사용한 스키마 설계 (`models: User, RefreshToken, UsageLog, AuditLog`)
- **JWT 및 RTR(Refresh Token Rotation) 인증 로직:**
  - Access Token(메모리 유지) & Refresh Token(HttpOnly Secure Cookie) 이중 분리
  - Zustand를 활용한 React 전역 상태(`useAuthStore`) 및 Axios Interceptor 자동 토큰 갱신
- **RBAC(역할 기반 접근 제어) 도입:**
  - `FREE_USER`, `PRO_USER`, `ADMIN` 3단계 권한 부여
  - KIS API 실시간 스캔 사용 횟수 제한(Rate Limit Guards) 미들웨어 적용

### 💎 수익화 및 백오피스 (Phase 6, 11)
- **관리자 전용 대시보드 (`AdminDashboard.jsx`):**
  - 전체 가입자 목록 실시간 조회 및 이름/이메일 클라이언트 필터링(Search)
  - 유저 권한 토글(`FREE` ⇄ `PRO`), 상태 변경(`ACTIVE` ⇄ `SUSPENDED`) 원클릭 스위칭 기능
- **수동 승인 기반 PRO 구독 워크플로우:**
  - 유저 프로필 모달 내 `[💎 PRO 구독 신청하기]` 액션 및 상태(`PENDING`) 연동
  - 통합 Admin 컨트롤에서 대기열을 확인하고 `[✅ 승인]` 시 Prisma DB 단일 트랜잭션을 통한 등급 격상 적용

### 📢 텔레그램 C2E (알림 브로드캐스트) (Phase 7, 8, 9)
- **개인화된 봇 연동:**
  - 유저별 `telegramId` 컬럼 생성 및 `/start` 명령어를 통한 Chat ID 바인딩
- **관리자 브로드캐스팅 API:**
  - PRO 등급 및 ADMIN 회원을 대상으로 추천 종목 리포트를 비동기로 대량 발송(Broadcast)
  - `Promise.allSettled`를 이용한 텔레그램 전송 실패 우회 및 발송 이력 아카이브 로직

### 📦 아카이브 및 랭킹 (Phase 10)
- **VIP 자료실 (Report Archive):**
  - 기 발송된 텔레그램 추천 리포트를 PRO 유저들이 웹에서 다시 조회할 수 있도록 DB 백업
- **수익률 명예의 전당 (ROI Ranking Widget):**
  - 백엔드에 종목 추천 이력(`Recommendation`)을 해시 저장
  - 현재가가 아닌 '최고 달성가'를 기준으로 역대 최대 수익률을 산출하여 실시간 TOP 10 랭킹 위젯 노출

### ⚙️ EC2 프로덕션 통합 인프라 (Phase 12)
- **PM2 Node.js 클러스터링 기반 서버 데몬화:** 
  - `ecosystem.config.cjs` 작성 및 `NODE_ENV=production` 배포 최적화
- **Nginx HTTP Reverse Proxy 세팅:**
  - `nginx.conf` 구성을 통한 80포트 다중 라우팅 체계 완성
  - React 정적 정적 파일(Vite 빌드)은 폴더 직접 서빙, `/api/` 경로는 Node 백엔드로 우회(Proxy_pass) 처리
- **Github Actions / SSH 배포 파이프라인 연계** (`aws_update.bat`)

---

## 💡 차기 패치 방향 (V1.1 예정)
- SSL(HTTPS) 인증서(`Let's Encrypt`) 적용을 통한 보안 강화
- KIS API 웹소켓(WebSocket) 이벤트 기반 실시간 호가 / 체결 트래커 리팩토링
- PRO_USER 구독 시 기간제(Expiry Date) 로직 및 자동 강등 스케줄러(Cron) 도입
