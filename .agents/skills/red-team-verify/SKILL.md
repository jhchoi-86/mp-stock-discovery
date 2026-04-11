---
name: red-team-verify
description: |
  MP Stock Discovery의 모든 주요 로직 변경, 신규 기능 배포 전에 수행하는
  다단계 레드팀 검증 사이클 스킬. 적대적 리뷰(Adversarial Review)와
  RARV(Reason-Act-Reflect-Verify) 사이클을 결합하여 논리 결함,
  엣지 케이스, 성능 병목을 사전 탐지한다.
  배포 전 검증, 레드팀, 로직 검증, QA 키워드에 트리거됨.
---

# SKILL: red-team-verify
# Red-Team Verified: 2026-04-10 | Fixed: 5 defects

## 목표

"작동하는 것처럼 보이는 코드"와 "실제로 안전하고 정확한 코드"를 구분한다.
모든 핵심 로직은 이 스킬의 9단계 품질 게이트를 통과해야 프로덕션 배포 자격을 얻는다.

---

## RARV 검증 사이클

```
Reason  → 변경 목적과 예상 효과를 명시적으로 선언
Act     → 실제 코드/로직 변경 적용
Reflect → 과거 데이터와 엣지 케이스로 역검증
Verify  → 정량적 기준 대비 결과 측정
```

---

## Phase 1 — 적대적 리뷰 (Adversarial Review)

### 페르소나 A: 가혹한 시니어 엔지니어

```
역할: 매사 비판적이며 모든 코드에 심각한 결함이 있다고 확신하는 15년 경력자.
임무: 제출된 코드/로직의 최악의 시나리오를 찾아내고 맹렬히 공격한다.
금지: 어떠한 칭찬도 하지 않는다. 오직 결함 목록만 생성한다.
```

**공격 체크리스트:**
```
[ ] 입력값 검증 누락으로 인한 크래시 가능성
[ ] 비동기 처리 오류 (await 누락, race condition)
[ ] 메모리 누수 (이벤트 리스너 미해제 — off() 미호출, setInterval 미정리)
[ ] API 실패 시 폴백 로직 부재
[ ] 엣지 케이스: 빈 배열, null, undefined, 0, 음수, NaN
[ ] 신호 데이터 누락 시 UI 무한 로딩
[ ] Redis 연결 실패 시 서비스 전체 다운 가능성
[ ] KIS API 토큰 만료 동시 발생 (thundering herd) 처리 여부
[ ] sleep() 함수 utils/common.cjs에서 import 여부 (직접 정의 금지)
[ ] SSE 인증 — URL 토큰 방식인지 헤더 방식인지 확인
```

### 페르소나 B: 건설적 중재자 엔지니어

```
역할: 페르소나 A의 지적을 경청하고 현실적인 해결책을 제시하는 중재자.
임무: 각 결함에 대해 현재 스택(Node.js CJS / React)에서 즉시 구현 가능한 수정 코드 제안.
```

---

## Phase 2 — 9단계 품질 게이트 (전체 통과 전 배포 불가)

```
GATE 1  : ESLint 에러 0건 (JavaScript 기준)
GATE 2  : npm test — 전체 단위 테스트 통과
GATE 3  : 신호 로직 — 과거 30일 백테스트 정확도 기준치 대비 ±5% 이내
          → 기준치: 최근 릴리즈 직전 측정값 (scripts/baseline-accuracy.json에 기록 필수)
GATE 4  : KIS API mock 연동 — 모든 TR_ID 응답 정상 처리
GATE 5  : Redis 캐시 hit/miss 정합성 — 예상값과 일치
GATE 6  : SSE 재연결 — 3회 retry + 지수 backoff + fatalError UI 동작 확인
GATE 7  : audit-security 스킬 — 자격증명 누출 0건
GATE 8  : signals.json 아카이브 무결성 — 스키마 오류 0건
GATE 9  : React 빌드 용량 500KB 이하 / API 응답 평균 200ms 이하 (LCP 별도 측정)
```

> **GATE 3 기준치 관리**: 배포 후 반드시 `scripts/baseline-accuracy.json` 업데이트.
> 기준치가 없으면 GATE 3는 이전 배포 대비 신호 발생 건수 ±20% 이내로 임시 판단.

---

## Phase 3 — 엣지 케이스 시나리오 테스트

```javascript
// ✅ 표준 엣지 케이스 + thundering herd 실제 테스트 코드 포함
const EDGE_CASES = [
  // 신호 엔진
  { case: '빈 종목 리스트',       input: [],         expectedOutput: [] },
  { case: 'BBW 값이 0',           input: { bbw: 0 }, expectNoError: true },
  { case: '모든 TF 신호 없음',     input: { signals: [] }, expected: 'WATCH' },
  { case: 'TFW 주봉 미완성 상태', input: { isTFWComplete: false }, expectTFWExcluded: true },
  { case: 'market 필드 누락',     input: { market: undefined }, expectValidationFail: true },

  // KIS API — Thundering Herd 실제 테스트
  { case: '토큰 동시 만료 (5개 요청)', test: async () => {
    await redis.del('kis:access_token');  // 캐시 강제 삭제
    const results = await Promise.all(Array(5).fill(null).map(() => getAccessToken()));
    const unique = new Set(results);
    return unique.size === 1;  // 토큰 1개만 발급되어야 정상
  }},
  { case: 'rate limit 429 응답',  statusCode: 429,  expectRetry: true },
  { case: '네트워크 단절 후 복구', offline: true,    expectReconnect: true },

  // SSE
  { case: 'SSE URL 토큰 미포함',   token: null,      expect: 401 },
  { case: 'SSE 만료 JWT 토큰',     expired: true,    expect: 401 },
  { case: 'Heartbeat 60초 미수신', expect: 'autoReconnect' },

  // 구독 검증
  { case: 'Free → Premium 신호 접근',  tier: 'free',    signal: 'STRONG', expect: 403 },
  { case: '만료 구독 사용자',          expired: true,                      expect: 401 }
];
```

---

## Phase 4 — 성능 벤치마크

### SSE 부하 테스트 (FIX: --no-bailout 추가)

```bash
# JWT 테스트 토큰 발급
TEST_TOKEN=$(node -e "
const jwt = require('jsonwebtoken');
process.stdout.write(jwt.sign({userId:'load-test', tier:'premium'}, process.env.JWT_SECRET, {expiresIn:'1h'}));
")

# autocannon SSE 부하 테스트 (FIX: SSE long-lived connection 전용 옵션)
npx autocannon \
  -c 100 \
  -d 30 \
  --no-bailout \
  --renderStatusCodes \
  "http://localhost:3001/api/sse/signals?token=${TEST_TOKEN}"

# 기준: 100 동시 연결, 30초 유지, 에러율 1% 미만, 연결 성공률 99% 이상
```

### API 응답 시간 (FIX: curl-format.txt 내용 포함)

```bash
# curl-format.txt 파일 생성 (없으면 에이전트가 생성)
cat > /tmp/curl-format.txt << 'FORMAT'
     time_namelookup:  %{time_namelookup}s\n
        time_connect:  %{time_connect}s\n
     time_appconnect:  %{time_appconnect}s\n
    time_pretransfer:  %{time_pretransfer}s\n
       time_redirect:  %{time_redirect}s\n
  time_starttransfer:  %{time_starttransfer}s\n
                    ----------\n
          time_total:  %{time_total}s\n
FORMAT

# API 응답 시간 측정
curl -w "@/tmp/curl-format.txt" -o /dev/null -s \
  -H "Authorization: Bearer ${TEST_TOKEN}" \
  http://localhost:3001/api/signals/latest
# 기준: time_total 0.200s(200ms) 이하
```

### Redis 응답 시간

```bash
redis-cli --latency-history -h localhost -p 6379 -i 1
# 기준: 평균 1ms 이하
```

---

## 검증 리포트 템플릿

```markdown
## Red-Team 검증 리포트
- 검증 대상: [변경 사항 명칭]
- 검증 일시: [YYYY-MM-DD HH:mm]
- 검증자: MP Stock AI Agent (red-team-verify v3.0)
- 기준치 파일: scripts/baseline-accuracy.json

### 페르소나 A 발견 결함
1. [결함 설명] — 심각도: [CRITICAL/HIGH/MEDIUM/LOW]

### 페르소나 B 해결 제안
1. [결함 1 해결책 + 수정 코드]

### 9단계 품질 게이트 결과
| Gate | 항목 | 결과 |
|------|------|------|
| 1 | ESLint | ✅/❌ |
...

### 엣지 케이스 통과율: X/13

### 성능 벤치마크
- SSE 100 동시 연결 에러율: X%
- API 응답 평균: Xms

### 최종 판정: ✅ 배포 승인 / ❌ 수정 후 재검증 필요
```

---

## 퀄리티 체크리스트

```
[ ] 페르소나 A 공격 체크리스트 10개 항목 전체 수행
[ ] 페르소나 B 해결책 코드 첨부
[ ] 9단계 품질 게이트 전체 통과
[ ] GATE 3 기준치 — scripts/baseline-accuracy.json 존재 확인
[ ] 엣지 케이스 13개 이상 테스트
[ ] Thundering herd 실제 테스트 (고유 토큰 수 = 1) 통과
[ ] autocannon --no-bailout SSE 부하 테스트 에러율 1% 미만
[ ] API 응답 200ms 이하, LCP 별도 Lighthouse 측정
[ ] 검증 리포트 아티팩트 생성 완료
[ ] 배포 후 baseline-accuracy.json 업데이트 예약
```

---

*Skill Level: 5 (Composition) | Red-Team Verified | MP Stock Discovery v3.0*
