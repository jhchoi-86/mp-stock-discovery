const fs = require('fs');
const path = require('path');
const dataDir = path.join(__dirname, '..', 'data');
const fullPriceFile = path.join(dataDir, 'live_prices_full.json');
const signalsFile = path.join(dataDir, 'signals.json');

// 1. Update live_prices_full.json
if (fs.existsSync(fullPriceFile)) {
    const data = JSON.parse(fs.readFileSync(fullPriceFile, 'utf8'));
    if (data['014620']) {
        data['014620'].price = 39050;
        data['014620'].change_rate = 7.87;
        fs.writeFileSync(fullPriceFile, JSON.stringify(data, null, 2));
        console.log('[Fix] live_prices_full.json: Seongkwang fixed to 39050');
    }
}

// 2. Update signals.json
if (fs.existsSync(signalsFile)) {
    const signals = JSON.parse(fs.readFileSync(signalsFile, 'utf8'));
    let count = 0;
    signals.forEach(s => {
        if (s.code === '014620') {
            s.current_price = 39050;
            count++;
        }
    });
    fs.writeFileSync(signalsFile, JSON.stringify(signals, null, 2));
    console.log(`[Fix] signals.json: Seongkwang fixed in ${count} entries`);
}
