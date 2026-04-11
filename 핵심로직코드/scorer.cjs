// platform/analysis/scoring/scorer.cjs
// UI 표시용 신호 배점 모듈

function calculateDisplayScore(tfSigs, latest, isTopSector = false) {
  let score = 50; // 기본 점수 (프론트엔드와 동일)
  const sig2H = tfSigs['2H'] || latest;
  const currentPrice = sig2H?.close || 0;

  // 1. 추세 강도 (BB-MACD)
  if (sig2H?.cond_up7) score += 15;
  
  // 2. 핵심 지지/저항 돌파 (DHH2)
  if (sig2H?.DHH2) score += 20;

  // 3. 거래량 보너스
  if (sig2H?.trigger_vol) score += 10;

  // 4. RSI 과매도 탈출 보너스
  if (sig2H?.trigger_rsi) score += 10;

  // 5. 업종 프리미엄
  if (isTopSector) score += 5;

  // 6. 이평선 배열 (정배열 우대)
  if (sig2H?.sma5 > sig2H?.sma20) score += 5;

  // 7-10. 신호 중첩 보너스 (전 시간대)
  const tfs = ["30M", "1H", "2H", "4H", "1D", "2D", "1W"];
  tfs.forEach(tf => {
    const s = tfSigs[tf];
    if (s) {
      if (s.signal_HH) score += 1;
      if (s.cond_up7) score += 1;
      if (s.signal_H) score += 2;
      if (s.signal_HHH || s.is_strong_signal) score += 5;
    }
  });

  // 11. 거래량 급증 (1D)
  if (tfSigs['1D']?.trigger_vol) score += 5;

  // 12. 역배열 감점
  if (sig2H?.sma5 < sig2H?.sma20) score -= 20;

  const finalScore = Math.max(0, Math.min(100, score));
  return { total: finalScore, breakdown: [] };
}

function getGrade(score) {
  if (score >= 90) return 'S';
  if (score >= 75) return 'A';
  if (score >= 60) return 'B';
  return null;
}

module.exports = { calculateDisplayScore, getGrade };
