const fs = require('fs');
const path = require('path');
const axios = require('axios');

async function run() {
    const codes = [
        { code: "004170", name: "신세계" },
        { code: "060150", name: "인선이엔티" },
        { code: "003670", name: "포스코퓨처엠" },
        { code: "028050", name: "삼성엔지니어링" },
        { code: "003230", name: "삼양식품" },
        { code: "047050", name: "포스코인터내셔널" },
        { code: "161890", name: "한국콜마" },
        { code: "213420", name: "덕산네오룩스" },
        { code: "000250", name: "삼천당제약" },
        { code: "087010", name: "펩트론" }
    ];

    const DATA_DIR = path.join(__dirname, 'data');
    const SIGNALS_FILE = path.join(DATA_DIR, 'signals.json');
    const PAST_REC_FILE = path.join(DATA_DIR, 'past_recommendations.json');

    let signals = [];
    if (fs.existsSync(SIGNALS_FILE)) {
        signals = JSON.parse(fs.readFileSync(SIGNALS_FILE, 'utf8'));
    }

    const records = [];
    
    // Convert current KST date
    const now = new Date();
    now.setUTCHours(now.getUTCHours() + 9);
    const dateStr = `${now.getUTCFullYear()}-${(now.getUTCMonth()+1).toString().padStart(2,'0')}-${now.getUTCDate().toString().padStart(2,'0')}`;

    for (const stock of codes) {
        // Find 2H signal first, then 1D signal for result_2 (1st Entry Point)
        const stockSigs = signals.filter(s => s.code === stock.code);
        let targetSig = stockSigs.find(s => s.timeframe === '2H');
        if (!targetSig) targetSig = stockSigs.find(s => s.timeframe === '1D');
        if (!targetSig) targetSig = stockSigs[0];
        
        // Use result_2 as 1st Entry Point
        let rec_price = targetSig && targetSig.result_2 ? targetSig.result_2 : 0;
        
        // If no signal exists in DB for some reason, we could trigger a fetch, 
        // but for now let's just use what's available
        if (rec_price > 0) {
            records.push({
                code: stock.code,
                name: stock.name,
                category: "야간 추천 1차 타점 대기",
                rec_price: Math.round(rec_price),
                date: dateStr
            });
        } else {
             console.log(`[Warning] No valid result_2 entry point found for ${stock.name} (${stock.code}) in signals.json`);
        }
    }

    fs.writeFileSync(PAST_REC_FILE, JSON.stringify(records, null, 2), 'utf8');
    console.log(`[Success] Overwrote past_recommendations.json with ${records.length} targets.`);
    console.log(records);
}

run();
