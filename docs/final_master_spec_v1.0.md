# [최종 공인 명세서 v1.0] 11대 핵심 지표 및 SSOT 아키텍처

**확정일**: 2026-04-05
**승인자**: USER (Master)
**상태**: 집행 대기 (READY FOR EXECUTION)

---

## 1. 11대 핵심 지표 데이터 규격 (SSOT)

| 지표명 | DB 컬럼명 | 타입 | 비고 |
| :--- | :--- | :--- | :--- |
| **현재가** | `current_price` | DECIMAL(12,0) | 기존 |
| **등락률** | `change_rate` | DECIMAL(6,2) | 기존 |
| **거래대금** | `trade_amount` | BIGINT | **신규** |
| **추세 유형** | `trend_type` | VARCHAR(20) | **신규** (상승/횡보/하락) |
| **추세 강도** | `trend_strength` | DECIMAL(5,2) | **신규** (ADX 값) |
| **별표 등급** | `star_grade` | TINYINT | **신규** (1~5) |
| **1차 매수가** | `entry_price_1` | DECIMAL(12,0) | **신규** |
| **2차 매수가** | `entry_price_2` | DECIMAL(12,0) | **신규** |
| **손절가** | `stop_loss` | DECIMAL(12,0) | **신규** |
| **1차 목표가** | `target_price_1` | DECIMAL(12,0) | **신규** |
| **2차 목표가** | `target_price_2` | DECIMAL(12,0) | 기존 |

---

## 2. 확정 SSOT 아키텍처 기반 시퀀스

1. **데이터 발생**: 관리자 스크래퍼 / 분석 엔진.
2. **영속성 저장**: NCP MariaDB `SIGNAL_REPORTS` 테이블 (11대 지표 통합).
3. **캐시 동기화**: Redis Cache (**Write-through**, TTL: 30분). 
4. **전파/조회**: 
    - **API 서버**: Redis 경유하여 웹 대시보드(Top5/Report)에 공급.
    - **텔레그램 엔진**: Redis 경유하여 기존 포맷에 수치 인젝션 발송.

---

## 3. 데이터 유효성 검사 (Validation Logic)

### [검증 범위]
- **일반**: [전일 종가 × 0.30] ~ [전일 종가 × 1.30]
- **권리락/배당락**: [전일 종가 × 0.40] ~ [전일 종가 × 1.30]
- **신규 상장**: [공모가 × 0.50] ~ [공모가 × 4.00]

### [예외 처리]
- `is_validation_exempt` 플래그 활성 시(거래재개 등) 검증 스킵.
- 위반 시: **Insert 거부** + **Warn 로그** + **관리자 텔레그램 알림**.

---

> [!IMPORTANT]
> **본 명세서는 아키텍처 최종안으로, 추가 지시 전까지 독자적으로 집행하지 않습니다.**
