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
    
    try {
        console.log("Testing Minute API for 005930...");
        const res = await axios.get('https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-time-itemchartprice', {
            headers: {
                'authorization': 'Bearer ' + token,
                'appkey': KIS_APP_KEY,
                'appsecret': KIS_APP_SECRET,
                'tr_id': 'FHKST03010200' // Intraday chart tr_id
            },
            params: {
                "FID_ETC_CLS_CODE": "",
                "FID_COND_MRKT_DIV_CODE": "J",
                "FID_INPUT_ISCD": "005930",
                "FID_INPUT_HOUR_1": "153000",
                "FID_PW_DATA_INCU_YN": "N"
            }
        });
        console.log('Today Minute Success:', res.data.output2?.length, 'records');
        if(res.data.output2?.length > 0) {
            console.log("Sample Data:", res.data.output2[0]);
        }
    } catch(e) {
        console.error('Error:', e.response?.data || e.message);
    }
}
test();
