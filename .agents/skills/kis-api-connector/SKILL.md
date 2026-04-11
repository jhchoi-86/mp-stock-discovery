---
name: kis-api-connector
description: |
  한국투자증권(KIS) Open API 연동 작업 전반을 처리하는 스킬.
  토큰 발급/갱신, 주식 시세 조회, 실시간 체결 데이터 수신,
  rate limit 관리, OAuth 인증 오류 처리에 트리거됨.
  KIS API, access_token, approval_key, rate limit 오류 발생 시 호출.
---

# SKILL: kis-api-connector
# Red-Team Verified: 2026-04-10 | Fixed: 5 defects

## 목표

KIS API와의 안전하고 안정적인 연결을 유지한다.
토큰 만료, rate limit 초과, 네트워크 단절 상황을 자동 복구한다.
Thundering herd(동시 토큰 갱신) 문제를 Mutex로 원천 차단한다.

---

## 필수 패키지 및 유틸 선언

```javascript
// ✅ 반드시 최상단에 선언 (누락 시 런타임 에러)
const Bottleneck = require('bottleneck');
const { Mutex } = require('async-mutex');
const { sleep } = require('./utils/common.cjs');  // 공통 유틸에서 import

const redis = require('./redis.cjs');  // Redis 클라이언트
```

---

## KIS API 기본 설정

```javascript
// ✅ 환경변수 (하드코딩 절대 금지 — 모두 .env 관리)
const KIS_CONFIG = {
  baseUrl   : process.env.KIS_BASE_URL,    // https://openapi.koreainvestment.com:9443
  appKey    : process.env.KIS_APP_KEY,
  appSecret : process.env.KIS_APP_SECRET,
  accountNo : process.env.KIS_ACCOUNT_NO,
  mockMode  : process.env.KIS_MOCK === 'true'
};
```

---

## 토큰 발급 및 자동 갱신 (Thundering Herd 방지)

```javascript
// ✅ Mutex로 동시 토큰 갱신 문제 해결 (FIX: thundering herd)
const tokenMutex = new Mutex();

async function getAccessToken() {
  // 1차: 캐시 확인 (Mutex 밖에서 빠른 조회)
  const cached = await redis.get('kis:access_token');
  if (cached) return cached;

  // 2차: Mutex 획득 후 재확인 (다른 요청이 먼저 갱신했을 수 있음)
  const release = await tokenMutex.acquire();
  try {
    const doubleCheck = await redis.get('kis:access_token');
    if (doubleCheck) return doubleCheck;  // Double-checked locking

    const response = await fetch(`${KIS_CONFIG.baseUrl}/oauth2/tokenP`, {
      method  : 'POST',
      headers : { 'Content-Type': 'application/json' },
      body    : JSON.stringify({
        grant_type : 'client_credentials',
        appkey     : KIS_CONFIG.appKey,
        appsecret  : KIS_CONFIG.appSecret
      })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(`Token issue failed: ${err.msg1}`);
    }

    const { access_token, expires_in } = await response.json();
    // TTL: 만료 10분 전 갱신을 위해 600초 차감
    await redis.setex('kis:access_token', expires_in - 600, access_token);
    return access_token;

  } finally {
    release();  // 반드시 해제
  }
}
```

---

## Rate Limit 준수 래퍼

```javascript
// ✅ Bottleneck: 초당 20건 상한 (50ms 간격)
const kisRateLimiter = new Bottleneck({ minTime: 50, maxConcurrent: 20 });

// ✅ 재귀 대신 반복문으로 재시도 (FIX: 스택 오버플로우 방지)
const kisApiCall = kisRateLimiter.wrap(async (endpoint, params, maxRetries = 3) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const token = await getAccessToken();

    const response = await fetch(`${KIS_CONFIG.baseUrl}${endpoint}`, {
      headers: {
        'Authorization' : `Bearer ${token}`,
        'appkey'        : KIS_CONFIG.appKey,
        'appsecret'     : KIS_CONFIG.appSecret,
        'tr_id'         : params.tr_id,
        'custtype'      : 'P'
      }
    });

    if (response.status === 429) {
      // rate limit 초과 → 지수 백오프 후 재시도 (재귀 금지)
      const wait = attempt * 1000;
      console.warn(`[KIS] Rate limit hit. Waiting ${wait}ms (attempt ${attempt}/${maxRetries})`);
      await sleep(wait);
      continue;
    }

    const data = await response.json();

    if (data.rt_cd === '1') {  // KIS 에러 코드
      await handleKisError(data.msg_cd, data.msg1);
    }

    return data;
  }
  throw new Error(`[KIS] Max retries(${maxRetries}) exceeded for ${endpoint}`);
});
```

---

## 주요 TR_ID 참조표

| 기능 | TR_ID (실전) | TR_ID (모의) |
|------|------------|------------|
| 주식 현재가 조회 | `FHKST01010100` | `FHKST01010100` |
| 주식 일봉 조회 | `FHKST03010100` | `FHKST03010100` |
| 실시간 체결 구독 | `H0STCNT0` | `H0STMCNT0` |
| 주식 잔고 조회 | `TTTC8434R` | `VTTC8434R` |
| 매수 가능 조회 | `TTTC8908R` | `VTTC8908R` |

> TR_ID는 실전/모의 구분 필수. mockMode 값으로 자동 선택하는 헬퍼 함수 사용 권장.

---

## 에러 처리

```javascript
const KIS_ERROR_CODES = {
  'EGW00123': '토큰 만료',
  'EGW00121': '앱키 오류',
  'EGW00201': 'rate limit 초과',
  'EGW00404': '종목 코드 오류'
};

async function handleKisError(errorCode, message) {
  const desc = KIS_ERROR_CODES[errorCode] ?? '알 수 없는 오류';
  console.error(`[KIS ERROR] ${errorCode}: ${desc} — ${message}`);

  if (errorCode === 'EGW00123') {
    // 토큰 만료 → 캐시 무효화 후 재발급 (Mutex가 thundering herd 방지)
    await redis.del('kis:access_token');
    return getAccessToken();
  }
  throw new Error(`KIS API Error [${errorCode}]: ${desc}`);
}
```

---

## 단계별 실행 지침

### STEP 1 — 연결 상태 점검

```bash
# Redis 토큰 유효성 확인
redis-cli get kis:access_token | head -c 20

# API 헬스 체크 (모의투자)
KIS_MOCK=true node -e "
const { kisApiCall } = require('./analyzer.cjs');
kisApiCall('/uapi/domestic-stock/v1/quotations/inquire-price', {
  tr_id: 'FHKST01010100',
  fid_cond_mrkt_div_code: 'J',
  fid_input_iscd: '005930'
}).then(d => console.log(d.output?.stck_prpr, '원')).catch(console.error);
"
```

### STEP 2 — Thundering Herd 테스트

```bash
# 5개 동시 요청으로 토큰 갱신 경합 테스트
node -e "
const { getAccessToken } = require('./analyzer.cjs');
Promise.all(Array(5).fill(null).map(() => getAccessToken()))
  .then(tokens => {
    const unique = new Set(tokens);
    console.log('발급된 고유 토큰 수 (1이어야 정상):', unique.size);
  });
"
```

### STEP 3 — Rate Limit 모니터링

```bash
# API 호출 카운터 실시간 모니터링
node -e "
const redis = require('./redis.cjs');
setInterval(async () => {
  const count = await redis.get('kis:api_call_count') ?? 0;
  process.stdout.write('\r[KIS] 초당 호출 수: ' + count + '  ');
}, 1000);
"
```

---

## 퀄리티 체크리스트

```
[ ] .env에 KIS_BASE_URL, KIS_APP_KEY, KIS_APP_SECRET, KIS_ACCOUNT_NO 등록 확인
[ ] Bottleneck, async-mutex package.json 의존성 등록 확인
[ ] utils/common.cjs에서 sleep import 확인
[ ] 모의투자 모드(KIS_MOCK=true) 연결 테스트 통과
[ ] Redis 토큰 캐시 TTL (expires_in - 600) 확인
[ ] Thundering herd 테스트 — 고유 토큰 수 = 1 확인
[ ] rate limit 초과 시 반복문 재시도 (재귀 없음) 확인
[ ] 토큰 만료(EGW00123) 자동 갱신 확인
[ ] TR_ID 실전/모의 자동 선택 로직 확인
```

---

*Skill Level: 4 (Tool & Validation) | Red-Team Verified | MP Stock Discovery v3.0*
