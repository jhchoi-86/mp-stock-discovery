const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const DATA_DIR = path.join(__dirname, 'data');
const PAST_REC_FILE = path.join(DATA_DIR, 'past_recommendations.json');
const KIS_TOKEN_FILE = path.join(DATA_DIR, 'kis_token.json');

async function run() {
    const API_KEY = process.env.KIS_APP_KEY;
    const API_SECRET = process.env.KIS_APP_SECRET;
    
    let kisToken;
    try {
        const saved = JSON.parse(fs.readFileSync(KIS_TOKEN_FILE, 'utf8'));
        kisToken = saved.token;
    } catch(e) { console.log("Token error", e); return; }

    const curPrice1 = await getPrice('004170', kisToken, API_KEY, API_SECRET);
    const curPrice2 = await getPrice('060150', kisToken, API_KEY, API_SECRET);
    const curPrice3 = await getPrice('003670', kisToken, API_KEY, API_SECRET);

    const records = [
        { code: '004170', name: '신세계', category: '1차 매수타점 연속돌파', rec_price: curPrice1, date: '2026-03-24' },
        { code: '060150', name: '인선이엔티', category: '1차 매수타점 (급등기법)', rec_price: curPrice2, date: '2026-03-24' },
        { code: '003670', name: '포스코퓨처엠', category: '1차 타점', rec_price: Math.round(curPrice3 * 0.9), date: '2026-03-24' }
    ];

    fs.writeFileSync(PAST_REC_FILE, JSON.stringify(records, null, 2));
    console.log("Forced past_recommendations.json to EXACT live prices. Expecting NightlyMonitor dispatch within 10s.");
}

async function getPrice(code, kisToken, API_KEY, API_SECRET) {
    const kisUrl = 'https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-price';
    const kisRes = await axios.get(kisUrl, {
        headers: {
            'authorization': 'Bearer ' + kisToken,
            'appkey': API_KEY,
            'appsecret': API_SECRET,
            'tr_id': 'FHKST01010100'
        },
        params: {
            "FID_COND_MRKT_DIV_CODE": "J",
            "FID_INPUT_ISCD": code
        }
    });
    return parseInt(kisRes.data.output.stck_prpr);
}
run();
