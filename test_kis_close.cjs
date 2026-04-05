require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const KIS_APP_KEY = (process.env.KIS_APP_KEY || '').trim();
const KIS_APP_SECRET = (process.env.KIS_APP_SECRET || '').trim();
const DATA_DIR = path.join(__dirname, 'data');
const KIS_TOKEN_FILE = path.join(DATA_DIR, 'kis_token.json');

async function getKisAccessToken() {
    if (fs.existsSync(KIS_TOKEN_FILE)) {
        const saved = JSON.parse(fs.readFileSync(KIS_TOKEN_FILE, 'utf8'));
        if (saved.expiry > Date.now() + 3600000) return saved.token;
    }
    const response = await axios.post('https://openapivts.koreainvestment.com:29443/oauth2/tokenP', {
        grant_type: 'client_credentials', appkey: KIS_APP_KEY, appsecret: KIS_APP_SECRET
    });
    return response.data.access_token;
}

async function testSeongkwangClose() {
    const token = await getKisAccessToken();
    const url = 'https://openapivts.koreainvestment.com:29443/uapi/domestic-stock/v1/quotations/inquire-daily-price';
    const res = await axios.get(url, {
        headers: {
            'authorization': 'Bearer ' + token,
            'appkey': KIS_APP_KEY,
            'appsecret': KIS_APP_SECRET,
            'tr_id': 'FHKST01010400'
        },
        params: {
            "FID_COND_MRKT_DIV_CODE": "J",
            "FID_INPUT_ISCD": "014620", // 성광벤드
            "FID_PERIOD_DIV_CODE": "D",
            "FID_ORG_ADJ_PRC": "0"
        }
    });

    const latest = res.data.output[0];
    console.log('--- Seongkwang Bend (014620) Daily Price ---');
    console.log('Date:', latest.stck_bsop_date);
    console.log('Close:', latest.stck_clpr);
    console.log('High:', latest.stck_hgpr);
    console.log('Low:', latest.stck_lwpr);
    console.log('Open:', latest.stck_oprc);
    console.log('------------------------------------------');
}

testSeongkwangClose().catch(console.error);
