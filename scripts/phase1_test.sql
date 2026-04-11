-- [Phase 1-4] 트리거 검증 테스트 (v1.3)
-- 1. 비정상 수치 삽입 시도 (±30% 초과)
INSERT INTO daily_stock_snapshots (code, name, current_price) 
VALUES ('TEST_ERR', 'Error Stock', 9999999);

-- 2. 예외 플래그 사용 시 삽입 (성공해야 함)
INSERT INTO daily_stock_snapshots (code, name, current_price, is_validation_exempt) 
VALUES ('TEST_EXM', 'Exempt Stock', 9999999, TRUE);

-- 3. 검증 결과 확인
SELECT code, name, current_price, is_validation_exempt, created_at
FROM daily_stock_snapshots
WHERE code LIKE 'TEST_%'
ORDER BY created_at DESC;
