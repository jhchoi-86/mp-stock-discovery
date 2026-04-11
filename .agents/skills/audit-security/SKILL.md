---
name: audit-security
description: |
  MP Stock Discovery 코드베이스, 환경설정 파일, 커밋 이력을 자동 검사하여
  자격증명 누출(API 키, DB 비밀번호, JWT 시크릿), 취약한 인증 패턴, PII 개인정보 노출,
  SQL Injection, CORS 설정 오류, 구독 권한 우회 가능성을 탐지하고 해결책을 제시.
  신규 외부 API 연동, 배포 전 QA, security, 보안 키워드에 트리거됨.
---

# SKILL: audit-security
# Red-Team Verified: 2026-04-10 | Fixed: 6 defects

## 목표

MP Stock의 모든 코드 변경이 프로덕션 배포 전 보안 감사를 통과하도록 보장한다.
유사투자자문업 플랫폼으로서 구독자 금융 데이터 보호와 법적 준수를 최우선으로 한다.

---

## 보안 감사 체크리스트 (11개 영역)

### 영역 1 — 자격증명 누출 탐지 (FIX: 변수 할당 패턴 추가)

```bash
# 패턴 1: 직접 하드코딩 탐지
grep -rn --include="*.js" --include="*.cjs" --include="*.jsx" \
  -E "(appKey|appSecret|access_token|KIS_APP|DB_URL|REDIS_URL|TELEGRAM_TOKEN|JWT_SECRET|SOLAPI)" \
  . --exclude-dir=node_modules \
  | grep -v "process\.env\." \
  | grep -v "//.*FIX"

# 패턴 2: 변수 할당 후 사용 탐지 (process.env 제외 누락 우회)
grep -rn --include="*.cjs" --include="*.js" \
  -E "const (appKey|token|secret|key)\s*=" \
  . --exclude-dir=node_modules \
  | grep -v "process\.env"

# .env 파일 git 추적 여부 확인 (0줄이어야 정상)
git ls-files .env .env.* 2>/dev/null | wc -l
```

**허용 패턴:** `process.env.KIS_APP_KEY`
**금지 패턴:** `const appKey = "PSCD..."` (하드코딩), `const key = config.appKey` (간접 할당)

---

### 영역 2 — Prisma / SQL 인젝션 검사

```javascript
// ✅ 안전 — Prisma 파라미터 바인딩
const user = await prisma.user.findFirst({ where: { email: userInput } });

// ❌ 위험 — $queryRawUnsafe에 변수 직접 삽입
await prisma.$queryRawUnsafe(`SELECT * FROM users WHERE email = '${userInput}'`);
```

```bash
# $queryRawUnsafe 전체 사용 탐지
grep -rn "\$queryRawUnsafe" . --exclude-dir=node_modules
```

---

### 영역 3 — SSE 인증 토큰 검증 (FIX: req.query.type 취약점 수정)

```javascript
// ✅ SSE 인증 — JWT URL 파라미터 방식 (EventSource 헤더 불가)
app.get('/api/sse/signals', (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(401).end();

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (e) {
    return res.status(401).end();
  }

  // ✅ tier는 반드시 JWT payload에서 추출 (req.query 신뢰 금지)
  const userTier = decoded.tier;  // NOT req.query.type

  res.setHeader('Content-Type', 'text/event-stream');
  // ... SSE 스트림 시작
});

// ❌ 위험 — 클라이언트 조작 가능한 쿼리 파라미터로 tier 판단
const tier = req.query.type;  // SECURITY VULNERABILITY
```

```bash
# req.query.type/tier 사용 탐지
grep -rn "req\.query\.\(type\|tier\|role\)" . --include="*.cjs" --exclude-dir=node_modules
```

---

### 영역 4 — 구독 권한 우회 방지

```javascript
// ✅ tier 검증 — JWT payload 기반
const checkSignalAccess = (jwtTier, signalType) => {
  const TIER_ACCESS = {
    'free'     : ['WATCH'],
    'standard' : ['WATCH', 'NORMAL'],
    'premium'  : ['WATCH', 'NORMAL', 'STRONG']
  };
  return TIER_ACCESS[jwtTier]?.includes(signalType) ?? false;
};
```

```bash
# 신호 API 라우트 tier 검증 누락 탐지
grep -n "router\.get.*signal\|router\.post.*signal\|app\.get.*signal" server.cjs
```

---

### 영역 5 — PII 로그 노출 방지

```javascript
// ✅ 안전 로그 필터링
const safeLog = (label, data) => {
  const { password, token, email, phone, jwtSecret, ...safe } = data;
  console.log(`[${label}]`, safe);
};

// ❌ 위험 — 개인정보 평문 로그
console.log('User:', { email, password, phone });  // PII LEAK
```

```bash
# console.log에서 민감 정보 탐지
grep -rn "console\.log" . --include="*.cjs" --include="*.js" \
  --exclude-dir=node_modules \
  | grep -iE "email|phone|password|token|secret|jwt"
```

---

### 영역 6 — JWT 비밀키 보호 (FIX: 신규 추가)

```bash
# JWT_SECRET 하드코딩 탐지
grep -rn "jwt\.sign\|jwt\.verify" . --include="*.cjs" --exclude-dir=node_modules \
  | grep -v "process\.env\.JWT_SECRET"

# JWT 알고리즘 명시 확인 (none 알고리즘 취약점 방지)
grep -rn "jwt\.verify" . --include="*.cjs" --exclude-dir=node_modules
# → algorithm 옵션 명시 확인: jwt.verify(token, secret, { algorithms: ['HS256'] })
```

```javascript
// ✅ JWT 검증 — algorithm 명시 필수
jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });

// ❌ 위험 — algorithm 미명시 (none 알고리즘 허용됨)
jwt.verify(token, process.env.JWT_SECRET);
```

---

### 영역 7 — CORS 설정 검사 (FIX: 신규 추가)

```javascript
// ✅ 안전 — 명시적 도메인 화이트리스트
const corsOptions = {
  origin: [
    'https://mpstock.kr',
    'https://www.mpstock.kr',
    process.env.NODE_ENV === 'development' ? 'http://localhost:5173' : null
  ].filter(Boolean),
  credentials: true
};
app.use(cors(corsOptions));

// ❌ 위험 — 모든 도메인 허용
app.use(cors());           // wildcard 금지
app.use(cors({ origin: '*' }));  // wildcard 금지
```

```bash
# CORS wildcard 탐지
grep -rn "cors()" server.cjs
grep -rn "origin.*\*" server.cjs
```

---

### 영역 8 — Telegram/Solapi 토큰 보호

```bash
# 텔레그램 봇 토큰 패턴 탐지
grep -rPn "\d{8,10}:AA[A-Za-z0-9_-]{35}" . --exclude-dir=node_modules

# Solapi API Key/Secret 패턴 탐지 (환경변수 외부 사용)
grep -rn "SOLAPI" . --include="*.cjs" --include="*.js" --exclude-dir=node_modules \
  | grep -v "process\.env"
```

---

### 영역 9 — 유사투자자문업 법적 준수 검사

```bash
# 투자 지시 문구 탐지 (법적 위반 가능)
grep -rn \
  -E "(매수하세요|매도하세요|지금 사세요|매수 추천|매도 추천|투자를 권합니다|꼭 사야|강력 추천)" \
  . --include="*.js" --include="*.jsx" --include="*.cjs" --include="*.json" \
  --exclude-dir=node_modules
```

**허용 표현:** "매수 신호 감지됨", "기술적 수축 구간 진입", "BBW 강신호 발생"
**금지 표현:** "지금 매수하세요", "이 종목을 추천합니다", "반드시 매수할 것"

---

### 영역 10 — 의존성 취약점 스캔

```bash
npm audit --audit-level=high
npm audit fix --dry-run
```

---

### 영역 11 — .gitignore 등록 확인 (FIX: 패턴 확장)

```bash
# 반드시 .gitignore에 있어야 할 항목들
required_ignores=(
  ".env"
  ".env.local"
  ".env.production"
  ".env.staging"
  ".env.test"
  "*.key"
  "*.pem"
  "signals.json.bak"
  "audit-report-*.txt"
)

echo "=== .gitignore 등록 확인 ==="
for item in "${required_ignores[@]}"; do
  if grep -q "$item" .gitignore 2>/dev/null; then
    echo "✅ $item"
  else
    echo "❌ MISSING: $item — .gitignore에 즉시 추가 필요"
  fi
done
```

---

## 자동 감사 스크립트 생성 (FIX: 스크립트 파일 생성 지침)

```bash
# scripts/security-audit.js 파일이 없을 경우 에이전트가 직접 생성
cat > scripts/security-audit.js << 'SCRIPT'
#!/usr/bin/env node
const { execSync } = require('child_process');

const checks = [
  { name: '하드코딩 자격증명', cmd: "grep -rn --include='*.js' --include='*.cjs' -E '(appKey|appSecret)\\s*=' . --exclude-dir=node_modules | grep -v 'process\\.env'" },
  { name: '$queryRawUnsafe 사용', cmd: "grep -rn '\\$queryRawUnsafe' . --exclude-dir=node_modules" },
  { name: 'CORS wildcard', cmd: "grep -rn 'cors()' server.cjs" },
  { name: '투자 지시 문구', cmd: "grep -rn -E '(매수하세요|매도하세요)' . --include='*.js' --exclude-dir=node_modules" }
];

let totalIssues = 0;
for (const check of checks) {
  try {
    const result = execSync(check.cmd, { encoding: 'utf8' }).trim();
    if (result) {
      console.error(`❌ [${check.name}]\n${result}\n`);
      totalIssues++;
    } else {
      console.log(`✅ ${check.name}`);
    }
  } catch { console.log(`✅ ${check.name}`); }
}

console.log(`\n총 발견 이슈: ${totalIssues}건`);
process.exit(totalIssues > 0 ? 1 : 0);
SCRIPT
echo "scripts/security-audit.js 생성 완료"
```

---

## 심각도별 대응 기준

| 심각도 | 예시 | 대응 |
|--------|------|------|
| 🔴 CRITICAL | API 키 하드코딩, JWT_SECRET 노출, DB URL 노출 | 즉시 작업 중단, 키 교체 필수 |
| 🟠 HIGH | 인증 없는 SSE, SQL Injection, CORS wildcard | 배포 차단, 당일 수정 |
| 🟡 MEDIUM | PII 로그, tier 쿼리 파라미터, JWT algorithm 미명시 | 다음 스프린트 수정 |
| 🟢 LOW | 불필요한 주석, 오래된 의존성 | 백로그 등록 |

---

## 퀄리티 체크리스트

```
[ ] 자격증명 누출 (직접 + 변수 할당 패턴) → 0건
[ ] SQL Injection ($queryRawUnsafe) → 0건
[ ] SSE 인증 — JWT URL 파라미터 방식 확인
[ ] tier 판단 — JWT payload 추출 (req.query 미사용) 확인
[ ] JWT algorithm 명시 (algorithms: ['HS256']) 확인
[ ] CORS — 명시적 도메인 화이트리스트 적용 확인
[ ] PII 로그 노출 → 0건
[ ] Telegram/Solapi 토큰 노출 → 0건
[ ] 투자 지시 문구 → 0건
[ ] npm audit HIGH 이상 → 0건
[ ] .gitignore — .env.staging, .env.test 포함 확인
[ ] scripts/security-audit.js 존재 및 실행 가능 확인
```

---

*Skill Level: 4 (Tool & Validation) | Red-Team Verified | MP Stock Discovery v3.0*
