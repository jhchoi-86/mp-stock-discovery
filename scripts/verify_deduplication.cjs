const fs = require('fs');
const path = require('path');

const landingFile = path.join(__dirname, '..', 'data', 'landing_strategy.json');

function verifyDeduplication() {
    console.log('[Verify] Checking for duplicates in landing_strategy.json...');
    if (!fs.existsSync(landingFile)) {
        console.error('[Error] landing_strategy.json not found!');
        return;
    }

    const data = JSON.parse(fs.readFileSync(landingFile, 'utf8'));
    const stocks = data.stocks || [];
    const seen = new Set();
    const duplicates = [];

    stocks.forEach(s => {
        if (seen.has(s.code)) {
            duplicates.push(s.code);
        }
        seen.add(s.code);
    });

    if (duplicates.length > 0) {
        console.error(`[FAIL] Duplicates found: ${duplicates.join(', ')}`);
        process.exit(1);
    } else {
        console.log(`[PASS] No duplicates found among ${stocks.length} stocks.`);
    }
}

verifyDeduplication();
