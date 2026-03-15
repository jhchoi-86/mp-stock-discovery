const fs = require('fs');
const path = require('path');

const signalsFile = path.join(__dirname, 'data', 'signals.json');
if (fs.existsSync(signalsFile)) {
    const signals = JSON.parse(fs.readFileSync(signalsFile, 'utf8'));
    console.log('--- Signals Found ---');
    console.log(JSON.stringify(signals, null, 2));
    console.log('---------------------');
} else {
    console.log('Signals file not found.');
}
