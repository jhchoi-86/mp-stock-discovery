-- 1. 새 Role Enum 값 추가
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'FREE_TRIAL';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'PAID';

-- 2. trial_expires_at 컬럼 추가
ALTER TABLE system_audit.users ADD COLUMN IF NOT EXISTS trial_expires_at TIMESTAMP;

-- 3. 기존 FREE_USER → 분류 이관
-- created_at 기준 14일 이내 → FREE_TRIAL
UPDATE system_audit.users
  SET role = 'FREE_TRIAL',
      trial_expires_at = created_at + INTERVAL '14 days'
  WHERE role = 'FREE_USER'
    AND created_at > NOW() - INTERVAL '14 days';

-- 4. created_at 기준 14일 초과 → FREE
UPDATE system_audit.users
  SET role = 'FREE',
      trial_expires_at = NULL
  WHERE role = 'FREE_USER'
    AND created_at <= NOW() - INTERVAL '14 days';

-- 5. PRO_USER → PAID
UPDATE system_audit.users
  SET role = 'PAID'
  WHERE role = 'PRO_USER';

-- 6. 검증
-- SELECT role, COUNT(*) FROM system_audit.users GROUP BY role;
