#!/bin/bash
# [v9.5.0] MP Stock Discovery Hardened Deployment Script
set -e # Exit on any error

echo "========================================="
echo "🚀 MP Stock Discovery 배포를 시작합니다."
echo "========================================="

echo "1. 최신 소스코드 동기화 (git reset)..."
# 로컬 수정사항이나 untracked 파일로 인한 충돌 방지
git fetch --all
git reset --hard origin/main
git clean -fd

echo "2. 버전 및 릴리즈 노트 업데이트 (scripts/version_sync.cjs)..."
# package.json 버전 기반으로 RELEASE.md 자동 업데이트
node scripts/version_sync.cjs

echo "3. 프론트엔드 빌드 (npm run build)..."
# release 스크립트 대신 직접 빌드하여 PM2 리로드 시점 조절
npm run build

echo "4. Prisma DB 스키마 갱신..."
npx prisma db push --schema=platform/infra/db/schema.prisma --skip-generate || echo "Warning: Infra schema push failed, skipping..."
npx prisma db push --schema=prisma/schema.prisma

echo "6. Python 가상환경 및 Sniper Engine 셋업..."
cd sniper_engine
python3 -m venv venv || true
source venv/bin/activate
pip install -r requirements.txt
cd ..

echo "7. PM2 클러스터 롤링 리스타트 (ecosystem.config.cjs)..."
# interpreter: none 설정이 포함된 최신 설정을 적용합니다.
npx pm2 reload ecosystem.config.cjs --env production

echo "8. 웹 서버 정적 파일 동기화 (Nginx Web Root)..."
# Nginx가 바라보는 경로로 빌드 파일을 복사합니다.
sudo cp -rf dist/* /var/www/mp-stock-discovery/dist/
sudo chown -R ubuntu:ubuntu /var/www/mp-stock-discovery/dist

echo "========================================="
echo "✅ 배포 완료! 현재 버전: $(grep version package.json | cut -d '\"' -f 4)"
echo "========================================="
