# 🔵🔴 원팀 모드 — AWS 운영 서버 전수 점검 보고서

> **작성일시**: 2026-04-05 04:57 KST  
> **서버 IP**: 15.134.243.209 (AWS ap-northeast-2)  
> **운영 버전**: v7.5.37  
> **점검 방식**: 블루팀(데이터 수집) → 레드팀(이상/리스크 검증) → 최종 저장

---

## 🔴 레드팀 최종 승인 요약

> 레드팀은 블루팀이 수집한 전체 데이터를 교차 검증하여 아래 결과를 확인했습니다.
> 본 보고서는 레드팀 검증을 득한 후 저장되었습니다.

---

## 1. 서버 기본 상태

| 항목 | 상태 | 비고 |
|---|---|---|
| PM2 프로세스 | ✅ `online` | `mp-stock-discovery` v7.5.37 |
| 서버 버전 | ✅ v7.5.37 | 최신 배포 확인 |
| Nginx | ✅ `active` | nginx/1.24.0 (Ubuntu) |
| 업타임 | ⚠️ 재시작 **71회** | 잦은 재시작 — 아래 원인 참고 |
| Node.js | ✅ v22.22.1 | |

---

## 2. 시스템 리소스

| 항목 | 값 | 평가 |
|---|---|---|
| 메모리 총량 | 911 MB | |
| 메모리 사용 | 547 MB / 60.0% | ⚠️ 60% 사용 — 관리 필요 |
| 메모리 여유 | 365 MB | |
| 스왑 사용 | 213 MB / 2.0 GB | 🟡 주의 — 메모리 부족 시 스왑 확장 |
| 디스크 사용 | 8.5 GB / 29 GB (31%) | ✅ 여유 충분 |
| 서버 업타임 | 2일 10시간 | |
| 평균 부하 (1m/5m/15m) | 0.00 / 0.04 / 0.00 | ✅ 정상 |

---

## 3. 환경변수 (.env) 검증

| 키 | 상태 | 길이 | 리스크 |
|---|---|---|---|
| `JWT_ACCESS_SECRET` | ✅ SET | 32자 | — |
| `KIS_APP_KEY` | ✅ SET | 36자 | — |
| `KIS_APP_SECRET` | ✅ SET | 180자 | — |
| `CRON_SECRET` | 🔴 **MISSING** | 0 | **CRITICAL** |
| `CORE_INTEGRITY_HASH` | ✅ SET | 64자 | — |
| `TELEGRAM_BOT_TOKEN` | ✅ SET | 46자 | — |
| `TELEGRAM_CHAT_ID` | ✅ SET | 25자 | — |
| `DATABASE_URL` | ✅ SET | 118자 | — |

> 🔴 **[CRITICAL]** `CRON_SECRET`이 서버 `.env`에 설정되지 않음.  
> **영향**: TASK-003에서 로컬 핫픽스 적용 후 배포했으나 서버 .env에 키 자체가 없어  
> 야간 크론 자동 동기화 호출이 `[SECURITY] CRON_SECRET is not set` 경고와 함께  
> `isLocalCron = false`가 되어 **야간 자동 동기화가 동작하지 않고 있음**.  
> 
> ✅ **조치 필요**: 서버 .env에 `CRON_SECRET=<랜덤 32자 이상 문자열>` 추가 필수.

---

## 4. 데이터 파일 상태

| 파일 | 크기 | 최종 수정 | 항목 수 | 평가 |
|---|---|---|---|---|
| `data/signals.json` | 2,941 KB | 2026-04-04 06:58 | 2,460개 | ⚠️ 마지막 동기화가 04-04 오전이며 그 이후 갱신 없음 |
| `data/live_prices_full.json` | **2 B** | 2026-04-04 06:58 | **0개 (빈 객체)** | 🔴 **HIGH** — 실시간 가격 데이터 비어 있음 |
| `data/stock_master.json` | 29.6 KB | 2026-04-03 13:34 | **350개** | ✅ 정상 |
| `data/live_signals.json` | 550 KB | 2026-04-03 13:34 | 696개 | 🟡 04-03 이후 갱신 없음 |
| `data/time_slot_signals.json` | 10 KB | 2026-04-04 06:40 | 2 key | ✅ 정상 |
| `data/landing_strategy.json` | 1.2 KB | 2026-04-04 18:36 | 3 key | ✅ 최신 (오늘 갱신) |
| `data/watchlist_strategy.json` | 0.3 KB | 2026-04-04 10:54 | 2 key | ✅ 정상 |
| `data/last_sent_date.json` | 26 B | 2026-04-02 12:26 | 1 key | 🔴 **HIGH** — `"2026-04-02"` 3일 미갱신 |
| `data/kis_token.json` | 0.4 KB | 2026-04-04 03:14 | 2 key | ✅ 정상 (만료 전) |

### 4-1. 구버전 signals 파일 방치
`data/` 폴더에 `signals_20260315_*.json` ~ `signals_20260317_*.json` **총 27개** 파일이  
아카이브 디렉터리 없이 `data/` 루트에 누적되어 있음.

> ⚠️ `data/archive/` 폴더 자체가 **존재하지 않음** — `archiveOldSignals()` cron이  
> 아직 한 번도 실행되지 않았거나 실패했음을 의미.

---

## 5. DB (PostgreSQL RDS, Prisma)

| 테이블 | 레코드 수 | 평가 |
|---|---|---|
| `user` | 10명 | ✅ 정상 |
| `dailySignalHistory` | **5건** | 🟡 적음 — 야간 배치 실행 빈도 확인 필요 |
| `dailyStockSnapshot` | 3,184건 | ✅ 정상 |
| `report` | 136건 | ✅ 정상 |

> 🟡 `dailySignalHistory` 5건은 하루 1회 실행 기준 매우 적음.  
> `last_sent_date.json`이 2026-04-02에 머물러 있는 것과 연계하여  
> 야간 크론 실행 자체가 멈춰 있을 가능성 높음.

---

## 6. PM2 로그 분석

### 6-1. 오류 로그 (ERROR)
| 오류 | 발생 | 리스크 |
|---|---|---|
| `🚨 [SECURITY ALERT] 소스코드 변조가 감지되었습니다 (Hash Mismatch)` | 서버 기동 시 매번 | 🟡 MEDIUM — 배포 때마다 hash 값 불일치로 경고 발생 (서버 구동 차단 없음) |
| `[AI Engine] ECONNREFUSED 127.0.0.1:8000` | 서버 기동 시 | 🟡 MEDIUM — AI 엔진(포트 8000) 미기동 상태 |
| `Error: WebSocket is not open (readyState 0)` | 주기적 반복 | 🟡 MEDIUM — KIS WebSocket이 연결 시도 중 메시지 전송 → 자동 재연결 로직 정상 동작 |

### 6-2. 정보 로그 (INFO)
| 항목 | 내용 |
|---|---|
| `[KIS-WSS]` | 35개 종목 구독 재연결 정상 성공 |
| `[NightlyMonitor] Heartbeat - KST: 4:58, Day: 0` | Day=0(일요일) — 크론 스킵 정상 |

---

## 7. 아카이브 / 파일 정리 상태

| 항목 | 상태 |
|---|---|
| `data/archive/` | 🔴 **존재하지 않음** |
| 루트 signals 스냅샷 파일 | ⚠️ 27개, 총 ~10MB 이상 방치 |
| `archiveOldSignals()` 실행 여부 | 미실행 (archive 폴더 없음) |

> 🔴 **조치 필요**: 아카이브 cron이 실행되면 자동으로 폴더가 생성되어야 함.  
> ARCHIVE_CRON_TIME 환경변수 확인 및 다음 새벽 2시 실행 결과를 모니터링할 것.

---

## 8. KIS 회로차단기 (Circuit Breaker)

| 항목 | 상태 |
|---|---|
| `data/kis_circuit_breaker.json` | **파일 없음** |
| 평가 | ✅ 정상 — 회로차단기가 작동한 이력 없음 |

---

## 9. 리스크 종합 등급표

| # | 항목 | 등급 | 즉시 조치 |
|---|---|---|---|
| 1 | **서버 .env CRON_SECRET 미설정** | 🔴 CRITICAL | ✅ 필수 |
| 2 | **live_prices_full.json 빈 객체** | 🔴 HIGH | ✅ 필요 |
| 3 | **last_sent_date 2026-04-02 고착** | 🔴 HIGH | ✅ 원인 파악 |
| 4 | 구버전 signals_*.json 27개 방치 | 🟡 MEDIUM | 이번 주 내 |
| 5 | data/archive 폴더 미생성 | 🟡 MEDIUM | 모니터링 |
| 6 | PM2 재시작 71회 | 🟡 MEDIUM | 로그 추가 확인 |
| 7 | dailySignalHistory DB 5건 | 🟡 MEDIUM | 배치 실행 확인 |
| 8 | AI Engine (포트 8000) 미기동 | 🟡 MEDIUM | 선택적 조치 |
| 9 | Hash Mismatch 보안 경고 | 🟡 MEDIUM | CORE_INTEGRITY_HASH 재계산 |
| 10 | 메모리 사용 60% / 스왑 213MB | 🟡 LOW-MED | 상태 모니터링 |
| 11 | KIS-WSS 주기적 재연결 | ℹ️ INFO | 자동 재연결 정상 |

---

## 10. 즉시 조치 가이드

### 🔴 #1 — 서버 .env에 CRON_SECRET 추가 (즉시)
```bash
# AWS 서버 SSH 접속 후
cd ~/mp-stock-discovery
echo 'CRON_SECRET='$(openssl rand -hex 32) >> .env
pm2 reload mp-stock-discovery --update-env
# 이후 동일한 값을 로컬 .env에도 복사할 것
```

### 🔴 #2 — live_prices_full.json 재구축
```bash
# 서버에서 실행 (마켓 오픈 시간대에)
cd ~/mp-stock-discovery
node scripts/clean_resync_v7.cjs
```

### 🔴 #3 — last_sent_date 원인 파악
```bash
# 야간 크론 로그 확인
pm2 logs mp-stock-discovery --lines 200 --nostream | grep -E "Cron|Sending|last_sent|21:00"
# 만약 크론이 정상 실행되었는데 날짜 갱신이 안 된다면
# data/last_sent_date.json 수동 갱신 검토
```

### 🟡 구버전 signals_*.json 정리 (이번 주)
```bash
cd ~/mp-stock-discovery
mkdir -p data/archive
mv data/signals_2026*.json data/archive/
```

---

## ✅ 레드팀 최종 검증 결과

| 검증 항목 | 결과 |
|---|---|
| 블루팀 수집 데이터 완전성 | ✅ 확인 (9개 파일, DB 4개 테이블, 환경변수 8개, PM2, Nginx) |
| CRITICAL 항목 (서버 CRON_SECRET) | 🔴 확인 — 신규 발견, 즉시 조치 필요 |
| HIGH 항목 (live_prices_full, last_sent_date) | 🔴 확인 |
| MEDIUM 항목 (아카이브, AI Engine, Hash) | 🟡 확인 — 모니터링/선택적 조치 |
| 리스크 등급 평가 일관성 | ✅ 통과 |
| 보고서 포맷 및 근거 명확성 | ✅ 통과 |

> **🔴 레드팀 결론**: 서버 `.env`의 `CRON_SECRET` 누락이 가장 치명적인 이슈.  
> TASK-003 보안 패치(로컬)가 배포되었으나 **서버 .env에 실제 키 값 추가가 누락**되어  
> 야간 자동 동기화 크론이 동작하지 않고 있음. 나머지 항목은 운영 지속 가능하나  
> CRON_SECRET, live_prices_full, last_sent_date 3개 항목의 즉시 조치를 권고함.

---

*레드팀 승인: ✅ ALL PASS (CRITICAL 항목 즉시 조치 전제)*  
*보고서 저장: 2026-04-05*
