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

async function testInvestor(code, div = 'J') {
    const token = await getToken();
    console.log(`[TEST] Code: ${code}, Div: ${div}`);
    try {
        const res = await axios.get(`https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-investor`, {
            headers: {
                'authorization': `Bearer ${token}`,
                'appkey': KIS_APP_KEY,
                'appsecret': KIS_APP_SECRET,
                'tr_id': 'FHKST01010900'
            },
            params: {
                "FID_COND_MRKT_DIV_CODE": div,
                "FID_INPUT_ISCD": code
            }
        });
        console.log(`[TEST-SUCCESS] ${code} (${div}):`, JSON.stringify(res.data.output, null, 2));
    } catch (err) {
        console.error(`[TEST-FAILED] ${code} (${div}):`, err.response ? err.response.status : err.message);
        if (err.response) console.log(err.response.data);
    }
}

async function runAll() {
    // 093370: KOSPI
    // 066970: KOSDAQ
    await testInvestor('093370', 'J'); // Try J
    await new Promise(r => setTimeout(r, 1000));
    await testInvestor('066970', 'J'); // Try J
}

runAll().catch(console.error);
