# 📄 PRD: MP 리서치 툴 회원 및 사용량 관리 시스템 (SaaS V1.0)

## 1. 문서 개요
- **프로젝트명:** MP KOSPI/KOSDAQ 리서치 툴 SaaS 전환 (Phase 1)
- **작성일:** 2026-03-17
- **목표:** 단일 사용자용 주식 시그널 분석 웹앱을 다중 사용자 기반의 SaaS 형태로 전환하기 위한 회원 인증, 권한 제어(RBAC), 앱 사용량 추적 시스템 구축.
- **개발 환경:** Antigravity (Data Table, Workflow, UI Builder 연동)
- **비고:** 본 Phase 1에서는 결제(Billing) 시스템을 제외하며, 향후 확장성을 고려하여 스키마를 설계함.

---

## 2. 사용자 권한 정책 (RBAC)

시스템은 총 4단계의 사용자 등급(Role)을 가지며, 등급별로 접근 가능한 UI와 API가 제한됩니다.

| Role | 권한 수준 | 주요 접근 권한 및 제한 |
| :--- | :--- | :--- |
| **GUEST** | 미인증 사용자 | 로그인/회원가입 페이지, 랜딩 페이지 접근만 가능 |
| **FREE_USER** | 가입 완료/무료 | 지연된 시그널 리포트 조회 (일일 조회 횟수 제한: 5회) |
| **PRO_USER** | VIP/유료 사용자 | 실시간 시그널 조회, 텔레그램 발송 기능 (일일 횟수 제한: 50회) |
| **ADMIN** | 시스템 관리자 | 모든 데이터 접근, 전체 유저 목록 조회, 권한 수동 변경, 계정 정지 |

---

## 3. 핵심 기능 요구사항 (Functional Requirements)

### 3.1. 인증 및 인가 (Auth & Security)
- **이메일 회원가입/로그인:** Bcrypt 방식의 비밀번호 단방향 암호화 처리.
- **토큰 기반 세션 관리:** Access Token(단기)과 Refresh Token(장기, HttpOnly 쿠키) 구조 구현.
- **소셜 로그인 연동:** Google OAuth 2.0 지원 (Antigravity Auth 플러그인 또는 사용자 정의 워크플로우 활용).
- **접근 제어 (Middleware/Guard):** 각 API 및 UI 라우팅 시 사용자 Role을 검증하여 권한 밖 요청(403 Forbidden) 차단.

### 3.2. 사용량 제어 (Rate Limiting & Usage Tracking)
- **일일 사용량 카운팅:** 사용자가 특정 액션(리포트 다운로드, 텔레그램 발송 등)을 수행할 때마다 카운트 증가.
- **제한 초과 차단:** 지정된 일일 한도 초과 시 API 요청을 차단하고 프론트엔드에 `429 Too Many Requests` 상태 코드 및 안내 메시지 반환.
- **초기화:** 매일 자정(KST 00:00)을 기준으로 사용량 카운트 초기화.

### 3.3. 관리자 대시보드 (Admin Panel)
- **회원 관리:** 가입된 전체 사용자 목록, 현재 등급, 최근 로그인 일자 조회.
- **권한 수동 제어:** 특정 사용자의 Role을 `FREE_USER` ↔ `PRO_USER`로 변경.
- **감사 로그:** 관리자가 사용자의 권한을 변경하거나 정지시킨 내역을 시스템 로그로 기록.

---

## 4. 데이터 모델 설계 (Database Schema)

Antigravity의 데이터베이스(Data Tables)에 생성할 테이블 명세입니다.

### 4.1. `users` (사용자 마스터)
| 필드명 | 타입 | 필수 | 설명 |
| :--- | :--- | :---: | :--- |
| `id` | UUID | Y | PK |
| `email` | String | Y | Unique (로그인 ID) |
| `password_hash` | String | N | 소셜 가입자의 경우 Null 허용 |
| `name` | String | Y | 사용자 이름 |
| `role` | Enum | Y | `FREE_USER`, `PRO_USER`, `ADMIN` (Default: `FREE_USER`) |
| `status` | Enum | Y | `ACTIVE`, `SUSPENDED`, `DELETED` |
| `last_login_at` | Timestamp | N | 최근 로그인 시간 |
| `created_at` | Timestamp | Y | 가입일시 |

### 4.2. `auth_providers` (소셜 로그인 연동)
| 필드명 | 타입 | 필수 | 설명 |
| :--- | :--- | :---: | :--- |
| `id` | UUID | Y | PK |
| `user_id` | UUID | Y | FK (`users.id`) |
| `provider` | String | Y | 예: `google`, `kakao` |
| `provider_uid` | String | Y | 소셜 서비스에서 제공하는 고유 식별자 |

### 4.3. `usage_logs` (일일 사용량 트래킹)
> **Note:** Antigravity에서 Redis 캐싱 노드를 지원하는 경우 인메모리로 처리하고, 미지원 시 아래 물리 테이블을 활용하여 통계를 냅니다.

| 필드명 | 타입 | 필수 | 설명 |
| :--- | :--- | :---: | :--- |
| `id` | UUID | Y | PK |
| `user_id` | UUID | Y | FK (`users.id`) |
| `action_type` | String | Y | 예: `VIEW_REPORT`, `SEND_TELEGRAM` |
| `usage_count` | Integer | Y | 사용 횟수 |
| `log_date` | Date | Y | 기준 일자 (YYYY-MM-DD) |

### 4.4. `audit_logs` (관리자 감사 로그)
| 필드명 | 타입 | 필수 | 설명 |
| :--- | :--- | :---: | :--- |
| `id` | UUID | Y | PK |
| `admin_id` | UUID | Y | FK (`users.id` - 관리자) |
| `target_user_id` | UUID | Y | FK (`users.id` - 대상 유저) |
| `action` | String | Y | 예: `UPDATE_ROLE`, `SUSPEND_ACCOUNT` |
| `details` | JSON | N | 변경 전/후 데이터 상세 |
| `created_at` | Timestamp | Y | 발생일시 |

---

## 5. 핵심 워크플로우 설계 (Antigravity Action Flows)

Antigravity에서 API 엔드포인트 역할을 할 핵심 Action Workflow 흐름입니다.

### 5.1. 가입 및 로그인 흐름 (Auth Flow)
1. **[POST] /api/auth/register:** 이메일 중복 체크 → 비밀번호 해싱 → `users` 테이블 인서트 → 성공 응답.
2. **[POST] /api/auth/login:** 계정 존재 여부 및 상태(`ACTIVE`) 확인 → 비밀번호 검증 → Access/Refresh 토큰 발급 → Refresh 토큰은 쿠키로 세팅, Access 토큰은 JSON 응답.

### 5.2. 사용량 체크 미들웨어 흐름 (Usage Check Flow)
> 리포트 다운로드 등 제한이 있는 기능 실행 전에 공통으로 통과하는 워크플로우
1. 요청 헤더의 Access Token 검증.
2. `users.role` 확인. (`ADMIN`은 무제한 패스)
3. 해당 일자(`log_date`), 유저(`user_id`), 기능(`action_type`)으로 `usage_logs` 조회.
4. 카운트가 등급별 허용치 미만이면 통과 및 `usage_count` +1 업데이트.
5. 카운트 초과 시 에러 반환 (`429 Too Many Requests`).

### 5.3. 관리자 권한 변경 흐름 (Admin Action Flow)
1. 요청 헤더 토큰 검증 및 `role === 'ADMIN'` 체크.
2. 대상 `user_id`의 `role` 필드 업데이트 (`users` 테이블).
3. `audit_logs` 테이블에 내역 인서트.
4. (선택) 대상 사용자에게 권한 변경 알림 이메일 발송.

---

## 6. 보안 및 확장성 고려사항 (DevSecOps)
- **Idempotency (멱등성):** 동일한 권한 변경 요청이나 카운트 증가가 네트워크 지연으로 중복 발생하지 않도록 트랜잭션 처리 혹은 중복 키 방어 로직 적용 필요.
- **RTR (Refresh Token Rotation):** 보안 강화를 위해 Refresh Token을 사용하여 새 Access Token을 발급받을 때, Refresh Token도 함께 갱신하여 1회용으로만 사용되게 처리.
- **결제 시스템 확장성:** 추후 `subscriptions` 테이블을 추가하고, 유저 테이블에 `subscription_id` FK만 연결하면 구조 변경 없이 PRO_USER 등급을 결제 상태와 동기화할 수 있음.