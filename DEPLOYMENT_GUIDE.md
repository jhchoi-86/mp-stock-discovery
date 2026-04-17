# GitHub Actions & AWS 배포 가이드

## 1. 필수 AWS 설정

### 1.1 IAM Role 생성 (OIDC 연동)
```bash
# AWS Console에서 생성 또는 다음 명령어 사용:
aws iam create-role \
  --role-name github-actions-role \
  --assume-role-policy-document file://trust-policy.json
```

`trust-policy.json`:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::YOUR_ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:YOUR_GITHUB_ORG/YOUR_REPO:ref:refs/heads/main"
        }
      }
    }
  ]
}
```

### 1.2 IAM Policy 연결
```bash
aws iam put-role-policy \
  --role-name github-actions-role \
  --policy-name github-actions-policy \
  --policy-document file://policy.json
```

`policy.json`:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "ecr:PutImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload",
        "ecr:BatchCheckLayerAvailability"
      ],
      "Resource": "arn:aws:ecr:ap-northeast-2:YOUR_ACCOUNT_ID:repository/mp-stock"
    },
    {
      "Effect": "Allow",
      "Action": "ecr:GetAuthorizationToken",
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ec2-instance-connect:SendSSHPublicKey",
        "ssm:StartSession"
      ],
      "Resource": "*"
    }
  ]
}
```

### 1.3 ECR Repository 생성
```bash
aws ecr create-repository \
  --repository-name mp-stock \
  --region ap-northeast-2 \
  --image-tag-mutability MUTABLE
```

## 2. GitHub Secrets 설정

GitHub Repository Settings → Secrets and Variables → Actions에서 다음을 추가:

### 필수 Secrets:
- **AWS_ACCOUNT_ID**: 12자리 AWS 계정 ID
- **AWS_ROLE_ARN**: arn:aws:iam::YOUR_ACCOUNT_ID:role/github-actions-role
- **EC2_INSTANCE_IP**: 배포 대상 EC2 인스턴스의 공인 IP
- **EC2_PRIVATE_KEY**: EC2 접속용 private key (PEM)
- **DEPLOYMENT_BUCKET**: S3 배포 스크립트 저장 버킷 이름

### 데이터베이스 Secrets:
- **DB_URL**: postgresql://user:password@host:5432/db_name
- **REDIS_URL**: redis://:password@host:6379

### 애플리케이션 Secrets:
- **JWT_ACCESS_SECRET**: 긴 난수 문자열 (최소 32자)
- **JWT_REFRESH_SECRET**: 긴 난수 문자열 (최소 32자)
- **CORE_INTEGRITY_HASH**: SHA256 해시 또는 난수

### 외부 API Secrets:
- **KIS_APP_KEY**: 한국투자증권 API 키
- **KIS_APP_SECRET**: 한국투자증권 API 시크릿
- **TELEGRAM_BOT_TOKEN**: Telegram Bot Token
- **TELEGRAM_CHAT_ID**: Telegram Chat ID

## 3. EC2 설정

### 3.1 필수 소프트웨어 설치
```bash
#!/bin/bash
sudo yum update -y
sudo yum install -y docker curl git

# Docker 시작
sudo systemctl start docker
sudo systemctl enable docker

# 사용자를 docker 그룹에 추가
sudo usermod -aG docker ec2-user
newgrp docker

# Docker Compose 설치
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# AWS CLI 설치
sudo yum install -y aws-cli
```

### 3.2 배포 디렉토리 생성
```bash
sudo mkdir -p /opt/mp-stock
sudo chown ec2-user:ec2-user /opt/mp-stock
cd /opt/mp-stock
```

### 3.3 docker-compose.prod.yml 배포
```bash
# GitHub에서 docker-compose.prod.yml을 /opt/mp-stock에 복사
# 또는 S3에서 다운로드
aws s3 cp s3://your-bucket/docker-compose.prod.yml /opt/mp-stock/
```

## 4. 로컬 배포 테스트 (선택사항)

```bash
# 이미지 빌드
docker build -t mp-stock:latest -f Dockerfile .

# ECR에 로그인
aws ecr get-login-password --region ap-northeast-2 | \
  docker login --username AWS --password-stdin ACCOUNT_ID.dkr.ecr.ap-northeast-2.amazonaws.com

# 이미지 태그 및 푸시
docker tag mp-stock:latest ACCOUNT_ID.dkr.ecr.ap-northeast-2.amazonaws.com/mp-stock:latest
docker push ACCOUNT_ID.dkr.ecr.ap-northeast-2.amazonaws.com/mp-stock:latest
```

## 5. 워크플로우 트리거

### main 브랜치에 push하면 자동 배포:
```bash
git add .
git commit -m "Deploy to production"
git push origin main
```

### 수동 트리거 (workflow_dispatch):
GitHub Actions 탭에서 "Build and Deploy MP Stock" → "Run workflow" 클릭

## 6. 모니터링 & 롤백

### 배포 상태 확인:
```bash
# GitHub Actions 로그 확인
# GitHub Repository → Actions 탭

# EC2에서 컨테이너 상태 확인
ssh ec2-user@YOUR_EC2_IP
docker ps -a
docker logs mp-stock-backend
```

### 롤백:
```bash
# 이전 버전으로 롤백
ssh ec2-user@YOUR_EC2_IP
cd /opt/mp-stock
docker compose -p mp-stock -f docker-compose.prod.yml down
docker pull ACCOUNT_ID.dkr.ecr.ap-northeast-2.amazonaws.com/mp-stock:PREVIOUS_SHA
docker compose -p mp-stock -f docker-compose.prod.yml up -d
```

## 7. 보안 모범 사례

- ✅ 모든 시크릿은 GitHub Secrets 또는 AWS Secrets Manager에 저장
- ✅ EC2 private key는 파일로 저장하지 말고 시크릿으로 관리
- ✅ IAM Role은 최소 권한 원칙 적용
- ✅ Docker 이미지는 ecr:GetAuthorizationToken으로 접근 제어
- ✅ 정기적으로 이미지 스캔 (Trivy)
- ✅ 운영 환경 변수는 .env.production에 저장하지 말고 환경 변수로 주입

## 8. 트러블슈팅

### ECR 로그인 실패
```bash
aws ecr get-login-password --region ap-northeast-2 | \
  docker login --username AWS --password-stdin ACCOUNT_ID.dkr.ecr.ap-northeast-2.amazonaws.com
```

### EC2 SSH 연결 실패
```bash
ssh -i ~/.ssh/your-key.pem -o StrictHostKeyChecking=no ec2-user@YOUR_EC2_IP
```

### 헬스 체크 실패
```bash
docker logs mp-stock-backend
curl http://localhost:3001/api/health
```
