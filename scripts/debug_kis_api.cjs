const axios = require('axios');
require('dotenv').config();

async function debugApi() {
    const API_KEY = process.env.KIS_APP_KEY;
    const API_SECRET = process.env.KIS_APP_SECRET;

    console.log('--- KIS API Debug Start ---');
    
    // 1. Get Token
    let token;
    try {
        const res = await axios.post('https://openapi.koreainvestment.com:9443/oauth2/tokenP', {
            grant_type: "client_credentials",
            appkey: API_KEY,
            appsecret: API_SECRET
        });
        token = res.data.access_token;
        console.log('Token fetched successfully');
    } catch (e) {
        console.error('Token Error:', e.response?.data || e.message);
        return;
    }

    // 2. Test inquire-price (Samsung 005930)
    try {
        const res = await axios.get('https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-price', {
            headers: {
                'authorization': 'Bearer ' + token,
                'appkey': API_KEY,
                'appsecret': API_SECRET,
                'tr_id': 'FHKST01010100'
            },
            params: { "FID_COND_MRKT_DIV_CODE": "J", "FID_INPUT_ISCD": "005930" }
        });
        console.log('API Result:', JSON.stringify(res.data, null, 2));
    } catch (e) {
        console.error('API Error (500?):');
        console.error('Status:', e.response?.status);
        console.error('Data:', JSON.stringify(e.response?.data, null, 2));
    }
}

debugApi();
