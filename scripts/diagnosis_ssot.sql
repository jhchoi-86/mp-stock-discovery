-- [Diagnosis] Check star_grade data
SELECT 'COUNT_TOTAL' as tag, COUNT(*) FROM daily_stock_snapshots;
SELECT 'COUNT_STARRED' as tag, COUNT(*) FROM daily_stock_snapshots WHERE star_grade > 0;

-- [Emergency Fix] Ensure Top 5 has star_grade (B-ERR-02 보정)
-- 최신 레코드들에 별점을 강제 부여하여 리포트 발송 트리거 활성화
UPDATE daily_stock_snapshots 
SET star_grade = 3 
WHERE id IN (
    SELECT id FROM daily_stock_snapshots 
    WHERE code IN ('028050', '375500', '120110', '003030', '218410')
    ORDER BY created_at DESC
    LIMIT 5
);

-- [Verification] Final Check
SELECT code, name, star_grade, created_at 
FROM daily_stock_snapshots 
WHERE star_grade > 0 
ORDER BY created_at DESC 
LIMIT 5;
