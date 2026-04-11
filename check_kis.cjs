require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const KIS_APP_KEY = process.env.KIS_APP_KEY;
const KIS_APP_SECRET = process.env.KIS_APP_SECRET;
const TOKEN_FILE = path.join(__dirname, 'data/kis_token.json');

async function getToken() {
    if (fs.existsSync(TOKEN_FILE)) {
        const saved = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
        if (saved.expiry > Date.now() + 3600000) return saved.token;
    }
    const res = await axios.post('https://openapi.koreainvestment.com:9443/oauth2/tokenP', {
        grant_type: 'client_credentials', appkey: KIS_APP_KEY, appsecret: KIS_APP_SECRET
    });
    const token = res.data.access_token;
    const expiry = Date.now() + (res.data.expires_in * 1000);
    fs.writeFileSync(TOKEN_FILE, JSON.stringify({ token, expiry }));
    return token;
}

async function checkPrice(code) {
    const token = await getToken();
    const res = await axios.get(`https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-price?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=${code}`, {
        headers: {
            'content-type': 'application/json',
            'authorization': `Bearer ${token}`,
            'appkey': KIS_APP_KEY,
            'appsecret': KIS_APP_SECRET,
            'tr_id': 'FHKST01010100'
        }
    });
    console.log(`[KIS-TEST] ${code}:`, JSON.stringify(res.data.output, null, 2));
}

checkPrice('093370').catch(console.error);
