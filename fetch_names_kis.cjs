require('dotenv').config();
const fs = require('fs');
const axios = require('axios');

const KIS_APP_KEY = (process.env.KIS_APP_KEY || '').trim();
const KIS_APP_SECRET = (process.env.KIS_APP_SECRET || '').trim();
const MASTER_FILE = 'data/stock_master.json';
const UPDATE_FILE = 'update_master.cjs';

async function run() {
    console.log("Getting KIS Token...");
    const tokenRes = await axios.post('https://openapi.koreainvestment.com:9443/oauth2/tokenP', {
        grant_type: 'client_credentials',
        appkey: KIS_APP_KEY,
        appsecret: KIS_APP_SECRET
    });
    const token = tokenRes.data.access_token;
    console.log("Token obtained!");

    const masterData = JSON.parse(fs.readFileSync(MASTER_FILE, 'utf8'));
    let updateCode = fs.readFileSync(UPDATE_FILE, 'utf8');
    
    let changed = 0;
    
    for (const stock of masterData) {
        try {
            // Need to determine if KOSPI (J) or KOSDAQ (Q) usually, but we can just use J (stock price api works for both)
            const kisUrl = 'https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-price';
            const kisRes = await axios.get(kisUrl, {
                headers: {
                    'authorization': 'Bearer ' + token,
                    'appkey': KIS_APP_KEY,
                    'appsecret': KIS_APP_SECRET,
                    'tr_id': 'FHKST01010100' // Current price actually doesn't return name always... let's use naver api instead 
                },
                params: {
                    "FID_COND_MRKT_DIV_CODE": "J",
                    "FID_INPUT_ISCD": stock.code
                }
            });
            // Wait, inquire-price does not return the actual korean name. It returns price data.
            // Let's use search API or we can just use a much simpler Naver mobile AJAX API that always returns UTF-8!
        } catch (e) {
            console.error(`Error fetching ${stock.code}:`, e.message);
        }
    }
}

run();
