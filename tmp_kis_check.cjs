const analyzer = require('./analyzer.cjs');
const axios = require('axios');

async function test() {
    try {
        const token = await analyzer.getAccessToken();
        const res = await axios.get('https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-price', {
            headers: {
                'authorization': 'Bearer ' + token,
                'appkey': process.env.KIS_APP_KEY,
                'appsecret': process.env.KIS_APP_SECRET,
                'tr_id': 'FHKST01010100'
            },
            params: {
                'FID_COND_MRKT_DIV_CODE': 'J',
                'FID_INPUT_ISCD': '241560' // 두산밥캣
            }
        });
        
        const out = res.data.output;
        console.log('--- KIS Price Data (241560) ---');
        console.log('stck_prpr (Current):', out.stck_prpr);
        console.log('ovtm_untp_prpr (Overtime):', out.ovtm_untp_prpr);
        console.log('prdy_ctrt (Regular Yield):', out.prdy_ctrt);
        console.log('ovtm_untp_prdy_ctrt (Overtime Yield):', out.ovtm_untp_prdy_ctrt);
        console.log('ovtm_untp_prdy_vrss (Overtime Change):', out.ovtm_untp_prdy_vrss);
        
        const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
        const kstHour = kstNow.getUTCHours();
        console.log('Current KST Hour:', kstHour);
        
        const overtimePrice = parseInt(out.ovtm_untp_prpr || 0);
        if (overtimePrice > 0) {
            console.log('>> AFTER-HOURS PRICE DETECTED!');
        } else {
            console.log('>> No After-Hours Price currently (Likely outside 16:00-18:00 window)');
        }
    } catch (e) {
        console.error(e);
    }
}

test();
