const fs = require('fs');
const data = JSON.parse(fs.readFileSync('./data/live_signals.json', 'utf8'));
const timeframes = ["5M", "15M", "30M", "1H", "2H", "4H", "1D", "1W"];

// get unique codes
const codes = [...new Set(data.map(s => s.code))];
const results = [];

for (const code of codes) {
  const stockSignals = data.filter(s => s.code === code);
  const tfSigs = {};
  timeframes.forEach(tf => {
    const latest = stockSignals.filter(s => s.timeframe === tf).sort((a, b) => b.timestamp - a.timestamp)[0];
    if (latest) tfSigs[tf] = latest;
  });

  const latest = stockSignals.sort((a, b) => b.timestamp - a.timestamp)[0];

  let score = 0;
  let points = {};

  if (tfSigs['2H'] && tfSigs['2H'].cond_up7) { score += 25; points['2H_MACD'] = 25; }
  if (tfSigs['2H'] && (tfSigs['2H'].signal_HH || tfSigs['2H'].DHH2)) { score += 25; points['2H_SIGNAL'] = 25; }
  if (tfSigs['1D'] && tfSigs['1D'].trigger_vol) { score += 5; points['1D_VOL'] = 5; }
  if (tfSigs['1W'] && tfSigs['1W'].trigger_vol) { score += 5; points['1W_VOL'] = 5; }

  const current_price = latest ? latest.current_price : 0;
  const result_2 = tfSigs['2H'] ? tfSigs['2H'].result_2 : 0;
  if (current_price > 0 && result_2 > 0 && current_price >= result_2) {
    const diffPercent = ((current_price - result_2) / result_2) * 100;
    if (diffPercent <= 0.5) { score += 10; points['GAP_0.5'] = 10; }
    else if (diffPercent <= 1.0) { score += 5; points['GAP_1.0'] = 5; }
    points['diffPercent'] = diffPercent;
  }

  ['15M', '30M', '1H', '2H', '4H'].forEach(tf => {
    if (tfSigs[tf] && (tfSigs[tf].signal_HH || tfSigs[tf].DHH2)) { score += 2; points[`${tf}_SIG`] = 2; }
  });

  ['1D', '1W'].forEach(tf => {
    if (tfSigs[tf] && (tfSigs[tf].signal_HH || tfSigs[tf].DHH2)) { score += 10; points[`${tf}_SIG`] = 10; }
  });
  
  const finalScore = Math.min(score, 100);
  if (finalScore > 0) {
    results.push({ code, name: latest.name, score: finalScore, points });
  }
}

results.sort((a, b) => b.score - a.score);
console.log(JSON.stringify(results.slice(0, 10), null, 2));
