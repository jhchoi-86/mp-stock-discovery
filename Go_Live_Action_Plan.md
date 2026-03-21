# Final Go-Live Action Plan (Platform 1.0)
**상태:** 진행 대기중 | **승인 권한:** 최고 책임자(USER) 승인 필수

본 문서는 MP Stock Platform 1.0 런칭을 위한 최종 작전 계획서입니다. **반드시 한 단계씩(Step-by-Step) 진행하며, 각 완료 후 책임자의 승인(Sign-off)을 받아야만 다음 단계로 넘어갑니다.**

---

## [Step 1] 인프라 프로비저닝 및 DB 세팅 (Infra & DB Prep)
**상태:** 완료됨 (Completed)

**실행 내용:**
- [x] `.env` 파일 내 물리적 DB 연결 정보, KIS API Key 설정 확인
- [x] 데이터베이스 스키마 생성 및 반영 (`npx prisma generate`, `npx prisma migrate dev`)
- [x] 초기 데이터 시드 주입 (`seedUniverse.cjs`)
- [x] 기존 V2 유저 권한 마이그레이션 적용 (`migrateRoles.sql`)

---

## [Step 2] 격리된 병렬 가동 개시 (Isolated Parallel Run Start)
**상태:** 완료됨 (Completed)

**실행 내용:**
- [x] 텔레그램 발송 채널을 방어 격리용 채널(테스트방) ID로 변경 확인
- [x] KIS 모의투자 키(또는 분리 계정) 적용 확인
- [x] V2 가동 유지 상태에서 V1.0 서버 PM2 백그라운드 구동 (포트 3001)

---

## [Step 3] 실전 부하 섀도우 검증 (Load Testing)
**상태:** 완료됨 (Completed)

**실행 내용:**
- [x] 병렬 가동 중 K6 스크립트(`loadTest.js`, 100 VU / 10분) 투입
- [x] PostgreSQL 활성 커넥션(PgBouncer) 풀 고갈 여부 모니터링
- [x] BullMQ 메모리(Redis) 적체/누수 미발생 확인
- [x] `P95 < 200ms` 성능 기준 통과 확인

---

## [Step 4] 트래픽 컷오버 및 비상 대기 (The Cutover)
**상태:** 완료됨 (Completed)

**실행 내용:**
- [x] V1.0 텔레그램 발송 채널을 **운영자용 프로덕션 채널**로 복귀
- [x] Nginx 리로딩: `cutover.sh` 실행 (포트 3000 -> 3001 라우팅 전환)
- [x] 외부 트래픽 정상 인입 확인
- [x] `rollback.sh`를 즉시 가동할 수 있는 3분 롤백 대기조 배치

---

## [Step 5] 안정화 및 Phase 5 착수 (Post-Launch)
**상태:** 완료됨 (Completed)

**실행 내용:**
- [x] 모니터링 기준 가용성 99.5% 연속 유지 확인
- [x] 레거시 V2 폐기 (Shutdown & Archive)
- [x] 결제 시스템(Toss Confirm API) 백엔드 개발 착수

---
**[주의사항]: 시스템 무결성을 위해, 이전 단계의 체크리스트가 모두 ✅ 시그널을 점등한 후에만 다음 스텝 실행을 요청하십시오.**
