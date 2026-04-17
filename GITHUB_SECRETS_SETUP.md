# GitHub Secrets 설정 가이드

## 개요

GitHub Actions 워크플로우에서 AWS 리소스에 접근하고 배포하기 위해 필요한 시크릿을 설정합니다.

## 방법 1: 자동 설정 스크립트 (권장)

```bash
# 터미널에서 실행
bash scripts/setup-aws.sh

# 스크립트가 자동으로:
# 1. ECR 저장소 생성
# 2. IAM Role 및 Policy 생성
# 3. S3 버킷 생성
# 4. GitHub Secrets 설정 값 출력
```

## 방법 2: 수동 설정

### 1. AWS 계정 ID 확인

```bash
aws sts get-caller-identity --query Account --output text
```

### 2. GitHub 저장소로 이동

```
https://github.com/YOUR_GITHUB_ORG/YOUR_REPO/settings/secrets/actions
```

### 3. 다음 Secrets 추가

#### **필수 Secrets (AWS)**

1. **AWS_ACCOUNT_ID**
   - 값: 12자리 AWS 계정 ID
   - 예: `123456789012`

2. **AWS_ROLE_ARN**
   - 값: `arn:aws:iam::YOUR_ACCOUNT_ID:role/github-actions-role`
   - 예: `arn:aws:iam::123456789012:role/github-actions-role`

3. **DEPLOYMENT_BUCKET**
   - 값: S3 버킷 이름
   - 예: `mp-stock-deployment-1234567890`

#### **필수 Secrets (EC2)**

4. **EC2_INSTANCE_IP**
   - 값: EC2 인스턴스 공인 IP
   - 예: `203.0.113.42`

5. **EC2_PRIVATE_KEY**
   - 값: EC2 private key 파일 내용
   - 방법:
     ```bash
     cat ~/.ssh/your-key.pem
     # 전체 내용을 복사해서 GitHub Secret에 붙여넣기
     ```

#### **필수 Secrets (데이터베이스)**

6. **DB_URL**
   - 값: PostgreSQL 연결 문자열
   - 예: `postgresql://postgres:password@db-host:5432/mp_stock`
   - 포맷: `postgresql://USERNAME:PASSWORD@HOST:PORT/DATABASE`

7. **REDIS_URL**
   - 값: Redis 연결 문자열
   - 예: `redis://:password@redis-host:6379`
   - 포맷: `redis://:PASSWORD@HOST:PORT`

#### **필수 Secrets (애플리케이션)**

8. **JWT_ACCESS_SECRET**
   - 값: 긴 난수 문자열 (최소 32자)
   - 생성:
     ```bash
     openssl rand -base64 32
     ```

9. **JWT_REFRESH_SECRET**
   - 값: 긴 난수 문자열 (최소 32자)
   - 생성:
     ```bash
     openssl rand -base64 32
     ```

10. **CORE_INTEGRITY_HASH**
    - 값: 32자 16진수
    - 생성:
      ```bash
      openssl rand -hex 32
      ```

#### **필수 Secrets (외부 API)**

11. **KIS_APP_KEY**
    - 값: 한국투자증권 App Key

12. **KIS_APP_SECRET**
    - 값: 한국투자증권 App Secret

13. **TELEGRAM_BOT_TOKEN**
    - 값: Telegram Bot Token
    - 얻는 방법: @BotFather와 대화

14. **TELEGRAM_CHAT_ID**
    - 값: Telegram Chat ID
    - 얻는 방법: @userinfobot 사용

15. **ADMIN_WHITELIST** (선택사항)
    - 값: 쉼표로 구분된 관리자 이메일
    - 예: `admin@example.com,dev@example.com`

## Secret 보안 모범 사례

✅ **해야 할 일:**
- [ ] 각 시크릿에 고유한 값 사용
- [ ] 주기적으로 시크릿 로테이션
- [ ] 시크릿 생성일자 기록
- [ ] 액세스 로그 모니터링
- [ ] 최소 권한 원칙 적용

❌ **하면 안 될 일:**
- 시크릿을 git에 커밋
- 로그에 시크릿 노출
- 개발자 간에 시크릿 공유
- 동일한 시크릿 여러 환경에 사용
- 만료되지 않는 토큰 사용

## Secret 사용 확인

### 워크플로우에서 secret 사용 예:

```yaml
- name: Deploy to EC2
  env:
    JWT_SECRET: ${{ secrets.JWT_ACCESS_SECRET }}
    DB_URL: ${{ secrets.DB_URL }}
  run: |
    echo "Using database: $DB_URL"
```

### GitHub CLI로 확인:

```bash
# 저장소의 모든 secret 목록 (실제 값은 표시 안 됨)
gh secret list -R YOUR_GITHUB_ORG/YOUR_REPO
```

## Secret 업데이트

### 기존 Secret 수정:

1. GitHub 저장소 settings → Secrets
2. 해당 Secret 우측의 "Update secret" 클릭
3. 새로운 값 입력
4. "Update secret" 클릭

### 새 Secret 추가:

1. "New repository secret" 클릭
2. Name 입력
3. Value 입력
4. "Add secret" 클릭

## Secret 삭제

⚠️ **주의**: 삭제 후 복구 불가능

1. GitHub 저장소 settings → Secrets
2. 해당 Secret 우측의 삭제 아이콘 클릭
3. 확인

## 트러블슈팅

### Secret이 작동하지 않는 경우

1. Secret 이름 대소문자 확인 (GitHub는 대소문자 구분)
2. Workflow 파일에서 `${{ secrets.SECRET_NAME }}` 형식 확인
3. 최근 변경사항 확인
4. 캐시 삭제 후 재시도

### ECR 로그인 실패

```yaml
# 문제 가능성:
- AWS_ACCOUNT_ID가 잘못됨
- AWS_ROLE_ARN이 잘못됨
- IAM Policy가 부족함

# 해결:
- AWS 값 다시 확인
- IAM Policy 정책 확인
```

### EC2 SSH 연결 실패

```yaml
# 문제 가능성:
- EC2_PRIVATE_KEY가 잘못됨
- EC2_INSTANCE_IP가 잘못됨
- EC2 보안 그룹이 SSH 포트 차단

# 해결:
- Private key 파일 내용 전체 복사 확인
- 공인 IP 다시 확인
- AWS EC2 보안 그룹에서 22번 포트 허용
```

## 다음 단계

1. ✅ AWS 리소스 생성 (setup-aws.sh)
2. ✅ GitHub Secrets 설정 (위 가이드)
3. ⏭️ EC2 인스턴스 설정 (setup-ec2.sh)
4. ⏭️ 첫 배포 테스트 (main 브랜치에 push)

## 참고 자료

- GitHub Secrets 문서: https://docs.github.com/en/actions/security-guides/encrypted-secrets
- AWS IAM: https://docs.aws.amazon.com/iam/
- GitHub Actions: https://docs.github.com/en/actions
