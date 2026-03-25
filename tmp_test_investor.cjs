const axios = require('axios');
require('dotenv').config();

async function test() {
    try {
        const appkey = process.env.KIS_APP_KEY;
        const appsecret = process.env.KIS_APP_SECRET;

        const tokenRes = await axios.post('https://openapi.koreainvestment.com:9443/oauth2/tokenP', {
            grant_type: 'client_credentials',
            appkey, appsecret
        });
        const token = tokenRes.data.access_token;

        const invRes = await axios.get('https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-investor', {
            headers: {
                'authorization': `Bearer ${token}`,
                'appkey': appkey,
                'appsecret': appsecret,
                'tr_id': 'FHKST01010900'
            },
            params: {
                "FID_COND_MRKT_DIV_CODE": "J",
                "FID_INPUT_ISCD": "036930" // 주성엔지니어링
            }
        });
        console.log("----- RAW OUTPUT -----");
        console.dir(invRes.data.output, {depth: null});
    } catch(e) {
        console.error(e.response ? e.response.data : e.message);
    }
}
test();
