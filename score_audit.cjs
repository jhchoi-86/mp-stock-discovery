const fs = require('fs');
const signals = JSON.parse(fs.readFileSync('c:/Users/danbe/Documents/Antigravity/주식종목발굴/data/signals.json', 'utf8'));
const code = '086450';

const stockSignals = signals.filter(s => s.code === code);
const tfSigs = {};
["30M", "1H", "2H", "4H", "1D", "2D", "1W"].forEach(tf => {
    tfSigs[tf] = stockSignals.filter(s => s.timeframe === tf).sort((a,b) => b.timestamp - a.timestamp)[0];
});

const calculateTotalScore = (tfSigs) => {
    let score = 0;
    const sig2H = tfSigs['2H'];
    const price = sig2H ? sig2H.current_price : 0;
    
    console.log(`--- Audit for ${code} ---`);
    
    // 1. 추세 필터(2H): cond_up7 -> 20점
    if (sig2H && sig2H.cond_up7) {
        score += 20;
        console.log(`[Rule 1] 2H Trend (cond_up7): +20`);
    }
    
    // 2. 눌림목 감지(2H): DHH2 -> 20점
    if (sig2H && sig2H.DHH2) {
        score += 20;
        console.log(`[Rule 2] 2H Pullback (DHH2): +20`);
    }
    
    // 3. 이평선 정배열(2H): 5 > 10 > 20 > 60 -> 10점
    const isAligned = sig2H && (sig2H.sma5 > sig2H.sma10 && sig2H.sma10 > sig2H.sma20 && sig2H.sma20 > sig2H.sma60);
    if (isAligned) {
        score += 10;
        console.log(`[Rule 3] 2H Aligned (5>10>20>60): +10`);
    }
    
    // 4. 이격도 A(2H): 정배열 & 10일선 < 현재가 < 5일선 -> 5점
    if (isAligned && price < sig2H.sma5 && price > sig2H.sma10) {
        score += 5;
        console.log(`[Rule 4] Gap A: +5`);
    }
    
    // 5. 이격도 B(2H): 정배열 & 20일선 < 현재가 < 10일선 -> 3점
    if (isAligned && price < sig2H.sma10 && price > sig2H.sma20) {
        score += 3;
        console.log(`[Rule 5] Gap B: +3`);
    }
    
    // 6-9. 신호 중첩 보너스 (각 시간대별)
    const tfs = ["30M", "1H", "2H", "4H", "1D", "2D", "1W"];
    tfs.forEach(tf => {
      const s = tfSigs[tf];
      if (s) {
        if (s.signal_HH) {
            score += 1;
            console.log(`[Rule 6] ${tf} HH: +1`);
        }
        if (s.cond_up7) {
            score += 1;
            console.log(`[Rule 7] ${tf} Trend: +1`);
        }
        if (s.cond_strong_trend) {
            score += 2;
            console.log(`[Rule 8] ${tf} Strong Trend Bonus: +2`);
        }
        if (s.is_strong_signal && s.signal_HH) {
            score += 2;
            console.log(`[Rule 9] ${tf} Absolute Bonus: +2`);
        }
      }
    });
    
    // 10. 거래량 급증(1D): 1.5배 초과 -> 3점
    if (tfSigs['1D'] && tfSigs['1D'].trigger_vol) {
        score += 3;
        console.log(`[Rule 10] 1D Volume Spike: +3`);
    }
    
    // 11. 역배열 조건: 5일선 < 20일선(2H) -> -20점
    if (sig2H && sig2H.sma5 < sig2H.sma20) {
        score -= 20;
        console.log(`[Rule 11] Inverse Alignment: -20`);
    }

    console.log(`TOTAL SCORE: ${score}`);
    return score;
};

calculateTotalScore(tfSigs);
