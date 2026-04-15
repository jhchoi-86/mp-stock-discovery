# SKILL: Deployment & PM2 Stack
# MP Stock Discovery v9.4.25 | MetaPrompt Studio
# Rev: Blue/Red Team Audit v1.1
# 적용 범위: ecosystem.config.cjs, PM2, AWS EC2, 배포/롤백 관련 모든 작업

---

## 🎯 이 스킬을 사용할 때

Claude Code가 다음 작업을 요청받은 경우 이 스킬을 먼저 참조:
- PM2 프로세스 추가/수정
- ecosystem.config.cjs 변경
- AWS EC2 배포 스크립트 작성
- 롤백 절차 실행
- 프로세스 간 통신 구조 변경
- 새 서비스를 PM2 스택에 추가

---

## 🏗️ 4-PROCESS PM2 스택 전체 구조

```
ecosystem.config.cjs
├── Process 1: server            → server.cjs
│   ├── 역할: SSE 브로드캐스트, JWT 인증, REST API
│   ├── 위험도: 🔴 HIGH
│   └── 모드: fork (cluster 절대 금지 — SSE 단절)
│
├── Process 2: ai-service        → ai-service/main.py (FastAPI)
│   ├── 역할: AI 이상감지, 신호 보정
│   ├── 위험도: 🟡 MEDIUM
│   └── 인터프리터: python3
│
├── Process 3: sniper_3m         → sniper_3m.cjs
│   ├── 역할: 30M TF 고빈도 신호 감시
│   ├── 위험도: 🟡 MEDIUM
│   └── 의존성: analyzer.cjs (SSOT 참조)
│
└── Process 4: sniper_engine     → sniper_engine/realtime_engine.py
    ├── 역할: 고속 틱 처리
    ├── 위험도: 🟡 MEDIUM
    └── 인터프리터: python3
```

> ⚠️ analyzer.cjs는 독립 프로세스가 아님 — Process 1/3이 내부적으로 require()
> ⚠️ PM2 프로세스명은 ecosystem.config.cjs의 `name` 필드와 정확히 일치해야 함

---

## 🖥️ PM2 핵심 명령어

```bash
# 전체 스택 기동
pm2 start ecosystem.config.cjs

# 개별 프로세스 재시작 (ecosystem name 필드 기준)
pm2 restart server
pm2 restart ai-service
pm2 restart sniper_3m       # ecosystem name과 정확히 일치 필수
pm2 restart sniper_engine

# 전체 재시작
pm2 restart all

# 실시간 모니터링
pm2 monit

# 로그 확인
pm2 logs                    # 전체 로그
pm2 logs server --lines 100 # server 최근 100줄

# 프로세스 저장 (재부팅 후 자동 복구용)
pm2 save
pm2 startup

# 상태 확인
pm2 status
pm2 list
```

---

## 🚀 배포 절차 (표준)

```bash
# 1. 코드 풀
git pull origin main

# 2. 의존성 설치 (변경 있을 경우)
npm install
pip install -r ai-service/requirements.txt      # ai-service 의존성
pip install -r sniper_engine/requirements.txt   # sniper_engine 의존성

# 3. 배포 전 체크리스트 실행 (아래 참조)

# 4. 프로세스 재시작
pm2 restart all

# 5. 상태 확인 및 5분 모니터링
pm2 status
pm2 logs --lines 50
pm2 monit   # 5분간 4개 프로세스 정상 여부 확인
```

---

## 🔄 롤백 절차

### PM2 롤백 (코드 문제 발생 시)
```bash
pm2 stop all

# 안전한 방법: revert (히스토리 보존)
git revert HEAD --no-edit

# 주의 필요: reset (미커밋 변경사항 전부 소실 — 신중히 사용)
# git reset --hard [commit-hash]   ⚠️ 미저장 작업 전부 삭제됨

pm2 start ecosystem.config.cjs
pm2 save
```

### DB 롤백 (Prisma 마이그레이션 실패 시)
```bash
# 마이그레이션 롤백
npx prisma migrate resolve --rolled-back [migration_name]

# DB 스냅샷 복원 (최후 수단)
pg_restore -d [database_name] [snapshot_file]
```

---

## ✅ 배포 전 체크리스트

```bash
# 1. integrityGuard 사전 실행
node src/utils/integrityGuard.cjs

# 2. tdrGate HMAC 서명 테스트
# (tdrGate 자체 테스트 스크립트 실행)

# 3. signals.json 구조 무결성 확인
node -e "const s = require('./data/signals.json'); console.log(Object.keys(s.signals[0]))"

# 4. 전체 크레덴셜 하드코딩 스캔 (JS + Python)
grep -rn "KIS_\|JWT_\|TDR_\|TELEGRAM\|AWS_" \
  --include="*.cjs" --include="*.js" --include="*.py" . \
  | grep -v "process.env\|\.env\|#"

# 5. kis_token.json 갱신 상태 확인
node -e "const d=require('./data/kis_token.json');console.log('Expires:', d.expires_at)"
```

---

## ⚙️ ecosystem.config.cjs 전체 예시

```javascript
module.exports = {
  apps: [
    {
      name: 'server',              // pm2 restart server
      script: 'server.cjs',
      exec_mode: 'fork',           // cluster 절대 금지
      watch: false,
      max_memory_restart: '500M',
      env: { NODE_ENV: 'production' }
    },
    {
      name: 'ai-service',          // pm2 restart ai-service
      script: 'ai-service/main.py',
      interpreter: 'python3',
      watch: false,
      max_memory_restart: '300M'
    },
    {
      name: 'sniper_3m',           // pm2 restart sniper_3m
      script: 'sniper_3m.cjs',
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '200M'
    },
    {
      name: 'sniper_engine',       // pm2 restart sniper_engine
      script: 'sniper_engine/realtime_engine.py',
      interpreter: 'python3',
      watch: false,
      max_memory_restart: '300M'
    }
  ]
}
```

---

## 🌐 AWS EC2 배포 환경

- **보안그룹**: SSE 포트, FastAPI 포트 — 최소 허용 IP만 개방 (0.0.0.0/0 금지)
- **IAM**: EC2 인스턴스 역할 최소권한 준수
- **재부팅 후 자동 시작**: `pm2 startup` + `pm2 save` 설정 확인

---

## ⚠️ 절대 금지 사항

1. `exec_mode: 'cluster'` 적용 (SSE 연결 단절)
2. `watch: true` 프로덕션 적용 (파일 변경 시 무한 재시작)
3. 롤백 없이 DB 마이그레이션 단독 실행
4. 4개 프로세스 중 1개라도 DOWN 상태에서 정상 서비스 선언
5. ecosystem.config.cjs에 .env 값 직접 하드코딩
6. `git reset --hard` 미커밋 작업 확인 없이 실행
