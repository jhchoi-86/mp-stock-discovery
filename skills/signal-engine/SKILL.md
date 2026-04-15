# SKILL: Signal Engine (analyzer.cjs)
# MP Stock Discovery v9.4.25 | MetaPrompt Studio
# Rev: Blue/Red Team Audit v1.1
# 적용 범위: analyzer.cjs, scorer.cjs, signals.json, sniper_3m.cjs 관련 모든 작업

---

## 🎯 이 스킬을 사용할 때

Claude Code가 다음 작업을 요청받은 경우 이 스킬을 먼저 참조:
- analyzer.cjs 수정 또는 신규 로직 추가
- BBW / DHH2 지표 관련 계산 로직
- 신호 등급(Grade) 시스템 변경
- signals.json 구조 변경
- sniper_3m.cjs 고빈도 신호 로직 (30M TF 기반)
- 타임프레임(TF) 추가 또는 제거

---

## 📡 7-TIMEFRAME 아키텍처

```
TF Index | Timeframe | 용도
---------|-----------|-----
TF-1     | 30M       | 단기 모멘텀 진입 판단 / sniper_3m.cjs 주 참조 TF
TF-2     | 1H        | 단중기 추세 확인
TF-3     | 2H        | 중기 스윙 진입
TF-4     | 4H        | 중기 추세 핵심
TF-5     | 1D        | 일봉 추세 판단
TF-6     | 2D        | BBW Strong Signal 핵심
TF-7     | 1W        | 장기 추세 필터
```

> ⚠️ TF 추가/제거 시 scorer.cjs의 수렴 조건 로직 동반 수정 필수

---

## 📊 BBW (Bollinger Band Width) 로직 원칙

- **BBW Strong Signal 조건**: 다중 TF 동시 수렴 (TF 개수 임계값 변경 시 Blue/Red Team 검토)
- **DHH2**: BBW 보조 지표 — 단독 사용 금지, BBW와 함께 복합 조건으로만 사용
- **SSOT 원칙**: 모든 BBW/DHH2 계산 로직은 `analyzer.cjs` 단일 파일에만 존재
  - 중복 계산 로직을 다른 파일에 추가하는 것은 SSOT 위반

---

## 🏆 Signal Grade System

```
Grade | Stars    | 조건                      | 권장 액션       | 필터 기준
------|----------|---------------------------|-----------------|----------
A     | ★★★★★   | 전 TF 수렴 (최강 신호)     | 즉시 알림 발송  | 통과
B     | ★★★★    | 강 신호 (5~6 TF 수렴)      | 알림 발송       | 통과
C     | ★★★     | 중 신호 (3~4 TF 수렴)      | 모니터링        | 선택적 통과
D     | ★★      | 약 신호 (1~2 TF 수렴)      | 필터링 권장     | 기본 필터 적용
```

**Grade D 필터링 기준:**
- 거래량 조건 미충족 시 자동 제외
- 단일 TF만 수렴인 경우 UI 표시 생략 권장
- Grade D는 알림 발송 대상에서 제외

**scorer.cjs 수정 규칙:**
- Grade 기준값(임계값) 변경 → 반드시 전체 7-TF 회귀 테스트
- 별(★) 개수는 5성제 고정 — A=5개, B=4개, C=3개, D=2개
- Grade E 이하 추가 시 useStockManager.js 프론트엔드 렌더링 동반 수정

---

## 📄 signals.json 스키마 원칙

```json
{
  "signals": [
    {
      "ticker": "005930",
      "grade": "A",
      "stars": 5,
      "timeframes": {
        "30M": true,
        "1H": true,
        "2H": true,
        "4H": true,
        "1D": true,
        "2D": true,
        "1W": true
      },
      "bbw": 0.045,
      "timestamp": "2026-04-14T09:00:00Z"
    }
  ],
  "updated_at": "2026-04-14T09:00:00Z"
}
```

**스키마 변경 금지 사항:**
- `grade`, `stars`, `ticker`, `timeframes` 키 이름 변경 금지 (useStockManager.js 직접 의존)
- timeframes 키는 반드시 7-TF(30M/1H/2H/4H/1D/2D/1W) 고정 — 구 TF(1M/3M/5M) 사용 금지
- 구조 변경 시 반드시 `src/hooks/useStockManager.js` 동반 수정
- 업데이트 주기: 5분 — 주기 변경 시 SSE 브로드캐스트 타이밍과 동기화 확인

---

## 🔗 데이터 흐름

```
KIS API (시세 데이터)
    ↓
analyzer.cjs (7-TF BBW/DHH2 계산) ← SSOT
    ├──→ sniper_3m.cjs [P3] (30M TF 고빈도 감시)
    ↓
platform/analysis/workers/ (병렬 분석 워커)
    ↓
scorer.cjs (Grade A~D 산정 / 5성제)
    ↓
tdrGate.cjs (규제 게이트 통과)
    ↓
signals.json (SSOT 저장 / 5분 갱신)
    ↓
server.cjs SSE 브로드캐스트
    ↓
useStockManager.js (React 전역 상태)
    ↓
프론트엔드 UI 렌더링
```

---

## ⚠️ 작업 금지 사항

1. analyzer.cjs 내 BBW 공식 임의 변경 → 전체 신호 품질 붕괴
2. signals.json timeframes 키를 구 TF(1M/3M/5M)로 되돌리는 변경
3. signals.json 구조 변경 후 프론트엔드 미반영 배포
4. SSOT 원칙 위반 (다른 파일에 BBW 계산 로직 복제)
5. TF 추가 시 scorer.cjs 수렴 조건 미업데이트
6. 투자 권유 문구가 포함된 신호 설명 텍스트 생성

---

## ✅ 작업 전 체크리스트

- [ ] analyzer.cjs 변경 → Blue/Red Team 검토 요청
- [ ] 신호 로직 변경 → 7-TF(30M~1W) 전체 회귀 테스트 실행
- [ ] signals.json 스키마 변경 → useStockManager.js 동반 확인
- [ ] Grade 임계값 변경 → scorer.cjs 단위 테스트 실행
- [ ] sniper_3m.cjs 수정 → 30M TF 연동 영향도 확인
