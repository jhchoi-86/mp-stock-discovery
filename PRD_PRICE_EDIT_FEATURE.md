# PRD: 종목 가격 인라인 편집 기능
> **문서 유형:** 기능 설계안 (Blue Team 설계 + Red Team 검증 완료)  
> **작성일:** 2026-04-14  
> **버전:** v1.0  
> **대상 시스템:** MP Stock v9.4.30+ | MP 시그널 대시보드

---

## 1. 목적 및 배경

### 목적
동기화 완료 후 평가된 종목들의 **1차 진입가, 2차 진입가, 손절가(SL), 목표가(Target)** 를 대시보드에서 직접 편집할 수 있는 인라인 편집 기능 추가.

### 현재 문제
- 동기화 후 자동 산출된 가격은 알고리즘 기반 추정값임
- 트레이더가 시장 상황에 따라 수동 조정이 필요하나 현재 편집 UI 없음
- 수정하려면 DB 직접 접근 또는 코드 수정이 필요한 상황

### 현재 화면 구조 (스크린샷 분석)
```
종목 카드
├── 이평선배열(2H): 1차/2차/5분/10분/20분/60분 가격
├── 신호발생구간: 30M/1H/2H/4H/1D/2D/1W 타임프레임 뱃지
└── 추천매매
    ├── 1차 매수진입가 (2H): 150,100원
    ├── 2차 매수진입가 (2H): 145,597원
    ├── 목표가 (Target):     192,780원
    └── 손절가 (SL):         142,685원
```

---

## 2. 기능 요구사항

### 2.1 핵심 기능 (Must Have)

| ID | 요구사항 | 우선순위 |
|----|---------|--------|
| F-01 | 추천매매 영역의 4개 가격 필드 인라인 편집 | 🔴 P0 |
| F-02 | 편집 모드 진입: 가격 클릭 시 input 필드 활성화 | 🔴 P0 |
| F-03 | 저장: Enter 키 또는 저장 버튼으로 DB 반영 | 🔴 P0 |
| F-04 | 취소: ESC 키 또는 취소 버튼으로 원복 | 🔴 P0 |
| F-05 | 편집값 DB 저장 (`daily_stock_snapshots` 테이블) | 🔴 P0 |
| F-06 | 저장 후 UI 즉시 반영 (새로고침 불필요) | 🔴 P0 |

### 2.2 보조 기능 (Should Have)

| ID | 요구사항 | 우선순위 |
|----|---------|--------|
| F-07 | 편집 상태 시각적 구분 (배경색/테두리 변경) | 🟡 P1 |
| F-08 | 유효성 검사: 숫자만 입력, 0 이하 금지 | 🟡 P1 |
| F-09 | 유효성 검사: 손절가 < 진입가 < 목표가 순서 검증 | 🟡 P1 |
| F-10 | 수정된 가격 원본값 대비 변경 표시 (뱃지) | 🟡 P1 |
| F-11 | 일괄 편집 모드: 카드 단위 전체 편집/저장 | 🟡 P1 |

### 2.3 선택 기능 (Nice to Have)

| ID | 요구사항 | 우선순위 |
|----|---------|--------|
| F-12 | 편집 이력 로그 (언제, 얼마에서 얼마로 변경) | 🟢 P2 |
| F-13 | 알고리즘 산출값으로 리셋 버튼 | 🟢 P2 |
| F-14 | 전체 종목 일괄 초기화 | 🟢 P2 |

---

## 3. 화면 설계

### 3.1 편집 전 (현재 상태)

```
┌─────────────────────────────────────────┐
│ 추천매매                                  │
│                                          │
│ 1차 매수진입가 (2H):  150,100원  [✏️]    │
│ 2차 매수진입가 (2H):  145,597원  [✏️]    │
│ 목표가 (Target):      192,780원  [✏️]    │
│ 손절가 (SL):          142,685원  [✏️]    │
└─────────────────────────────────────────┘
```
- 연필 아이콘(✏️)은 hover 시에만 표시 (UI 오염 방지)

### 3.2 편집 중 (클릭 후)

```
┌─────────────────────────────────────────┐
│ 추천매매                          [저장] [취소] │
│                                          │
│ 1차 매수진입가 (2H):  [  150100  ] ← 활성│
│ 2차 매수진입가 (2H):  145,597원          │
│ 목표가 (Target):      192,780원          │
│ 손절가 (SL):          142,685원          │
│                                          │
│ ⚠️ 손절가 < 진입가 < 목표가 순서 확인    │
└─────────────────────────────────────────┘
```

### 3.3 저장 완료 후

```
┌─────────────────────────────────────────┐
│ 추천매매                    [수동수정 ●] │
│                                          │
│ 1차 매수진입가 (2H):  151,000원  ← 수정됨│
│ 2차 매수진입가 (2H):  145,597원          │
│ 목표가 (Target):      192,780원          │
│ 손절가 (SL):          142,685원          │
└─────────────────────────────────────────┘
```
- `[수동수정 ●]` 뱃지로 알고리즘값과 구분

---

## 4. API 설계

### 4.1 엔드포인트

```
PATCH /api/stocks/:code/prices
```

### 4.2 요청 Body

```json
{
  "date": "2026-04-14",
  "entry1": 151000,
  "entry2": 145597,
  "target": 192780,
  "stop_loss": 142685
}
```

### 4.3 응답

```json
{
  "success": true,
  "code": "062040",
  "updated": {
    "entry1": 151000,
    "entry2": 145597,
    "target": 192780,
    "stop_loss": 142685,
    "is_manual": true,
    "updated_at": "2026-04-14T17:30:00.000Z"
  }
}
```

### 4.4 에러 응답

```json
{
  "success": false,
  "error": "INVALID_PRICE_ORDER",
  "message": "손절가(140000)가 1차 진입가(151000)보다 높습니다."
}
```

---

## 5. DB 스키마 변경

### 5.1 `daily_stock_snapshots` 테이블 컬럼 추가

```sql
ALTER TABLE daily_stock_snapshots
  ADD COLUMN inst_buy_manual      INTEGER,
  ADD COLUMN inst_buy2_manual     INTEGER,
  ADD COLUMN target_manual        INTEGER,
  ADD COLUMN stop_loss_manual     INTEGER,
  ADD COLUMN is_manual_price      BOOLEAN DEFAULT FALSE,
  ADD COLUMN manual_updated_at    TIMESTAMP;
```

### 5.2 조회 시 우선순위 로직

```sql
-- 수동 편집값 우선, 없으면 알고리즘값 사용
SELECT
  code,
  COALESCE(inst_buy_manual, inst_buy)   AS entry1,
  COALESCE(inst_buy2_manual, inst_buy2) AS entry2,
  COALESCE(target_manual, target)       AS target_price,
  COALESCE(stop_loss_manual, stop_loss) AS stop_loss_price,
  is_manual_price
FROM daily_stock_snapshots
WHERE date = $1;
```

---

## 6. 프론트엔드 구현

### 6.1 수정 대상 파일

| 파일 | 변경 내용 |
|------|---------|
| `StockCard.jsx` | 인라인 편집 UI 추가 |
| `usePriceEdit.js` | 편집 상태 관리 훅 신규 생성 |
| `priceEditService.js` | PATCH API 호출 서비스 신규 생성 |

### 6.2 `usePriceEdit.js` 핵심 로직

```javascript
const usePriceEdit = (stockCode, initialPrices) => {
  const [isEditing, setIsEditing] = useState(false);
  const [prices, setPrices] = useState(initialPrices);
  const [editValues, setEditValues] = useState(initialPrices);
  const [isManual, setIsManual] = useState(false);

  const validate = (values) => {
    if (values.stop_loss >= values.entry1)
      return '손절가는 1차 진입가보다 낮아야 합니다.';
    if (values.entry1 >= values.target)
      return '1차 진입가는 목표가보다 낮아야 합니다.';
    if (values.entry2 >= values.entry1)
      return '2차 진입가는 1차 진입가보다 낮아야 합니다.';
    return null;
  };

  const save = async () => {
    const error = validate(editValues);
    if (error) { alert(error); return; }

    const res = await fetch(`/api/stocks/${stockCode}/prices`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: today(), ...editValues })
    });

    if (res.ok) {
      setPrices(editValues);
      setIsManual(true);
      setIsEditing(false);
    }
  };

  const cancel = () => {
    setEditValues(prices); // 원복
    setIsEditing(false);
  };

  return { isEditing, prices, editValues, isManual,
           setIsEditing, setEditValues, save, cancel };
};
```

### 6.3 `server.cjs` PATCH 라우트 추가

```javascript
// PATCH /api/stocks/:code/prices
app.patch('/api/stocks/:code/prices',
  authenticateToken,           // JWT 인증 필수
  requireRole('ADMIN', 'PREMIUM'), // 권한 제한
  async (req, res) => {
    const { code } = req.params;
    const { date, entry1, entry2, target, stop_loss } = req.body;

    // 유효성 검사
    if (stop_loss >= entry1)
      return res.status(400).json({ error: 'INVALID_PRICE_ORDER',
        message: '손절가는 1차 진입가보다 낮아야 합니다.' });
    if (entry1 >= target)
      return res.status(400).json({ error: 'INVALID_PRICE_ORDER',
        message: '1차 진입가는 목표가보다 낮아야 합니다.' });

    await prisma.daily_stock_snapshots.update({
      where: { code_date: { code, date } },
      data: {
        inst_buy_manual:   entry1,
        inst_buy2_manual:  entry2,
        target_manual:     target,
        stop_loss_manual:  stop_loss,
        is_manual_price:   true,
        manual_updated_at: new Date()
      }
    });

    res.json({ success: true, code, updated: req.body });
  }
);
```

---

## 7. 보안 요구사항

| 항목 | 요구사항 |
|------|---------|
| 인증 | JWT 토큰 필수 (`authenticateToken` 미들웨어) |
| 권한 | ADMIN 또는 PREMIUM 등급만 편집 가능 |
| 입력 검증 | 숫자 타입, 양수, 가격 순서 서버사이드 검증 |
| 감사 로그 | `manual_updated_at` 타임스탬프 기록 |
| Rate Limit | 동일 종목 1분 내 5회 이상 수정 차단 |

---

## 8. Red Team 검증 결과

### 🔴 지적 1: DB 스키마 변경 시 기존 validate_stock_signal() 충돌
**내용:** `daily_stock_snapshots`에 컬럼 추가 시 기존 `validate_stock_signal()` PL/pgSQL 함수가 INSERT 시 신규 컬럼 누락으로 에러 발생 가능.

**대응:**
```sql
-- 신규 컬럼 모두 DEFAULT 값 설정으로 기존 INSERT 영향 없음
ADD COLUMN inst_buy_manual INTEGER DEFAULT NULL,
ADD COLUMN is_manual_price BOOLEAN DEFAULT FALSE
```

### 🔴 지적 2: PATCH 엔드포인트 인증 미적용 시 무인증 가격 조작
**내용:** `/api/reset` 패턴 재발 — 인증 미들웨어 누락 가능성.

**대응:** `authenticateToken` + `requireRole` 2단계 미들웨어 명시적 적용. 코드 리뷰 체크리스트에 추가.

### 🔴 지적 3: COALESCE 조회 시 캐시 미반영
**내용:** `landing_strategy.json` 캐시가 수동 편집 전 값을 가지고 있으면 즉시 반영 안 됨.

**대응:**
```javascript
// PATCH 성공 후 캐시 무효화
await redis.del(`daily_top5:${date}`);
await redis.del(`landing_strategy:${date}`);
// PublishingService 트리거로 landing_strategy.json 재생성
```

### 🟡 지적 4: 가격 순서 검증이 프론트만 있고 서버 누락
**내용:** 클라이언트 검증 우회 시 DB에 잘못된 가격 순서 저장 가능.

**대응:** 서버사이드 검증 코드 명시적 추가 (위 PATCH 라우트 참조).

### 🟡 지적 5: 수동 편집값이 다음날 동기화로 덮어씌워질 위험
**내용:** 다음날 통합 동기화 실행 시 `is_manual_price: true`인 종목의 수동값이 초기화될 수 있음.

**대응:**
```javascript
// BulkSyncService.cjs 동기화 로직에 조건 추가
if (existingRecord?.is_manual_price) {
  // 수동 편집 컬럼은 덮어쓰지 않음
  skipFields: ['inst_buy_manual', 'inst_buy2_manual',
               'target_manual', 'stop_loss_manual', 'is_manual_price']
}
```

---

## 9. 구현 순서

```
Step 1: DB 마이그레이션 (15분)
  → ALTER TABLE 실행
  → Prisma schema.prisma 업데이트
  → prisma generate

Step 2: API 라우트 추가 (30분)
  → server.cjs에 PATCH /api/stocks/:code/prices 추가
  → 유효성 검사 + 인증 미들웨어 적용
  → 캐시 무효화 로직 추가

Step 3: 프론트엔드 (45분)
  → usePriceEdit.js 훅 생성
  → StockCard.jsx 편집 UI 추가
  → 저장/취소/수동수정 뱃지 구현

Step 4: BulkSyncService.cjs 수정 (15분)
  → is_manual_price 보호 로직 추가

Step 5: 테스트 및 배포 (15분)
  → pm2 restart all
  → 편집 → 저장 → 새로고침 후 유지 확인
```

**총 예상 소요: 2시간**

---

## 10. 완료 기준

| 항목 | 기준 |
|------|------|
| 편집 UI | 가격 클릭 → input 활성화 |
| 저장 | Enter/버튼 → DB 반영 → UI 즉시 갱신 |
| 취소 | ESC/버튼 → 원래값 복원 |
| 유효성 | 잘못된 가격 순서 → 에러 메시지 |
| 보안 | 미인증 PATCH 요청 → 401 반환 |
| 동기화 보호 | 다음날 동기화 후에도 수동값 유지 |
| 수동 표시 | `[수동수정 ●]` 뱃지 표시 |

---

*작성: MetaPrompt Studio / MP Stock Engineering*  
*Blue Team 설계 + Red Team 검증 완료*  
*기준 버전: v9.4.30 | DB: PostgreSQL 17.6 (mpstock-db)*
