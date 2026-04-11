'use strict';
/**
 * [TASK] scoreEngine.cjs — 점수 계산 프록시 모듈
 * 기존의 로직을 src/services/ScoringService.cjs 하나로 완벽히 통합했습니다.
 */

const ScoringService = require('../services/ScoringService.cjs');

function calculateTotalScore(tfSigs, latest) {
    // 백엔드의 경우 top sector 조회를 생략하거나 기본값을 씁니다
    const res = ScoringService.calculateTotalScore(tfSigs, latest, false);
    return { score: res.totalScore, bestTf: res.bestTf };
}

module.exports = { calculateTotalScore };
