# MP Stock Skills Index
# MP Stock Discovery v9.4.25 | MetaPrompt Studio
# Rev: Blue/Red Team Audit v1.1 — 2026-04-14
# Claude Code 세션 시작 시 이 파일 먼저 참조

---

## 📚 스킬 목록 및 사용 시점

| 스킬 | 파일 경로 | 사용 시점 |
|------|----------|----------|
| 📡 Signal Engine | `skills/signal-engine/SKILL.md` | analyzer.cjs, BBW/DHH2, signals.json, Grade 시스템 |
| 🔴 Security | `skills/security/SKILL.md` | .env, JWT, tdrGate, 로그 마스킹, AWS IAM |
| 🚀 Deployment | `skills/deployment/SKILL.md` | PM2, ecosystem.config.cjs, 배포/롤백, AWS EC2 |
| 🗄️ Database | `skills/database/SKILL.md` | schema.prisma, Prisma, Redis, BullMQ, integrityGuard |
| 🖥️ API Server | `skills/api-server/SKILL.md` | server.cjs, SSE, KIS API, Telegram, useStockManager.js |
| 🔄 Workflow | `skills/workflow/SKILL.md` | Blue/Red Team 검토, AGENTS.md, 배포 승인, 버전관리 |

---

## ⚡ 빠른 스킬 선택

```
analyzer.cjs 수정         → Signal Engine + Workflow
server.cjs 수정           → API Server + Security + Workflow
tdrGate.cjs 수정          → Security + Workflow (Red Team 필수)
ecosystem.config.cjs 수정 → Deployment + Workflow (🔴 HIGH)
schema.prisma 수정        → Database + Workflow
.env 관련                 → Security
PM2 / 배포                → Deployment
KIS 토큰 갱신             → API Server + Security
SSE 버그                  → API Server
신호 등급 변경            → Signal Engine + Workflow
signals.json 구조 변경    → Signal Engine + API Server + Workflow
Python 서비스 수정        → Security (Python 스캔) + Workflow
새 기능 설계              → Workflow (Blue/Red Team 먼저)
```

---

## 🏗️ 프로젝트 핵심 요약

- **Product**: MP Stock Discovery v9.4.25
- **Stack**: Node.js + React + PostgreSQL + Redis + BullMQ + AWS EC2 + PM2
- **4 Processes**: server.cjs(P1) / ai-service(P2) / sniper_3m.cjs(P3) / sniper_engine(P4)
- **7-TF**: 30M / 1H / 2H / 4H / 1D / 2D / 1W
- **Signal SSOT**: analyzer.cjs → BBW/DHH2 → Grade A★★★★★~D★★ → signals.json
- **보안**: 모든 키 .env 전용 (JS+Python 스캔), tdrGate Fail-Closed, 투자권유 금지
- **워크플로우**: Blue/Red Team → 데니얼 최종 승인 → pm2 restart → 5분 모니터링

---

## 📝 스킬 파일 변경 이력

| 날짜 | 버전 | 변경 내용 |
|------|------|----------|
| 2026-04-14 | v1.0 | 초기 생성 (6개 스킬) |
| 2026-04-14 | v1.1 | Blue/Red Team Audit 22개 이슈 반영 |
