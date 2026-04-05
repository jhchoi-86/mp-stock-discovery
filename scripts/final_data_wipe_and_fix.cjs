const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const signalsFile = path.join(dataDir, 'signals.json');
const fullPriceFile = path.join(dataDir, 'live_prices_full.json');
const latestLogFile = path.join(dataDir, 'vip_logs', 'latest.json');

// Saturday 13:00 KST = 1775271600000
const WIPEOUT_THRESHOLD = 1775271600000; 

// 1. Clean signals.json
if (fs.existsSync(signalsFile)) {
    let signals = JSON.parse(fs.readFileSync(signalsFile, 'utf8'));
    console.log(`Original Signals: ${signals.length}`);
    
    // Wipe out Saturday's pollution
    signals = signals.filter(s => s.timestamp < WIPEOUT_THRESHOLD);
    console.log(`After Wipeout: ${signals.length}`);
    
    // Fix Seongkwang in remaining signals
    signals.forEach(s => {
        if (s.code === '014620') {
            s.current_price = 39050;
            if (s.kis_change_data) {
                s.kis_change_data.rate = 7.87;
                s.kis_change_data.change = 3100; // 39050 - 35950 = 3100
                s.kis_change_data.sign = '2';
            }
        }
    });
    fs.writeFileSync(signalsFile, JSON.stringify(signals, null, 2));
    console.log('signals.json updated.');
}

// 2. Clean live_prices_full.json
if (fs.existsSync(fullPriceFile)) {
    const data = JSON.parse(fs.readFileSync(fullPriceFile, 'utf8'));
    if (data['014620']) {
        data['014620'].price = 39050;
        data['014620'].change_rate = 7.87;
        data['014620'].updated_at = 1775205600000; // Friday 20:00 KST approx
        fs.writeFileSync(fullPriceFile, JSON.stringify(data, null, 2));
        console.log('live_prices_full.json updated.');
    }
}

// 3. Clean latest.json
if (fs.existsSync(latestLogFile)) {
    const log = JSON.parse(fs.readFileSync(latestLogFile, 'utf8'));
    if (log.stocks) {
        log.stocks.forEach(s => {
            if (s.code === '014620') {
                s.current_price = 39050;
                s.yield_pct = 7.87; // Or whatever entry vs 39050 is
            }
        });
        fs.writeFileSync(latestLogFile, JSON.stringify(log, null, 2));
        console.log('latest.json updated.');
    }
}
