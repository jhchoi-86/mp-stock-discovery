# 🚀 MP 리서치 툴: 단계별 워크플로우 구현 설계서 (V1.1 개선판)

본 문서는 Antigravity 환경에서 SaaS 전환을 위한 백엔드 워크플로우(API 로직)를 구현하는 순서를 정의합니다. 보안성(세션 무효화)과 관리자 편의성이 대폭 강화되었습니다.

---

## 🛠️ Step 1. 기초 공사 (데이터 모델 및 환경 설정)

### 1.1 데이터베이스 테이블 준비
- `users` : 사용자 마스터 정보 및 상태(role, status)
- `refresh_tokens` : **[신규]** 기기별 세션 제어 및 토큰 무효화를 위한 테이블 (user_id, token, expires_at, is_revoked)
- `usage_logs` : 일일 API/기능 사용량 트래킹
- `audit_logs` : 관리자 권한 변경 등의 감사 로그

### 1.2 환경 변수(ENV) 등록
하드코딩을 피하기 위해 Antigravity 설정에 다음 변수들을 등록합니다.
- `JWT_ACCESS_SECRET` / `JWT_ACCESS_EXPIRES_IN` (예: 15m)
- `JWT_REFRESH_SECRET` / `JWT_REFRESH_EXPIRES_IN` (예: 7d)
- `CLIENT_URL` (CORS 및 쿠키 도메인 설정용)

---

## 🔐 Step 2. 인증 워크플로우 (Authentication Flows)

### [WF-AUTH-01] 이메일 회원가입 (`POST /api/auth/register`)
- **트리거:** 프론트엔드에서 이메일, 비밀번호, 이름 전송
- **노드(Node) 구성 순서:**
  1. **[Condition]** 이메일 형식 및 비밀번호 길이(8자 이상) 유효성 검사. (실패 시 400 Bad Request)
  2. **[DB Query]** `users` 테이블에서 동일 `email` 존재 여부 확인. (존재 시 409 Conflict)
  3. **[Crypto]** 비밀번호를 Bcrypt로 단방향 해싱(Hash).
  4. **[DB Insert]** `users` 테이블에 새 레코드 추가 (기본 `role`: `FREE_USER`).
  5. **[Response]** 가입 완료 메시지 및 201 Created 반환.

### [WF-AUTH-02] 로그인 및 세션 생성 (`POST /api/auth/login`)
- **트리거:** 프론트엔드에서 이메일, 비밀번호 전송
- **노드(Node) 구성 순서:**
  1. **[DB Query]** `email`로 `users` 테이블 조회. (없으면 401 Unauthorized)
  2. **[Condition]** 계정 `status`가 `SUSPENDED`인지 확인. (맞으면 403 Forbidden)
  3. **[Crypto]** 입력된 비밀번호와 DB의 `password_hash` 비교. (불일치 시 401)
  4. **[JWT Sign]** `user_id`, `role`을 담아 Access Token 발급.
  5. **[JWT Sign]** `user_id`를 담아 Refresh Token 발급.
  6. **[DB Insert]** 발급된 Refresh Token을 `refresh_tokens` 테이블에 저장 (토큰 탈취 대비 및 기기 제어용).
  7. **[DB Update]** `users` 테이블의 `last_login_at` 현재 시간으로 갱신.
  8. **[Response]** - Header: `Set-Cookie`로 Refresh Token 주입 (HttpOnly, Secure, SameSite=Strict).
     - Body: Access Token 및 유저 정보 JSON 반환.

### [WF-AUTH-03] 로그아웃 (`POST /api/auth/logout`) **[신규]**
- **트리거:** 사용자가 로그아웃 버튼 클릭
- **노드(Node) 구성 순서:**
  1. **[Header Parse]** Cookie에서 Refresh Token 추출.
  2. **[DB Update]** `refresh_tokens` 테이블에서 해당 토큰을 찾아 `is_revoked = true`로 변경 (세션 무효화).
  3. **[Response]** Cookie의 Refresh Token 만료 시간을 과거로 설정하여 브라우저에서 삭제하도록 응답.

### [WF-AUTH-04] 토큰 자동 갱신 (`POST /api/auth/refresh`)
- **트리거:** 프론트엔드 Interceptor에서 Access Token 만료 시 자동 호출
- **노드(Node) 구성 순서:**
  1. **[Header Parse]** Cookie에서 Refresh Token 추출. (없으면 401)
  2. **[JWT Verify]** Refresh Token 유효성 검증.
  3. **[DB Query]** `refresh_tokens` 테이블에서 해당 토큰이 존재하고 `is_revoked == false`인지 확인. (실패 시 401 및 재로그인 요구)
  4. **[JWT Sign]** 새로운 Access/Refresh Token 발급 (RTR 기법).
  5. **[DB Update]** 기존 Refresh Token은 `is_revoked = true` 처리, 새 토큰 Insert.
  6. **[Response]** 새 쿠키 설정 및 새 Access Token 반환.

---

## 🛡️ Step 3. 공통 미들웨어 워크플로우 (Guard & Rate Limiting)

### [WF-MW-01] 권한 및 사용량 검증 (서브 플로우)
- **입력 파라미터:** `action_type`, `required_role`
- **노드(Node) 구성 순서:**
  1. **[Header Parse]** `Authorization: Bearer <token>`에서 Access Token 추출 및 Verify.
  2. **[Condition]** 토큰의 `role`이 `required_role`을 충족하는지 확인. (`ADMIN`은 무조건 통과)
  3. **[Config/Variable]** 등급에 따른 일일 한도 설정 (예: `FREE_USER`=5회, `PRO_USER`=50회).
  4. **[DB Query]** `usage_logs` 테이블에서 (오늘 날짜, `user_id`, `action_type`) 기준 카운트 조회.
  5. **[Condition]** 카운트가 한도에 도달했으면 429 Too Many Requests 반환 (프로세스 중단).
  6. **[DB Upsert]** 한도 미만이면 카운트 +1 업데이트.
  7. **[Success]** 검증 통과, 호출한 메인 플로우로 복귀.

---

## 📊 Step 4. 비즈니스 로직 적용 예시

### [WF-BIZ-01] 프리미엄 리포트 다운로드 (`GET /api/reports/download`)
- **노드(Node) 구성 순서:**
  1. **[Call Sub-Workflow]** `[WF-MW-01]` 호출 (Param: `action_type='DOWNLOAD'`, `required_role='FREE_USER'`).
  2. **[DB Query]** 시그널 데이터 및 분석 로직 실행.
  3. **[Format]** 마크다운(MD) 또는 CSV 포맷으로 데이터 변환.
  4. **[Response]** 파일 스트림 또는 다운로드 URL 반환.

---

## 🛠️ Step 5. 관리자 전용 워크플로우 (Admin Flows)

### [WF-ADMIN-01] 전체 유저 목록 조회 (`GET /api/admin/users`) **[신규]**
- **트리거:** 관리자 대시보드 진입
- **노드(Node) 구성 순서:**
  1. **[Call Sub-Workflow]** `[WF-MW-01]` 호출 (Param: `required_role='ADMIN'`).
  2. **[DB Query]** `users` 테이블 목록 조회 (Pagination, Status/Role 필터링 포함).
  3. **[Response]** 유저 리스트 JSON 반환.

### [WF-ADMIN-02] 사용자 등급/상태 변경 (`PUT /api/admin/users/:id/status`)
- **트리거:** 대시보드에서 권한 변경(PRO 부여) 또는 계정 정지(SUSPEND) 클릭
- **노드(Node) 구성 순서:**
  1. **[Call Sub-Workflow]** `[WF-MW-01]` 호출 (Param: `required_role='ADMIN'`).
  2. **[DB Update]** Path 파라미터로 받은 대상 `user_id`의 `role` 또는 `status` 갱신.
  3. **[DB Insert]** `audit_logs` 테이블에 변경 내역 기록 (누가, 누구를, 어떻게 변경했는지).
  4. **[Response]** 200 OK 반환.