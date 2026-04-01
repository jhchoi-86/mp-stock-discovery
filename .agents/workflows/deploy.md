---
description: MP Stock 플랫폼 배포 및 업데이트 절차
---

MP Stock 플랫폼의 모든 코드 수정 및 서버 배포 시 반드시 다음 절차를 준수합니다.

## 1. 코드 수정 및 로컬 검증
- 수정 사항이 의도대로 동작하는지 로컬 환경에서 테스트합니다.

## 2. RELEASE.md 업데이트 (필수)
- [RELEASE.md](file:///c:/Users/danbe/Documents/Antigravity/주식종목발굴/RELEASE.md) 파일을 열어 새로운 버전 섹션을 추가합니다.
- 버전 번호(v1.x.x), 날짜, 주요 변경 사항, 조치 내용을 기록합니다.

## 3. 프론트엔드 빌드 및 서버 업로드
- `npm run build`를 실행하여 최신 `dist` 폴더를 생성합니다.
- 서버(AWS)의 `/home/ubuntu/mp-stock-discovery/` 경로에 빌드 파일과 수정된 소스 코드를 동기화합니다.
- **중요**: `RELEASE.md` 파일도 서버에 함께 업로드합니다.

## 4. 서버 프로세스 재시작
- `ssh`로 서버에 접속하여 `pm2 restart mp-stock-discovery`를 실행합니다.

## 5. 최종 확인
- 운영 사이트가 정상적으로 동작하는지 확인하고, 화면에서 버전 정보나 변경 사항이 반영되었는지 검증합니다.
