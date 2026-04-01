# MP Stock Discovery — UI 변경 대응 로직 변경 설계서

> **문서 버전:** v3.0 (블루팀/레드팀 선행 조사 결과 반영)
> **작성일:** 2026-03-31
> **작성자:** 데니얼 (MetaPrompt Studio)
> **연관 문서:** `MP_Stock_UI_수정_작업설계서_v1.1.md`
> **작업 순서:** 본 문서(로직) 완료 → UI 설계서(v1.1) 착수

---

## 1. 선행 확인 결과 요약 (블루팀 + 레드팀 교차 검증 확정)

| # | 확인 항목 | 결과 | 판정 |
|---|---------|------|------|
| 1 | `analyzer.cjs` — SMA 함수 | `sma(src, period)` L45 구현 확인. 재사용 가능 | ✅ 확정 |
| 2 | `analyzer.cjs` — 2H TF 기존 필드 | `result_2`, `result_3`, `cond_up7`, `DHH2`, `progress`, `signal_HH`, `adx`, `sma20/60/120` 포함 | ✅ 확정 |
| 3 | `analyzer.cjs` — 30분봉 가용성 | `intervalMap`에 `'30M': '30m'` L668 정의됨. 인자 전달만으로 즉시 가동 가능 | ✅ 확정 |
| 4 | `signals.json` — TF별 독립 구조 | TF별 독립 Row. `signal_HH`, `cond_up7` 각 TF 내 개별 존재. 글로벌 플래그 아님 | ✅ 확정 |
| 5 | `server.cjs` — 직렬화 위치 | `/api/stocks`는 원본만 반환. 병합 로직은 **프론트엔드 `useStockManager.js` L153**에 위치 | ⚠️ 위험 요소 |
| 6 | `PcDashboard.jsx` — 영향 범위 | `SignalIndicator.jsx`, `reportUtils.js` 두 파일이 `timeframeStatus` 객체 구조에 깊게 의존 | ⚠️ 수정 필수 |

---

## 2. 핵심 아키텍처 결정 사항

### 2.1 병합 로직 이관 여부 (중요 선택)

레드팀 검증에서 발견된 핵심 위험 요소:
현재 `total_score` 연산 및 복합 데이터 매핑이 **프론트엔드 `useStockManager.js` L153**에 구현되어 있음.

| 방안 | 설명 | 장점 | 단점 |
|------|------|------|------|
| **A안 (권장)** | `buildSignalTimeframes()`를 `useStockManager.js`에 추가 | 기존 아키텍처 유지, 리스크 최소 | 프론트 코드 증가 |
| **B안** | `server.cjs`로 이관 후 `/api/stocks`에서 병합 반환 | 백엔드 책임 명확화 | `useStockManager.js` 전체 리팩토링 필요, 리스크 큼 |

> ✅ **A안 채택** — 이번 작업 범위에서는 기존 병합 위치(`useStockManager.js`)를 유지하고,
> 신규 변환 함수만 해당 파일에 추가한다. B안(이관)은 별도 리팩토링 이슈로 분리한다.

---

## 3. 변경 로직 1 — 이평선배열(2H) 신규 데이터

### 3.1 현재 vs 목표

**현재 (AS-IS)**
```js
// t1D 객체 — 1D(일봉) 기준만 존재
t1D.sma20   // 20일 이평
t1D.sma60   // 60일 이평
t1D.sma120  // 120일 이평
```

**목표 (TO-BE)**
```js
// t2H 객체 — 기존 필드에 SMA 4개 추가
t2H.sma5    // 신규
t2H.sma10   // 신규
t2H.sma20   // 기존 존재 → 확인 후 재사용 또는 유지
t2H.sma60   // 기존 존재 → 확인 후 재사용 또는 유지
curPrice    // 기존 필드 재사용
```

> ⚠️ **주의:** 레드팀 확인 결과 2H 객체에 `sma20/60/120`이 이미 존재함.
> `sma20`, `sma60`은 신규 추가가 아니라 **기존 필드 재사용** 가능.
> **실제 신규 추가 대상은 `sma5`, `sma10` 2개뿐.**

### 3.2 수정 위치 — `analyzer.cjs`

`sma(src, period)` 함수(L45)가 이미 존재하므로 그대로 재사용.
2H TF 분석 결과 저장 블록에 **`sma5`, `sma10` 2개만 추가** 저장.

```js
// analyzer.cjs — 2H 분석 결과 저장 부분
// sma20, sma60은 기존 존재 → 유지
// sma5, sma10만 신규 추가
signals[stockCode]['t2H'] = {
  ...existing_t2H_fields,         // 기존 필드 전체 유지
  sma5:  sma(closes_2h, 5),       // 신규 추가 (기존 sma() 재사용)
  sma10: sma(closes_2h, 10),      // 신규 추가
  // sma20, sma60은 이미 존재하므로 별도 추가 불필요
};
```

> ✅ **DB 스키마(Prisma) 변경 불필요** — signals.json 파일 기반 확장만으로 해결.

### 3.3 수정 위치 — `useStockManager.js`

A안 채택에 따라 `useStockManager.js` 내 기존 병합 로직 위치(L153 근방)에
t2H SMA 필드를 종목 객체에 포함시키는 코드 추가.

```js
// useStockManager.js — 기존 병합 로직 근방 (L153)
const enrichedStock = {
  ...stock,
  t2H: {
    sma5:  signal.t2H?.sma5  ?? null,   // 신규
    sma10: signal.t2H?.sma10 ?? null,   // 신규
    sma20: signal.t2H?.sma20 ?? null,   // 기존 재사용
    sma60: signal.t2H?.sma60 ?? null,   // 기존 재사용
  },
};
```

### 3.4 UI 렌더링 — `PcDashboard.jsx`

```jsx
// 이평선배열(2H) 셀 — 가격 내림차순 정렬
const MA_ITEMS = [
  { label: '5일',   price: stock.t2H?.sma5  },
  { label: '10일',  price: stock.t2H?.sma10 },
  { label: '20일',  price: stock.t2H?.sma20 },
  { label: '60일',  price: stock.t2H?.sma60 },
  { label: '현재가', price: stock.curPrice, highlight: true },
];

const sorted = MA_ITEMS
  .filter(item => item.price != null)
  .sort((a, b) => b.price - a.price);

sorted.map(item => (
  <div className={`ma-row ${item.highlight ? 'current-price' : ''}`}>
    {item.price.toLocaleString()}원 ({item.label})
  </div>
))
```

---

## 4. 변경 로직 2 — 신호발생구간 배열 구조 변환

### 4.1 현재 vs 목표

**현재 (AS-IS)**
```js
// timeframeStatus — TF별 통합 boolean (유형 구분 없음)
timeframeStatus = {
  '1H': true,
  '2H': true,
  '4H': false,
  '1D': true,
  ...
}
```

**목표 (TO-BE)**
```js
// 신호 유형별 활성 TF 배열 3개 + 30분봉('30') 포함
buy_signal_timeframes:    ['30', '1H', '2H', '4H', '1D', '2D', '1W']
trend_signal_timeframes:  ['30', '1H', '2H', '4H', '1D', '2D', '1W']
strong_signal_timeframes: ['30', '1H', '2H', '4H', '1D', '2D', '1W']
```

### 4.2 변환 로직 — `useStockManager.js`

A안 채택: `buildSignalTimeframes()`를 `useStockManager.js`에 추가 구현.
`signals.json`의 TF별 독립 구조가 확인되었으므로 직접 접근 가능.

```js
// useStockManager.js — buildSignalTimeframes 함수 추가
const ALL_TIMEFRAMES = ['30', '1H', '2H', '4H', '1D', '2D', '1W'];

function buildSignalTimeframes(signalsByTf) {
  // signalsByTf: signals.json의 TF별 독립 객체
  // 예: { '1H': { signal_HH: true, cond_up7: false, ... }, '2H': { ... }, ... }

  const buy    = [];
  const trend  = [];
  const strong = [];

  for (const tf of ALL_TIMEFRAMES) {
    const tfData = signalsByTf?.[tf] ?? {};

    const isBuy    = tfData.signal_HH === true;
    const isTrend  = tfData.cond_up7  === true;
    const isStrong = isBuy && isTrend;

    if (isBuy)    buy.push(tf);
    if (isTrend)  trend.push(tf);
    if (isStrong) strong.push(tf);
  }

  return {
    buy_signal_timeframes:    buy,
    trend_signal_timeframes:  trend,
    strong_signal_timeframes: strong,
  };
}

// 기존 병합 로직(L153) 근방에 추가
const enrichedStock = {
  ...stock,
  ...buildSignalTimeframes(stock.signalsByTf),
};
```

### 4.3 30분봉 TF 추가 — `analyzer.cjs`

`intervalMap`에 `'30M': '30m'` (L668) 이미 정의되어 있음.
분석 엔진 루프의 **TF 실행 목록에 `'30M'` 추가**만 하면 즉시 가동.

```js
// analyzer.cjs — 분석 대상 TF 목록에 '30M' 추가
const TARGET_TIMEFRAMES = [
  '30M',   // ← 신규 추가 (intervalMap에 이미 정의됨)
  '1H',
  '2H',
  '4H',
  '1D',
  '2D',
  '1W',
];
```

> ✅ 별도 로직 구현 불필요. TF 목록 추가만으로 해결.
> 분석 결과는 `signals.json`의 `'30M'` 키로 저장됨.
> `buildSignalTimeframes()`의 `ALL_TIMEFRAMES` 배열에서 `'30'` 대신 `'30M'`으로 키 통일 필요.

### 4.4 영향 파일 수정 — `SignalIndicator.jsx` / `reportUtils.js`

레드팀 확인: 두 파일이 `timeframeStatus` **객체 구조에 깊게 의존**.
배열 구조로 변경 시 아래 패턴을 일괄 수정해야 함.

```js
// 수정 전 (객체 참조)
timeframeStatus['1H']               // 직접 키 참조
Object.values(timeframeStatus)      // 전체 값 순회
Object.keys(timeframeStatus)        // 전체 키 순회

// 수정 후 (배열 참조)
buy_signal_timeframes.includes('1H')        // 매수신호 여부
trend_signal_timeframes.includes('1H')      // 추세신호 여부
strong_signal_timeframes.includes('1H')     // 강력신호 여부
```

> ⚠️ **`SignalIndicator.jsx`와 `reportUtils.js` 두 파일의 일괄 수정이 필수.**
> 수정 전 두 파일의 `timeframeStatus` 참조 위치를 전수 검색 후 처리.

---

## 5. 구현 체크리스트

### 5.1 이평선배열(2H) — sma5/sma10 신규 추가
- [x] `analyzer.cjs` — 2H 분석 저장 블록에 `sma(closes_2h, 5)`, `sma(closes_2h, 10)` 추가
- [x] `signals.json` 출력 확인 — t2H 객체에 sma5/sma10 저장 여부
- [x] `useStockManager.js` — t2H 4개 필드 enrichedStock에 포함
- [ ] `PcDashboard.jsx` — 가격 내림차순 정렬 렌더링 + 현재가 강조 (UI 설계서 착수 시)

### 5.2 신호발생구간 배열 변환
- [x] `analyzer.cjs` — `TARGET_TIMEFRAMES`에 `'30M'` 추가
- [x] `signals.json` 출력 확인 — `'30M'` 키 정상 저장 여부
- [ ] `useStockManager.js` — `buildSignalTimeframes()` 함수 구현 및 병합
- [ ] `ALL_TIMEFRAMES` 키 통일 — `'30M'` vs `'30'` 표기 확정 후 전체 적용
- [ ] `SignalIndicator.jsx` — `timeframeStatus` 객체 참조 → 3종 배열 참조로 전수 수정
- [ ] `reportUtils.js` — 동일 수정
- [ ] `PcDashboard.jsx` — 배열 소비 구조 렌더링 (UI 설계서 착수 시)

### 5.3 통합 검증
- [ ] `signals.json` — t2H.sma5/sma10 및 `'30M'` TF 키 정상 저장 확인
- [ ] UI 렌더링 — 이평선배열(2H) 가격 정렬 정상 표시 확인
- [ ] UI 렌더링 — 신호발생구간 3종 배열 버튼 활성/비활성 정상 표시 확인
- [ ] null 처리 — sma 데이터 없는 종목 `"-"` graceful fallback 확인
- [ ] 회귀 확인 — 기존 1D 이평선, 추천매매, PineScript 4버튼 정상 동작
- [ ] `reportUtils.js` — 리포트 생성 기능 정상 동작 확인

---

## 6. 작업 순서 및 예상 시간

| 순서 | 작업 | 대상 파일 | 예상 시간 |
|------|------|----------|----------|
| 1 | 30분봉 TF 목록 추가 | `analyzer.cjs` | 10분 |
| 2 | sma5/sma10 저장 추가 | `analyzer.cjs` | 20분 |
| 3 | 동기화 1회 실행 → signals.json 출력 확인 | — | 10분 |
| 4 | `buildSignalTimeframes()` 구현 및 병합 | `useStockManager.js` | 30분 |
| 5 | t2H 4개 필드 병합 추가 | `useStockManager.js` | 15분 |
| 6 | `timeframeStatus` 참조 전수 수정 | `SignalIndicator.jsx`, `reportUtils.js` | 30분 |
| 7 | 통합 검증 및 회귀 확인 | 전체 | 30분 |
| 8 | 프론트 렌더링 변경 | `PcDashboard.jsx` | **UI 설계서 착수 시 처리** |

> **총 예상 소요 시간:** 약 2.5시간
> **DB 마이그레이션:** 없음
> **백엔드 API 구조 변경:** 없음 (A안 채택, useStockManager.js 내 처리)

---

## 7. 에이전트 지시 요약 (Agent Prompt)

(생략 - 본 문서 내용에 포함됨)

---

*문서 끝 — MP Stock Discovery 로직 변경 설계서 v3.0*
