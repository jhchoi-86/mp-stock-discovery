# 🏗️ MP Stock Discovery (주식 종목 발굴 시스템) 기술 스택 및 설계 구조

본 문서는 **MP Stock Discovery** 프로젝트의 전체적인 기술 스택, 시스템 아키텍처 및 주요 기능 설계 구조를 종합적으로 정리한 문서입니다.

---

## 💻 1. 기술 스택 (Tech Stack)

### 🎨 프론트엔드 (Frontend)
*   **Core:** React 19 + Vite 8
*   **Language:** JavaScript (ES6+)
*   **State Management:** Zustand (전역 상태 관리, Auth 상태 유지)
*   **Network Client:** Axios (엔드포인트 통신 및 인터셉터 처리), Fetch API
*   **UI / Styling:** 순수 CSS (Vanilla CSS)를 활용한 Dark Mode & Glassmorphism(글래스모피즘) 테마
*   **Icons:** Lucide-React

### ⚙️ 백엔드 (Backend)
*   **Core:** Node.js + Express.js 5.x
*   **Language:** JavaScript (CommonJS, `.cjs`)
*   **Database ORM:** Prisma 6.x
*   **Database:** PostgreSQL (`pg` 모듈 기반)
*   **Security & Auth:**
    *   JWT (JSON Web Token) - HttpOnly/Secure 쿠키를 통한 안전한 세션 관리
    *   Bcrypt - 패스워드 단방향 암호화 (Salt)
*   **External Integrations:**
    *   **Data Scraping:** Cheerio, Iconv-lite (네이버 금융 등 외부 HTML 파싱용)
    *   **Notifications:** `node-telegram-bot-api` (텔레그램 봇을 통한 알림 발송)

### ☁️ 인프라 및 배포 (Infrastructure & DevOps)
*   **Cloud Provider:** AWS EC2 (Ubuntu Linux)
*   **Web Server / Proxy:** Nginx (정적 파일 호스팅 및 리버스 프록시 역할)
*   **Process Manager:** PM2 (Node.js 무중단 백그라운드 실행 및 클러스터링)
*   **Domain & SSL:** `mpstock.co.kr` (가비아 연동) / Let's Encrypt (Certbot을 통한 HTTPS 구성)

---

## 🏛️ 2. 시스템 아키텍처 (System Architecture)

본 시스템은 단일 AWS EC2 인스턴스 위에서 프론트엔드 정적 파일 서빙과 백엔드 API 서버가 **Nginx 리버스 프록시**를 매개로 통신하는 모놀리식(Monolithic) 하이브리드 구조를 가집니다.

```mermaid
graph TD
    Client[Web Browser / User] -- HTTPS (443) --> Nginx[Nginx Reverse Proxy]
    
    subgraph AWS EC2 (Ubuntu)
        Nginx -- "/" (Static Files) --> React[React / Vite Build (dist)]
        Nginx -- "/api/*" (Reverse Proxy) --> PM2[PM2 Process Manager]
        PM2 --> Express[Express.js Backend (Port: 3001)]
    end
    
    Express -- ORM / TCP --> DB[(PostgreSQL Database)]
    Express -- HTTP GET --> Yahoo[Yahoo Finance API (OHLCV)]
    Express -- HTTP GET --> KIS[한국투자증권/Naver API (Real-time)]
    Express -- Webhook --> Telegram[Telegram Bot API]
```

---

## 🧩 3. 주요 기능 및 계층 설계 (Feature & Layer Design)

### 3.1. 인증 및 권한 시스템 (RBAC)
사용자는 3가지 단계의 권한(Role)을 가집니다.
1.  **FREE_USER (일반 회원):** 기본 회원가입 유저. 사이트 열람은 가능하나 핵심 추천 종목이나 VIP 리포트, 텔레그램 알림에는 제한이 있습니다.
2.  **PRO_USER (구독 회원):** 관리자의 승인을 받은 VIP 회원. 텔레그램 봇과 연동하여 실시간 매수/매도 신호 알림을 수신하며, 모든 차트 및 리포트가 해금됩니다.
3.  **ADMIN (관리자):** 회원 관리(삭제, 권한 부여, 정지), 강제 동기화, 전체 푸시(Broadcast) 알림 권한을 가집니다.

### 3.2. 데이터 수집 및 분석 엔진 (Core Analyzer)
전체 350여 개의 종목 유니버스를 대상으로 다중 타임프레임(5M, 15M, 1H, 1D 등) 분석을 수행합니다.
*   **하이브리드 데이터 패치 (Hybrid Fetch):** 과거 데이터(봉차트)는 Yahoo Finance API를 통해 수집하고, 실시간 현재가 및 호가는 KIS(한국투자증권) 또는 네이버 금융 API 등을 활용하여 딜레이 없는 데이터를 구축합니다.
*   **지표 연산:** 수집된 OHLCV 데이터를 바탕으로 EMA(지수이동평균), MACD, 볼린저밴드, RSI 등 보조지표를 서버사이드에서 즉각 연산하여 프론트엔드 부하를 최소화합니다.

### 3.3. 알림 및 리포트 스케줄링 (Notification)
*   **텔레그램 봇 연동:** 유저가 Profile 탭에서 자신의 텔레그램 ID를 연동하면, 백엔드는 조건에 부합하는 타점(급등 1차, 눌림목 등) 도달 시 `node-telegram-bot-api`를 즉각 호출하여 모바일 푸시 알림을 전송합니다.
*   **리포트 추출:** 분석된 종목들의 타점 정보를 취합하여 엑셀/텍스트 형태의 리포트를 다운로드할 수 있는 API를 제공합니다.

### 3.4. 데이터베이스 모델링 (Prisma Schema Overview)
핵심 테이블 간의 참조 무결성을 `Cascade` 설정을 통해 안전하게 관리합니다.
*   **`User`**: 핵심 유저 정보, 권한(Role), 비밀번호(Bcrypt Hashed), 텔레그램ID 관리
*   **`RefreshToken`**: 보안 유지를 위한 기기별 JWT 교체 주기 관리
*   **`UsageLog`** / **`AuditLog`**: API 호출 통계 및 관리자(Admin)의 민감한 조치 이력 보관
*   **`SubscriptionRequest`**: 일반 회원의 PRO 등급 상향 조정을 위한 대기열 테이블

---

## 🔒 4. 보안 설계 (Security Considerations)
*   **CORS & Proxy:** Nginx 설정 단에서 허용된 도메인(`mpstock.co.kr`)만 허용하며 백엔드 포트(3001)는 외부망(`0.0.0.0`) 접근을 허용하되 CORS 미들웨어로 검증합니다.
*   **토큰 탈취 방어:** Access Token은 메모리 및 Authorization 헤더/쿠키로 짧게(15m) 유지하고, Refresh Token은 XSS 공격을 방지하기 위해 `httpOnly`, `secure`, `sameSite: 'lax'`가 적용된 쿠키에 보관합니다.
*   **API Rate Limit 방어:** 타 API(야후 Finance 등) 대량 호출 시 422, 429 에러를 피하기 위해 Nudge(Delay) 로직 및 요청 기간 바운더리를 최적화하여 구현했습니다.
