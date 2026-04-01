# MP Stock Discovery v3.0 배포 계획서 (7차 보완 - 배포 확정본)

본 문서는 v3.0 로직 고도화 및 데이터 구조 변경에 따른 **장애 제로 배포**를 위한 최종 가이드라인입니다.

## 1. 배포 개요
- **버전**: v3.0 (7-Timeframe & Universal Cache)
- **권장 배포 시간**: **장 마감 후 (15:30 KST 이후)** 또는 야간 배치 전
- **예상 다운타임**: 약 5~10분 (전체 종목 최초 동기화 및 signals.json 재생성 소요 시간)

## 2. 주요 변경 파일 목록 (Total Sync)
| 구분 | 파일명 | 변경 내용 |
|------|--------|-----------|
| **코어** | `analyzer.cjs` | 7개 TF 분석, 인터벌 캐시, 리샘플링 로직 |
| **데이터** | `useStockManager.js` | 2D 지원, 신호 수신 배열 구조 동기화 |
| **UI** | `SignalIndicator.jsx` | 30M/2D 인디케이터 추가 |
| **UI** | `PcDashboard.jsx` | 2H MA 정렬 및 전용 셀 연동 |
| **UI** | `MobileStockCard.jsx` | 모바일 카드 시그널 렌더링 최적화 |
| **유틸** | `reportUtils.js` | 리포트 내 신호 판정 패턴 수정 |

## 3. 배포 절차 (Safe Deployment Steps)

### STEP 1: 백엔드 중단 및 데이터 백업
```bash
# 1. 서비스 중단 (구조 변경에 따른 일시 중단)
pm2 stop all

# 2. 기존 데이터 백업 (롤백 대비 필수)
cp data/signals.json data/signals_v2_backup.json

# 3. 코드 업데이트 (Lock 파일 준수를 위해 npm ci 사용)
git pull origin main
npm ci
```

### STEP 2: 서비스 기동 및 데이터 재생성
```bash
# 1. 서비스 시작
pm2 start all

# 2. 전체 종목 동기화 수동 트리거 (또는 자동 스케줄 대기)
# analyzer 실행으로 v3.0 형식의 signals.json 생성 확인
```

### STEP 3: 프론트엔드 빌드 및 배포
```bash
# 1. 환경 변수(.env.production) 설정 확인 후 빌드
npm run build

# 2. 정적 파일 배포 경로 업데이트
```

## 4. 사후 검증 체크리스트 (Verification)

### 1. 데이터 정합성 즉시 확인 (명령어 실행 필수)
```bash
node -e "
const s = require('./data/signals.json');
const tfs = [...new Set(s.map(x => x.timeframe))];
console.log('--- v3.0 데이터 검증 ---');
console.log('TF 목록:', tfs.sort());
console.log('30M 건수:', s.filter(x => x.timeframe==='30M').length);
console.log('2D 건수:', s.filter(x => x.timeframe==='2D').length);
if(tfs.includes('2D') && tfs.includes('30M')) console.log('✅ TF 검증 성공');
"
```

### 2. PM2 로그 집중 모니터링 항목
- `ReferenceError`: `resampleChartData` 또는 `currentCandle` 미선언 여부 확인.
- `Atomic Write Error`: `signals.json` 파일 쓰기 시 `.tmp` 잔류 여부 확인.
- `2D Resample Count`: 신규 상장주 등에서 2D 캔들이 25개 미만인 케이스(정상 처리됨) 확인.

## 5. 비상 롤백 전략 (Rollback)

**배포 후 크래시 또는 대시보드 렌더링 오류 발생 시 즉시 실행:**
```bash
# 1. 이전 안정 버전 복구
git checkout [v2.x_Tag_or_Commit]

# 2. 데이터 구조 원복 (v3.0 데이터와 v2.0 코드 혼용 방지)
mv data/signals.json data/signals_v3_failed.json
mv data/signals_v2_backup.json data/signals.json

# 3. 서비스 재시작
pm2 restart all
```

---
**작성자**: Antigravity (Advanced AI Coding Agent)
**승인 상태**: 레드팀 9차 전수 검증 및 배포 절차 최종 보완 완료.
