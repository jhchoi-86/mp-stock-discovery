-- [Phase 1-4] 트리거 정밀 검증 테스트 v2 (v1.3)
-- 기존 데이터가 있는 종목(삼성E&A, 028050)으로 오타 삽입 시도

-- 1. 비정상 수치 삽입 시도 (거부되어야 함)
-- 삼성E&A의 현재가는 4만원대이므로, 999만원은 에러를 유발해야 함.
INSERT INTO daily_stock_snapshots (code, name, current_price) 
VALUES ('028050', '삼성E&A_오타테스트', 9999999);

-- 2. 결과 확인 (위 INSERT가 실패해야 정상)
SELECT code, name, current_price, created_at
FROM daily_stock_snapshots
WHERE code = '028050'
ORDER BY created_at DESC
LIMIT 1;
