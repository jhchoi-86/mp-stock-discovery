// platform/analysis/scoring/scorer.cjs
// UI 표시용 신호 배점 모듈

function calculateDisplayScore(signal) {
  const items = [
    { score: 25, pass: signal.DHH2 && signal.cond_up7,    label: '눌림목+추세 동시(핵심)' },
    { score: 20, pass: signal.cond_up7,                    label: '추세강도(BB-MACD)' },
    { score: 20, pass: signal.DHH2,                        label: '지지/저항 돌파' },
    { score: 15, pass: signal.trigger_vol,                 label: '거래량 급증(1.5x)' },
    { score: 10, pass: signal.trigger_rsi,                 label: 'RSI 반등훅(<40)' },
    { score:  5, pass: signal.isTrending,                  label: 'ADX 추세(≥25)' },
    { score:  5, pass: signal.entry_approved,              label: '불리시+거래량+RSI' },
  ];
  
  const raw = items.reduce((acc, i) => acc + (i.pass ? i.score : 0), 0);
  return { total: Math.min(raw, 100), breakdown: items };
}

function getGrade(score) {
  if (score >= 90) return 'S';
  if (score >= 75) return 'A';
  if (score >= 60) return 'B';
  return null;
}

module.exports = { calculateDisplayScore, getGrade };
