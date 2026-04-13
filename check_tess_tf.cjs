const fs = require('fs');
const path = require('path');

const SIGNALS_FILE = path.join(__dirname, 'data', 'signals.json');

if (fs.existsSync(SIGNALS_FILE)) {
    const signals = JSON.parse(fs.readFileSync(SIGNALS_FILE, 'utf8'));
    const tess = signals.filter(s => s.code === '095610');
    tess.forEach(s => {
        console.log(`${s.timeframe}: Price=${s.current_price}, Target=${s.result_1 || s.targetPrice1}`);
    });
} else {
    console.log('Signals file not found');
}
