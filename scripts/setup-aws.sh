#!/bin/bash

# ============================================================================
# AWS Setup Script for MP Stock Docker Deployment
# This script sets up all required AWS resources for automated deployment
# ============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# ============================================================================
# Configuration
# ============================================================================
AWS_REGION="ap-northeast-2"
ECR_REPO_NAME="mp-stock"
IAM_ROLE_NAME="github-actions-role"
IAM_POLICY_NAME="github-actions-policy"
S3_BUCKET_NAME="mp-stock-deployment-$(date +%s)"

# ============================================================================
# Functions
# ============================================================================
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# ============================================================================
# Check Prerequisites
# ============================================================================
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI not found. Install it: https://aws.amazon.com/cli/"
        exit 1
    fi
    
    # Check jq
    if ! command -v jq &> /dev/null; then
        log_error "jq not found. Install it: https://stedolan.github.io/jq/"
        exit 1
    fi
    
    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        log_error "AWS credentials not configured. Run: aws configure"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# ============================================================================
# Get AWS Account ID
# ============================================================================
get_aws_account_id() {
    log_info "Getting AWS Account ID..."
    AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    log_success "AWS Account ID: $AWS_ACCOUNT_ID"
}

# ============================================================================
# Create ECR Repository
# ============================================================================
create_ecr_repository() {
    log_info "Creating ECR repository: $ECR_REPO_NAME"
    
    # Check if repository exists
    if aws ecr describe-repositories --repository-names $ECR_REPO_NAME --region $AWS_REGION &> /dev/null; then
        log_warn "ECR repository already exists"
        return
    fi
    
    aws ecr create-repository \
        --repository-name $ECR_REPO_NAME \
        --region $AWS_REGION \
        --image-tag-mutability MUTABLE \
        --image-scanning-configuration scanOnPush=true
    
    log_info "Applying ECR lifecycle policy (keeping last 10 images)..."
    
    # Create lifecycle policy document
    cat > /tmp/ecr-lifecycle.json << 'EOF'
{
  "rules": [
    {
      "rulePriority": 1,
      "description": "Keep last 10 images",
      "selection": {
        "tagStatus": "any",
        "countType": "imageCountMoreThan",
        "countNumber": 10
      },
      "action": {
        "type": "expire"
      }
    }
  ]
}
EOF
    
    # Apply lifecycle policy
    aws ecr put-lifecycle-policy \
        --repository-name $ECR_REPO_NAME \
        --region $AWS_REGION \
        --lifecycle-policy-text file:///tmp/ecr-lifecycle.json
        
    log_success "ECR repository created and lifecycle policy applied: $ECR_REPO_NAME"
}

# ============================================================================
# Create IAM Role for GitHub Actions
# ============================================================================
create_iam_role() {
    log_info "Creating IAM role: $IAM_ROLE_NAME"
    
    # Check if role exists
    if aws iam get-role --role-name $IAM_ROLE_NAME &> /dev/null; then
        log_warn "IAM role already exists"
        return
    fi
    
    # Create trust policy document
    cat > /tmp/trust-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:YOUR_GITHUB_ORG/YOUR_REPO:*"
        }
      }
    }
  ]
}
EOF
    
    # Replace account ID
    sed -i "s/ACCOUNT_ID/$AWS_ACCOUNT_ID/g" /tmp/trust-policy.json
    
    # Get GitHub org and repo from user
    read -p "Enter your GitHub organization (e.g., danbe): " GITHUB_ORG
    read -p "Enter your GitHub repository name (e.g., mp-stock): " GITHUB_REPO
    
    sed -i "s|YOUR_GITHUB_ORG/$GITHUB_REPO|$GITHUB_ORG/$GITHUB_REPO|g" /tmp/trust-policy.json
    
    # Create role
    aws iam create-role \
        --role-name $IAM_ROLE_NAME \
        --assume-role-policy-document file:///tmp/trust-policy.json
    
    log_success "IAM role created: $IAM_ROLE_NAME"
}

# ============================================================================
# Create IAM Policy
# ============================================================================
create_iam_policy() {
    log_info "Creating IAM policy: $IAM_POLICY_NAME"
    
    # Create policy document
    cat > /tmp/policy.json << EOF
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
      "Resource": "arn:aws:ecr:$AWS_REGION:$AWS_ACCOUNT_ID:repository/$ECR_REPO_NAME"
    },
    {
      "Effect": "Allow",
      "Action": "ecr:GetAuthorizationToken",
      "Resource": "*"
    }
  ]
}
EOF
    
    # Attach policy to role
    aws iam put-role-policy \
        --role-name $IAM_ROLE_NAME \
        --policy-name $IAM_POLICY_NAME \
        --policy-document file:///tmp/policy.json
    
    log_success "IAM policy attached: $IAM_POLICY_NAME"
}

# ============================================================================
# Create S3 Bucket for Deployment Scripts
# ============================================================================
create_s3_bucket() {
    log_info "Creating S3 bucket: $S3_BUCKET_NAME"
    
    aws s3 mb s3://$S3_BUCKET_NAME --region $AWS_REGION
    
    # Enable versioning
    aws s3api put-bucket-versioning \
        --bucket $S3_BUCKET_NAME \
        --versioning-configuration Status=Enabled
    
    # Block public access
    aws s3api put-public-access-block \
        --bucket $S3_BUCKET_NAME \
        --public-access-block-configuration \
        "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
    
    log_success "S3 bucket created: $S3_BUCKET_NAME"
}

# ============================================================================
# Output Configuration
# ============================================================================
output_configuration() {
    log_info "GitHub Secrets Configuration"
    echo ""
    echo "Add the following secrets to your GitHub repository:"
    echo "Settings → Secrets and variables → Actions → New repository secret"
    echo ""
    echo "1. AWS_ACCOUNT_ID:"
    echo "   Value: $AWS_ACCOUNT_ID"
    echo ""
    echo "2. AWS_ROLE_ARN:"
    echo "   Value: arn:aws:iam::$AWS_ACCOUNT_ID:role/$IAM_ROLE_NAME"
    echo ""
    echo "3. DEPLOYMENT_BUCKET:"
    echo "   Value: $S3_BUCKET_NAME"
    echo ""
    echo "4. EC2_INSTANCE_IP (필요한 경우):"
    echo "   Value: <your-ec2-public-ip>"
    echo ""
    echo "5. EC2_PRIVATE_KEY (필요한 경우):"
    echo "   Value: <your-ec2-private-key-content>"
    echo ""
    echo "6. DB_URL:"
    echo "   Value: postgresql://user:password@host:5432/mp_stock"
    echo ""
    echo "7. REDIS_URL:"
    echo "   Value: redis://:password@host:6379"
    echo ""
    echo "8. JWT_ACCESS_SECRET:"
    echo "   Value: $(openssl rand -base64 32)"
    echo ""
    echo "9. JWT_REFRESH_SECRET:"
    echo "   Value: $(openssl rand -base64 32)"
    echo ""
    echo "10. CORE_INTEGRITY_HASH:"
    echo "    Value: $(openssl rand -hex 32)"
    echo ""
}

# ============================================================================
# Main
# ============================================================================
main() {
    log_info "Starting AWS setup for MP Stock..."
    echo ""
    
    check_prerequisites
    get_aws_account_id
    
    log_info "Creating AWS resources..."
    create_ecr_repository
    create_iam_role
    create_iam_policy
    create_s3_bucket
    
    echo ""
    output_configuration
    
    log_success "AWS setup completed!"
    echo ""
    echo "Next steps:"
    echo "1. Add GitHub Secrets (see above)"
    echo "2. Set up EC2 instance"
    echo "3. Push to main branch to trigger deployment"
}

main "$@"