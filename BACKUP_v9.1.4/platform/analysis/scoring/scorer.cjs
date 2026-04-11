// platform/analysis/scoring/scorer.cjs
// UI 표시용 신호 배점 모듈 - Refactored to act as a proxy to the unified ScoringService

const ScoringService = require('../../../src/services/ScoringService.cjs');

function calculateDisplayScore(tfSigs, latest, isTopSector = false) {
  const res = ScoringService.calculateTotalScore(tfSigs, latest, isTopSector);
  return { total: res.totalScore, breakdown: [] };
}

function getGrade(score) {
  return ScoringService.getGrade(score);
}

function generateReasonTag(tfSigs, latest) {
  return ScoringService.generateReasonTag(tfSigs, latest);
}

module.exports = { calculateDisplayScore, getGrade, generateReasonTag };
