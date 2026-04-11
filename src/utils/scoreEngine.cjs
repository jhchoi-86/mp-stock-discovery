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

function getGrade(score) {
    if (score >= 95) return '5'; 
    if (score >= 80) return '5';
    if (score >= 60) return '4';
    return '3';
}

function getCategory(score) {
    return score >= 80 ? '추천종목' : '스나이퍼 포착';
}

function getStars(score) {
    if (score >= 95) return 5;
    if (score >= 90) return 4;
    return 3;
}

function calculateBonusScore(f, i, p) {
    return ScoringService.calculateBonusScore(f, i, p);
}

module.exports = { calculateTotalScore, getGrade, getCategory, getStars, calculateBonusScore };
