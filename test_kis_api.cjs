const axios = require('axios');
require('dotenv').config();

const KIS_APP_KEY = process.env.KIS_APP_KEY;
const KIS_APP_SECRET = process.env.KIS_APP_SECRET;

async function testKisPrice(code) {
    try {
        // Request Token
        const tokenRes = await axios.post('https://openapi.koreainvestment.com:9443/oauth2/tokenP', {
            grant_type: 'client_credentials',
            appkey: KIS_APP_KEY,
            appsecret: KIS_APP_SECRET
        });
        const token = tokenRes.data.access_token;

        // Inquire Price
        const priceRes = await axios.get('https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-price', {
            headers: {
                'authorization': 'Bearer ' + token,
                'appkey': KIS_APP_KEY,
                'appsecret': KIS_APP_SECRET,
                'tr_id': 'FHKST01010100'
            },
            params: {
                "FID_COND_MRKT_DIV_CODE": "J",
                "FID_INPUT_ISCD": code
            }
        });

        console.log(`KIS Price Response for ${code}:`);
        console.log(JSON.stringify(priceRes.data.output, null, 2));
    } catch (e) {
        console.error(e.response?.data || e.message);
    }
}

testKisPrice('095610');
