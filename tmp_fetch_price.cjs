const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const KIS_APP_KEY = process.env.KIS_APP_KEY;
const KIS_APP_SECRET = process.env.KIS_APP_SECRET;

async function run() {
    try {
        const authRes = await axios.post('https://openapi.koreainvestment.com:9443/oauth2/tokenP', {
            grant_type: 'client_credentials',
            appkey: KIS_APP_KEY,
            appsecret: KIS_APP_SECRET
        });
        const token = authRes.data.access_token;

        const recs = JSON.parse(fs.readFileSync('tmp_past_recs.json', 'utf8'));

        for (const rec of recs) {
            const kisRes = await axios.get('https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-price', {
                headers: {
                    'authorization': 'Bearer ' + token,
                    'appkey': KIS_APP_KEY,
                    'appsecret': KIS_APP_SECRET,
                    'tr_id': 'FHKST01010100'
                },
                params: {
                    "FID_COND_MRKT_DIV_CODE": "J",
                    "FID_INPUT_ISCD": rec.code
                }
            });
            const stck_prpr = kisRes.data.output.stck_prpr;
            const currentPrice = parseInt(stck_prpr);
            const targetPrice = parseInt(rec.rec_price);
            
            const diffPerc = Math.abs(currentPrice - targetPrice) / targetPrice * 100;
            const inRange = diffPerc <= 0.1;

            console.log(`CODE: ${rec.code}`);
            console.log(`NAME: ${rec.name}`);
            console.log(`TARGET: ${targetPrice}`);
            console.log(`CURRENT: ${currentPrice}`);
            console.log(`MARGIN_PCT: ${diffPerc.toFixed(3)}%`);
            console.log(`IN_RANGE_0.1: ${inRange}`);
        }
    } catch (e) {
        console.error(e.response ? e.response.data : e.message);
    }
}
run();
