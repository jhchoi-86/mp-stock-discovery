const axios = require('axios');
const fs = require('fs');
require('dotenv').config();

const KIS_APP_KEY = process.env.KIS_APP_KEY;
const KIS_APP_SECRET = process.env.KIS_APP_SECRET;
const KIS_API_BASE = 'https://openapi.koreainvestment.com:9443';

async function getAccessToken() {
    try {
        let tokenData = null;
        if (fs.existsSync('data/kis_token.json')) {
            tokenData = JSON.parse(fs.readFileSync('data/kis_token.json', 'utf8'));
            if (tokenData.access_token && Date.now() < tokenData.expires_at) {
                return tokenData.access_token;
            }
        }
        console.log("Fetching new KIS access token...");
        const response = await axios.post(`${KIS_API_BASE}/oauth2/tokenP`, {
            grant_type: 'client_credentials',
            appkey: KIS_APP_KEY,
            appsecret: KIS_APP_SECRET
        });
        const accessToken = response.data.access_token;
        fs.writeFileSync('data/kis_token.json', JSON.stringify({
            access_token: accessToken,
            expires_at: Date.now() + (response.data.expires_in * 1000) - 60000 
        }));
        return accessToken;
    } catch (e) {
        console.error("Token err:", e.message);
        throw e;
    }
}

async function fetchInvestorTrend(stockCode) {
    const token = await getAccessToken();
    try {
        const url = `${KIS_API_BASE}/uapi/domestic-stock/v1/quotations/inquire-investor`;
        const headers = {
            'content-type': 'application/json; charset=utf-8',
            'authorization': `Bearer ${token}`,
            'appkey': KIS_APP_KEY,
            'appsecret': KIS_APP_SECRET,
            'tr_id': 'FHKST01010900'
        };
        const params = {
            'FID_COND_MRKT_DIV_CODE': 'J',
            'FID_INPUT_ISCD': stockCode
        };

        const response = await axios.get(url, { headers, params });
        if (response.data && response.data.output) {
            console.log(`\n=== Investor Trend for [${stockCode}] ===`);
            const latest = response.data.output.slice(0, 3);
            latest.forEach(day => {
                console.log(`Date: ${day.stck_bsop_date}`);
                console.log(`- Prsn (Retail) Net Buy: ${day.prsn_ntby_qty}`);
                console.log(`- Frgn (Foreigner) Net Buy: ${day.frgn_ntby_qty}`);
                console.log(`- Orgn (Institution) Net Buy: ${day.orgn_ntby_qty}`);
                console.log('-------------------------');
            });
        } else {
            console.log('Output format unexpected for', stockCode, response.data);
        }
    } catch (e) {
        console.error("API err:", e.response?.data || e.message);
    }
}

async function test() {
    await fetchInvestorTrend('005930'); // Samsung Electronics
    await fetchInvestorTrend('375500'); // DL이앤씨
}

test();
