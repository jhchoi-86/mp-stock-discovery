const fs = require('fs');
const path = require('path');

const SIGNALS_FILE = path.join(__dirname, 'data', 'signals.json');

if (fs.existsSync(SIGNALS_FILE)) {
    const signals = JSON.parse(fs.readFileSync(SIGNALS_FILE, 'utf8'));
    const tessSignals = signals.filter(s => s.code === '095610');
    console.log(JSON.stringify(tessSignals, null, 2));
} else {
    console.log('Signals file not found');
}
