require('dotenv').config();
const axios = require('axios');

const KIS_APP_KEY = process.env.KIS_APP_KEY;
const KIS_APP_SECRET = process.env.KIS_APP_SECRET;

async function test(code) {
    try {
        const response = await axios.post('https://openapi.koreainvestment.com:9443/oauth2/tokenP', {
            grant_type: 'client_credentials',
            appkey: KIS_APP_KEY,
            appsecret: KIS_APP_SECRET
        });
        const kisTokenGlobal = response.data.access_token;
        
        const kisUrl = 'https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-price';
        const kisRes = await axios.get(kisUrl, {
            headers: {
                'authorization': 'Bearer ' + kisTokenGlobal,
                'appkey': KIS_APP_KEY,
                'appsecret': KIS_APP_SECRET,
                'tr_id': 'FHKST01010100'
            },
            params: {
                "FID_COND_MRKT_DIV_CODE": "J",
                "FID_INPUT_ISCD": code
            }
        });
        console.log(kisRes.data.output);
    } catch(e) { console.error(e); }
}

test('047810');
