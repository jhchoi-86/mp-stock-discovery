const fs = require('fs');
const path = require('path');
const signalsFile = path.join(__dirname, '..', 'data', 'signals.json');

try {
    const signals = JSON.parse(fs.readFileSync(signalsFile, 'utf8'));
    const sk = signals.filter(s => s.code === '005930');
    console.log('Samsung Signals Count:', sk.length);
    if (sk.length > 0) {
        const latest = sk[sk.length - 1];
        console.log('LATEST SIGNAL FOR 005930 (Samsung):');
        console.log(JSON.stringify(latest, null, 2));
    }
} catch (e) {
    console.error(e);
}
