# SKILL: Development Workflow & Blue/Red Team
# MP Stock Discovery v9.4.25 | MetaPrompt Studio
# Rev: Blue/Red Team Audit v1.1
# 적용 범위: 모든 작업의 검토 절차, 배포 승인, AGENTS.md 연동

---

## 🎯 이 스킬을 사용할 때

Claude Code가 다음 상황에서 이 스킬을 참조:
- Critical 파일 수정 전 검토 요청
- 신규 기능 설계/구현 전 검증
- 배포 전 최종 승인 절차
- Agent 모드 작업 시 AGENTS.md 연동
- 대형 리팩토링 작업 범위 분할

---

## 🔵🔴 Blue/Red Team 검토 프로세스

### 검토 수준 기준표

| 대상 파일/작업 | 검토 수준 |
|---------------|----------|
| server.cjs, analyzer.cjs | 🔴 필수 (전체 검토) |
| tdrGate.cjs | 🔴 필수 + 규제 준수 확인 |
| schema.prisma | 🔴 필수 + 마이그레이션 계획 포함 |
| ecosystem.config.cjs | 🔴 필수 (PM2 전체 스택 영향) |
| signals.json 구조 변경 | 🔴 필수 |
| scorer.cjs, sniper_3m.cjs | 🟡 권장 |
| ai-service/main.py, sniper_engine/*.py | 🟡 권장 |
| 신규 API 라우터 추가 | 🟡 권장 |
| UI 컴포넌트 수정 | 🟢 선택 |

---

## 🔵 Blue Team 체크항목 (기능/정확성)

```
✅ 기능 요구사항 충족 여부
✅ 기존 로직과의 호환성 (Breaking Change 없음)
✅ 7-TF(30M/1H/2H/4H/1D/2D/1W) 신호 흐름 무결성 유지
✅ signals.json ↔ useStockManager.js 구조 일치
✅ KIS API 응답 처리 정확성
✅ 에러 핸들링 커버리지 (catch 블록 포함)
✅ 누락된 엣지케이스 확인
✅ 성능 영향도 (고빈도 신호 처리 병목 없음)
✅ SSE heartbeat / 메모리 누수 없음
```

---

## 🔴 Red Team 체크항목 (보안/규제/엣지케이스)

```
✅ .env 키 하드코딩 없음 (JS/CJS + Python 파일 모두 스캔)
✅ 로그에 토큰/크레덴셜 노출 없음
✅ tdrGate 우회 패턴 없음
✅ JWT 인증 우회 경로 없음
✅ 투자 권유 문구 없음 (금융위원회 규제)
✅ race condition 취약점 없음 (KIS 토큰 갱신 catch 포함)
✅ SQL Injection / NoSQL Injection 위험 없음
✅ SSE 메모리 누수 패턴 없음 (heartbeat clearInterval)
✅ AWS IAM 최소권한 원칙 준수
✅ AGENTS.md 규칙 위반 없음
✅ Python 서비스(ai-service, sniper_engine) 보안 검토 포함
✅ TELEGRAM_CHAT_ID 하드코딩 없음
```

---

## 📋 표준 검토 요청 템플릿

```
[Blue Team 검토 요청]
대상 파일: [파일명]
변경 내용: [요약]
확인 요청: 기능 정확성, 기존 로직 호환성, 누락 케이스, 에러 핸들링

[Red Team 검토 요청]
대상 파일: [파일명]
보안 위험: .env 하드코딩, 토큰 노출, tdrGate 우회 여부
Python 포함: ai-service/sniper_engine 코드 변경 시 Python도 스캔
규제 확인: 투자 권유 문구, 금융위원회 컴플라이언스, 면책 문구 포함 여부
```

---

## 📁 AGENTS.md 연동 규칙

- **위치**: 프로젝트 루트 `/AGENTS.md`
- **Claude Agent 모드 진입 시 반드시 먼저 참조**
- 내용 변경 절대 금지 (변경 필요 시 데니얼 승인 후 별도 진행)
- AGENTS.md에 정의된 작업 범위 외 자율 실행 금지

```bash
# Agent 모드 시작 전 확인
cat AGENTS.md
```

---

## ✂️ 대형 작업 분할 원칙

작업이 다음 조건 중 하나라도 해당하면 반드시 분할:
- 3개 이상의 Critical 파일 동시 수정
- 1,000줄 이상 코드 변경
- DB 마이그레이션 + 코드 변경 동시 진행
- 새 PM2 프로세스 추가 + 기존 프로세스 수정 동시 진행

**분할 방법:**
```
1단계: 설계/인터페이스 정의 → 검토
2단계: 핵심 로직 구현 → 검토
3단계: 연동/통합 → 검토
4단계: 배포 → 모니터링
```

각 단계 완료 후 `/clear`로 컨텍스트 초기화

---

## 🚦 배포 승인 게이트

```
코드 변경
    ↓
Blue Team 검토 통과
    ↓
Red Team 검토 통과
    ↓
배포 전 체크리스트 통과
    ↓
[최종 승인: 데니얼 확인]  ← 1인 창업 — 자동 배포 오판 방지
    ↓
pm2 restart all
    ↓
pm2 monit 5분 모니터링
    ↓
이상 없으면 배포 완료
이상 있으면 즉시 롤백
```

---

## 📊 버전 관리 컨벤션

```
버전 형식: v[major].[minor].[patch]
현재: v9.4.25

Major (+1): 아키텍처 변경, PM2 스택 구조 변경
Minor (+1): 신규 모듈 추가, TF 추가/제거
Patch (+1): 버그 수정, 성능 개선, 보안 패치

업데이트 대상:
- CLAUDE.md — 버전/날짜 변경
- 해당 SKILL.md — Rev 날짜 업데이트
- SKILLS_INDEX.md — 변경 이력 추가
```

---

## ⚠️ 워크플로우 위반 패턴 (하지 말 것)

1. Blue/Red Team 검토 없이 Critical 파일 직접 수정
2. ecosystem.config.cjs 검토 없이 PM2 프로세스 변경
3. 검토 없이 프로덕션 직접 배포
4. 롤백 계획 없는 마이그레이션 실행
5. AGENTS.md 미확인 상태에서 Agent 모드 작업
6. 분할 없이 대형 작업 단번에 처리
7. Python 서비스 코드 변경 시 Red Team 보안 검토 생략
