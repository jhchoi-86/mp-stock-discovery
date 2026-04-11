---
name: signal-logic-verify
description: |
  MP Stock Discovery의 7-timeframe BBW(Bollinger BandWidth) 신호 분석 엔진
  (analyzer.cjs)의 로직을 설계·수정·검증할 때 호출하는 스킬.
  BBW 강신호 판단, 배열 기반 신호 재구성, 타임프레임 간 정합성 검증,
  100점 스코어링 시스템 통합 작업에 트리거됨.
  신호 로직을 변경하는 모든 작업에서 반드시 선행 실행.
---

# SKILL: signal-logic-verify
# Red-Team Verified: 2026-04-10 | Fixed: 6 defects

## 목표

BBW 신호 엔진의 정확성과 일관성을 보장한다.
신호 로직 변경 → 레드팀 검증 → 배포 승인의 3단계 파이프라인을 수행한다.

---

## 공통 유틸 (최우선 확인)

```javascript
// 모든 CJS 파일에서 sleep은 반드시 아래에서 import
const { sleep, escapeHtml } = require('../../utils/common.cjs');
```

---

## 7-Timeframe 아키텍처 정의

```
TF1   : 1분봉    (초단기 노이즈 필터 — 완성봉 기준)
TF5   : 5분봉    (단기 모멘텀 확인)
TF15  : 15분봉   (추세 방향성)
TF60  : 60분봉   (중기 추세 기준선)
TF240 : 4시간봉  (스윙 구간 판단)
TFD   : 일봉     (장기 추세 확인)
TFW   : 주봉     (거시 방향 필터 — 주봉 미완성 구간 처리 필수)
```

> ⚠️ **TFW 주봉 처리**: 장중에는 주봉이 미완성 상태.
> isTFWComplete 플래그로 완성 여부 확인 후 신호 가중치 적용.
> 주봉 미완성 시 TFW는 보조 참고용으로만 사용하고, 강신호 카운트에서 제외.

---

## BBW 강신호 판단 기준

```javascript
// ✅ 강신호 조건 — 시장별 분기 처리 (FIX: 코인/주식 구분)
const isStrongSignal = (signals, market) => {
  const validTFs = signals.filter(s => {
    // 주봉 미완성 제외
    if (s.tf === 'TFW' && !s.isTFWComplete) return false;

    // 거래량 기준: 코인 24시간 거래 vs 주식 6.5시간 거래 구분
    const volumeThreshold = market === 'COIN' ? 1.3 : 1.5;

    return (
      s.bbwValue < s.threshold &&
      s.volumeRatio > volumeThreshold &&
      s.pricePosition > 0.7
    );
  });
  return validTFs.length >= 3;
};

// ✅ 100점 스코어링 가중치 (합계 반드시 100)
const SCORE_WEIGHTS = {
  bbwIntensity   : 30,  // BBW 수축 강도
  volumeSignal   : 25,  // 거래량 신호
  trendAlignment : 25,  // 타임프레임 정렬
  priceAction    : 20   // 가격 포지션
};
// 합계: 30+25+25+20 = 100 ✅
```

---

## 필수 함수 구현 (누락 금지)

```javascript
// ✅ validateSignalSchema — AGENTS.md SignalSchema 기준
const validateSignalSchema = (signal) => {
  const required = ['ticker','name','timeframes','totalScore','signalType','market','timestamp'];
  for (const field of required) {
    if (signal[field] === undefined || signal[field] === null) {
      console.error(`[validateSignalSchema] 누락 필드: ${field}`);
      return false;
    }
  }
  if (signal.totalScore < 0 || signal.totalScore > 100) return false;
  if (!['STRONG','NORMAL','WATCH'].includes(signal.signalType)) return false;
  if (!['KR_STOCK','COIN'].includes(signal.market)) return false;
  return true;
};

// ✅ getSignalStats — analyzer.cjs에 반드시 export
const getSignalStats = () => {
  const recent = loadRecentSignals(100);
  return {
    total    : recent.length,
    strong   : recent.filter(s => s.signalType === 'STRONG').length,
    normal   : recent.filter(s => s.signalType === 'NORMAL').length,
    watch    : recent.filter(s => s.signalType === 'WATCH').length,
    avgScore : recent.reduce((acc, s) => acc + s.totalScore, 0) / (recent.length || 1)
  };
};

module.exports = { getSignalStats, validateSignalSchema, isStrongSignal };
```

---

## 단계별 실행 지침

### STEP 1 — 스냅샷 생성
```bash
cp analyzer.cjs analyzer.cjs.snapshot.$(date +%Y%m%d_%H%M%S)
node -e "
const { getSignalStats } = require('./analyzer.cjs');
console.log(JSON.stringify(getSignalStats(), null, 2));
"
```

### STEP 2 — 로직 변경
- 변경 대상 함수를 단독으로 추출하여 순수 함수로 재작성
- market 파라미터 전달 여부 반드시 확인
- 변경 전/후 예상 출력값 주석으로 명시

### STEP 3 — RARV 검증 사이클
```
Reason  → 변경 근거와 예상 효과 명시
Act     → 실제 코드 수정 적용
Reflect → 과거 30일 시뮬레이션 데이터로 역검증 (KR_STOCK / COIN 분리)
Verify  → 신호 정확도 기존 대비 ±5% 이내 확인
```

### STEP 4 — 스키마 검증 및 저장
```javascript
// 구조 검증
const isValid = validateSignalSchema(newSignal);
if (!isValid) throw new Error('Signal schema validation failed');

// 저장 (AGENTS.md 표준 필드명 준수)
await archiveSignal({
  ticker, name, timeframes, totalScore, signalType, market, timestamp
});
```

### STEP 5 — 아카이브 무결성 확인
```bash
node -e "
const data = require('./signals.json');
const errors = data.signals.filter(s =>
  !s.ticker || !s.totalScore || !s.market || !s.signalType
);
console.log('총 신호 수:', data.signals.length);
console.log('최신 신호:', new Date(data.signals.at(-1)?.timestamp).toLocaleString('ko-KR'));
console.log('스키마 오류 건수:', errors.length);
"
```

---

## 퀄리티 체크리스트

```
[ ] BBW 임계값 변경 시 7개 TF 전체 적용 확인
[ ] TFW 주봉 미완성 처리 로직 (isTFWComplete) 확인
[ ] 코인/주식 volumeThreshold 분기 처리 확인
[ ] false positive 비율 5% 이하 유지
[ ] SCORE_WEIGHTS 합계 = 100 검증
[ ] validateSignalSchema() 통과 확인
[ ] archiveSignal() 필드명 AGENTS.md SignalSchema와 일치 확인
[ ] 과거 30일 백테스트 결과 (KR_STOCK / COIN 분리) 첨부
```

---

## 골든 예시 (Few-Shot)

### 입력
```
"BBW 60분봉 임계값을 0.025에서 0.020으로 낮춰서 더 엄격한 수축 신호를 잡고 싶다"
```

### 에이전트 실행 순서
```
1. analyzer.cjs 스냅샷 생성
2. TF60 임계값 상수 확인: const BBW_THRESHOLD_TF60 = 0.025
3. 코인/주식 분기 처리 확인 후 값 변경: 0.025 → 0.020
4. 30일 백테스트 (KR_STOCK / COIN 분리 실행)
5. false positive 비율 + validateSignalSchema 통과 확인
6. 개발자 승인 요청 아티팩트 생성
```

### 출력 아티팩트
```
📊 신호 로직 변경 검증 리포트
- 변경 항목: TF60 BBW 임계값 0.025 → 0.020
- KR_STOCK: 15건/일 → 9건/일 (-40%) | COIN: 22건/일 → 14건/일 (-36%)
- False positive 변화: 12% → 7% (개선)
- validateSignalSchema 통과: ✅
- 권장 사항: 변경 승인 권고
- 백테스트 기간: 2026-03-10 ~ 2026-04-10
```

---

*Skill Level: 4 (Tool & Validation) | Red-Team Verified | MP Stock Discovery v3.0*
