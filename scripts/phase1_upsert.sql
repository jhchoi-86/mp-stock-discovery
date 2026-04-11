-- [Phase 1-3] 클린 데이터 마이그레이션 (v1.3)
-- officialData.js의 OFFICIAL_TOP5 데이터를 DB에 Upsert (PostgreSQL 방식)

INSERT INTO daily_stock_snapshots (
    code, name,
    entry_price1, stop_loss, target_price1,
    star_grade, trend, trade_amount,
    is_executed, created_at
) VALUES
    -- 삼성E&A
    ('028050', '삼성E&A', 37139, 36024, 42578, 3, '우상향 지속', 313800000000, FALSE, NOW()),
    -- DL이앤씨
    ('375500', 'DL이앤씨', 65600, 63632, 74658, 3, '골든크로스', 125000000000, FALSE, NOW()),
    -- 코오롱인더
    ('120110', '코오롱인더', 78100, 72030, 84774, 3, '바닥권 탈출', 89000000000, FALSE, NOW()),
    -- 세아제강지주
    ('003030', '세아제강지주', 220381, 213769, 265650, 3, '단기 조정', 45000000000, FALSE, NOW()),
    -- RFHIC
    ('218410', 'RFHIC', 89733, 87041, 94219, 3, '상승 전환', 62000000000, FALSE, NOW())
ON CONFLICT (code, created_at) DO UPDATE SET
    entry_price1 = EXCLUDED.entry_price1,
    stop_loss    = EXCLUDED.stop_loss,
    target_price1 = EXCLUDED.target_price1,
    star_grade   = EXCLUDED.star_grade,
    trend        = EXCLUDED.trend,
    trade_amount = EXCLUDED.trade_amount,
    is_executed  = EXCLUDED.is_executed;

-- 5종 상위 종목 조회 검증
SELECT code, name, entry_price1, stop_loss, target_price1, star_grade, trend
FROM daily_stock_snapshots
WHERE code IN ('028050', '375500', '120110', '003030', '218410')
ORDER BY code ASC;
