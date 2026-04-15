# SKILL: Security & Credentials
# MP Stock Discovery v9.4.25 | MetaPrompt Studio
# Rev: Blue/Red Team Audit v1.1
# 적용 범위: .env, JWT, tdrGate.cjs, 로그 마스킹, AWS IAM 관련 모든 작업

---

## 🎯 이 스킬을 사용할 때

Claude Code가 다음 작업을 요청받은 경우 이 스킬을 먼저 참조:
- 환경변수(.env) 관련 코드 작성
- JWT 인증 로직 수정
- tdrGate.cjs 변경
- 로그 출력 코드 작성
- AWS SDK 코드 작성
- Telegram Bot API 코드 작성
- 새로운 API 키/시크릿 추가

---

## 🚨 과거 크레덴셜 노출 이력 (최우선 주의)

| 항목 | 노출 경로 | 조치 상태 |
|------|----------|----------|
| Telegram Token | 코드 하드코딩 | 교체 완료 |
| JWT Secret | 코드 하드코딩 | 교체 완료 |
| DB Password | 코드 하드코딩 | 교체 완료 |
| AWS Key Pair | 코드 하드코딩 | 교체 완료 |

> 🔴 신규 코드 작성 시 위 항목 반드시 .env 참조 여부 1차 확인 후 진행

---

## 🔑 .env 필수 키 전체 목록

```bash
# 인증
TDR_SECRET=...            # TDR HMAC 서명 키
JWT_SECRET=...            # SSE 인증 토큰 서명 키

# 한국투자증권 KIS API
KIS_APP_KEY=...           # KIS API Key
KIS_APP_SECRET=...        # KIS API Secret

# 데이터베이스
DATABASE_URL=...          # PostgreSQL 연결 문자열

# 캐시 / 큐
REDIS_URL=...             # Redis 연결 문자열

# 알림
TELEGRAM_TOKEN=...        # 텔레그램 봇 토큰
TELEGRAM_CHAT_ID=...      # 텔레그램 채널/채팅 ID (.env 전용)

# AWS
AWS_ACCESS_KEY_ID=...     # AWS IAM Access Key
AWS_SECRET_ACCESS_KEY=... # AWS IAM Secret Key
```

**규칙:**
- 코드 내 값 직접 작성 절대 금지
- 신규 키 추가 시 `.env.example`에도 키 이름(값 없이) 반드시 추가
- `console.log()` 등 로그에 env 변수 값 출력 금지

---

## 🛡️ tdrGate.cjs — 규제 게이트

### 동작 원리 (정확한 순서)
```
KIS API 시세 수신
    ↓
analyzer.cjs (BBW/DHH2 계산)
    ↓
scorer.cjs (Grade 산정)
    ↓
tdrGate.cjs ← 규제 게이트 위치
    ├── HMAC 서명 검증 (TDR_SECRET)
    ├── AI 이상감지 분석
    ↓ (이상 감지 시)
    Fail-Closed → 500ms 내 신호 차단
    ↓ (정상)
signals.json 저장 → SSE 브로드캐스트
```

> ⚠️ tdrGate는 analyzer.cjs 이후, signals.json 저장 이전에 위치

### 절대 금지 사항
- tdrGate 우회 코드 작성 금지 (조건문으로 게이트 스킵하는 패턴)
- HMAC 검증 로직 약화/제거 금지
- 500ms 타임아웃 값 임의 증가 금지

### 오탐(False Positive) 복구 절차
```bash
# 1. 게이트 상태 로그 확인
pm2 logs server --lines 100

# 2. 프로세스 재시작
pm2 restart server

# 3. 게이트 정상화 확인
pm2 monit
```

---

## 🔐 SSE JWT 인증

```javascript
// ✅ 올바른 방식 — URL 파라미터로 전달
const eventSource = new EventSource(`/api/stream?token=${jwt}`);

// ❌ 잘못된 방식 — EventSource는 custom header 불가
// new EventSource('/api/stream', { headers: { Authorization: ... } });
```

### 로그 마스킹 필수 패턴
```javascript
// ✅ 토큰 마스킹 처리
const safeUrl = req.url.replace(/token=[^&]+/, 'token=***MASKED***');
console.log(`Request: ${safeUrl}`);

// ❌ 절대 금지 — 토큰 평문 로그 출력
console.log(`Request: ${req.url}`); // URL에 JWT 포함 시 노출
```

---

## ☁️ AWS IAM 최소권한 원칙

- EC2 인스턴스 역할: 필요한 서비스(S3, CloudWatch 등)만 최소 권한 부여
- 코드에서 IAM 권한 확장 요청 로직 작성 금지
- 보안그룹 수정 코드 생성 시 반드시 특정 포트/IP 명시 (0.0.0.0/0 전체 개방 금지)

---

## ⚖️ 법적 컴플라이언스

- 유사투자자문업 금융위원회 신고 사업체
- 모든 신호는 참고용 — 투자 판단 및 손익은 사용자 책임

**생성 금지 문구**: "매수 추천", "수익 보장", "확실한 수익", "투자 권유", "지금 사세요"

**표준 면책 문구 (반드시 사용):**
```
"본 신호는 참고용이며 투자 판단 및 손익은 전적으로 본인 책임입니다."
"MP Stock 신호는 정보 제공 목적이며 투자 권유가 아닙니다."
```

---

## 📋 보안 코드 작성 체크리스트

```bash
# 전체 크레덴셜 하드코딩 스캔 (JS/CJS/Python 포함)
grep -rn "KIS_\|JWT_\|TDR_\|TELEGRAM\|AWS_\|DATABASE_URL\|REDIS_URL" \
  --include="*.js" --include="*.cjs" --include="*.py" . \
  | grep -v "process.env\|\.env\|#\|//"
```

- [ ] 환경변수 하드코딩 없음 (위 스캔 명령 실행)
- [ ] Python 파일(.py)도 스캔 대상 포함 확인
- [ ] 로그 출력에 토큰/키 마스킹 처리
- [ ] tdrGate 우회 패턴 없음
- [ ] .env.example 업데이트 (TELEGRAM_CHAT_ID 포함)
- [ ] AWS IAM 최소권한 준수
- [ ] 면책 문구 포함, 투자 권유 문구 없음
