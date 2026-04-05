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
// 신호 유형별 활성 TF 배열 3개 + 30분봉('30M') 포함
buy_signal_timeframes:    ['30M', '1H', '2H', '4H', '1D', '2D', '1W']
trend_signal_timeframes:  ['30M', '1H', '2H', '4H', '1D', '2D', '1W']
strong_signal_timeframes: ['30M', '1H', '2H', '4H', '1D', '2D', '1W']
```

### 4.2 신호 판정 기준 (PineScript 연동 로직)

MTF 볼린저 밴드 지표를 활용한 **'절대 신호(Strong Signal)'** 판정 기준입니다.

- **조건**:
  1. `plot_bbw > plot_bbw_mtf` (현재 TF BBW가 2배 TF BBW보다 큼)
  2. `plot_bbw > plot_low` (현재 TF 수축 구간 돌파)
  3. `plot_bbw_mtf > plot_con_mtf` (2배 TF 상위 구간 유지)
  4. `cond_up7` (MACD 추세 정배열)
  5. `signal_HH` (최종 타점 컨펌)

이 5가지 조건이 모두 만족될 때 해당 TF를 `strong_signal_timeframes` 배열에 추가합니다.

---

## 5. 구현 체크리스트

### 5.1 이평선배열(2H) — sma5/sma10 신규 추가
- [ ] `analyzer.cjs` — 2H 분석 저장 블록에 `sma(closes_2h, 5)`, `sma(closes_2h, 10)` 추가
- [ ] `signals.json` 출력 확인 — t2H 객체에 sma5/sma10 저장 여부
- [ ] `useStockManager.js` — t2H 4개 필드 enrichedStock에 포함
- [ ] `PcDashboard.jsx` — 가격 내림차순 정렬 렌더링 + 현재가 강조

### 5.2 신호발생구간 배열 변환
- [ ] `analyzer.cjs` — `TARGET_TIMEFRAMES`에 `'30M'` 추가
- [ ] `useStockManager.js` — `buildSignalTimeframes()` 함수 구현 및 3개 배열 병합
- [ ] `SignalIndicator.jsx` — `timeframeStatus` 객체 참조 → 3종 배열 참조로 전수 수정
- [ ] `reportUtils.js` — 동일 수정
- [ ] `PcDashboard.jsx` — 배열 소비 구조 렌더링

---

## 6. 에이전트 지시 요약 (Agent Prompt)

```
[지시] 선행 조사(블루팀 + 레드팀 교차검증) 결과에 따라 아래 내용을 구현하라.
기존 1D 이평선, PineScript 4버튼 판정, 추천매매 로직은 절대 수정하지 마라.

- analyzer.cjs: TARGET_TIMEFRAMES에 '30M' 추가, 2H 객체에 sma5, sma10 추가
- useStockManager.js: buildSignalTimeframes() 통한 3개 배열 병합 (Buy, Trend, Strong)
- UI: PcDashboard, SignalIndicator 전수 수정하여 신규 배열 구조 반영
```

---

*문서 끝 — MP Stock Discovery 로직 변경 설계서 v3.0*
