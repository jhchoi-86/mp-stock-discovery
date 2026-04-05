const fs = require('fs');
const path = require('path');

// [TASK-007] 날짜 가드: 이 스크립트는 특정일 종가 하드코딩 데이터임. 날짜 불일치 시 실행 거부.
const APPLIED_DATE = '2026-04-03'; // 이 스크립트가 적용되어야 하는 날짜
const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];
if (today !== APPLIED_DATE) {
    console.error(`[ManualFix] ⚠️ DANGER: This script was written for ${APPLIED_DATE}.`);
    console.error(`[ManualFix] Today is ${today}. Running this will apply STALE prices.`);
    console.error(`[ManualFix] Update APPLIED_DATE and prices before running again.`);
    process.exit(1);
}

const DATA_DIR = path.join(__dirname, '..', 'data');
const FULL_PRICE_FILE = path.join(DATA_DIR, 'live_prices_full.json');
const SIGNALS_FILE = path.join(DATA_DIR, 'signals.json');

function fix() {
    if (!fs.existsSync(FULL_PRICE_FILE)) return;
    
    let s = JSON.parse(fs.readFileSync(FULL_PRICE_FILE, 'utf8'));
    
    // Samsung Electro-Mechanics (009150) - Real 4/3 Close: 149,100
    s['009150'] = { 
        ...s['009150'], 
        price: 149100, 
        change_rate: 0.40, 
        high: 149500, 
        low: 147800, 
        open: 148500,
        updated_at: Date.now()
    };
    
    // SK Telecom (017670) - Real 4/3 Close: 54,100
    s['017670'] = { 
        ...s['017670'], 
        price: 54100, 
        change_rate: 0.19, 
        high: 54500, 
        low: 53800, 
        open: 54000,
        updated_at: Date.now()
    };
    
    fs.writeFileSync(FULL_PRICE_FILE, JSON.stringify(s, null, 2));
    
    // Also update signals if they exist
    if (fs.existsSync(SIGNALS_FILE)) {
        let sigs = JSON.parse(fs.readFileSync(SIGNALS_FILE, 'utf8'));
        sigs.forEach(sig => {
            if (sig.code === '009150') sig.current_price = 149100;
            if (sig.code === '017670') sig.current_price = 54100;
        });
        fs.writeFileSync(SIGNALS_FILE, JSON.stringify(sigs, null, 2));
    }
    
    console.log('[ManualFix] Applied fix for 009150 and 017670.');
}

fix();
