# Deployment Plan - MP Stock Discovery v3.0

이 문서는 v3.0 로직 고도화 및 v1.1 UI/UX 리팩토링 사항을 운영 서버(`mpstock.co.kr`)에 안정적으로 배포하기 위한 가이드입니다.

## 1. 배포 대상 및 환경
- **버전**: v3.0.0 (Release)
- **주요 변경**: 7개 타임프레임 확장, SMA 5/10 추가, 3x7 신호 그리드 UI
- **대상 서버**: AWS EC2 (Ubuntu)
- **도구**: `aws_update.bat`, PM2, Git

---

## 2. 배포 전 체크리스트 (Pre-Deployment)

- [ ] **로컬 빌드 확인**: `npm run build` 실행 시 오류 없는지 확인
- [ ] **데이터 정합성**: `data/signals.json` 내에 `30M` 타임프레임 및 `sma5/10` 필드 존재 확인
- [ ] **코드 파리티**: `analyzer.cjs`, `useStockManager.js` 등의 최신 수정사항이 로컬 Git에 커밋되었는지 확인
- [ ] **백업 확인**: `MP_Stock_v3.0.0_20260401_1900` 폴더에 소스 전체 복제본 존재 확인

---

## 3. 배포 실행 절차 (Deployment Steps)

### Step 1: 자동 배포 스크립트 실행
로컬 터미널에서 아래 명령어를 실행하여 AWS 배포를 자동 진행합니다.
```powershell
.\aws_update.bat
```
> **스크립트 수행 내용:**
> 1. Local React build (`dist` 생성)
> 2. AWS 서버 `dist` 폴더 백업
> 3. AWS 서버 최신 코드 `git pull`
> 4. `dist` 폴더 AWS 업로드 (SCP)
> 5. PM2 프로세스 0초 무중단 재시작 (`ecosystem.config.cjs`)
> 6. Health Check (정상 응답 확인)

### Step 2: 백엔드 엔진 동기화 확인
AWS 접속 후 `analyzer.cjs`가 정상 작동하는지 로그를 확인합니다.
```bash
pm2 logs discovery
```

---

## 4. 배포 후 검증 (Post-Deployment)

### 4.1 UI/UX 검증
- [ ] https://mpstock.co.kr 접속 후 F5 새로고침
- [ ] 종목명 셀 3행 표시 및 별점(stars) 출력 확인
- [ ] 이평선배열(2H) 컬럼에 5행 가격순 정렬 및 현재가(📍) 강조 확인
- [ ] 신호발생구간 3x7 그리드에 30M 버튼 포함 여부 확인

### 4.2 데이터/기능 검증
- [ ] 대시보드 상단 7개 TF 필터 버튼 작동 확인
- [ ] `분석데이터` 팝업 레이블이 간소화되었는지 확인
- [ ] 텔레그램 알림 메시지 발송 확인 (필요 시)

---

## 5. 긴급 롤백 절차 (Rollback Plan)

배포 직후 심각한 오류 발생 시 아래 명령으로 이전 버전으로 즉시 복구합니다.
```bash
# AWS 서버 접속 후 실행
cd ~/mp-stock-discovery
rm -rf dist
mv dist_backup_[TIMESTAMP] dist
pm2 reload ecosystem.config.cjs --env production
```
*※ `aws_update.bat`에서 헬스체크 실패 시 자동으로 수행되나, 수동 복구가 필요한 경우 참조.*

---
**Deployment Coordinator**: Antigravity (Deepmind Team)
**Approval Status**: Ready for Deployment
