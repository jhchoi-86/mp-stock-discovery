-- [Phase 1-1] DB 스키마 확장 (PostgreSQL v1.3)
-- 대상 테이블: daily_stock_snapshots (SSOT 원천)

-- 1. 신규 컬럼 8종 추가 (B-ERR-04 보정)
ALTER TABLE daily_stock_snapshots 
  ADD COLUMN IF NOT EXISTS trade_amount    BIGINT        DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trend_type      VARCHAR(20)   DEFAULT '횡보',
  ADD COLUMN IF NOT EXISTS trend_strength  NUMERIC(5,2)  DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS star_grade      SMALLINT      DEFAULT 0,
  ADD COLUMN IF NOT EXISTS entry_price_1   NUMERIC(12,0) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS entry_price_2   NUMERIC(12,0) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stop_loss       NUMERIC(12,0) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS target_price_1  NUMERIC(12,0) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_validation_exempt BOOLEAN DEFAULT FALSE;

-- 2. 컬럼 주석(Comment) 추가
COMMENT ON COLUMN daily_stock_snapshots.trade_amount IS '거래대금(원)';
COMMENT ON COLUMN daily_stock_snapshots.trend_type IS '추세유형(상승/횡보/하락)';
COMMENT ON COLUMN daily_stock_snapshots.trend_strength IS '추세강도(ADX)';
COMMENT ON COLUMN daily_stock_snapshots.star_grade IS '별표등급(1~5)';
COMMENT ON COLUMN daily_stock_snapshots.entry_price_1 IS '1차매수가';
COMMENT ON COLUMN daily_stock_snapshots.entry_price_2 IS '2차매수가';
COMMENT ON COLUMN daily_stock_snapshots.stop_loss IS '손절가';
COMMENT ON COLUMN daily_stock_snapshots.target_price_1 IS '1차목표가';
COMMENT ON COLUMN daily_stock_snapshots.is_validation_exempt IS '유효성검사 예외여부';

-- 3. [Phase 1-2] 데이터 유효성 검사 트리거 함수 정의 (R-MISS-03 보정)
CREATE OR REPLACE FUNCTION validate_stock_signal() 
RETURNS TRIGGER AS $$
DECLARE
    prev_close NUMERIC(12,0);
    lower_bound NUMERIC(12,0);
    upper_bound NUMERIC(12,0);
BEGIN
    -- 예외 플래그 확인
    IF NEW.is_validation_exempt = TRUE THEN
        RETURN NEW;
    END IF;

    -- 전일 종가 조회
    SELECT current_price INTO prev_close
    FROM daily_stock_snapshots
    WHERE code = NEW.code
    ORDER BY created_at DESC
    LIMIT 1;

    -- 검증 로직 집행 (±30% 범위)
    IF prev_close IS NOT NULL AND prev_close > 0 THEN
        lower_bound := FLOOR(prev_close * 0.30);
        upper_bound := CEIL(prev_close * 1.30);

        IF NEW.current_price < lower_bound OR NEW.current_price > upper_bound THEN
            RAISE EXCEPTION 'VALIDATION FAILED: current_price(%) out of range [%, %] for stock(%)', 
                NEW.current_price, lower_bound, upper_bound, NEW.code;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. 트리거 등록
DROP TRIGGER IF EXISTS trg_validate_stock_signal ON daily_stock_snapshots;
CREATE TRIGGER trg_validate_stock_signal
BEFORE INSERT ON daily_stock_snapshots
FOR EACH ROW
EXECUTE FUNCTION validate_stock_signal();
