/**
 * scoringEngine.cjs
 * 원팀 모드: Blue Team 구현 및 Red Team 예외 방어 로직 적용
 */

/**
 * 5가지 지표의 원시 값을 계산합니다.
 * @param {Object} data 
 * @returns {Object} 5가지 지표 계산 결과
 */
function computeIndicators(data) {
    const {
        open = 0,
        prev_close = 1, // Fallback: 0으로 인한 Zero Division 방어
        current_vol = 0,
        avg_prev_5d_vol = 1,
        current_price = 0,
        vwap = 1,
        buy_ticks = 0,
        sell_ticks = 1,
        ask_volume_sum = 0,
        bid_volume_sum = 1
    } = data || {};

    // 1. 갭상승률 (%)
    const safe_prev_close = prev_close > 0 ? prev_close : 1;
    const gapRatio = ((open - safe_prev_close) / safe_prev_close) * 100;

    // 2. 당일 거래대금 급증률 (%)
    const safe_avg_vol = avg_prev_5d_vol > 0 ? avg_prev_5d_vol : 1;
    const volumeSurgeRatio = (current_vol / safe_avg_vol) * 100;

    // 3. VWAP 이격도 (%)
    const safe_vwap = vwap > 0 ? vwap : 1;
    const vwapDiv = (current_price / safe_vwap) * 100;

    // 4. 체결강도 (%)
    const safe_sell_ticks = sell_ticks > 0 ? sell_ticks : 1;
    const tickPower = (buy_ticks / safe_sell_ticks) * 100;

    // 5. 호가 잔량 비율 (배)
    const safe_bid_volume_sum = bid_volume_sum > 0 ? bid_volume_sum : 1;
    const obRatio = ask_volume_sum / safe_bid_volume_sum;

    return {
        gapRatio,
        volumeSurgeRatio,
        vwapDiv,
        tickPower,
        obRatio
    };
}

/**
 * 5가지 지표로 최종 득점 매핑을 수행합니다.
 * @param {Object} indicators computeIndicators의 반환값
 * @returns {Object} 각 항목 점수 및 총점 등
 */
function calculateScore(indicators) {
    const { gapRatio, volumeSurgeRatio, vwapDiv, tickPower, obRatio } = indicators;
    
    let scores = {
        gap: 0,
        volumeSurge: 0,
        vwapDiv: 0,
        tickPower: 0,
        obRatio: 0,
    };

    // 1. 갭상승률
    if (gapRatio >= 2 && gapRatio <= 4) scores.gap = 100;
    else if (gapRatio >= 0 && gapRatio < 2) scores.gap = 50;
    else scores.gap = 0; // 4% 초과 혹은 음수

    // 2. 거래대금 급증률
    if (volumeSurgeRatio >= 300) scores.volumeSurge = 100;
    else if (volumeSurgeRatio >= 200 && volumeSurgeRatio < 300) scores.volumeSurge = 70;
    else scores.volumeSurge = 0;

    // 3. VWAP 이격도
    if (vwapDiv >= 100.1 && vwapDiv <= 101.5) scores.vwapDiv = 100;
    else if (vwapDiv >= 99 && vwapDiv < 100.1) scores.vwapDiv = 50; // Red Team 보완: 100.0 이상 포섭
    else scores.vwapDiv = -100;

    // 4. 체결강도
    if (tickPower >= 120) scores.tickPower = 100;
    else if (tickPower >= 100 && tickPower < 120) scores.tickPower = 60;
    else scores.tickPower = 0;

    // 5. 호가 잔량 비율
    if (obRatio >= 1.5) scores.obRatio = 100;
    else if (obRatio >= 1.0 && obRatio < 1.5) scores.obRatio = 50;
    else scores.obRatio = 0;

    let totalScore = scores.gap + scores.volumeSurge + scores.vwapDiv + scores.tickPower + scores.obRatio;
    
    // Red Team 방어코드: 총점 음수 방지
    totalScore = Math.max(0, totalScore);

    return {
        scores,
        totalScore
    };
}

module.exports = {
    computeIndicators,
    calculateScore
};
