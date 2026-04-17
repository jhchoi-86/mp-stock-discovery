# 로컬 빌드 & ECR 테스트 가이드

## 개요

로컬에서 Docker 이미지를 빌드하고 AWS ECR에 푸시하는 방법을 테스트합니다.

## 1단계: AWS 로그인

### AWS CLI 설정

```bash
# AWS 자격증명 설정
aws configure

# 입력:
# AWS Access Key ID: <YOUR_ACCESS_KEY>
# AWS Secret Access Key: <YOUR_SECRET_KEY>
# Default region name: ap-northeast-2
# Default output format: json
```

### 자격증명 확인

```bash
aws sts get-caller-identity
```

## 2단계: 로컬 이미지 빌드

### 프로덕션 이미지 빌드

```bash
cd ~/Documents/Antigravity/주식종목발굴

# 이미지 빌드
docker build -t mp-stock:latest -f Dockerfile .

# 또는 Makefile 사용
make build

# 빌드 확인
docker images | grep mp-stock
```

### 빌드 시간 측정

```bash
time docker build -t mp-stock:latest -f Dockerfile .

# 예상: 120-150s
```

## 3단계: 로컬 테스트

### 이미지 테스트

```bash
# 이미지 레이어 확인
docker history mp-stock:latest

# 이미지 크기 확인
docker images mp-stock --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}"

# 이미지 정보
docker inspect mp-stock:latest | jq '.Config | {Env, Cmd, Entrypoint}'
```

### 컨테이너 테스트 (선택사항)

```bash
# 현재 docker-compose 실행 중인지 확인
docker ps | grep mp-

# 이미 실행 중이면 skip, 아니면:
docker compose -p mp-stock -f docker-compose.dev.yml up -d

# 테스트
curl http://localhost:3001/api/health

# 종료
docker compose -p mp-stock -f docker-compose.dev.yml down
```

## 4단계: ECR 저장소 생성 (첫 배포 시만)

### 저장소 확인

```bash
# ECR 저장소 목록 확인
aws ecr describe-repositories --region ap-northeast-2

# "mp-stock" 저장소 있는지 확인
```

### 없으면 생성

```bash
aws ecr create-repository \
  --repository-name mp-stock \
  --region ap-northeast-2 \
  --image-tag-mutability MUTABLE \
  --image-scanning-configuration scanOnPush=true
```

## 5단계: ECR 로그인

```bash
# AWS Account ID 확인
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo $AWS_ACCOUNT_ID

# ECR 로그인
aws ecr get-login-password --region ap-northeast-2 | \
  docker login --username AWS --password-stdin \
  $AWS_ACCOUNT_ID.dkr.ecr.ap-northeast-2.amazonaws.com

# 로그인 확인
# 출력: Login Succeeded
```

## 6단계: 이미지 태깅

```bash
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# 이미지 태그 지정
docker tag mp-stock:latest \
  $AWS_ACCOUNT_ID.dkr.ecr.ap-northeast-2.amazonaws.com/mp-stock:latest

# 또는 커밋 SHA로 태깅
COMMIT_SHA=$(git rev-parse --short HEAD)
docker tag mp-stock:latest \
  $AWS_ACCOUNT_ID.dkr.ecr.ap-northeast-2.amazonaws.com/mp-stock:$COMMIT_SHA

# 태그 확인
docker images | grep mp-stock
```

## 7단계: ECR에 푸시

```bash
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# 이미지 푸시 (크기에 따라 5-15분)
docker push \
  $AWS_ACCOUNT_ID.dkr.ecr.ap-northeast-2.amazonaws.com/mp-stock:latest

# 진행률 표시
# 또는 커밋 SHA로 푸시
COMMIT_SHA=$(git rev-parse --short HEAD)
docker push \
  $AWS_ACCOUNT_ID.dkr.ecr.ap-northeast-2.amazonaws.com/mp-stock:$COMMIT_SHA
```

## 8단계: ECR에서 확인

```bash
# 푸시된 이미지 확인
aws ecr describe-images \
  --repository-name mp-stock \
  --region ap-northeast-2

# 또는 JSON 형식으로
aws ecr describe-images \
  --repository-name mp-stock \
  --region ap-northeast-2 \
  --query 'imageDetails[*].[imageTags[0], pushTime, imageSize]' \
  --output table
```

## 9단계: ECR에서 이미지 다운로드 & 테스트

```bash
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# ECR 로그인 (필요시 다시)
aws ecr get-login-password --region ap-northeast-2 | \
  docker login --username AWS --password-stdin \
  $AWS_ACCOUNT_ID.dkr.ecr.ap-northeast-2.amazonaws.com

# 로컬 이미지 삭제
docker rmi mp-stock:latest

# ECR에서 다운로드
docker pull \
  $AWS_ACCOUNT_ID.dkr.ecr.ap-northeast-2.amazonaws.com/mp-stock:latest

# 이미지 확인
docker images | grep mp-stock
```

## 전체 자동 스크립트

```bash
#!/bin/bash
set -e

echo "Step 1: Building image..."
docker build -t mp-stock:latest -f Dockerfile .

echo "Step 2: Getting AWS Account ID..."
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "Account ID: $AWS_ACCOUNT_ID"

echo "Step 3: Logging in to ECR..."
aws ecr get-login-password --region ap-northeast-2 | \
  docker login --username AWS --password-stdin \
  $AWS_ACCOUNT_ID.dkr.ecr.ap-northeast-2.amazonaws.com

echo "Step 4: Tagging image..."
docker tag mp-stock:latest \
  $AWS_ACCOUNT_ID.dkr.ecr.ap-northeast-2.amazonaws.com/mp-stock:latest

echo "Step 5: Pushing to ECR..."
docker push \
  $AWS_ACCOUNT_ID.dkr.ecr.ap-northeast-2.amazonaws.com/mp-stock:latest

echo "Step 6: Verifying in ECR..."
aws ecr describe-images \
  --repository-name mp-stock \
  --region ap-northeast-2 \
  --query 'imageDetails[0]'

echo "✓ Complete!"
```

파일로 저장:
```bash
# save-as: push-to-ecr.sh
chmod +x push-to-ecr.sh
./push-to-ecr.sh
```

## 문제 해결

### 1. ECR 로그인 실패

```bash
# 오류: no basic auth credentials
# 해결:
aws ecr get-login-password --region ap-northeast-2 | \
  docker login --username AWS --password-stdin \
  $AWS_ACCOUNT_ID.dkr.ecr.ap-northeast-2.amazonaws.com

# 또는 AWS 자격증명 재설정
aws configure
```

### 2. 저장소를 찾을 수 없음

```bash
# 오류: image not found
# 확인:
aws ecr describe-repositories --region ap-northeast-2

# 생성:
aws ecr create-repository \
  --repository-name mp-stock \
  --region ap-northeast-2
```

### 3. 푸시 속도 느림

```bash
# 대역폭 확인
# EC2에서 푸시하면 빠름 (VPC 내부 트래픽)

# 로컬에서 푸시하는 경우:
# - 파일 시스템 캐시 사용
# - Wi-Fi → 이더넷 변경
```

### 4. 이미지 크기 너무 큼

```bash
# 현재 크기 확인
docker images mp-stock

# Dockerfile 최적화 (OPTIMIZATION_GUIDE.md 참고)

# 불필요한 파일 제거
cat .dockerignore

# 다시 빌드
docker build -t mp-stock:latest -f Dockerfile --no-cache .
```

## 성능 측정

```bash
# 빌드 시간
time docker build -t mp-stock:latest -f Dockerfile .

# 푸시 시간 측정
time docker push \
  $AWS_ACCOUNT_ID.dkr.ecr.ap-northeast-2.amazonaws.com/mp-stock:latest

# 이미지 크기
du -h $(docker inspect -f '{{.GraphDriver.Data.MergedDir}}' mp-stock:latest)
```

## 다음 단계

1. ✅ 로컬 빌드 테스트 완료
2. ✅ ECR 푸시 테스트 완료
3. ⏭️ EC2 배포 설정 (setup-ec2.sh)
4. ⏭️ GitHub Actions 테스트 배포
