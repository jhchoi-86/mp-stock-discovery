CREATE OR REPLACE FUNCTION public.validate_stock_signal()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    prev_close NUMERIC(12,0);
    lower_bound NUMERIC(12,0);
    upper_bound NUMERIC(12,0);
BEGIN
    -- [Phase 4 Fix] Use is_executed instead of is_validation_exempt
    IF NEW.is_executed = TRUE THEN
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
$function$;
