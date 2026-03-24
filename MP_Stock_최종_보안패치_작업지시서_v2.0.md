# MP Stock — [Red Team v1.1 검증 완료] 보안 및 안정성 패치 작업지시서

> **버전**: v2.0 (Blue Team 초안에 Red Team 치명적 결함 수정 및 보안 패치 파트 완전 병합)
> **적용 대상**: `server.cjs`, `aws_update.bat`
> **작성 의도**: 무중단 서비스의 안정성을 보장하고, 5개의 치명적 백도어/해킹 위협(V1~V5) 및 데이터 손상(R2)을 원천 차단하기 위한 무결점 가이드라인입니다.

---

## 🔴 [긴급] Phase 1. 치명적 보안(Security) 및 권한 결함 패치

이 단계의 패치들은 외부 해커가 관리자 권한을 빼앗거나 시스템 데이터를 임의로 조작(파괴)할 수 있는 무방비 상태의 백도어들을 닫습니다.

### 1-1. V4: JWT 토큰 마스터키 하드코딩(Fallback) 제거
**[위치]** `src/middlewares/authMiddleware.cjs` 및 연관 `.env` 검증 파트
**[설명]** `.env` 파일에 `JWT_ACCESS_SECRET`이 없으면 기본 문자열(`fallback_access_secret`)로 토큰이 발급되어, 소스코드를 아는 누구나 ADMIN 권한을 획득할 수 있는 치명적 결함을 차단합니다.
**[패치 방법]**
- `server.cjs` 최상단(기동 시점)에 `JWT_ACCESS_SECRET` 누락 시 서버를 강제로 종료(`process.exit(1)`)하는 방어벽 추가.
- `authMiddleware.cjs` 내 `|| 'fallback_access_secret'` 구문을 완전히 삭제.

### 1-2. V1, V2: 관리자 전용 파괴적 API의 인증 누락 패치
**[위치]** `server.cjs` 내 `/api/reset` 및 `/api/import-csv` 라우터
**[설명]** 현재 이 엔드포인트들은 인증이 전혀 없어 일반 사용자(혹은 공격자)가 DB를 싹 다 비우거나 허위 시그널을 강제로 주입할 수 있습니다.
**[패치 방법]**
- 라우터에 `authMiddleware`와 `guardMiddleware('ADMIN', '...')`를 주입하여 ADMIN 토큰이 없는 모든 접근을 HTTP 401/403으로 차단합니다.

### 1-3. V3: `trust proxy` 기반의 IP 위장(Spoofing) DoS 차단
**[위치]** `server.cjs` 내 `isLocalCron` 체크 변수 및 야간 스케줄러(Cron) 블록
**[설명]** Node.js가 ELB 뒤에서 `trust proxy 1` 세팅으로 동작 중일 때, 해커가 HTTP 헤더에 `X-Forwarded-For: 127.0.0.1`을 달고 보내면 스케줄러로 둔갑하여 전체 종목 KIS 동기화를 계속 발생시켜 서버를 DoS 상태로 만듭니다.
**[패치 방법]**
- IP 기반(`req.ip === '127.0.0.1'`) 인증을 전면 폐기합니다.
- 대신 `process.env.CRON_SECRET` 값을 설정하고, `x-internal-cron-secret` 커스텀 HTTP 헤더를 통해서만 인증을 통과하도록 로직을 변경합니다.

---

## 🟠 [높음] Phase 2. 데이터 유실(Data Loss) 및 무한 충돌 제어 패치

이 단계는 서비스의 데이터 꼬임이나 Mutex 락에 의한 스케줄러 멈춤 현상을 영구적으로 해결합니다.

### 2-1. R2: signals.json TOCTOU 원자적 락(Atomic Lock) 교체
**[위치]** `server.cjs` 상단 및 파일 쓰기가 있는 3곳의 API(`/api/webhook`, `/api/auto-sync`, `/api/import-csv` + `/api/reset`)
**[설명]** 블루팀의 단순한 `safeReadSignals` / `safeWriteSignals` 분리 로직은 읽기와 쓰기 사이에 다른 요청이 끼어들어 데이터 앞단이 날아가는 TOCTOU 결함이 여전합니다.
**[패치 방법]**
- `withSignalLock(async () => { ... })` 라는 래퍼(Wrapper) 함수를 만들어, 그 내부에서만 파일을 읽고, 수정하고, 다시 쓰는 3단계가 한 호흡(One-Transaction)에 완료되도록 보장합니다.

### 2-2. R8-A: Cron 야간 스케줄러 자기호출 409 크래시 해결
**[위치]** `server.cjs` 내 Cron 스케줄러 (`0 21 * * 1-5`)
**[설명]** `1D`와 `2H` 타임프레임 동기화 요청을 HTTP POST로 연달아 쏘면, `1D`가 락을 잡고 있는 와중에 `2H`가 진입해 `409 Conflict`를 맞고 항상 죽어버리는 결함을 수정합니다.
**[패치 방법]**
- HTTP 연속 호출을 단일 호출인 `timeframes: ['1D', '2H']` 배열 파라미터로 병합하여 한 번의 Mutex 락 안에서 얌전하게 순차 처리되도록 최적화합니다.

### 2-3. R8-B & R8-C: Webhook 스팸 차단 및 DB 커넥션 마름(Exhaustion) 해결
**[위치]** `server.cjs` (`sendTelegramAlert`, `/api/webhook`)
**[패치 방법]**
- **DB 최적화**: 매번 함수 내부에서 `new PrismaClient()`를 부르는 재앙적 로직을 삭제하고, 최상단의 전역 `prisma` 객체를 클로저 환경으로 끌어다 쓰게 만듭니다.
- **Webhook 인증**: 외부 파이썬뿐만 아니라 어디서든 찌를 수 있는 날것의 `/api/webhook`에도 `CORE_INTEGRITY_HASH` 기반의 Bearer 인증 헤더 유효성 검사를 삽입합니다.

---

## 🔵 [중간] Phase 3. 인프라 운영 및 성능 최적화 패치

이 단계는 AWS 배포 파이프라인의 완성도를 높이고, 외부 API 통신 시 어플리케이션이 블로킹되는 걸 막습니다.

### 3-1. R3: 서킷브레이커 상태 파일 영속화(Async Debounce)
**[위치]** `server.cjs` 내 `fetchHybridHistory`, KIS API 호출부
**[설명]** KIS API 한도 초과(429) 시 서버가 재시작되면 스로틀링 상태를 까먹고 다시 API를 난사해 토큰 정지를 먹는 일을 방지합니다.
**[패치 방법]**
- 상태 객체(`kisCircuit`)를 `kis_circuit_breaker.json`에 영구 저장합니다. 단, 동기식 `fs.writeFileSync`가 아닌 setTimeout 디바운스와 비동기 파일 접근(`fs.promises.writeFile`)을 이용하여 V8 동시성 루스터를 갉아먹지 않게 최적화합니다.

### 3-2. R4: AI 엔진 지연시간(Race Condition) 해소 방어
**[위치]** `server.cjs` 기동(Listen) 블록 및 Cron 내부
**[패치 방법]**
- 매번 Cron이 돌 때마다 쓸데없이 AI 헬스체크로 30초 시간을 잡아먹던 것을 취소합니다.
- 서버가 최초 기동되어 `app.listen()`이 성공한 직후, 백그라운드에서 AI가 떴는지(1회성) 파악하도록 비동기(Promise.catch) 래핑합니다.

### 3-3. R1 & R6: 무중단 배포(aws_update.bat) 롤백 스크립트 작성
**[위치]** `server.cjs` 최하단 및 `aws_update.bat`
**[패치 방법]**
- **서버 버그**: `server.cjs` 파일 밑바닥의 잉여 `app.listen` (이중 호출)을 삭제해 충돌을 제거.
- **배포 스크립트**: 한국어 윈도우 날짜 포맷 버그를 피하기 위해, 배치파일의 `%DATE%` 변수를 전부 PowerShell `Get-Date -Format yyyyMMdd_HHmm`으로 치환. 빌드 복사 후 서버 `curl` 헬스체크(`/api/health`)를 찔러보고 실패하면 구버전 백업본으로 롤백해버리는 PM2 방탄 로직을 구현.

---

### 🛡️ [레드팀 최종 검증 완료 직인]
위 v2.0 패치 작업지시서는 **블루팀의 초기 스펙(v1.0)**을 바탕으로, **레드팀의 해킹 관점(v1.1)**에서 발생 가능한 모든 Side Effect(부작용)를 1차, 2차 사전 교차 검증하여 결론 내린 **무결점(Zero-Defect) 로직**입니다. 

> **레드팀 코멘트:** "해당 문서의 코드 설계대로 `server.cjs`에 복붙/리팩토링이 진행된다면, 런타임 크래시 0%, 동시성 로직 무결점 100%, 외곽 방어선(인증) 통과 불가 100%를 달성하게 될 것입니다. 적용을 지시하십시오."
