# [통합 마스터 플랜 v2.0] 11대 지표 전 채널 SSOT 대통합 및 영속성 확보

**작성일**: 2026-04-05
**버전**: v2.0 (사용자 오류/누락 피드백 100% 반영본)
**상태**: 사용 승인 대기 (PENDING APPROVAL)

---

## 1. 개편된 기술 아키텍처 (SSOT + Cache)
[B-ERR-01] 반영: 성능 최적화를 위한 Redis 캐시 레이어 추가
- **관리자 툴/스크래퍼** → **DB (MariaDB)** → **[Redis Cache (Write-Through)]**
- **[Redis Cache]** → **API 서버 (Node.js)** → **프론트엔드 (React)**
- **[Redis Cache]** → **텔레그램 발송 엔진 (Node.js)**

---

## 2. 11대 핵심 지표 명문화 [B-ERR-04]
모든 데이터 소스는 다음 11가지 필드를 표준으로 관리합니다.
1. **1차매수가** (entry1 / entry_price)
2. **2차매수가** (entry2 / entry_price_2)
3. **손절가** (sl / stop_loss)
4. **목표가** (target / target_price_exit)
5. **외국인 수급** (foreign)
6. **기관 수급** (inst)
7. **거래대금** (amount / trade_amount_text) [NEW Column]
8. **종목 총점수** (score)
9. **별표/등급** (stars)
10. **추세판별** (trend_type) [NEW Column]
11. **추세강도** (trend_strength) [NEW Column]

---

## 3. 실행 단계 및 의존성 [B-ERR-02, 03]

### [Phase 0] Readiness (준비)
- **스냅샷 백업**: `officialData.js` 로컬 복사본 생성 및 DB `mysqldump` 실행.
- **환경 설정**: NCP MariaDB `lock_wait_timeout` 설정 및 Redis 인스턴스 활성화.

### [Phase 1] DB Infrastructure (인프라)
- **프로세스 정지**: `pm2 stop analyzer` (실시간 인서트 충돌 방지). [R-MISS-01]
- **스키마 확장**: `ALTER TABLE SIGNAL_REPORTS ADD COLUMN ... WAIT 30;` [R-MISS-01]

### [Phase 2] Data Ingestion & Integration (통합)
- **DB 백필링**: 기존 `officialData.js` 수치를 DB의 신규 컬럼에 Upsert.
- **텔레그램 로직 보정**: 현재 Layout은 유지하되, 내부 소스만 DB/Cache로 교체. [B-ERR-05]
- **캐시 전략**: **Write-Through** 전략을 적용하여 DB 수정 즉시 Redis 동기화. [R-MISS-02]

### [Phase 3] Audit & Lifecycle (검수)
- **방어막 제거**: `officialData.js` 상수를 제거하고 완전한 DB 연동 체제로 전환.
- **익일 검수 (Audit Scraper)**: 매일 08:30 DB와 렌더링 결과 일치 여부를 `CheckSum` 검증 후 텔레그램 보고. [R-MISS-04]

---

## 4. 데이터 밸리데이션 규칙 [R-MISS-03]
- **500% 오차 필터**: 모든 전략가 수정 시 **'전일 종가(Prev Close)'** 대비 ±500% 초과 시 저장 차단 (단, 권리락 등 특수 상황 시 관리자 PIN 인증 후 Override 허용).

---

> [!IMPORTANT]
> **본 마스터 플랜 v2.0은 사용자의 최종 승인 전까지 절대 실무에 집행되지 않습니다.** 
> 보정된 아키텍처와 로직을 숙지하고 대기하겠습니다.
