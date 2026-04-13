const fs = require('fs');
const path = require('path');

// Simulate the logic in server.cjs
const SIGNALS_FILE = path.join(__dirname, 'data', 'signals.json');

function scoreSignal(signal, bonus) {
    // Mock scoring for test
    return (signal.score || 50) + (bonus || 0);
}

async function testSummary() {
    try {
        const rawData = fs.readFileSync(SIGNALS_FILE, 'utf8');
        const rawSigs = JSON.parse(rawData);
        
        console.log('Total raw signals:', rawSigs.length);

        const allSignals = rawSigs.map(s => ({
            ...s,
            score: s.score || scoreSignal(s, s.kis_change_data?.bonus_score || 0)
        }));

        const groupMap = new Map();

        for (const signal of allSignals) {
            const code = signal.code;
            if (!code) continue;

            if (!groupMap.has(code)) {
                groupMap.set(code, {
                    code,
                    latestSignal: null,
                    timeframeStatus: {}
                });
            }

            const group = groupMap.get(code);

            const existing = group.timeframeStatus[signal.timeframe];
            if (!existing || signal.timestamp > existing.timestamp) {
                group.timeframeStatus[signal.timeframe] = signal;
            }

            if (!group.latestSignal || signal.timestamp > group.latestSignal.timestamp) {
                group.latestSignal = signal;
            }
        }

        const result = Array.from(groupMap.values());
        console.log('Grouped stock count:', result.length);
        
        if (result.length > 0) {
            const first = result[0];
            console.log('Sample item:', {
                code: first.code,
                hasLatest: !!first.latestSignal,
                tfCount: Object.keys(first.timeframeStatus).length
            });
            
            if (first.code && first.latestSignal && Object.keys(first.timeframeStatus).length > 0) {
                console.log('✅ Signal Summary Logic PASS');
            } else {
                console.log('❌ Signal Summary Logic FAIL: Missing expected fields');
                process.exit(1);
            }
        } else {
            console.log('⚠️ Empty signals.json?');
        }
    } catch (e) {
        console.error('Test error:', e.message);
        process.exit(1);
    }
}

testSummary();
