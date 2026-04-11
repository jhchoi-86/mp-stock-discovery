'use strict';

/**
 * [TASK] Scoring Service - Single Source of Truth
 * Unifies the fragmented scoring algorithms previously found in:
 * - src/hooks/useStockManager.js (Frontend)
 * - src/utils/scoreEngine.cjs (Backend Cron)
 * - platform/analysis/scoring/scorer.cjs (Legacy UI)
 */

class ScoringService {
    /**
     * Calculate unified total score based on the v3.4.0 Hybrid (Day + Swing) Rules + KIS Bonus
     * @param {Object} tfSigs - Object containing signal details keyed by timeframe (e.g., '2H', '1D')
     * @param {Object} latest - The latest overall signal/ticker data
     * @param {Boolean} isTopSector - True if the stock belongs to one of the top performing sectors
     * @returns {{ totalScore: number, bestTf: string, grade: string }}
     */
    static calculateTotalScore(tfSigs, latest, isTopSector = false) {
        if (!tfSigs) tfSigs = {};
        
        let score = 0;
        const sig2H = tfSigs['2H'];
        const sig1H = tfSigs['1H'];
        const sig30M = tfSigs['30M'];
        const price = sig2H?.current_price || latest?.current_price || 0;

        // 1. 추세 필터(2H): cond_up7 -> 20점
        if (sig2H && sig2H.cond_up7) score += 20;

        // 2. 눌림목 감지(2H): DHH2 -> 20점
        if (sig2H && sig2H.DHH2) score += 20;

        // 3. 이평선 정배열(2H): 5 > 10 > 20 > 60 -> 10점
        const isAligned = sig2H && (sig2H.sma5 > sig2H.sma10 && sig2H.sma10 > sig2H.sma20 && sig2H.sma20 > sig2H.sma60);
        if (isAligned) score += 10;

        // 4. 하이브리드 합의점 보너스: 2H 추세(O) & (1H or 30M 매수신호(O)) -> 15점
        const hasLowTfMomentum = (sig1H && sig1H.signal_HH) || (sig30M && sig30M.signal_HH);
        if (sig2H && sig2H.cond_up7 && hasLowTfMomentum) score += 15;

        // 5. 이격도 A(2H): 정배열 & 10일선 < 현재가 < 5일선 -> 5점
        if (isAligned && price > 0 && price < sig2H.sma5 && price > sig2H.sma10) score += 5;

        // 6. 이격도 B(2H): 정배열 & 20일선 < 현재가 < 10일선 -> 3점
        if (isAligned && price > 0 && price < sig2H.sma10 && price > sig2H.sma20) score += 3;

        // 7-10. 신호 중첩 보너스 (각 시간대별)
        const tfs = ["30M", "1H", "2H", "4H", "1D", "2D", "1W"];
        tfs.forEach(tf => {
            const s = tfSigs[tf];
            if (s) {
                if (s.signal_HH) score += 1;   // 매수신호(HH)
                if (s.cond_up7) score += 1;    // 추세신호(cond_up7)
                if (s.signal_H) score += 2;    // 강력신호(signal_H)
                if (s.signal_HHH || s.is_strong_signal) score += 5;  // 절대신호
            }
        });

        // 11. 거래량 급증(1D): 1.5배 초과 -> 5점
        if (tfSigs['1D'] && tfSigs['1D'].trigger_vol) score += 5;

        // 12. 역배열 감점 (2H): 5일선 < 20일선 -> -20점
        if (sig2H && sig2H.sma5 < sig2H.sma20) score -= 20;

        // 13. [Backend Addition] 업종 프리미엄
        if (isTopSector) score += 5;

        // 14. [Backend Addition] KIS/Broker 보너스 수급 점수
        const kisBonus = latest?.bonus_score || latest?.kis_change_data?.bonus_score || 0;
        score += kisBonus;

        const finalScore = Math.max(0, Math.min(100, score));
        return { 
            totalScore: finalScore, 
            bestTf: '2H',
            grade: this.getGrade(finalScore),
            starGrade: this.getStarGrade(finalScore)
        };
    }

    /**
     * Generate human-readable trading strategies for Day and Swing traders
     * 4-Phase System: [적극 매수 / 분할 매수 / 분할 익절 / 관망]
     */
    static generateTradingStrategy(score, sig2H, sig1D) {
        let strategy_day = "관망 (신호 대기)";
        let strategy_swing = "관망 (추세 확인)";

        const price = sig2H?.current_price || 0;
        const ema5 = sig2H?.ema5 || 0;
        const isOverextended = price > ema5 * 1.05; // 5% above 2H EMA5 (Overbought zone)
        const isTrendingUp = sig2H?.cond_up7 || false;

        // [Phase 1] 적극 매수 (Strong Momentum & High Score)
        if (score >= 80) {
            strategy_day = "적극 매수 (돌파 대응) - 시초가 갭상승 시 5분봉 5선 지지 확인 후 진입";
            strategy_swing = "적극 매수 (추세 시작) - 시초가 대비 +2% 이내 분할 매수 권장";
        } 
        // [Phase 2] 분할 매수 (Healthy Trend or Pullback)
        else if (score >= 50 || (isTrendingUp && !isOverextended)) {
            strategy_day = "분할 매수 (눌림목 진입) - 30M 지지선 확인";
            strategy_swing = "분할 매수 (추세 추종) - 전고점 돌파 기대";
        } 
        // [Phase 3] 분할 익절 (High Price but Weakening Score/Overbought)
        else if (isOverextended || (score < 40 && price > sig2H?.sma20)) {
            strategy_day = "분할 익절 (과열 주의) - 단기 오버슈팅 구간";
            strategy_swing = "분할 익절 (익절 준비) - 추세 이탈 시 전량 매도";
        } 
        // [Phase 4] 관망 (Weak Trend & Low Score)
        else {
            strategy_day = "관망 (신호 미발생) - 바닥 확인 필요";
            strategy_swing = "관망 (리스크 관리) - 60일선 지지 확인";
        }

        return { strategy_day, strategy_swing };
    }

    /**
     * Get Alphabet grade based on total score
     */
    static getGrade(score) {
        if (score >= 90) return 'S';
        if (score >= 80) return 'A';
        if (score >= 60) return 'B';
        if (score >= 40) return 'C';
        return 'D';
    }

    /**
     * [Phase 5] Get 1-5 Numeric Star Grade for SSOT Alignment
     * @param {number} score 0-100
     * @returns {number} 1-5
     */
    static getStarGrade(score) {
        if (score >= 90) return 5;
        if (score >= 80) return 4;
        if (score >= 60) return 3;
        if (score >= 40) return 2;
        return 1;
    }

    /**
     * [v3.5.0] [TASK-A12] Centralized KIS Bonus Score logic
     * @param {number|string} foreignBuy 
     * @param {number|string} instBuy 
     * @param {number|string} personBuy 
     * @returns {number} bonus points
     */
    static calculateBonusScore(foreignBuy, instBuy, personBuy = 0) {
        const frgn = parseInt(foreignBuy) || 0;
        const orgn = parseInt(instBuy) || 0;
        const prsn = parseInt(personBuy) || 0;

        let score = 0;
        if (frgn > 0) score += 3;
        if (orgn > 0) score += 3;
        
        // Ssang-kkul-i (Twin-buy) & Retail sell premium
        if (frgn > 0 && orgn > 0 && prsn < 0) {
            score += 5; // Total 11
        }
        
        // Reverse Ssang-kkul-i penalty
        if (frgn < 0 && orgn < 0 && prsn > 0) {
            score -= 3;
        }

        return score;
    }

    /**
     * [v8.8.24] Generate Concise Selection Reason
     */
    static generateReasonTag(tfSigs, latest) {
        if (!tfSigs) tfSigs = {};
        const sig2H = tfSigs['2H'];
        const sig1D = tfSigs['1D'];
        let reasons = [];

        if (sig2H?.cond_up7) reasons.push("20일선 상방 추세");
        if (sig2H?.DHH2) reasons.push("눌림목 지지 확보");
        if (sig1D?.trigger_vol) reasons.push("거래량 급증 포착");
        
        const fBuy = latest?.foreignBuy || latest?.kis_change_data?.foreign_buy;
        const iBuy = latest?.instBuy || latest?.kis_change_data?.inst_buy;
        
        const hasF = fBuy && !String(fBuy).includes('-') && parseInt(fBuy) > 0;
        const hasI = iBuy && !String(iBuy).includes('-') && parseInt(iBuy) > 0;

        if (hasF && hasI) reasons.push("외인/기관 양매수");
        else if (hasF) reasons.push("외국인 수급 유입");
        else if (hasI) reasons.push("기관 수급 유입");

        if (reasons.length === 0) return "기술적 정배열 초입";
        return reasons.slice(0, 2).join(" / ");
    }
}

module.exports = ScoringService;
