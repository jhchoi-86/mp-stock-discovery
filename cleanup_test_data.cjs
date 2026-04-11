const fs = require('fs');
const path = require('path');

function run() {
    const codesToRemove = ['TEST_ERR', 'TEST_EXM'];
    const signalsPath = path.join(__dirname, 'data', 'signals.json');
    
    if (fs.existsSync(signalsPath)) {
        try {
            const signals = JSON.parse(fs.readFileSync(signalsPath, 'utf8'));
            const originalCount = Object.keys(signals).length;
            
            codesToRemove.forEach(code => {
                if (signals[code]) {
                    delete signals[code];
                }
            });
            
            const newCount = Object.keys(signals).length;
            fs.writeFileSync(signalsPath, JSON.stringify(signals, null, 2));
            console.log(`[Cleanup] signals.json: Removed ${originalCount - newCount} records. Total remaining: ${newCount}`);
            console.log('[Cleanup] SUCCESS.');
        } catch (err) {
            console.error('[Cleanup] JSON Error:', err.message);
        }
    } else {
        console.log('[Cleanup] signals.json not found at:', signalsPath);
    }
}

run();
