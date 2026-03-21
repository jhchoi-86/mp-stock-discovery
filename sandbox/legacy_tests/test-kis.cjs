const axios = require('axios');
require('dotenv').config();

const KIS_APP_KEY = process.env.KIS_APP_KEY;
const KIS_APP_SECRET = process.env.KIS_APP_SECRET;

async function test() {
    console.log("Fetching token...");
    const tokenRes = await axios.post('https://openapi.koreainvestment.com:9443/oauth2/tokenP', {
        grant_type: 'client_credentials',
        appkey: KIS_APP_KEY,
        appsecret: KIS_APP_SECRET
    });
    const token = tokenRes.data.access_token;
    console.log("Token acquired.");
    
    try {
        console.log("Testing Daily API for 005930...");
        const res = await axios.get('https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice', {
            headers: {
                'authorization': 'Bearer ' + token,
                'appkey': KIS_APP_KEY,
                'appsecret': KIS_APP_SECRET,
                'tr_id': 'FHKST03010100'
            },
            params: {
                "FID_COND_MRKT_DIV_CODE": "J",
                "FID_INPUT_ISCD": "005930",
                "FID_INPUT_DATE_1": "20230101",
                "FID_INPUT_DATE_2": "20240315",
                "FID_PERIOD_DIV_CODE": "D",
                "FID_ORG_ADJ_PRC": "0"
            }
        });
        console.log('Daily Success:', res.data.output2?.length, 'records');
        if(res.data.output2?.length > 0) {
            console.log("Sample Data:", res.data.output2[0]);
        } else {
            console.log("Full response:", res.data);
        }
    } catch(e) {
        console.error('Daily Error:', e.response?.data || e.message);
    }
}
test();
