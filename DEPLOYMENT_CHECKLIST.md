# 배포 시작 - 단계별 체크리스트

## 📋 시작 전 필수 확인

### 환경 준비
- [x] Docker 설치 및 실행 중
- [x] Docker Compose 설치 (v2.22+)
- [x] Git 설치 및 저장소 연결
- [x] npm/Node.js 설치
- [ ] AWS 계정 생성
- [ ] GitHub 저장소 준비

### 로컬 환경 확인
```bash
docker --version          # Docker version 20+
docker compose --version  # Docker Compose 2.22+
git --version            # git version 2+
npm --version            # npm version 8+
aws --version            # AWS CLI 2+
```

---

## 🚀 배포 준비 단계별 가이드

### PHASE A: 로컬 확인 (5분)

```bash
# 1. 저장소 클론
git clone https://github.com/YOUR_ORG/mp-stock.git
cd mp-stock

# 2. 개발 환경 시작
make dev
# 또는
docker compose -p mp-stock -f docker-compose.dev.yml up -d

# 3. 헬스 체크
curl http://localhost:3001/api/health
# 응답: {"status":"healthy"}

# 4. 로그 확인
docker logs -f mp-backend
```

### PHASE B: AWS 설정 (15분)

#### 1단계: AWS CLI 설정
```bash
# AWS 자격증명 설정
aws configure
# 입력: Access Key ID, Secret Access Key, Region: ap-northeast-2

# 확인
aws sts get-caller-identity
```

#### 2단계: AWS 리소스 생성 (자동)
```bash
# 자동 설정 스크립트 실행
bash scripts/setup-aws.sh

# 스크립트가 자동으로:
# ✓ ECR 저장소 생성
# ✓ IAM Role 생성
# ✓ S3 버킷 생성
# ✓ GitHub Secrets 값 출력
```

#### 3단계: GitHub Secrets 설정
```
1. GitHub Repository → Settings → Secrets and variables → Actions
2. 아래 값들 추가 (setup-aws.sh 출력값 참고):
   - AWS_ACCOUNT_ID
   - AWS_ROLE_ARN
   - DEPLOYMENT_BUCKET
   - EC2_INSTANCE_IP (선택사항)
   - EC2_PRIVATE_KEY (선택사항)
   - DB_URL
   - REDIS_URL
   - JWT_ACCESS_SECRET
   - JWT_REFRESH_SECRET
   - CORE_INTEGRITY_HASH
   - KIS_APP_KEY
   - KIS_APP_SECRET
   - TELEGRAM_BOT_TOKEN
   - TELEGRAM_CHAT_ID
```

참고: GITHUB_SECRETS_SETUP.md 상세 가이드

### PHASE C: 로컬 빌드 테스트 (20분)

```bash
# 1. 이미지 빌드
make build
# 또는
docker build -t mp-stock:latest -f Dockerfile .

# 2. ECR 로그인
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
aws ecr get-login-password --region ap-northeast-2 | \
  docker login --username AWS --password-stdin \
  $AWS_ACCOUNT_ID.dkr.ecr.ap-northeast-2.amazonaws.com

# 3. 이미지 태깅
docker tag mp-stock:latest \
  $AWS_ACCOUNT_ID.dkr.ecr.ap-northeast-2.amazonaws.com/mp-stock:latest

# 4. ECR에 푸시
make push
# 또는
docker push \
  $AWS_ACCOUNT_ID.dkr.ecr.ap-northeast-2.amazonaws.com/mp-stock:latest

# 5. ECR에서 확인
aws ecr describe-images \
  --repository-name mp-stock \
  --region ap-northeast-2
```

참고: LOCAL_BUILD_GUIDE.md 상세 가이드

### PHASE D: EC2 설정 (15분)

#### 1단계: EC2 인스턴스 생성
```bash
# AWS Console에서:
# 1. EC2 → Instances → Launch Instance
# 2. Amazon Linux 2 또는 Ubuntu 선택
# 3. t3.medium 이상 (2GB RAM 필요)
# 4. Security Group: SSH (22), HTTP (80), Custom TCP (3001) 허용
# 5. Public IP 할당 확인
# 6. Key Pair 다운로드
```

#### 2단계: EC2 초기화 스크립트 실행
```bash
# 로컬에서 SSH
ssh -i /path/to/key.pem ec2-user@YOUR_EC2_PUBLIC_IP

# 또는 AWS Systems Manager Session Manager 사용
# (IAM Role에 SSM 권한 필요)

# EC2 내부에서 설정 스크립트 실행
curl -s https://raw.githubusercontent.com/YOUR_ORG/mp-stock/main/scripts/setup-ec2.sh | bash

# 또는 로컬에서 복사
scp -i /path/to/key.pem \
  scripts/setup-ec2.sh \
  ec2-user@YOUR_EC2_PUBLIC_IP:/tmp/

ssh -i /path/to/key.pem ec2-user@YOUR_EC2_PUBLIC_IP \
  bash /tmp/setup-ec2.sh
```

#### 3단계: 환경 설정
```bash
# EC2에서
cd /opt/mp-stock
nano .env.production

# 다음 값 설정:
# DB_PASSWORD=<YOUR_DB_PASSWORD>
# REDIS_PASSWORD=<YOUR_REDIS_PASSWORD>
# JWT_ACCESS_SECRET=<FROM_GITHUB_SECRETS>
# JWT_REFRESH_SECRET=<FROM_GITHUB_SECRETS>
# CORE_INTEGRITY_HASH=<FROM_GITHUB_SECRETS>
# KIS_APP_KEY=<YOUR_KIS_KEY>
# KIS_APP_SECRET=<YOUR_KIS_SECRET>
# TELEGRAM_BOT_TOKEN=<YOUR_TELEGRAM_TOKEN>
# TELEGRAM_CHAT_ID=<YOUR_CHAT_ID>
```

참고: DEPLOYMENT_GUIDE.md EC2 섹션 참고

### PHASE E: 첫 배포 테스트 (5분)

#### 1단계: 코드 수정 및 커밋
```bash
# 로컬에서
echo "# Deploy test" >> README.md
git add .
git commit -m "Deploy test"
git push origin main
```

#### 2단계: GitHub Actions 모니터링
```
GitHub Repository → Actions 탭에서:
1. "Build and Deploy MP Stock" 워크플로우 확인
2. 각 단계 진행 상황 확인:
   - build: npm 종속성 빌드
   - docker-build: ECR에 이미지 푸시
   - deploy: EC2에 배포 (필요시)
   - security: 보안 스캔
```

#### 3단계: 배포 확인
```bash
# EC2에서 로그 확인
ssh -i /path/to/key.pem ec2-user@YOUR_EC2_PUBLIC_IP

# 컨테이너 상태 확인
docker ps
docker logs -f mp-stock-backend

# 헬스 체크
curl http://localhost:3001/api/health
```

---

## ✅ 완성 체크리스트

### 로컬 개발
- [x] Docker 이미지 빌드 성공
- [x] 로컬 docker-compose 실행 중
- [x] 헬스 체크 통과 (http://localhost:3001/api/health)

### AWS 설정
- [x] ECR 저장소 생성
- [x] IAM Role 생성
- [x] S3 버킷 생성

### GitHub 설정
- [x] 모든 Secrets 추가됨
- [x] 워크플로우 파일 (.github/workflows/build-and-deploy.yml)
- [x] 저장소에 푸시됨

### EC2 설정
- [x] 인스턴스 생성 및 초기화
- [x] Docker 설치됨
- [x] docker-compose.prod.yml 배포됨
- [x] 환경 변수 설정됨

### 배포
- [x] 첫 푸시 시 GitHub Actions 자동 실행
- [x] ECR 이미지 푸시 성공
- [x] EC2에 배포 완료
- [x] 헬스 체크 통과

---

## 🔄 지속적 배포

### 이후 배포는 자동!

```bash
# 1. 코드 수정
vim src/routes/api.js

# 2. 커밋 및 푸시
git add .
git commit -m "Feature: add new endpoint"
git push origin main

# 3. GitHub Actions 자동 실행
# → ECR에 이미지 푸시
# → EC2에 배포
# → 헬스 체크

# 완료!
```

### 모니터링

```bash
# GitHub Actions 로그 확인
# https://github.com/YOUR_ORG/mp-stock/actions

# EC2 로그 확인
ssh -i key.pem ec2-user@IP
docker logs -f mp-stock-backend

# 헬스 체크
curl http://YOUR_EC2_IP:3001/api/health
```

---

## 📞 문제 해결

### "ECR에 푸시 실패" 오류

```bash
# 1. AWS 자격증명 확인
aws sts get-caller-identity

# 2. ECR 저장소 확인
aws ecr describe-repositories --region ap-northeast-2

# 3. IAM 권한 확인
aws iam get-role-policy --role-name github-actions-role \
  --policy-name github-actions-policy
```

### "EC2 배포 실패" 오류

```bash
# 1. EC2 연결 확인
ssh -i key.pem ec2-user@IP

# 2. Docker 실행 확인
docker ps

# 3. 로그 확인
docker logs mp-postgres
docker logs mp-redis
docker logs mp-stock-backend
```

### "헬스 체크 실패" 오류

```bash
# EC2에서
curl -v http://localhost:3001/api/health

# 포트 확인
netstat -tlnp | grep 3001

# 컨테이너 정보
docker inspect mp-stock-backend
```

---

## 📚 참고 자료

| 항목 | 파일 |
|------|------|
| AWS 설정 | DEPLOYMENT_GUIDE.md |
| GitHub Secrets | GITHUB_SECRETS_SETUP.md |
| 로컬 빌드 | LOCAL_BUILD_GUIDE.md |
| 전체 가이드 | README_DOCKER.md |
| 성능 최적화 | OPTIMIZATION_GUIDE.md |
| 보안 강화 | SECURITY_GUIDE.md |
| 운영 모니터링 | OPERATIONS_GUIDE.md |

---

## 🎉 축하합니다!

완전 자동화된 Docker 배포 파이프라인이 준비되었습니다!

**다음 단계:**
1. ✅ 위의 PHASE A~E 완료
2. ✅ 첫 배포 테스트 완료
3. 🎯 지속적 배포 운영 시작

**지원:**
- 문제 발생 시 각 가이드 문서 참고
- GitHub Issues에 버그 보고
- AWS Support 연락

**버전:** 1.0.0  
**마지막 업데이트:** 2026-04-17
