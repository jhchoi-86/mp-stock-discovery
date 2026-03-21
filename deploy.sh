#!/bin/bash
# 무중단 배포 (Zero-Downtime Deployment) 스크립트
echo "========================================="
echo "🚀 MP Stock Discovery 배포를 시작합니다."
echo "========================================="

echo "1. 최신 소스코드 다운로드 (git pull)..."
git pull origin main

echo "2. 프론트엔드 React / Vite 정적 파일 빌드 (npm run build)..."
npm run build

echo "2.5. Python 가상환경 및 AI 마이크로서비스 세팅..."
cd ai-service
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cd ..

echo "2.6. Prisma DB 스키마 갱신 (Anomaly/Score 반영)..."
npx prisma db push --schema=platform/infra/db/schema.prisma

echo "3. PM2 클러스터 롤링 리스타트 (무중단 서버 재시작)..."
# reload 명령어는 old 프로세스를 유지한 채 new 프로세스를 하나씩 띄우며(ready 대기), 연결을 자연스럽게 넘겨줍니다.
npx pm2 reload ecosystem.config.cjs --env production

echo "========================================="
echo "✅ 모든 배포 단계가 성공적으로 완료되었습니다!"
echo "========================================="
