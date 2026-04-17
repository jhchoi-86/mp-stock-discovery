const fs = require('fs');
const path = require('path');

const LANDING_FILE = path.join(process.cwd(), 'data', 'landing_strategy.json');

function verifyLandingData() {
    if (!fs.existsSync(LANDING_FILE)) {
        console.error('❌ landing_strategy.json not found');
        return;
    }

    try {
        const data = JSON.parse(fs.readFileSync(LANDING_FILE, 'utf8'));
        console.log('✅ landing_strategy.json loaded successfully');
        console.log('Update Time:', data.updatedAt);
        
        if (!data.stocks || data.stocks.length === 0) {
            console.warn('⚠️ No stocks found in landing data');
            return;
        }

        data.stocks.forEach((s, idx) => {
            console.log(`[Stock ${idx + 1}] ${s.name} (${s.code})`);
            
            const requiredFields = ['entryPrice1', 'entryPrice2', 'targetPrice1', 'stopLoss'];
            requiredFields.forEach(field => {
                if (s[field] === undefined) {
                    console.error(`  ❌ Missing field: ${field}`);
                } else {
                    console.log(`  ✅ ${field}: ${s[field]}`);
                }
            });
            
            // Backward compatibility check
            if (s.entryPrice === undefined) console.warn('  ⚠️ Missing backward compat field: entryPrice');
            if (s.targetPrice === undefined) console.warn('  ⚠️ Missing backward compat field: targetPrice');
        });

    } catch (e) {
        console.error('❌ Error parsing landing data:', e.message);
    }
}

verifyLandingData();
