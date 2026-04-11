-- [Final Polish] Real Data Sync for Top 5 (SSOT v1.3)
-- 028050 (삼성E&A)
UPDATE daily_stock_snapshots SET 
    entry_price_1 = 37139, stop_loss = 36024, target_price_1 = 42578, 
    trend_type = '우상향 지속', trend_strength = 25.5, star_grade = 3
WHERE code = '028050' AND id = (SELECT MAX(id) FROM daily_stock_snapshots WHERE code = '028050');

-- 375500 (DL이앤씨)
UPDATE daily_stock_snapshots SET 
    entry_price_1 = 65600, stop_loss = 63632, target_price_1 = 74658, 
    trend_type = '골든크로스', trend_strength = 22.1, star_grade = 3
WHERE code = '375500' AND id = (SELECT MAX(id) FROM daily_stock_snapshots WHERE code = '375500');

-- 120110 (코오롱인더)
UPDATE daily_stock_snapshots SET 
    entry_price_1 = 78100, stop_loss = 72030, target_price_1 = 84774, 
    trend_type = '바닥권 탈출', trend_strength = 18.4, star_grade = 3
WHERE code = '120110' AND id = (SELECT MAX(id) FROM daily_stock_snapshots WHERE code = '120110');

-- 003030 (세아제강지주)
UPDATE daily_stock_snapshots SET 
    entry_price_1 = 220381, stop_loss = 213769, target_price_1 = 265650, 
    trend_type = '단기 조정', trend_strength = 31.0, star_grade = 3
WHERE code = '003030' AND id = (SELECT MAX(id) FROM daily_stock_snapshots WHERE code = '003030');

-- 218410 (RFHIC)
UPDATE daily_stock_snapshots SET 
    entry_price_1 = 89733, stop_loss = 87041, target_price_1 = 94219, 
    trend_type = '상승 전환', trend_strength = 20.8, star_grade = 3
WHERE code = '218410' AND id = (SELECT MAX(id) FROM daily_stock_snapshots WHERE code = '218410');

-- Invalidate Redis to force fresh fetch
-- mp:signal:028050, 375500, 120110, 003030, 218410
-- We will do this via a separate redis command
