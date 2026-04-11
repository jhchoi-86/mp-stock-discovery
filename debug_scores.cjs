const ScoringService = require('./src/services/ScoringService.cjs');
const fs = require('fs');
const path = require('path');

// Simulate the input for SK이노베이션 (096770) based on low score (14)
// We'll try to guess what signals made it 14.
const mockTfSigs = {
    '2H': {
        cond_up7: true,  // +20
        sma5: 120000,
        sma10: 121000,
        sma20: 122000,
        sma60: 123000,
        current_price: 126400
    },
    '1D': { trigger_vol: false }
};

// If score was 14:
// 20 (cond_up7) - 20 (sma5 < sma20 penalty) + 14 (overlap signals or bonus) = 14.

const result = ScoringService.calculateTotalScore(mockTfSigs, { current_price: 126400 });
console.log('--- Scoring Debug (SK Innovation Mock) ---');
console.log(JSON.stringify(result, null, 2));

// Real check: find the actual tfSigs from signals file if possible
const signalsPath = path.join(__dirname, 'data/signals.json');
if (fs.existsSync(signalsPath)) {
    const allSignals = JSON.parse(fs.readFileSync(signalsPath, 'utf8'));
    const skSignals = allSignals['096770'];
    if (skSignals) {
        const realResult = ScoringService.calculateTotalScore(skSignals.timeframes, skSignals.latest);
        console.log('--- Real Scoring (SK Innovation) ---');
        console.log(JSON.stringify(realResult, null, 2));
    }
}
