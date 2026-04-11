# [블루팀] 11대 지표 데이터 통합 실무 작업 지시서 v1.3

**작성일**: 2026-04-05
**책임자**: 블루팀 (실무 팀장)
**원칙**: 텔레그램 포맷 100% 보존 + DB 데이터 동적 주입

---

## 1. 실무 작업 항목 (Action Items)

### [Item 1] 백엔드 DB 스키마 및 마스터 데이터 셋업
- **SQL 집행**: `ALTER TABLE` 명령을 통해 `trade_amount`, `trend_type`, `trend_strength` 등 누락된 7개 컬럼을 NCP MariaDB 상용 환경에 안전하게 추가합니다.
- **Data Flush**: `officialData.js`의 공인 수치를 기반으로 DB의 오염된 구버전 데이터를 덮어쓰는 `Upsert` 쿼리를 실행합니다.

### [Item 2] 텔레그램 발송 엔진 데이터 연동
- **Template Logic Revision**: `telegram_bot.cjs` 내의 메시지 템플릿(Layout)은 **수정하지 않습니다.**
- **Variable Binding**: `$ENTRY_PRICE$` 등의 변수에 할당되는 값의 원천을 `Memory Constant`에서 `Database Query Results`로 전면 교체합니다.

### [Item 3] 웹 플랫폼 SSOT 연동 완료
- **Provider 개편**: `Top5StrategyBanner.jsx` 및 `MPStockDailyReport.jsx`의 데이터 로더(`Data Loader`)를 DB API로 정규화합니다.
- **Verification**: 배너에 표시되는 수치와 대시보드 리스트의 수치가 DB 상의 '단 하나의 값'으로 동일하게 수렴하는지 전수 검증합니다.

---

## 2. 긴급 복구 및 롤백 절차
- **Snapshot 보존**: 작업 직전 `officialData.js`를 백업하여, DB 연동 오류 시 즉시 프론트엔드 상수 기반으로 서비스를 원복합니다.
- **로그 모니터링**: 텔레그램 발송 로그(`telegram_error.log`)를 실시간 감시하여 데이터 주입 사고 발생 시 즉시 프로세스를 재시작합니다.

---

> [!IMPORTANT]
> **본 지시서는 블루팀 마스터 플랜과 레드팀 감사 결과가 병합된 후 사용자의 최종 서명(Approval) 시 집행됩니다.**
