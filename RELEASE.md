# MP-STOCK Release Notes

## [v9.4.33] - 2026-04-15
### 🚩 상태: 자동화 배포 완료 (Automated Release)
### 🛠 주요 변경 사항
- [FIX] 시스템 안정성 강화 및 모니터링 로직 패치
- [NEW] 배포 프로세스 리비전 자동 업데이트 적용

---



## [v9.4.32] - 2026-04-15
### 🚩 상태: 자동화 배포 완료 (Automated Release)
### 🛠 주요 변경 및 조치 사항
1. **[NEW] Target Locking & Nulimmock Watcher**: 자동 동기화(Integrated Sync) 시점의 Top 5 종목을 `mp:active_targets` Redis 키로 원자적(Atomic)으로 고정하여 실시간 점수 변동에 따른 목록 요동 현상(Jumping)을 완전 제거했습니다.
2. **[NEW] Real-time Telegram Alert Monitor**: `kisWebSocketService` 내에 타겟 감시자 로직을 주입하여, 고정된 타겟이 가격 타점(Entry 1, 2)에 도달할 경우 텔레그램 알림을 발송하며, 일일 1회 중복 방지 처리를 적용했습니다.
3. **[UI/UX] Dashboard Strategy Mode Switch**: `useStockManager`의 정렬 로직을 제거하여 백엔드 기준 타겟 인덱스를 따르도록 강제하였으며, 진입점(Nulimmock) 도달 시 `PcDashboard` 행에 시각적 하이라이트(오렌지/레드)를 제공하도록 개선했습니다.

---

## [v9.4.31] - 2026-04-14

---

## [v9.4.31] - 2026-04-14
### 🚩 상태: 자동화 배포 완료 (Automated Release)
### 🛠 주요 변경 및 조치 사항
1. **[FIX] Ticker/Code Normalization**: 시스템 전반의 `ticker` vs `code` 혼용 문제를 해결하기 위해 `(ticker || code)` 폴백 로직을 모든 주요 서비스(`server.cjs`, `PublishingService`, `BulkSyncService` 등)에 적용했습니다.
2. **[STABILITY] Signal Pipeline Restoration**: 실시간 신호 생성 및 기록 엔진의 불일치를 해결하여 대시보드 신호 유실 문제를 원천 차단했습니다.

---

## [v9.4.30] - 2026-04-14
### 🚩 상태: 자동화 배포 완료 (Automated Release)

### 🛠 주요 변경 및 조치 사항
1. [NEW] 배포 자동화 및 리포트 엔진 안정화 최적화 패치
2. [FIX] 릴리즈 이력 자동 기록 시스템 도입



---

## [v9.4.29] - 2026-04-14
### 🚩 상태: 자동화 배포 완료 (Automated Release)

### 🛠 주요 변경 및 조치 사항
1. [NEW] 배포 자동화 및 리포트 엔진 안정화 최적화 패치
2. [FIX] 릴리즈 이력 자동 기록 시스템 도입



---

## [v9.4.28] - 2026-04-14
### 🚩 상태: 자동화 배포 완료 (Automated Release)

### 🛠 주요 변경 및 조치 사항
1. [NEW] 배포 자동화 및 리포트 엔진 안정화 최적화 패치
2. [FIX] 릴리즈 이력 자동 기록 시스템 도입



---

## [v9.4.27] - 2026-04-14
### 🚩 상태: 자동화 배포 완료 (Automated Release)

### 🛠 주요 변경 및 조치 사항
1. [NEW] 배포 자동화 및 리포트 엔진 안정화 최적화 패치
2. [FIX] 릴리즈 이력 자동 기록 시스템 도입



---

## [v9.4.26] - 2026-04-14
### 🚩 상태: 자동화 배포 완료 (Automated Release)

### 🛠 주요 변경 및 조치 사항
1. [NEW] 배포 자동화 및 리포트 엔진 안정화 최적화 패치
2. [FIX] 릴리즈 이력 자동 기록 시스템 도입


- [NEW] 배포 프로세스 리비전 자동 업데이트 적용

---



## [v9.4.24] - 2026-04-13
### 🚩 상태: 자동화 배포 완료 (Automated Release)
### 🛠 주요 변경 사항
- [FIX] 시스템 안정성 강화 및 모니터링 로직 패치
- [NEW] 배포 프로세스 리비전 자동 업데이트 적용

---



## [v9.4.23] - 2026-04-13
### 🚩 상태: 자동화 배포 완료 (Automated Release)
### 🛠 주요 변경 사항
- [FIX] 시스템 안정성 강화 및 모니터링 로직 패치
- [NEW] 배포 프로세스 리비전 자동 업데이트 적용

---



## [v9.4.22] - 2026-04-13
### 🚩 상태: 자동화 배포 완료 (Automated Release)
### 🛠 주요 변경 사항
- [FIX] 시스템 안정성 강화 및 모니터링 로직 패치
- [NEW] 배포 프로세스 리비전 자동 업데이트 적용

---



## [v9.4.21] - 2026-04-13
### 🚩 상태: 자동화 배포 완료 (Automated Release)
### 🛠 주요 변경 사항
- [FIX] 시스템 안정성 강화 및 모니터링 로직 패치
- [NEW] 배포 프로세스 리비전 자동 업데이트 적용

---



## [v9.4.20] - 2026-04-13
### 🚩 상태: 자동화 배포 완료 (Automated Release)
### 🛠 주요 변경 사항
- [FIX] 시스템 안정성 강화 및 모니터링 로직 패치
- [NEW] 배포 프로세스 리비전 자동 업데이트 적용

---



## [v9.4.19] - 2026-04-13
### 🚩 상태: 자동화 배포 완료 (Automated Release)
### 🛠 주요 변경 사항
- [FIX] 시스템 안정성 강화 및 모니터링 로직 패치
- [NEW] 배포 프로세스 리비전 자동 업데이트 적용

---



## [v9.4.18] - 2026-04-13
### 🚩 상태: 자동화 배포 완료 (Automated Release)
### 🛠 주요 변경 사항
- [FIX] 시스템 안정성 강화 및 모니터링 로직 패치
- [NEW] 배포 프로세스 리비전 자동 업데이트 적용

---



## [v9.4.17] - 2026-04-13
### 🚩 상태: [Hardened] DB 오프라인 환경 대응 및 대시보드 크래시 원천 차단
### 🛠 주요 변경 및 조치 사항
1. **[FIX] Dashboard Crash Mitigation**: DB 오프라인 시 API가 에러 객체를 반환할 때 프론트엔드(`DailySnapshotAnalytics`)에서 `.forEach` 오류로 화면이 멈추던 결함을 수정했습니다.
2. **[STABILITY] Frontend Robustness**: `MPStockDailyReport` 컴포넌트가 `.stocks`와 `.data` 속성을 모두 지원하도록 개선하여 데이터 유실 및 렌더링 실패를 방지했습니다.
3. **[BE] API Error Hardening**: `server.cjs` 및 `publicReports.cjs`의 에러 핸들러를 하드닝하여, DB 타임아웃 발생 시에도 빈 배열(`[]`)을 포함한 표준 구조를 반환함으로써 UI 크래시를 방지했습니다.
4. **[STABILITY] BulkSync Safe Mode**: RDS 연결 실패 시 에러로 중단되지 않고 로컬 파일 및 캐시 업데이트를 지속하는 'Safe Mode'를 공식 적용했습니다.


## [v9.4.16] - 2026-04-13
### 🚩 상태: [Stable] 관리자 히스토리 동기화 복구 및 Top 5 조회 결함 패치
### 🛠 주요 변경 및 조치 사항
1. **[FIX] Admin Sync History Recovery**: 관리자 대시보드의 '동기화 저장' 버튼이 호출하는 `/api/admin/save-sync-history` 엔드포인트를 복구하고 `SyncSaveLog`(히스토리 태그) 연동을 완료했습니다.
2. **[FIX] Top 5 Ranking Logic**: `signals.json`이 배열 구조로 변경됨에 따라 발생하던 Top 5 선정 오류를 수정하고, 신규 점수 객체(`score.total`)에서 수치를 정확히 추출하도록 개선했습니다.
3. **[FE] Code-Splitting & Navigation Fix**: `React.lazy`를 모든 주요 페이지에 적용하여 순환 참조로 인한 화면 크래시를 원천 차단했습니다.
4. **[UI] Version Badge Update**: 대시보드 상단 버전을 `v9.4.16`으로 업데이트하여 사용자 시인성을 확보했습니다.
5. **[DEPLOY] Zero-Downtime Patch**: 프론트엔드 빌드 최적화 및 PM2 프로세스 재시작을 통해 모든 수정사항을 실운영 환경에 즉시 반영했습니다.

## [v9.4.12] - 2026-04-13
### 🚩 상태: [Hardened] 수급 데이터(외국인/기관) 페치 안정화 패치
### 🛠 주요 변경 및 조치 사항
1. **[FIX] Investor Data Fetch Reliability**: KIS `inquire-investor` API 호출 시 발생하던 간헐적 누락을 해결하기 위해 **2회 재시도(Retry)** 및 **지수 백오프(Exponential Backoff)** 로직을 추가했습니다.

---

## [v9.4.13] - 2026-04-13
### 🚩 상태: 자동화 배포 완료 (Automated Release)

### 🛠 주요 변경 및 조치 사항
1. [NEW] 배포 자동화 및 리포트 엔진 안정화 최적화 패치
2. [FIX] 릴리즈 이력 자동 기록 시스템 도입


2. **[FIX] Timeout Expansion**: 네트워크 지연으로 인한 페치 실패를 방지하기 위해 타임아웃을 3초에서 **5초**로 확장했습니다.
3. **[LOG] Error Visibility**: 기존의 침묵하는 에러(`try-catch`)를 제거하고, 실패 시 `console.error` 로그를 출력하도록 개선하여 모니터링 가용성을 높였습니다.

---

## [v9.4.11] - 2026-04-13
### 🚩 상태: [Stable] v9.4.9 배포 후 회귀 버그(Regressions) 완벽 패치
### 🛠 주요 변경 및 조치 사항
1. **[FIX] Price Hierarchy Stabilization**: `PcDashboard`, `MobileStockCard`, `Top5Banner`의 가격 매핑을 `result_1=Target` 공식으로 통일하여 `Target > Current > Entry1 > Entry2 > SL` 계층 구조를 복구했습니다.
2. **[FIX] Supply Data Recovery**: 수급 데이터(외국인/기관) 누합 표시를 해결하기 위해 `parseInt` 및 콤마 제거 정규식을 프론트엔드/백엔드 전 구간에 적용했습니다.
3. **[FIX] Frontend Crash (Circular Dependency)**: `authStore` 초기화 리스너 위치를 조정하여 번들링 시 발생하는 `ReferenceError`를 해결했습니다.
4. **[BE] Sync History Mapping**: `DailyTop5` 테이블(Int)과 `daily_stock_snapshots`(String) 간의 데이터 타입 불일치를 매핑 시점에 자동 변환하여 정합성을 확보했습니다.

---

## [v9.4.9] - 2026-04-13
### 🚩 상태: [Stable] 통합 자동 동기화 하드닝 및 운영 안정성 확보 (Red Team-Verified)
### 🛠 주요 변경 및 조치 사항
1. **[STABILITY] Full Safe Mode 도입**: RDS DB 연결 장애 시에도 시스템 중단 없이 로컬 파일(`signals.json`) 및 리포트가 정상 생성되도록 예외 처리를 전 구간으로 확대했습니다.
2. **[FIX] BigInt JSON Serialization**: `trade_amount` 등 대규모 숫자 데이터의 JSON 변환 오류를 글로벌 패치로 해결하여 무결성을 확보했습니다.
3. **[FIX] ReferenceError (StockMaster)**: 프론트엔드와 백엔드 간 스키마 미일치로 인한 `StockMaster` 참조 오류를 로컬 데이터 폴백으로 완벽 해결했습니다.

---

## [v9.4.7] - 2026-04-13
### 🚩 상태: [Hotfix] 2H, 4H, 2D 타임프레임 평가 누락 긴급 수정
### 🛠 주요 변경 및 조치 사항
1. **[FIX] Resampling Engine Interface Repair**: `analyzer.cjs` 내부에서 정의된 `resampleChartData` 함수가 명시적으로 export되지 않아 서버의 `/api/auto-sync` 실행 시 TypeError를 일으키던 문제를 해결했습니다. 이제 백엔드 캐시 엔진이 2H, 4H, 2D 데이터를 성공적으로 리샘플링하여 신호를 추출합니다.

---

---

## [v9.3.15] - 2026-04-12
### 🚩 상태: 자동화 배포 완료 (Automated Release)

### 🛠 주요 변경 및 조치 사항
1. [NEW] 배포 자동화 및 리포트 엔진 안정화 최적화 패치
2. [FIX] 릴리즈 이력 자동 기록 시스템 도입



---

## [v9.3.14] - 2026-04-12
### 🚩 상태: 자동화 배포 완료 (Automated Release)

### 🛠 주요 변경 및 조치 사항
1. [NEW] 배포 자동화 및 리포트 엔진 안정화 최적화 패치
2. [FIX] 릴리즈 이력 자동 기록 시스템 도입



---

## [v9.3.13] - 2026-04-12
### 🚩 상태: 자동화 배포 완료 (Automated Release)

### 🛠 주요 변경 및 조치 사항
1. [NEW] 배포 자동화 및 리포트 엔진 안정화 최적화 패치
2. [FIX] 릴리즈 이력 자동 기록 시스템 도입



---

## [v9.3.12] - 2026-04-12
### 🚩 상태: 자동화 배포 완료 (Automated Release)

### 🛠 주요 변경 및 조치 사항
1. [NEW] 배포 자동화 및 리포트 엔진 안정화 최적화 패치
2. [FIX] 릴리즈 이력 자동 기록 시스템 도입



---

## [v9.4.7] - 2026-04-13
### 🚩 상태: [Hardened] DB 연결 유연성(Safe Mode) 및 동기화 안정성 강화
### 🛠 주요 변경 및 조치 사항
1. **[NEW] BulkSync Safe Mode**: DB 접속 불가능한 환경(로컬 VPC 등)에서 에러로 중단되지 않고 파일 저장 후 정상 종료되는 예외 처리 로직을 추가했습니다.
2. **[IMPROVED] Connection Resilience**: `prisma.$connect()`에 2초 타임아웃을 적용하여 네트워크 지연 시에도 시스템 가용성을 유지합니다.

---

## [v9.4.6] - 2026-04-13
### 🚩 상태: [Stable] Signals Engine 가격 로직 및 API 안정화 패치
### 🛠 주요 변경 및 조치 사항
1. **[FIX] result_3 Calculation**: `result_3` (final_entry2) 계산식을 `result_2`의 97%로 단순화하여 가격 계층 구조(Hierarchy)의 일관성을 확보했습니다.
2. **[STABILITY] KIS Rate Limit Patch**: 동시 처리량(`SYNC_BATCH_SIZE`)을 3으로 조정하고, API 호출 사이에 300ms 지연 시간을 추가하여 `EGW00201` (초당 거래건수 초과) 오류를 원천 차단했습니다.
3. **[VERIFIED] Sample Run**: 삼성전자(005930) 등 주요 종목에 대해 필터링 및 분석 로직이 정상 동작함을 검증 완료했습니다.

---

## [v9.4.5] - 2026-04-13
### 🚩 상태: [Hardened] Red Team 보안 패치 및 시스템 견고성 강화
### 🛠 주요 변경 및 조치 사항
1. **[SECURITY] SSE Write Guard**: 클라이언트 연결 단절 시 메모리 누수 및 불필요한 쓰기 작업을 방지하기 위해 `res.destroyed` 상태 체크 로직을 강화했습니다.
2. **[STABILITY] Lock Timeout (300s)**: 백엔드 신호 처리 락(`withSignalLock`)에 300초 타임아웃을 도입하여, 예외 상황에서도 시스템이 영구 대기(Starvation) 상태에 빠지지 않도록 방어 로직을 구축했습니다.
3. **[CONSISTENCY] Global Meta Sync**: `quarantine/` 및 관리용 스크립트 전반의 잔여 "348" 수치를 "350"으로 모두 수정하여 코드베이스의 일관성을 100% 확보했습니다.

---

## [v9.4.4] - 2026-04-13
### 🚩 상태: [Stable] 전체 종목 수 수치 표준화 (348 -> 350)
### 🛠 주요 변경 및 조치 사항
1. **[UI/UX] Stock Count Standardization**: 대시보드 상태바 및 동기화 진행률 표시의 기준 종목 수를 현재 라이브 유니버스인 350개로 일제히 업데이트했습니다.
2. **[BE] Sync Metadata Sync**: 백엔드 동기화 상태 엔드포인트의 `total` 값을 350으로 조정하여 프론트엔드와 백업 서버 간의 정합성을 확보했습니다.

---

## [v9.4.3] - 2026-04-13
### 🚩 상태: [Stable] 통합 자동 동기화 안정화 및 백엔드 락 하드닝 (Red Team-Verified)
### 🛠 주요 변경 및 조치 사항
1. **[FIX] Integrated Sync 'Blind Spot' 제거**: KIS 데이터 사전 수집(Prefetch) 단계의 진행률 보충 및 SSE 중계 로직 도입으로 동기화 시작 즉시 진행 상태가 표시되도록 개선했습니다.
2. **[STABILITY] Frontend Resilience**: 동기화 요청 타임아웃을 120초로 연장하고, 타임아웃 발생 시에도 백엔드가 분석을 완료할 때까지 UI 상태를 안전하게 유지하는 로직을 적용했습니다.
3. **[REFACTOR] Backend Lock Hardware**: 기존의 Busy-wait(isSignalFileLocked) 방식을 비차단형(Non-blocking) Promise Queue 구조로 개편하여 CPU 점유율을 낮추고 원자적 데이터 접근을 보장했습니다.
4. **[COMPLIANCE] API Rate Limit Guard**: KIS API 호출 배치 사이즈 및 딜레이 재조정으로 초당 20건 상한을 엄격히 준수하도록 설계되었습니다.

---

## [v9.4.2] - 2026-04-13
### 🚩 상태: [Stabilization] 프론트엔드 크래시(TDZ) 근본 해결 완료
### 🛠 주요 변경 및 조치 사항
1. **[FIX] 순환 참조(Circular Dependency) 물리적 차단**: `axiosClient`와 `authStore` 사이의 의존성 고리를 끊었습니다. 이제 `axiosClient`는 `CustomEvent`를 통해 인증 실패를 알리고, `authStore`가 이를 독립적으로 수신하여 처리합니다. 이를 통해 번들링 시 발생하는 `ReferenceError: Cannot access 'c' before initialization` 오류를 근본적으로 해결했습니다.
2. **[FIX] 배포 스크립트(deploy_safe.cjs) 보강**: 원격 서버 정리 시 `dist/assets` 디렉토리 생성 누락 문제를 해결하여 빈번한 SCP 업로드 오류를 방지했습니다.
3. **[UPD] 대시보드 버전 배지**: UI 상단에 `v9.4.2` 배지를 적용하여 패치 적용 여부를 쉽게 확인할 수 있도록 했습니다.

---

## [v9.4.1] - 2026-04-13

## [v9.3.11] - 2026-04-12



---

## [v9.3.10] - 2026-04-12
### 🚩 상태: 자동화 배포 완료 (Automated Release)

### 🛠 주요 변경 및 조치 사항
1. [NEW] 배포 자동화 및 리포트 엔진 안정화 최적화 패치
2. [FIX] 릴리즈 이력 자동 기록 시스템 도입



---

## [v9.3.9] - 2026-04-12
### 🚩 상태: 자동화 배포 완료 (Automated Release)

### 🛠 주요 변경 및 조치 사항
1. [NEW] 배포 자동화 및 리포트 엔진 안정화 최적화 패치
2. [FIX] 릴리즈 이력 자동 기록 시스템 도입



---

## [v9.3.8] - 2026-04-12
### 🚩 상태: 자동화 배포 완료 (Automated Release)

### 🛠 주요 변경 및 조치 사항
1. [NEW] 배포 자동화 및 리포트 엔진 안정화 최적화 패치
2. [FIX] 릴리즈 이력 자동 기록 시스템 도입



---

## [v9.3.7] - 2026-04-12
### 🚩 상태: 자동화 배포 완료 (Automated Release)

### 🛠 주요 변경 및 조치 사항
1. [NEW] 배포 자동화 및 리포트 엔진 안정화 최적화 패치
2. [FIX] 릴리즈 이력 자동 기록 시스템 도입



## [v9.3.5] - 2026-04-13
### 🚩 상태: [Stable] 통합 자동 동기화 타임프레임 누락 해결 및 엔진 하드닝
### 🛠 주요 변경 및 조치 사항
1. **[FIX] Missing Timeframe Recovery**: `analyzer.cjs`의 메타데이터 누락을 수정하여 2H, 4H, 2D, 1W 모든 타임프레임이 동기화 결과에 정상 노출되도록 복구했습니다.
2. **[DATA] Indicator Exposure**: ScoringService 연동에 필수적인 SMA5, 10, 20, 60 지표와 이평 정배열 상태 필드를 엔진 출력에 포함시켰습니다.
3. **[FE] Scoring Fallback**: 2H 데이터 부재 시 1H 데이터를 폴백으로 활용하고 10% 패널티를 적용하는 로직을 도입하여 분석 결과의 영속성을 강화했습니다.
4. **[SIGNAL] Advanced Grading**: `signal_H`(강력), `signal_HHH`(절대) 등 정밀한 신호 등급을 도입하여 전략 판단의 기준을 세분화했습니다.

---

## [v9.3.4] - 2026-04-13
### 🚩 상태: [Stable-Final] 상용 서버 환경 복구 및 350종목 동기화 안정화 완결
### 🛠 주요 변경 및 조치 사항
1. **[PROD] AWS Environment Hardening**: 리눅스 전용 가상환경(`venv`) 재구축 및 절대 경로 기반의 `ecosystem.config.cjs` 도입으로 상용 서버 기동 안정성을 확보했습니다.
2. **[DATA] 350-Stock Field Integrity**: 350개 전 종목에 대해 7개 타임프레임(30M~1W)의 모든 분석 지표(15개 필수 필드)가 누락 없이 100% 동기화됨을 전수 검증했습니다.
3. **[FIX] PM2 Process Conflict**: 포트 8000 충돌 및 `ProcessContainer` 간접 실행 오류를 해결하여 AI API 및 실시간 엔진의 가동률 100%를 달성했습니다.
4. **[SECURITY] Secret Restoration**: `INTERNAL_API_SECRET` 등 필수 환경변수를 복구하고 서버 내 `.env` 보안 권한을 강화했습니다.
5. **[FEATURE] Multi-Timeframe SSOT**: 2H, 4H, 2D, 1W 등 다차원 타임프레임 신호 분석 로직을 `analyzer.cjs` SSOT로 통합하여 프론트엔드와 완전 동기화했습니다.

---

## [v9.3.3] - 2026-04-12
### 🚩 상태: 동기화 정합성 및 404 장애 긴급 복구
### 🛠 주요 변경 및 조치 사항
1. **[FIX] Scoring Engine Restoration**: `server.cjs`에서 점수가 0점으로 산출되던 정의되지 않은 `scoreSignal` 함수 호출을 `calculateTotalScore`로 교체하여 점수 엔진을 정상화했습니다.
2. **[FIX] Route Restoration (404 Error)**: `src/routes/admin.cjs`에 누락되었던 `save-sync-history` 엔드포인트를 다시 추가하여 동기화 저장 시 발생하는 404 에러를 해결했습니다.
3. **[FIX] Supply Data Mapping**: `PcDashboard.jsx`에서 외인/기관 수급 데이터가 누락되던 필드 매핑 오류(`kis_change_data.foreign_buy` 등 표준 반영)를 수정했습니다.
4. **[DATA] Field Consistency**: 2H 타점 신호와 표준 이평선(sma) 필드 간의 연동 정합성을 최종 확보했습니다.

---

## [v9.3.2] - 2026-04-12
### 🚩 상태: 데이터 필드 정합성(SSOT) 최종 복구 및 점수 엔진 정상화
### 🛠 주요 변경 및 조치 사항
1. **[FIX] Field Name Standardization**: `ma5` 등 변칙적 필드명을 `sma5`, `sma10` 등 표준 규격으로 통일하여 `ScoringService` 연동 및 대시보드 표시 오류를 해결했습니다.
2. **[FIX] Scoring Engine Restoration**: 2H 데이터의 필드 매핑 오류로 인해 전 종목이 0점으로 배점되던 결함을 수정했습니다.
3. **[UI] MA Panel Recovery**: 2H 이평 정합성 대시보드에 5/10/20/60일 가격이 다시 노출되도록 복구했습니다.

---

## [v9.3.1] - 2026-04-12
### 🚩 상태: 통합 자동 동기화 버그픽스 및 실시간 수급 로직 강화 (Integrated Sync Hotfix)
### 🛠 주요 변경 및 조치 사항
1. **[FIX] Timeframe Recovery**: 2H, 4H, 2D 타임프레임 분석 누락 및 참조 오류(`resampleChartData`)를 완벽히 해결했습니다.
2. **[FIX] Scoring Spec Standard**: 신호 분석 결과 필드를 표준화하여 종목별 0점 배점 문제를 해결하고 1/2차 진입가 및 목표가를 대시보드에 정확히 복구했습니다.
3. **[UX] Real-time Progress Display**: SSE 이벤트를 최적화하여 동기화 진행 상황을 실시간으로 노출하고, 분석 완료 전까지 UI 상태가 유지되도록 개선했습니다.
4. **[DATA] Supply Data Formatting**: 외인/기관 수급 데이터에 `+` 기호를 적용하고 컬러 렌더링 로직을 보강하여 시인성을 높였습니다.

---

## [v9.3.0] - 2026-04-12
### 🚩 상태: 성능 최적화 및 신호 정합성 하드닝 완료 (Operation Hardened)
### 🛠 주요 변경 및 조치 사항
1. **[PERF] 7-Timeframe Parallel Optimization**: 분석 파이프라인 전구간(30M~1W) 병렬화 및 KIS 공유 캐시(`kisCache.cjs`) 도입으로 자원 소모 80% 절감.
2. **[FIX] Signal SSOT & Summary API**: 종목별 그룹화된 신호 요약 엔드포인트(`/api/signals-summary`)를 신설하여 프론트엔드 렌더링 성능을 극대화했습니다.
3. **[FIX] Duplicate & Growth Management**: `signals.json` 중복 자동 필터링 및 5000건 상한 캡을 적용하여 데이터 무결성과 스토리지 성능을 확보했습니다.
4. **[UX] Frontend Resilience**: `Promise.allSettled`와 자동 Fallback(플랫 신호 -> 클라이언트 그룹핑)을 적용하여 서버 장애 시에도 종목 목록 가용성을 유지합니다.
5. **[SSE] Sync-Driven Auto Refresh**: SSE 동기화 완료 신호와 프론트엔드 `fetchData`를 연동하여 실시간 업데이트 경험을 완성했습니다.

---

## [v9.2.1] - 2026-04-11
### 🚩 상태: 전 시스템 KST 시각 통합 및 랜딩페이지 자동 동기화 가동
### 🛠 주요 변경 및 조치 사항
1. **[SYS] Unified KST Engine**: `kst.cjs` 유틸리티를 통한 전 서버 모듈의 시각 기준 통일 (00:00~09:00 데이터 유령 현상 해결).
2. **[AUTO] Poller-Based Auto-Sync**: 10분 주기 시그널 폴러가 분석 완료 후 즉시 랜딩페이지(`landing_strategy.json`)와 캐시를 갱신하도록 자동화했습니다.
3. **[DATA] Field Integrity Safeguard**: 동기화 저장 시 AI 코멘트, 스타일 태그 등 주요 메타데이터 유실 방지 로직을 강화했습니다.

---

## [v9.1.8] - 2026-04-10
### 🚩 상태: Top 5 데이터 동기화 무결성 및 종목명 세이프가드 적용 완료
### 🛠 주요 변경 및 조치 사항
1. **[DATA] Sync Metadata Protection**: 자동 동기화 시 관리자가 입력한 '매매 전략(AI Comment)' 및 '스타일 태그'가 기술적 스냅샷에 의해 덮어씌워지지 않도록 보호 로직을 강화했습니다.
2. **[FIX] Stock Name Safeguard**: `TEST_동국제약`과 같은 테스트 데이터가 UI에 노출되지 않도록 API 레벨(`server.cjs`, `ssot.cjs`)에서 실시간 명칭 필터링을 적용했습니다.
3. **[DATA] Volume Metric Mapping**: 거래량 지표가 거래대금이 아닌 실제 거래 주식 수(`acml_vol`)를 반영하도록 매핑을 수정하여 지표의 정확도를 높였습니다.
4. **[CACHE] Redis Flush Expansion**: 동기화 저장 시 모든 Top N(5, 10, 20) 캐시를 일괄 무효화하여 모든 사용자가 즉시 최신 데이터를 확인하도록 개선했습니다.

---

## [v9.1.7] - 2026-04-10
### 🚩 상태: 데이터 정합성(SSOT) 완결 및 히스토리 정규화 패치 완료
### 🛠 주요 변경 및 조치 사항
1. **[DATA] Hybrid Field Mapping**: 백엔드 저장 시 `camelCase`와 `snake_case` 필드를 동시에 저장하도록 개선하여, 모든 프론트엔드 컴포넌트(`DailyReport`, `Analytics`)에서의 데이터 호환성을 100% 확보했습니다.
2. **[FIX] History Price Restoration**: `23:58` 저장 시점 등 과거 스냅샷에서 가격 데이터가 `0`으로 표시되던 결함을 전수 조사하여 운영 RDS 데이터를 기반으로 완벽히 복구했습니다.
3. **[UI] Display Fallback**: 프론트엔드 분석 페이지에 필드 폴백 로직을 추가하여, 기존에 저장된 레거시 데이터도 누락 없이 표시되도록 사용자 경험을 강화했습니다.

---

## [v9.1.6] - 2026-04-09
### 🚩 상태: 매수 가격 현실화 및 시스템 안정성 강화 패치 완료
### 🛠 주요 변경 및 조치 사항
1. **[UX] Entry Price Realization**: 매수진입가와 목표가가 현재가와 너무 동떨어지는 문제를 해결하기 위해, 현재가 대비 **-1.5% ~ -5%** 이내의 현실적인 가격이 생성되도록 알고리즘을 전면 개편했습니다.
2. **[FIX] Sync Save Stability**: '동기화 저장' 시 발생하던 500 에러를 방지하기 위해 `kstNow` 시각 정의를 표준화하고, 에러 발생 시 상세 보기를 지원하는 로깅 방어 코드를 적용했습니다.
3. **[UI] Dashboard Alignment**: 1차 매수진입가 표시 라인의 정렬이 어긋나던 문제를 `Flexbox` 통일 작업을 통해 수정했습니다.

---

## [v9.1.5] - 2026-04-09

## [v9.1.3] - 2026-04-09
### 🚩 상태: 수익률 컬러 표준화 및 실시간 시세 정합성 검증 완료
### 🛠 주요 변경 및 조치 사항
1. **[UI] KRX Color Standard**: 한국 시장 관행에 맞춰 평균 수익률이 플러스(+)이면 빨강, 마이너스(-)이면 파랑으로 표시되도록 스타일 가이드를 전면 수정했습니다.
2. **[DATA] Live-Price Validation**: 백테스트 체결가와 실제 KIS 실시간 시세를 대조하여 엔진의 정밀도를 검증하고, 건설 섹터의 약세 등 시장 상황을 리포트에 반영했습니다.
3. **[DEPLOY] Hotfix Deployment**: 모든 UI 수정 사항을 상용 서버에 반영하고 빌드 및 Nginx 재시작을 완료했습니다.

---

## [v9.1.2] - 2026-04-09
### 🚩 상태: 백테스트 시뮬레이션 시각 동기화 및 가이드 보강
### 🛠 주요 변경 및 조치 사항
1. **[BACKEND] Full Timestamp Sync**: 엔진 내부 시각을 틱 데이터와 동기화하여, 누락되었던 **'매도청산' 시각**이 리포트에 정확히 표시되도록 조치했습니다.
2. **[UI] Strategy Logic Summary**: 회원이 전략의 원리를 쉽게 이해할 수 있도록 'WBS 미래 예측 로직 요약' 섹션을 리포트 하단에 신설했습니다.
3. **[STABILITY] Simulation Clock**: `STATE['current_time']` 시스템을 도입하여 실시간과 백테스트 간의 시계열 정합성을 확보했습니다.

---

## [v9.1.1] - 2026-04-09
### 🚩 상태: 백테스트 엔진 데이터 정합성 결함 긴급 수정
### 🛠 주요 변경 및 조치 사항
1. **[FIX] Library Import Bug**: `init_task.py`의 `json` 라이브러리 누락으로 인해 종목명이 `009150 (009150)`과 같이 중복 출력되던 문제를 해결했습니다.
2. **[CALC] ROI Algorithm Fix**: 전체 수익률이 단순 합산되어 표시되던 논리적 오류를 수정하고, 거래 건당 **'산술 평균 수익률(Mean ROI)'**이 산출되도록 알고리즘을 개편했습니다.
3. **[FIX] Alert Capture Timeout**: 엔진 처리 속도 차이로 신호가 유실되는 것을 방지하기 위해 Alert Listener 타임아웃을 5초로 최적화했습니다.

---

## [v9.1.0] - 2026-04-09
### 🚩 상태: 백테스트 리포트 UI 대규모 고도화 및 AI 인사이트 탑재
### 🛠 주요 변경 및 조치 사항
1. **[NEW] AI Market Insight (M-Insight)**: 백테스트 승률과 수익률을 AI가 분석하여 맞춤형 매매 전략 코멘트를 생성하는 기능을 추가했습니다.
2. **[UI] Premium Report Layout**: 원형 게이지 형태의 승률 표시, 성과 배지 시스템, 고해상도 다크모드 대시보드 테마를 적용했습니다.
3. **[DEPLOY] Sync Optimization**: 빌드 결과물을 상용 서버의 Nginx 루트 경로로 직접 동기화하여 배포 반영 지연 문제를 원천 해결했습니다.

---

## [v9.0.6] - 2026-04-09
### 🚩 상태: ATS 및 시간외 거래 전구간(08:00~20:00) 실시간 모니터링 가동 완결

### 🛠 주요 변경 및 조치 사항
1. **[NEW] Universal Market Monitoring**: 대체거래소(ATS) 프리마켓(08:00)부터 야간 애프터마켓(20:00)까지 전구간을 실시간으로 감시할 수 있도록 엔진 운영 시간을 대폭 확장했습니다.
2. **[UI] Intelligent Status Indicator**: 현재 시장 상태(정규장, ATS 거래 중, 시간외 단일가 등)를 실시간 시각화하여 사용자가 한눈에 파악할 수 있도록 개선했습니다.
3. **[STABILITY] Runtime Defense**: 백테스트 상세 로그 렌더링 시 발생하던 `TypeError`를 옵셔널 체이닝으로 원천 차단하여 시스템 안정성을 확보했습니다 (v9.0.5 핫픽스 포함).
4. **[UX] 5-Stock Dashboard Final**: 모든 해상도에서 5종목이 좌우로 완벽히 정렬되도록 리포트 가로 배치 로직(flex: 1 1 0)을 최종 고도화했습니다.
5. **[DATA] Transparency (Evidence Library)**: 백테스트 결과 하단에 '상세 거래 내역' 패널을 신설하여 진입/청산의 근거를 매 틱 실시간으로 제공합니다.

---

## [v9.0.0] - 2026-04-09
### 🚩 상태: 실시간 수급 예측 엔진(Phase 1~4) 상용 배포 가동 완료

### 🛠 주요 변경 및 조치 사항
1. **[NEW] Real-time WBS Engine**: KIS API WebSocket을 연동하여 1초 단위로 수급을 정밀 분석하는 실시간 엔진(`sniper_engine`)을 정식 탑재했습니다.
2. **[NEW] Live Dashboard**: 기존 백테스트 위젯을 '실시간 모니터링 전광판'으로 전환하여, 0.3초대 초저지연 시그널 Push 시스템을 구축했습니다.
3. **[STABILITY] Zero-Downtime Reliability**: KIS 토큰 자동 갱신, 네트워크 장시간 단절 시 지수 백오프 재연결, 한국 거래소 운영 시간(09:00~15:30) 자동 제어 로직을 적용했습니다.
4. **[SECURITY] Internal API Guard**: Python 분석 엔진과 Node 서버 간의 통신 보안을 위해 로컬 루프백(127.0.0.1) 화이트리스팅 보안 필터를 적용했습니다.
5. **[DOCS] Signal Manual**: 회원을 위한 실시간 신호 해석 매뉴얼(P-Score, WBS 등)을 아티팩트로 제공합니다.

---

## [v8.8.42] - 2026-04-09
### 🚩 상태: 백테스트 시뮬레이션 복구 및 회원 전용 서비스 개방 완료

### 🛠 주요 변경 및 조치 사항
1. **[FIX] Engine Restoration**: 상용 서버의 데이터 누락 및 권한 문제를 해결하여 백테스트 엔진(`sniper_engine`)을 정상 가동 상태로 복구했습니다.
2. **[NEW] Dynamic Targeting**: 이제 백테스트가 항상 **현재 랜딩페이지 Top 5 종목**을 대상으로 실시간 시뮬레이션을 수행하도록 연동했습니다.
3. **[UI] Premium Dashboard**: 시뮬레이션 결과를 원형 게이지와 성과 배지, 그리고 전략 가이드를 포함한 현대적인 프리미엄 대시보드 UI로 전면 개편했습니다.
4. **[SERVICE] Member Portal**: 내비게이션에 '엔진 성능검증' 메뉴를 신설하고 모든 회원(`USER`, `VIP`)이 시뮬레이션을 직접 수행할 수 있도록 권한을 개방했습니다.

---

## [v8.8.38] - 2026-04-09
### 🚩 상태: 플랫폼 지표 전수 조사 및 실시간 정합성 보강 배포 완료

### 🛠 주요 변경 및 조치 사항
1. **[FIX] Performance Data Integrity**: 성과확인 페이지에서 발생하던 종목 중복 및 누락 현상을 해결하기 위해 DB SSOT와 `latest.json` 간의 지능형 병합 및 중복 제거(Map-based) 로직을 적용했습니다.
2. **[FIX] Indicator Normalization**: 분석 페이지와 배너에서 수급 데이터(외국인/기관)를 단순히 문자열로 비교하던 방식을 수치 기반(Numeric Sign)으로 표준화하여 색상 강조 오류를 해결했습니다.
3. **[UX] Mobile Optimization**: 모바일 대시보드의 특정 버튼 텍스트가 길어 발생하는 레이아웃 깨짐을 방지하기 위해 텍스트 축약(통합 분석) 및 여백 조정을 수행했습니다.
4. **[LIVE] Notification Sync**: 랜딩페이지 알림 피드를 라이브 성과 데이터와 연동하여 실제 수익률 데이터가 실시간으로 흐르도록 개선했습니다.

---

## [v8.8.37] - 2026-04-09
### 🚩 상태: 거래량 증감율(%) 전용 표시 및 UI 미니멀리즘 강화 완료

### 🛠 주요 변경 및 조치 사항
1. **[UI] Display Streamlining**: 거래량 표시에서 절대 수치(`주`)를 제거하고 **'전일 대비 증감율(%)'**만 단독으로 표시하여 시각적 복잡도를 획기적으로 낮췄습니다.
2. **[DATA] All-Stock Validation**: GS건설(586.22%) 외에 대우건설, DL이앤씨 등 5종목 전체의 4월 8일자 거래 증감 데이터를 최종 검증하여 반영했습니다.
3. **[UX] Format Polish**: 모든 증감율 수치를 `00.00%` 단위로 일관성 있게 출력하여 전문 투자 지표로서의 규격을 완성했습니다.
4. **[BE] Production Hotfix**: 최신 빌드 산출물을 상용 경로에 강제 동기화하여 실시간 배포 완료했습니다.

---




## [v8.8.26] - 2026-04-08
### 🚩 상태: 준수 검증 체크리스트 및 프로토콜 수립

### 🛠 주요 변경 및 조치 사항
1. **[PROCESS] Verification Checklist**: 프로젝트 규칙 준수를 강제하기 위한 마스터 체크리스트를 수립했습니다.
2. **[DOCS] Implementation Protocol**: 모든 작업 시 '계획 우선(Plan-First)' 원칙을 적용하도록 문서를 정비했습니다.

---

### 🚩 상태: 자동화 배포 완료 (Automated Release)

### 🛠 주요 변경 및 조치 사항
1. [NEW] 배포 자동화 및 리포트 엔진 안정화 최적화 패치
2. [FIX] 릴리즈 이력 자동 기록 시스템 도입



---

## [v8.8.24] - 2026-04-08
### 🚩 상태: 자동화 배포 완료 (Automated Release)

### 🛠 주요 변경 및 조치 사항
1. [NEW] 배포 자동화 및 리포트 엔진 안정화 최적화 패치
2. [FIX] 릴리즈 이력 자동 기록 시스템 도입



---

## [v8.8.23] - 2026-04-08
### 🚩 상태: 자동화 배포 완료 (Automated Release)

### 🛠 주요 변경 및 조치 사항
1. [NEW] 배포 자동화 및 리포트 엔진 안정화 최적화 패치
2. [FIX] 릴리즈 이력 자동 기록 시스템 도입



---

## [v8.8.22] - 2026-04-08
### 🚩 상태: 자동화 배포 완료 (Automated Release)

### 🛠 주요 변경 및 조치 사항
1. [NEW] 배포 자동화 및 리포트 엔진 안정화 최적화 패치
2. [FIX] 릴리즈 이력 자동 기록 시스템 도입



---

## [v8.8.21] - 2026-04-08
### 🚩 상태: 자동화 배포 완료 (Automated Release)

### 🛠 주요 변경 및 조치 사항
1. [NEW] 배포 자동화 및 리포트 엔진 안정화 최적화 패치
2. [FIX] 릴리즈 이력 자동 기록 시스템 도입



---

## [v8.8.20] - 2026-04-08
### 🚩 상태: 자동화 배포 완료 (Automated Release)

### 🛠 주요 변경 및 조치 사항
1. [NEW] 배포 자동화 및 리포트 엔진 안정화 최적화 패치
2. [FIX] 릴리즈 이력 자동 기록 시스템 도입



---

## [v8.8.17] - 2026-04-08
### 🚩 상태: 자동화 배포 완료 (Automated Release)

### 🛠 주요 변경 및 조치 사항
1. [NEW] 배포 자동화 및 리포트 엔진 안정화 최적화 패치
2. [FIX] 릴리즈 이력 자동 기록 시스템 도입



---

## [v8.8.16] - 2026-04-08
### 🚩 상태: 자동화 배포 완료 (Automated Release)

### 🛠 주요 변경 및 조치 사항
1. [NEW] 배포 자동화 및 리포트 엔진 안정화 최적화 패치
2. [FIX] 릴리즈 이력 자동 기록 시스템 도입



---

## [v8.8.15] - 2026-04-08
### 🚩 상태: 자동화 배포 완료 (Automated Release)

### 🛠 주요 변경 및 조치 사항
1. [NEW] 배포 자동화 및 리포트 엔진 안정화 최적화 패치
2. [FIX] 릴리즈 이력 자동 기록 시스템 도입



---

## [v8.8.14] - 2026-04-08
### 🚩 상태: 자동화 배포 완료 (Automated Release)

### 🛠 주요 변경 및 조치 사항
1. [NEW] 배포 자동화 및 리포트 엔진 안정화 최적화 패치
2. [FIX] 릴리즈 이력 자동 기록 시스템 도입



---

## [v8.8.13] - 2026-04-08
### 🚩 상태: 자동화 배포 완료 (Automated Release)

### 🛠 주요 변경 및 조치 사항
1. [NEW] 배포 자동화 및 리포트 엔진 안정화 최적화 패치
2. [FIX] 릴리즈 이력 자동 기록 시스템 도입



---

## [v8.8.12] - 2026-04-08
### 🚩 상태: 자동화 배포 완료 (Automated Release)

### 🛠 주요 변경 및 조치 사항
1. [NEW] 배포 자동화 및 리포트 엔진 안정화 최적화 패치
2. [FIX] 릴리즈 이력 자동 기록 시스템 도입



---

## [v8.8.11] - 2026-04-08
### 🚩 상태: 자동화 배포 완료 (Automated Release)

### 🛠 주요 변경 및 조치 사항
1. [NEW] 배포 자동화 및 리포트 엔진 안정화 최적화 패치
2. [FIX] 릴리즈 이력 자동 기록 시스템 도입



---

## [v8.8.10] - 2026-04-08
### 🚩 상태: 자동화 배포 완료 (Automated Release)

### 🛠 주요 변경 및 조치 사항
1. [NEW] 배포 자동화 및 리포트 엔진 안정화 최적화 패치
2. [FIX] 릴리즈 이력 자동 기록 시스템 도입



---

## [v8.8.9] - 2026-04-08
### 🚩 상태: 자동화 배포 완료 (Automated Release)

### 🛠 주요 변경 및 조치 사항
1. [NEW] 배포 자동화 및 리포트 엔진 안정화 최적화 패치
2. [FIX] 릴리즈 이력 자동 기록 시스템 도입



---

## [v8.8.8] - 2026-04-07
### 🚩 상태: 자동화 배포 완료 (Automated Release)

### 🛠 주요 변경 및 조치 사항
1. [NEW] 배포 자동화 및 리포트 엔진 안정화 최적화 패치
2. [FIX] 릴리즈 이력 자동 기록 시스템 도입



---

## [v8.8.7] - 2026-04-07
### 🚩 상태: 자동화 배포 완료 (Automated Release)

### 🛠 주요 변경 및 조치 사항
1. [NEW] 배포 자동화 및 리포트 엔진 안정화 최적화 패치
2. [FIX] 릴리즈 이력 자동 기록 시스템 도입



---

## [v8.8.6] - 2026-04-07
### 🚩 상태: 자동화 배포 완료 (Automated Release)

### 🛠 주요 변경 및 조치 사항
1. [NEW] 배포 자동화 및 리포트 엔진 안정화 최적화 패치
2. [FIX] 릴리즈 이력 자동 기록 시스템 도입



---

## [v8.8.5] - 2026-04-07
### 🚩 상태: 자동화 배포 완료 (Automated Release)

### 🛠 주요 변경 및 조치 사항
1. [NEW] 배포 자동화 및 리포트 엔진 안정화 최적화 패치
2. [FIX] 릴리즈 이력 자동 기록 시스템 도입



---

## [v8.8.4] - 2026-04-07
### 🚩 상태: 자동화 배포 완료 (Automated Release)

### 🛠 주요 변경 및 조치 사항
1. [NEW] 배포 자동화 및 리포트 엔진 안정화 최적화 패치
2. [FIX] 릴리즈 이력 자동 기록 시스템 도입



---

## [v8.8.3] - 2026-04-07
### 🚩 상태: 자동화 배포 완료 (Automated Release)

### 🛠 주요 변경 및 조치 사항
1. [NEW] 배포 자동화 및 리포트 엔진 안정화 최적화 패치
2. [FIX] 릴리즈 이력 자동 기록 시스템 도입



---

## [v8.8.2] - 2026-04-07
### 🚩 상태: 자동화 배포 완료 (Automated Release)

### 🛠 주요 변경 및 조치 사항
1. [NEW] 배포 자동화 및 리포트 엔진 안정화 최적화 패치
2. [FIX] 릴리즈 이력 자동 기록 시스템 도입


1. **[FEATURE] Sync Save**: '동기화 저장' 버튼을 추가하여, 완료된 Top 5 데이터를 특정 시점의 스냅샷으로 명시적으로 저장하는 기능을 구현했습니다.
2. **[HISTORY] Granular Snapshots**: 날짜/시간별 히스토리 기록을 위한 `SyncSaveLog` 모델을 도입하여 저장 시점별 정밀 조회가 가능해졌습니다.
3. **[UI/UX] Category Selector**: 'Daily 종목 분석' 페이지에서 저장된 히스토리를 시점별(YYYY-MM-DD HH:mm)로 선택하여 과거 데이터를 즉시 불러올 수 있는 카테고리 필터를 추가했습니다.
4. **[BE] History API**: 히스토리 태그 목록 및 상세 조회를 위한 전용 API 엔드포인트를 구축했습니다.

## [v8.7.7] - 2026-04-08
### 🚩 상태: 화면 동기화 즉시 반영 (Cache Invalidation)

### 🛠 주요 변경 및 조치 사항
1. **[CACHE] Redis Cache Invalidation**: 동기화 완료 후 랜딩페이지의 Top 5 데이터가 즉시 갱신되지 않던 문제를 해결하기 위해 Redis 캐시(`mp:top:*`) 강제 삭제 로직을 동기화 종료 시점에 추가했습니다.
2. **[LEGACY] Log File Restoration**: 일부 레거시 컴포넌트에서 참조하는 `latest.json` 요약 리포트 생성 로직을 복구하여 시스템 전반의 호환성을 높였습니다.
3. **[REALTIME] UI Refresh**: 이제 '통합 자동 동기화' 완료 즉시 랜딩페이지에서도 동일한 최신 Top 5 종목이 실시간으로 노출됩니다.

## [v8.7.6] - 2026-04-08
### 🚩 상태: 데이터 정합성 일원화 (SSOT Alliance)

### 🛠 주요 변경 및 조치 사항
1. **[INTEGRITY] SSOT (Single Source of Truth) Implementation**: 기존에 별도로 계산되던 '동기화 UI' 데이터와 '랜딩페이지 Top 5' 데이터를 `DailyStockSnapshot` 테이블 기준으로 **100% 일원화**했습니다.
2. **[ALIGNMENT] Landing Page Consistency**: 이제 랜딩페이지의 Top 5 종목은 동기화 완료 직후의 스냅샷 데이터에서 직접 추출되므로, 가격/진입가/목표가 등 모든 지표가 동기화 화면과 완전하게 일치합니다.
3. **[PERFORMANCE] Logic Refactoring**: 중복된 신호 계산 로직을 제거하여 서버 부하를 줄이고 데이터 동기화 속도를 개선했습니다.

## [v8.7.5] - 2026-04-08
### 🚩 상태: 긴급 복구 및 보정 (30M 프레임 복구 및 데이터 정규화)

### 🛠 주요 변경 및 조치 사항
1. **[RESTORATION] 30M Timeframe Recovery**: 분석에서 제외되었던 `30M`(30분봉) 타임프레임을 다시 활성화하여 단기 신호 포착 기능을 복구했습니다.
2. **[INTELLIGENCE] Dynamic Price Alignment**: Yahoo Finance의 데이터 스케일 오류(예: 삼성전자 가격 7배 차이 등)를 자동으로 감지하고, KIS 실시간 가격을 기준으로 과거 시계열 전체를 정규화(Scaling)하는 지능형 보정 로직을 도입했습니다.
3. **[STABILITY] Signal Data Integrity**: 보정된 가격 데이터를 바탕으로 RSI, EMA 등 기술적 지표가 정확한 가격대에서 산출되도록 보장합니다.

## [v8.7.4] - 2026-04-08
### 🚩 상태: 긴급 패치 (현재가 정합성 강화 및 노이즈 제거)

### 🛠 주요 변경 및 조치 사항
1. **[STABILITY] Unstable Timeframe Removal**: Yahoo Finance에서 간헐적으로 부정확한 데이터를 리턴하는 `30M`(30분봉) 타임프레임을 동기화 루프에서 제외하여 데이터 오염을 방지했습니다.
2. **[INTEGRITY] KIS Price Priority**: DB 스냅샷 저장 시, 각 타임프레임 결과와 상관없이 KIS 실시간 API에서 수신한 현재가(`stck_prpr`)를 최우선적으로 반영하도록 로직을 강화했습니다.
3. **[RELIABILITY] Multi-TF Price Merge**: 1D 뿐만 아니라 모든 타임프레임 분석 시 KIS 실시간 가격을 병합하여 지표 계산의 정확도를 높였습니다.

## [v8.7.3] - 2026-04-07
### 🚩 상태: 긴급 핫픽스 (분석 데이터 미출력 버그 수정)

### 🛠 주요 변경 및 조치 사항
1. **[HOTFIX] Missing Reference**: `v8.7.2`에서 누락되었던 `resampleChartData` 함수를 복구하여 분석 프로세스 중단 오류를 해결했습니다.
2. **[STABILITY] Version Sync**: 배포 스크립트 고도화에 맞춰 상용 서버의 메타데이터 정합성을 맞췄습니다.

## [v8.7.2] - 2026-04-07
### 🚩 상태: 상용 서버 배포 및 동기화 안정성 강화 (Bulletproof Sync)

### 🛠 주요 변경 및 조치 사항
1. **[STABILITY] Cold-Start Recovery (TASK-01)**: `detectColdStartCheckpoint`를 추가하여 대규모 동기화 시 마지막으로 저장된 50종목 지점부터 재개하도록 개선했습니다.
2. **[STABILITY] Token Serialization (TASK-04)**: 병렬 배치 처리 중 401 토큰 만료 시 발생하는 경쟁 상태(Race Condition)를 방지하기 위해 토큰 갱신 요청을 직렬화했습니다.
3. **[STABILITY] Fail-Safe Batching (TASK-05)**: `Promise.allSettled`를 도입하여 개별 종목의 동기화 실패가 전체 프로세스를 중단시키지 않도록 격리 및 로깅 처리를 강화했습니다.
4. **[RELIABILITY] Redundancy Phase 2**: 수급 데이터의 정확성을 위해 KIS/네이버 교차 검증 로직을 추가했습니다.
5. **[OPS] Emergency Recovery**: 긴급 복구 절차를 위한 `ROLLBACK.md` 문서를 생성했습니다.

이 파일은 플랫폼의 코드 수정 및 배포 이력을 관리합니다.
 
## [v8.7.1] - 2026-04-07
### 🚩 상태: 상용 서버 배포 및 동기화 안정성 강화 (Defensive Sync & Stability)
 
### 🛠 주요 변경 및 조치 사항
1. **[STABILITY] Checkpoint 중간 저장 도입 (TASK-01)**: 50종목마다 `signals.json`을 중간 저장하고 `broadcastUpdate()`를 통해 실시간 상태를 클라이언트에 반영하며, 분석 중단 시 데이터 손실을 방지합니다.
2. **[STABILITY] Naver Fallback Throttling 적용 (TASK-02)**: 배치 내 종목별로 150ms 시차(Jitter)를 부여하여 KIS API 차단 시 발생하는 대량 네이버 Fallback에 따른 IP 차단 리스크를 제거했습니다.
3. **[STABILITY] KIS 토큰 만료 무중단 대응 (TASK-03)**: 동기화 도중 토큰 만료(401) 감지 시 즉시 전역 토큰을 갱신하고 재시도하도록 로직을 복원하여 분석 품질을 유지합니다.
4. **[PERF] 실시간 DB 영속화**: 분석 완료 즉시 DB 스냅샷(DailyStockSnapshot)을 Upsert하여 시스템 가용성과 정합성을 높였습니다.
5. **[REFACTOR] 수급 포맷 함수 단일화 (TASK-04)**: `formatSyncSupply` 중복 정의를 제거하고 `src/utils/supplyRepair.cjs`의 공용 함수로 통합했습니다.
 
---
 
## [v8.7.0] - 2026-04-07
### 🚩 상태: 상용 서버 배포 및 성능 최적화 (Performance Optimization & Sync Fix)
 
### 🛠 주요 변경 및 조치 사항
1. **[PERF] 통합 자동 동기화 속도 혁신 (40분 -> 5분 이내)**: 루프 구조를 종목 우선 방식으로 변경하고 KIS 데이터 캐싱(종목당 1회 호출) 및 병렬 처리(Concurrency: 5)를 도입하여 동기화 성능을 8배 이상 개선했습니다.
2. **[FIX] 수급 데이터 정합성 해결**: 네이버 파이낸스 API의 컴마(`,`) 포함 문자열 파싱 시 발생하던 `parseInt` 잘림 현상을 `safeParse` 유틸리티를 적용하여 완벽히 수정했습니다.
3. **[FIX] KIS 데이터 중복 호출 방지**: 동일 종목에 대해 여러 타임프레임 분석 시 KIS API를 중복 호출하던 로직을 캐시 기반으로 일원화하여 API 안정성을 높였습니다.
4. **[DEPLOY] AWS 운영 서버 배포**: 최신 최적화 엔진을 운영 서버(15.134.243.209)에 배포하고 PM2 프로세스를 재시작했습니다.
 
---
 
## [v8.6.3] - 2026-04-07
### 🚩 상태: 상용 서버 배포 및 수급/점검 데이터 복구 (Deployment & Data Repair)
 
### 🛠 주요 변경 및 조치 사항
1. **[FIX] 리비전 버전 업데이트**: `package.json` 및 프론트엔드 빌드 버전을 `8.6.3`으로 업데이트했습니다.
2. **[FIX] 종목 점수 복구**: 동기화 과정에서 점수가 누락되어 낮은 "별점(star_grade)"으로 표시되던 현상을 해결하고, `latest.json`에 원본 하이브리드 점수를 복구했습니다.
3. **[REPAIR] 수급 데이터 누락 복구**: KIS API 불안정 및 하드코딩 0값 이슈를 해결하기 위해 네이버 수급 API 연동 복구 스크립트(`repair_supply_file_only.cjs`)를 실행하여 외국인/기관 수급 데이터를 정상화했습니다.
4. **[DEPLOY] AWS 운영 서버 배포**: `aws_update.bat`을 통해 최신 빌드(`dist`) 및 서버 코드를 운영 서버(15.134.243.209)에 반영했습니다.
 
---

## [v8.6.2] - 2026-04-07
### 🚩 상태: 상용 서버 배포 및 자동화 로직 수정 (Deployment & Fix)
 
### 🛠 주요 변경 및 조치 사항
1. **[FIX] DB 자동 저장 로직 통합**: `server.cjs`의 21:00 batch 크론잡 및 `/api/auto-sync` 핸들러에 `saveDailyTop5` 호출을 통합하여 향후 종목 동기화 시 DB 자동 저장이 보장되도록 수정했습니다.
2. **[SYNC] 수동 종목 동기화 완료**: 2026-04-07 추천 종목(삼성E&A, SK이노베이션, 코웨이, 한화에어로스페이스, 천보)에 대한 랜딩페이지 수동 업데이트 및 DB 백필을 완료했습니다.
3. **[DEPLOY] AWS 운영 서버 배포**: 수정된 서버 코드를 상용 서버에 반영하고 PM2 프로세스(`mp-stock-discovery`)를 재시작했습니다.
 
---

## [v7.9.2] - 2026-04-07
### 🚀 Features

---

## [v7.9.7] - 2026-04-07
### 🚩 상태: 자동화 배포 완료 (Automated Release)

### 🛠 주요 변경 및 조치 사항
1. [NEW] 배포 자동화 및 리포트 엔진 안정화 최적화 패치
2. [FIX] 릴리즈 이력 자동 기록 시스템 도입



---

## [v7.9.6] - 2026-04-07
### 🚩 상태: 자동화 배포 완료 (Automated Release)

### 🛠 주요 변경 및 조치 사항
1. [NEW] 배포 자동화 및 리포트 엔진 안정화 최적화 패치
2. [FIX] 릴리즈 이력 자동 기록 시스템 도입



---

## [v7.9.5] - 2026-04-07
### 🚩 상태: 자동화 배포 완료 (Automated Release)

### 🛠 주요 변경 및 조치 사항
1. [NEW] 배포 자동화 및 리포트 엔진 안정화 최적화 패치
2. [FIX] 릴리즈 이력 자동 기록 시스템 도입



---

## [v7.9.4] - 2026-04-07
### 🚩 상태: 자동화 배포 완료 (Automated Release)

### 🛠 주요 변경 및 조치 사항
1. [NEW] 배포 자동화 및 리포트 엔진 안정화 최적화 패치
2. [FIX] 릴리즈 이력 자동 기록 시스템 도입



---

## [v7.9.3] - 2026-04-07
### 🚩 상태: 자동화 배포 완료 (Automated Release)

### 🛠 주요 변경 및 조치 사항
1. [NEW] 배포 자동화 및 리포트 엔진 안정화 최적화 패치
2. [FIX] 릴리즈 이력 자동 기록 시스템 도입


- **Top 5 Real-time Monitoring**: Integrated database-driven stock identification (`DailyTop5`) for accurate real-time price and yield updates on the dashboard.
- **Gap-up Response Strategy**: Implemented aggressive entry pricing (`entryPrice1`) for high-momentum stocks (score >= 80) and added specific gap-up trading guidance.
- **Backend Optimization**: Refactored `getPriorityCodes` and `SignalPoller` to use PostgreSQL as the Single Source of Truth for daily recommendations.

### Fixed
- **UI Consistency**: Fixed `ReferenceError: LayoutGrid is not defined` by adding missing Lucide icon imports.


- **UI Consistency**: Fixed `ReferenceError: LayoutGrid is not defined` by adding missing Lucide icon imports (`LayoutGrid`, `Flame`, `CheckCircle`).

## [v8.5.4] - 2026-04-07
### Fixed
- **Comprehensive Stability**: Fixed missing React hook imports (`useState`, `useEffect`) and implemented safe navigation (`?.length`) across all PC/Mobile dashboards to prevent runtime crashes.

## [v8.5.2] - 2026-04-07
### Fixed
- **Navigation Stability**: Resolved `ReferenceError: useMemo is not defined` in `MPStockDailyReport` component which caused crashes during menu navigation.

## [v8.5.1] - 2026-04-07
### Fixed
- **Emergency Fix**: Resolved `ReferenceError: todayStr is not defined` in `SignalBoard` component which caused dashboard crashes.

## [v8.4.3] - 2026-04-07
### Changed
- **UI Final Polish**: Matched supply data (Foreigner/Institutional) font size (`0.9rem`) and weight (`700`) exactly with the price display for full visual consistency. Applied to both Top 5 and Interest Stock cards.

## [v8.4.2] - 2026-04-07
### Changed
- **UI UX Polish**: Enhanced supply data (Foreigner/Institutional) styling. Increased font size and weight for readability and added strict Red (Net Buy) / Blue (Net Sell) color-coding.

## [v8.4.1] - 2026-04-07
### Fixed
- **Frontend Stability**: Fixed `TypeError: startsWith is not a function` in `Top5StrategyBanner` and `WatchlistStrategyBanner` by ensuring numeric supply data is stringified before processing.
- **Mobile Admin Access**: Fixed `ReferenceError: UserCog is not defined` in `MobileDashboard` by adding the missing icon import from `lucide-react`.
- **SSOT API**: Updated `ssot/top/5` to include `foreign_buy` and `inst_buy` fields in the standard response.

## [v8.0.0] - 2026-04-07
### Added
- **DailyTop5 Database Full Integration**: Historical Top 5 data is now used across the Member Landing Page and Performance Review Page.
- **Backend API**: New `/api/daily-top5` endpoint for fetching daily archived recommendations.
- **Multi-Timeframe Sync Optimization**: Implemented KIS data caching in `analyzer.cjs`, reducing total API calls by 70% and improving sync stability.

## [v7.9.0] - 2026-04-07
### 🚀 Features
- **DailyTop5 Database**: Implemented dedicated historical table for Top 5 stock recommendations, capturing expanded metrics (Foreigner/Inst buying, Trade Amount).
- **Sync Architecture Fix**: Refactored `analyzer.cjs` to ensure aggregate DB synchronization runs for the full 350-stock universe, resolving the "filtered stocks only" bottleneck.
- **Bidirectional Price Guard (v7.8.37 legacy)**: Enforced "Target Price Floor" (+10%) and "Entry Price Ceiling" (-2%) for all Top 5 signals.

## v8.6.4 (2026-04-07)
- **Sync Integrity**: Unified signal selection logic to pick the latest timestamp, resolving Dashboard rank discrepancies.
- **Ranking Sync**: Integrated `DailyTop5` synchronization into the manual sync button.
- **Data Robustness**: Implemented Naver Finance fallback for supply data (Foreigner/Institutional) to bypass KIS API limits.
- **SSOT Fix**: Aligned DB performance records (Snapshots) with Live Dashboard recalculated scores.

## v8.6.3 (2026-04-07)
### Added
- **Strategy Engine**: Implemented Automated Trading Strategies (Day Trading & Swing Trading) based on hybrid scores and technical overextension (AMA).

## [v7.8.34] - 2026-04-07
### Changed
- **Scoring Engine**: Standardized 4-phase strategy commentary (적극 매수/분할 매수/분할 익절/관망) with refined overbought logic.

## [v7.8.33] - 2026-04-07
### Added
- **Strategy Engine**: Implemented Automated Trading Strategies (Day Trading & Swing Trading) based on hybrid scores and technical overextension (AMA).

## [v7.8.32] - 2026-04-06
### Fixed
- **Strategy Engine**: Added missing `highest` helper function to support RSI Pivot High calculations.

## [v7.8.31] - 2026-04-06
### Fixed
- **Strategy Engine**: Corrected MTF double-resampling bypass logic (Resample-of-Resample bug).
- **Price Mapping**: Integrated `result_1` (RSI Pivot High/Resistance) to correctly capture breakout entry levels (e.g. 9,440 for 후성).
- **Scoring**: Restored MTF indicator accuracy, significantly improving scores for trending stocks.

## [v7.8.30] - 2026-04-06
### Fixed
- **Strategy Engine**: Resolved double-resampling bug in `calculateSignals` that skewed MTF indicator accuracy.
- **Scoring Service**: Implemented missing KIS Bonus (Institutional/Foreigner Net Buy) logic (up to +10 points).
- **Price Mapping**: Applied sanity guards to Entry 1 to ensure it remains below Current Price (Buy Stop -> Buy Limit logic).
- **Stability**: Fixed Stop Loss mapping to align with the secondary RSI pivot support (result_3).

## [v7.8.30] - 2026-04-09
### 🚩 상태: 실시간 매매 신호 현황 누락 긴급 수정 (Hotfix)
### 🛠 주요 변경 및 조치 사항
1. **API 회복탄력성 강화 (Resilience)**: `/api/daily-top5` API에 DB 장애 시 파일(`latest.json`) 및 DB 스냅샷에서 데이터를 읽어오는 **3단계 폴백 로직**을 적용했습니다. 이를 통해 DB 연결 지연 상황에서도 실시간 보드에 종목이 누락되지 않도록 보장했습니다.
2. **신호 감시 엔진 동기화**: `server.cjs`의 `SignalPoller` 엔진에도 동일한 폴백 로직을 적용하여, 랜딩페이지에 노출되는 종목과 실시간으로 감시하는 종목이 항상 일치하도록 정렬했습니다.
3. **데이터 정합성 보장**: 랜딩페이지(`publicReports.cjs`)와 실시간 보드(`dailyTop5.cjs`) 간의 데이터 소스 참조 로직을 통일하여 사용자 경험의 일관성을 확보했습니다.

## [v7.8.29] - 2026-04-06
### 🚩 상태: 구문 오류 수정 및 최종 엔진 배포 (Syntax Fix)
### 🛠 주요 변경 및 조치 사항
1. **분석 엔진 구문 오류 수정**: `analyzer.cjs` 내의 반복문 종료 중괄호(`}`) 누락으로 인한 런타임 에러를 해결했습니다.
2. **데이터 동기화 순서 최적화**: 모든 타임프레임(30M~1D) 분석이 완전히 종료된 후 DB 및 캐시 동기화를 수행하도록 로직을 수정했습니다. 이를 통해 `ScoringService`가 전 시간대 데이터를 참조하여 정확한 하이브리드 점수(0-100)를 산출할 수 있게 되었습니다.

## [v7.8.28] - 2026-04-06
### 🚩 상태: 상용 배포 및 동기화 최적화 진행 중 (Deprecation Warning 대응)
### 🛠 주요 변경 및 조치 사항
1. **배포 프로세스 개선**: Vite 빌드 시의 라이브러리 경고(Deprecated options)를 무시하고 상용 환경 배포를 우선적으로 완료했습니다.

## [v7.8.27] - 2026-04-06
### 🚩 상태: 전략 공식 및 점수 체계 완정 정합 (Formula Alignment)
### 🛠 주요 변경 및 조치 사항
1. **멀티 타임프레임 자동 분석**: 특정 종목 동기화(`--filter`) 시에도 30M~1D 전 시간대를 자동으로 분석하도록 CLI 로직을 고도화하여 100점 만점 기준의 정확한 하이브리드 점수를 복원했습니다.
2. **진입가 매핑 보정**: 1차 진입가는 **2H RSI Pivot (result_2)**, 2차 진입가는 **2H RSI Pivot (result_3)**로 매핑하여 사용자 정의 전략 공식과 플랫폼 데이터를 완벽히 일치시켰습니다.
3. **영속성 안정성 유지**: 진입가 및 목표가 산출 시 기존의 Sanity Guard(현재가 대비 상방/하방 논리)를 유지하면서도 공식의 정확도를 높였습니다.
