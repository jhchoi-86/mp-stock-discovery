'use strict';
/**
 * [TASK-008] scoreEngine.cjs — 점수 계산 단일 모듈
 * - useStockManager.js, send_top5_report.cjs, server.cjs 야간 크론에서 공통 사용
 * - 세 곳에 각각 다른 구현이 있던 calculateTotalScore를 단일 표준 버전으로 통합
 */

/**
 * @param {Object} tfSigs - 타임프레임별 신호 객체 { '2H': {...}, '1H': {...}, ... }
 * @param {Object|null} latest - 가장 최신 글로벌 신호 (current_price 등)
 * @returns {{ score: number, bestTf: string }}
 */
function calculateTotalScore(tfSigs, latest) {
    let score = 0;
    const tfs = ['2H', '1D', '1W'];
    
    // 1️⃣ 베스트 타임프레임 코어 점수 (Max 50점) - 관리자/야간 크론 기준
    let coreScore = 0;
    tfs.forEach(tf => {
        let tfScore = 0;
        const s = tfSigs[tf];
        if (s && s.cond_up7) tfScore += 25;
        if (s && (s.signal_HH || s.DHH2)) tfScore += 25;
        if (tfScore > coreScore) coreScore = tfScore;
    });
    score += coreScore;

    // 2️⃣ 장기 수급 폭발 보너스 (거래량) (Max 10점)
    if (tfSigs['1D'] && tfSigs['1D'].trigger_vol) score += 5;
    if (tfSigs['1W'] && tfSigs['1W'].trigger_vol) score += 5;

    // 3️⃣ 스나이퍼 진입 타점 정밀도 (Max 10점)
    let bestDistScore = 0;
    const curPrice = latest?.current_price || latest?.entry_price || 0;
    if (curPrice > 0) {
        tfs.forEach(tf => {
            const s = tfSigs[tf];
            if (s && s.result_2) {
                const diffPct = ((curPrice - s.result_2) / s.result_2) * 100;
                if (diffPct >= 0 && diffPct <= 0.5) bestDistScore = Math.max(bestDistScore, 6);
                else if (diffPct > 0.5 && diffPct <= 1.0) bestDistScore = Math.max(bestDistScore, 4);
            }
        });
    }
    score += bestDistScore;

    // 4️⃣ 다중 시간대(MTF) 프랙탈 매수 보너스 (Max 40점)
    tfs.forEach(tf => {
        const s = tfSigs[tf];
        if (s) {
            if (s.signal_HH || s.DHH2) score += 5;
            if (s.signal_H) score += 2;
            if (s.signal_HHH || s.is_strong_signal) score += 5;
        }
    });

    // 5️⃣ KIS 보너스 점수 반영 (수급 등)
    const bonus = latest?.kis_change_data?.bonus_score || 0;
    score += bonus;

    // 하락 페널티 보강: 2H 5MA 하락 추세 시 감점 (Optional, 기존 scoreEngine 유지분)
    const sig2H = tfSigs['2H'];
    if (sig2H && sig2H.sma5 < sig2H.sma20) score -= 15;

    return { score: Math.min(100, Math.max(0, score)), bestTf: '2H' };
}

module.exports = { calculateTotalScore };
